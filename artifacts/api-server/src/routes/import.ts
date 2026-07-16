/**
 * POST /api/books/import/parse  — parse uploaded file, return detected books (no DB write)
 * POST /api/books/import/confirm — save selected books to the user's library
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import multer from "multer";
import { db, booksTable } from "@workspace/db";
import { parseCSV, parseDOCX, parsePDF, type ParsedBook } from "../import-parsers.js";

const router = Router();

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

interface AuthedRequest extends Request {
  userId: string;
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) { res.status(401).json({ error: "Unauthorized" }); return; }
  (req as AuthedRequest).userId = userId;
  next();
}

// ---------------------------------------------------------------------------
// Multer — in-memory, 5 MB cap
// ---------------------------------------------------------------------------

const ALLOWED_EXTS = new Set(["csv", "pdf", "docx", "doc", "txt"]);
const ALLOWED_MIMES = new Set([
  "text/csv",
  "application/csv",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "text/plain",
]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const ext = (file.originalname || "").split(".").pop()?.toLowerCase() ?? "";
    // Accept when MIME is a known book-file type, OR when the extension is
    // explicitly supported (covers "application/octet-stream" from mobile
    // pickers and other generic MIME types sent for valid file types).
    if (ALLOWED_MIMES.has(file.mimetype) || ALLOWED_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Please upload a CSV, PDF, or DOCX file."));
    }
  },
});

/** Promise wrapper around multer so we can use async/await */
function runMulter(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single("file")(req as any, res as any, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

const COVER_COLORS = [
  "#2D6A4F", "#C8873F", "#5856D6", "#E55A4E", "#4A90D9",
  "#8B5CF6", "#D4792A", "#1D7A7A", "#B5451B", "#4C7B58",
];
function randomColor() {
  return COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];
}

// ---------------------------------------------------------------------------
// POST /import/parse
// ---------------------------------------------------------------------------

router.post("/parse", requireAuth, async (req, res) => {
  try {
    await runMulter(req, res);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "File upload failed" });
  }

  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  const ext = (file.originalname ?? "").split(".").pop()?.toLowerCase();
  const mime = file.mimetype.toLowerCase();

  try {
    let books: ParsedBook[] = [];

    if (ext === "csv" || mime === "text/csv" || mime === "application/csv") {
      books = parseCSV(file.buffer);
    } else if (ext === "pdf" || mime === "application/pdf") {
      books = await parsePDF(file.buffer);
    } else if (ext === "docx" || mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
      books = await parseDOCX(file.buffer);
    } else if (ext === "doc" || mime === "application/msword") {
      // mammoth can handle some .doc files too
      books = await parseDOCX(file.buffer);
    } else if (ext === "txt" || mime === "text/plain") {
      // Re-use the CSV parser (common case: tab- or comma-separated text)
      books = parseCSV(file.buffer);
      if (books.length === 0) {
        // Fall back to heuristic line detection
        const { extractBooksFromText } = await import("../import-parsers.js");
        books = extractBooksFromText(file.buffer.toString("utf-8"));
      }
    } else {
      return res.status(400).json({ error: "Unsupported file type. Please upload CSV, PDF, or DOCX." });
    }

    return res.json({ books, count: books.length });
  } catch (err) {
    console.error("[import/parse]", err);
    return res.status(500).json({ error: "Failed to parse file" });
  }
});

// ---------------------------------------------------------------------------
// Background enrichment — fire-and-forget after confirm
// ---------------------------------------------------------------------------

/**
 * Look up a book by title + author on OpenLibrary's search API.
 * Returns { pages, genre } with whichever fields were found, or null on failure.
 */
async function lookupByTitleAuthor(
  title: string,
  author: string,
): Promise<{ pages: number | null; genre: string | null } | null> {
  try {
    const params = new URLSearchParams({
      title,
      author,
      limit: "1",
      fields: "number_of_pages_median,subject",
    });
    const url = `https://openlibrary.org/search.json?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      docs?: { number_of_pages_median?: number; subject?: string[] }[];
    };
    const doc = data.docs?.[0];
    if (!doc) return null;
    return {
      pages: doc.number_of_pages_median ?? null,
      genre: doc.subject?.[0] ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * For each inserted book that is missing pages or genre, query OpenLibrary and
 * patch the DB row. Runs entirely in the background — errors are swallowed.
 */
async function enrichBooksInBackground(
  bookIds: { id: string; title: string; author: string; hasMissingFields: boolean }[],
): Promise<void> {
  const toEnrich = bookIds.filter((b) => b.hasMissingFields);
  for (const book of toEnrich) {
    try {
      const result = await lookupByTitleAuthor(book.title, book.author);
      if (!result) continue;
      if (!result.pages && !result.genre) continue;

      // Only update fields that are still null in the DB
      const [current] = await db
        .select({ pages: booksTable.pages, genre: booksTable.genre })
        .from(booksTable)
        .where(eq(booksTable.id, book.id));
      if (!current) continue;

      const patch: Partial<typeof booksTable.$inferInsert> = {};
      if (!current.pages && result.pages) patch.pages = result.pages;
      if (!current.genre && result.genre) patch.genre = result.genre;
      if (Object.keys(patch).length === 0) continue;

      await db.update(booksTable).set(patch).where(eq(booksTable.id, book.id));
    } catch {
      // swallow — enrichment is best-effort
    }
  }
}

// ---------------------------------------------------------------------------
// POST /import/confirm
// ---------------------------------------------------------------------------

router.post("/confirm", requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const { books } = req.body as { books: ParsedBook[] };

  if (!Array.isArray(books) || books.length === 0) {
    return res.status(400).json({ error: "books array is required" });
  }

  // Fetch existing titles for duplicate detection
  const existing = await db
    .select({ title: booksTable.title, author: booksTable.author })
    .from(booksTable)
    .where(eq(booksTable.userId, userId));

  const existingKeys = new Set(
    existing.map((b) => `${b.title.toLowerCase()}|${b.author.toLowerCase()}`),
  );

  let imported = 0;
  let skipped = 0;
  const insertedForEnrichment: { id: string; title: string; author: string; hasMissingFields: boolean }[] = [];

  for (const book of books) {
    if (!book.title?.trim() || !book.author?.trim()) { skipped++; continue; }
    const key = `${book.title.trim().toLowerCase()}|${book.author.trim().toLowerCase()}`;
    if (existingKeys.has(key)) { skipped++; continue; }

    const now = new Date();
    const dateRead = book.dateRead ? new Date(book.dateRead) : null;
    const bookId = generateId();

    try {
      await db.insert(booksTable).values({
        id: bookId,
        userId,
        title: book.title.trim(),
        author: book.author.trim(),
        coverColor: randomColor(),
        status: book.status ?? "want_to_read",
        rating: book.rating ?? null,
        pages: book.pages ?? null,
        currentPage: null,
        notes: null,
        genre: book.genre ?? null,
        dateAdded: now,
        dateStarted: book.status === "reading" || book.status === "read" ? now : null,
        dateFinished: book.status === "read" ? (dateRead ?? now) : null,
      });
      existingKeys.add(key);
      imported++;

      // Track books that are missing pages or genre for enrichment
      const needsEnrichment = !book.pages || !book.genre;
      insertedForEnrichment.push({
        id: bookId,
        title: book.title.trim(),
        author: book.author.trim(),
        hasMissingFields: needsEnrichment,
      });
    } catch {
      skipped++;
    }
  }

  const enrichingCount = insertedForEnrichment.filter((b) => b.hasMissingFields).length;

  // Kick off enrichment in the background — do NOT await
  if (enrichingCount > 0) {
    enrichBooksInBackground(insertedForEnrichment).catch(() => {/* swallow */});
  }

  return res.json({ imported, skipped, enriching: enrichingCount });
});

export default router;

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    const allowed = [
      "text/csv", "application/csv",
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
      "text/plain",
      "application/octet-stream", // mobile pickers often send this
    ];
    // Also allow by extension for permissive MIME types
    const ext = (file.originalname || "").split(".").pop()?.toLowerCase();
    if (allowed.includes(file.mimetype) || ["csv", "pdf", "docx", "doc", "txt"].includes(ext ?? "")) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${file.mimetype}`));
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

  for (const book of books) {
    if (!book.title?.trim() || !book.author?.trim()) { skipped++; continue; }
    const key = `${book.title.trim().toLowerCase()}|${book.author.trim().toLowerCase()}`;
    if (existingKeys.has(key)) { skipped++; continue; }

    const now = new Date();
    const dateRead = book.dateRead ? new Date(book.dateRead) : null;

    try {
      await db.insert(booksTable).values({
        id: generateId(),
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
    } catch {
      skipped++;
    }
  }

  return res.json({ imported, skipped });
});

export default router;

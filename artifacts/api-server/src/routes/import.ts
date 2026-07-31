/**
 * POST /api/books/import/parse   — parse uploaded file, return detected books (no DB write)
 * POST /api/books/import/confirm — kick off a background import job, returns a jobId immediately
 * GET  /api/books/import/status/:jobId — poll the status of a confirm job
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import multer from "multer";
import { randomUUID } from "crypto";
import { db, booksTable } from "@workspace/db";
import { parseCSV, parseDOCX, parsePDF, type ParsedBook } from "../import-parsers.js";
import { enrichBooksInBackground as enrichBooks } from "../lib/enrich.js";
import { importLimiter } from "../lib/rate-limit.js";

const router = Router();

// ---------------------------------------------------------------------------
// Auth Middleware
// ---------------------------------------------------------------------------

interface AuthedRequest extends Request {
  userId: string;
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  (req as AuthedRequest).userId = userId;
  next();
}

// ---------------------------------------------------------------------------
// Multer File Upload Setup
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB cap
  fileFilter(_req, file, cb) {
    const ext = (file.originalname || "").split(".").pop()?.toLowerCase() ?? "";
    if (ALLOWED_MIMES.has(file.mimetype) || ALLOWED_EXTS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Unsupported file type. Please upload a CSV, PDF, or DOCX file."));
    }
  },
});

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
// Background import jobs
//
// In-memory job store. This is fine for a single-instance deployment
// (which is what this project runs as); if this is ever split across
// multiple server instances, a client polling for a job's status could
// land on an instance that never processed it — move this to a shared
// store (e.g. Redis) at that point. Same caveat as the rate limiter.
// ---------------------------------------------------------------------------

interface ImportJob {
  ownerId: string;
  status: "processing" | "completed" | "failed";
  total: number;
  imported: number;
  skipped: number;
  enriching: number;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

const importJobs = new Map<string, ImportJob>();

// Jobs are kept around for an hour after finishing (long enough for a
// client to pick up the final status even if it was slow to poll), then
// dropped so this map doesn't grow unbounded.
function scheduleJobCleanup(jobId: string) {
  setTimeout(() => importJobs.delete(jobId), 60 * 60 * 1000).unref();
}

const IMPORT_BATCH_SIZE = 100;

async function processImportJob(jobId: string, userId: string, books: ParsedBook[]) {
  const job = importJobs.get(jobId);
  if (!job) return;

  try {
    // Fetch existing books once for duplicate detection — prefer ISBN
    // match when available (more reliable than title/author spelling),
    // fall back to title+author for books without an ISBN on either side.
    const existing = await db
      .select({ title: booksTable.title, author: booksTable.author, isbn: booksTable.isbn })
      .from(booksTable)
      .where(eq(booksTable.userId, userId));

    const existingKeys = new Set(
      existing.map((b) => `${b.title.toLowerCase()}|${b.author.toLowerCase()}`),
    );
    const existingIsbns = new Set(
      existing.map((b) => b.isbn).filter((isbn): isbn is string => Boolean(isbn)),
    );

    const insertedForEnrichment: {
      id: string;
      title: string;
      author: string;
      isbn?: string;
      hasMissingFields: boolean;
    }[] = [];

    let skipped = 0;
    const rowsToInsert: (typeof booksTable.$inferInsert)[] = [];

    // Validate + de-dupe in memory first (fast, no DB round-trips), then
    // insert the survivors in batches below — this is what avoids 500+
    // sequential single-row round-trips.
    for (const book of books) {
      if (!book.title?.trim() || !book.author?.trim()) {
        skipped++;
        continue;
      }

      const cleanIsbn = book.isbn ? book.isbn.replace(/[^0-9Xx]/g, "") : null;
      const key = `${book.title.trim().toLowerCase()}|${book.author.trim().toLowerCase()}`;

      const isDuplicate = (cleanIsbn && existingIsbns.has(cleanIsbn)) || existingKeys.has(key);
      if (isDuplicate) {
        skipped++;
        continue;
      }

      // Add immediately so two rows in the same import with the same
      // title/author or ISBN don't both slip through as "new".
      existingKeys.add(key);
      if (cleanIsbn) existingIsbns.add(cleanIsbn);

      const now = new Date();
      const dateRead = book.dateRead ? new Date(book.dateRead) : null;
      const bookId = generateId();

      rowsToInsert.push({
        id: bookId,
        userId,
        title: book.title.trim(),
        author: book.author.trim(),
        coverColor: randomColor(),
        isbn: cleanIsbn,
        status: book.status ?? "want_to_read",
        rating: book.rating ?? null,
        pages: book.pages ?? null,
        genre: book.genre ?? null,
        dateAdded: now,
        dateStarted: (book.status === "reading" || book.status === "read") ? now : null,
        dateFinished: (book.status === "read") ? (dateRead ?? now) : null,
      });

      const hasSearchableInfo = Boolean(book.isbn || book.title?.trim());
      const isMissingMetadata = !book.pages || !book.genre;
      if (isMissingMetadata && hasSearchableInfo) {
        insertedForEnrichment.push({
          id: bookId,
          title: book.title.trim(),
          author: book.author.trim(),
          isbn: book.isbn,
          hasMissingFields: true,
        });
      }
    }

    job.skipped = skipped;

    // Insert in batches (multi-row INSERT per batch) rather than one row
    // per round-trip. A batch failure only drops that batch, not the
    // whole import.
    let imported = 0;
    for (let i = 0; i < rowsToInsert.length; i += IMPORT_BATCH_SIZE) {
      const chunk = rowsToInsert.slice(i, i + IMPORT_BATCH_SIZE);
      try {
        await db.insert(booksTable).values(chunk);
        imported += chunk.length;
      } catch (err) {
        console.error(`[import/confirm] Job ${jobId}: batch insert failed:`, err);
        job.skipped += chunk.length;
      }
      job.imported = imported;
    }

    job.status = "completed";
    job.finishedAt = Date.now();

    if (insertedForEnrichment.length > 0) {
      job.enriching = insertedForEnrichment.length;
      enrichBooks(insertedForEnrichment).catch((err) => {
        console.error(`[import/confirm] Job ${jobId}: background enrichment trigger failed:`, err);
      });
    }
  } catch (err) {
    console.error(`[import/confirm] Job ${jobId} failed:`, err);
    job.status = "failed";
    job.error = "Import failed unexpectedly";
    job.finishedAt = Date.now();
  } finally {
    scheduleJobCleanup(jobId);
  }
}

// ---------------------------------------------------------------------------
// POST /import/parse — File parsing endpoint
// ---------------------------------------------------------------------------

router.post("/parse", requireAuth, importLimiter, async (req, res) => {
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
      books = await parseDOCX(file.buffer);
    } else if (ext === "txt" || mime === "text/plain") {
      books = parseCSV(file.buffer);
      if (books.length === 0) {
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
// POST /import/confirm — kicks off a background job, responds immediately
// ---------------------------------------------------------------------------

router.post("/confirm", requireAuth, importLimiter, (req, res) => {
  const { userId } = req as AuthedRequest;
  const { books } = req.body as { books: ParsedBook[] };

  if (!Array.isArray(books) || books.length === 0) {
    return res.status(400).json({ error: "books array is required" });
  }

  const jobId = randomUUID();
  importJobs.set(jobId, {
    ownerId: userId,
    status: "processing",
    total: books.length,
    imported: 0,
    skipped: 0,
    enriching: 0,
    startedAt: Date.now(),
  });

  // Respond immediately — the actual duplicate-check + insert work runs
  // in the background so a large (500+) file never risks an HTTP timeout
  // on this request. The client polls GET /import/status/:jobId.
  res.status(202).json({ jobId, total: books.length });

  processImportJob(jobId, userId, books);
});

// ---------------------------------------------------------------------------
// GET /import/status/:jobId — poll a confirm job's progress/result
// ---------------------------------------------------------------------------

router.get("/status/:jobId", requireAuth, (req, res) => {
  const { userId } = req as AuthedRequest;
  const job = importJobs.get(req.params.jobId);

  // 404 for both "doesn't exist" and "belongs to someone else" so this
  // endpoint doesn't leak whether a given job id is valid.
  if (!job || job.ownerId !== userId) {
    return res.status(404).json({ error: "Import job not found (it may have expired)" });
  }

  return res.json({
    status: job.status,
    total: job.total,
    imported: job.imported,
    skipped: job.skipped,
    enriching: job.enriching,
    error: job.error,
  });
});

export default router;
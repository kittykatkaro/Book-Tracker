/**
 * POST /api/books/import/parse  — parse uploaded file, return detected books (no DB write)
 * POST /api/books/import/confirm — kick off a background import job, returns { jobId } immediately
 * GET  /api/books/import/status/:jobId — poll for progress on a background import job
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { eq } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import multer from "multer";
import { db, booksTable } from "@workspace/db";
import { parseCSV, parseDOCX, parsePDF, type ParsedBook } from "../import-parsers.js";
import { enrichBooksInBackground as enrichBooks } from "../lib/enrich.js";
import {
  createImportJob,
  getImportJob,
  updateImportJob,
  serializeImportJob,
} from "../lib/import-jobs.js";

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
// POST /import/parse — File parsing endpoint
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
// Batch insert size — one round trip per BATCH_SIZE rows instead of one
// round trip per row. 100 is a safe default: well under Postgres' bound
// parameter limits even with ~10 columns per row, and small enough that
// a single failed batch doesn't risk losing a huge chunk of the import.
// ---------------------------------------------------------------------------
const BATCH_SIZE = 100;

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

interface InsertCandidate {
  row: typeof booksTable.$inferInsert;
  forEnrichment: { id: string; title: string; author: string; isbn?: string } | null;
}

/**
 * Runs the actual import in the background: batched inserts, then
 * progressive enrichment — reporting progress into the job store as it
 * goes so `/status/:jobId` has something fresh to return.
 */
async function processImportJob(jobId: string, userId: string, books: ParsedBook[]) {
  try {
    updateImportJob(jobId, { status: "importing", message: "Checking for duplicates…" });

    // One query to fetch existing (title, author) pairs for dedupe —
    // cheap even for large libraries, avoids a query per candidate row.
    const existing = await db
      .select({ title: booksTable.title, author: booksTable.author })
      .from(booksTable)
      .where(eq(booksTable.userId, userId));

    const existingKeys = new Set(
      existing.map((b) => `${b.title.toLowerCase()}|${b.author.toLowerCase()}`),
    );

    let imported = 0;
    let skipped = 0;
    let processed = 0;
    const insertedForEnrichment: { id: string; title: string; author: string; isbn?: string }[] = [];

    // Build validated rows up front (cheap, in-memory) so batches only
    // ever contain rows we actually intend to insert.
    const candidates: InsertCandidate[] = [];
    for (const book of books) {
      if (!book.title?.trim() || !book.author?.trim()) {
        skipped++;
        processed++;
        continue;
      }

      const key = `${book.title.trim().toLowerCase()}|${book.author.trim().toLowerCase()}`;
      if (existingKeys.has(key)) {
        skipped++;
        processed++;
        continue;
      }
      existingKeys.add(key); // guard against duplicates within the same import batch

      const now = new Date();
      const dateRead = book.dateRead ? new Date(book.dateRead) : null;
      const bookId = generateId();

      const hasSearchableInfo = Boolean(book.isbn || book.title?.trim());
      const isMissingMetadata = !book.pages || !book.genre;
      const needsEnrichment = isMissingMetadata && hasSearchableInfo;

      candidates.push({
        row: {
          id: bookId,
          userId,
          title: book.title.trim(),
          author: book.author.trim(),
          coverColor: randomColor(),
          status: book.status ?? "want_to_read",
          rating: book.rating ?? null,
          pages: book.pages ?? null,
          genre: book.genre ?? null,
          dateAdded: now,
          dateStarted: (book.status === "reading" || book.status === "read") ? now : null,
          dateFinished: (book.status === "read") ? (dateRead ?? now) : null,
        },
        forEnrichment: needsEnrichment
          ? { id: bookId, title: book.title.trim(), author: book.author.trim(), isbn: book.isbn }
          : null,
      });
    }

    // Batched inserts — one round trip per BATCH_SIZE rows instead of
    // one per row. If a whole batch fails (e.g. one bad row poisons a
    // multi-row insert), fall back to inserting that batch's rows one
    // at a time so a single bad row doesn't sink its neighbors too.
    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batch = candidates.slice(i, i + BATCH_SIZE);
      try {
        await db.insert(booksTable).values(batch.map((c) => c.row));
        imported += batch.length;
        for (const c of batch) {
          if (c.forEnrichment) insertedForEnrichment.push(c.forEnrichment);
        }
      } catch (batchError) {
        console.error(
          `[import/confirm] Batch insert failed (rows ${i}-${i + batch.length}), falling back to per-row:`,
          batchError,
        );
        for (const c of batch) {
          try {
            await db.insert(booksTable).values(c.row);
            imported++;
            if (c.forEnrichment) insertedForEnrichment.push(c.forEnrichment);
          } catch (rowError) {
            console.error(`[import/confirm] Failed to insert book "${c.row.title}":`, rowError);
            skipped++;
          }
        }
      }

      processed += batch.length;
      updateImportJob(jobId, {
        processed,
        imported,
        skipped,
        message: `Imported ${imported}/${books.length} books…`,
      });

      // Yield back to the event loop between batches so a large import
      // doesn't starve other requests being handled by this process.
      await yieldToEventLoop();
    }

    // Enrichment phase — progressive, so status reflects real progress
    // instead of jumping straight from "importing" to "done".
    if (insertedForEnrichment.length > 0) {
      updateImportJob(jobId, {
        status: "enriching",
        enrichTotal: insertedForEnrichment.length,
        enrichDone: 0,
        message: `Imported ${imported}/${books.length} books. Fetching missing details for ${insertedForEnrichment.length} of them…`,
      });

      await enrichBooks(insertedForEnrichment, (done, total) => {
        updateImportJob(jobId, {
          enrichDone: done,
          message: `Imported ${imported}/${books.length} books. Enriched ${done}/${total}…`,
        });
      });
    }

    updateImportJob(jobId, {
      status: "completed",
      message:
        skipped > 0
          ? `Done — imported ${imported}, skipped ${skipped}.`
          : `Done — imported ${imported} book${imported === 1 ? "" : "s"}.`,
    });
  } catch (error) {
    console.error(`[import/confirm] Job ${jobId} failed:`, error);
    updateImportJob(jobId, {
      status: "failed",
      error: error instanceof Error ? error.message : "Import failed unexpectedly",
      message: "Import failed.",
    });
  }
}

// ---------------------------------------------------------------------------
// POST /import/confirm — kicks off a background job, responds immediately
// ---------------------------------------------------------------------------

router.post("/confirm", requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const { books } = req.body as { books: ParsedBook[] };

  if (!Array.isArray(books) || books.length === 0) {
    return res.status(400).json({ error: "books array is required" });
  }

  const job = createImportJob(userId, books.length);

  // Fire-and-forget — the client polls /status/:jobId for progress.
  processImportJob(job.id, userId, books).catch((err) => {
    console.error(`[import/confirm] Unhandled error processing job ${job.id}:`, err);
    updateImportJob(job.id, {
      status: "failed",
      error: "Import failed unexpectedly",
      message: "Import failed.",
    });
  });

  return res.status(202).json(serializeImportJob(job));
});

// ---------------------------------------------------------------------------
// GET /import/status/:jobId — poll for progress on a background import job
// ---------------------------------------------------------------------------

router.get("/status/:jobId", requireAuth, async (req, res) => {
  const { userId } = req as AuthedRequest;
  const job = getImportJob(req.params.jobId as string);

  if (!job || job.userId !== userId) {
    return res.status(404).json({ error: "Import job not found" });
  }

  return res.json(serializeImportJob(job));
});

export default router;
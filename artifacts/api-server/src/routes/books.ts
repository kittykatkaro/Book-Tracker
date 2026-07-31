import {
  Router,
  type Request,
  type Response,
  type NextFunction,
} from "express";
import { eq, desc, and, or, isNull } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import multer from "multer";
import { randomUUID } from "crypto";
import { db, booksTable } from "@workspace/db";
import { enrichBooksInBackground } from "../lib/enrich.js";
import { classifyGenre, aggregateGenreCounts } from "../lib/genres.js";
import { objectStorageClient } from "../lib/objectStorage.js";

const router = Router();

const COVER_COLORS = [
  "#2D6A4F",
  "#C8873F",
  "#5856D6",
  "#E55A4E",
  "#4A90D9",
  "#8B5CF6",
  "#D4792A",
  "#1D7A7A",
  "#B5451B",
  "#4C7B58",
];

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

function randomColor(): string {
  return COVER_COLORS[Math.floor(Math.random() * COVER_COLORS.length)];
}

function formatBook(book: typeof booksTable.$inferSelect) {
  return {
    ...book,
    coverUrl: book.coverUrl ?? null,
    dateAdded: book.dateAdded.toISOString(),
    dateStarted: book.dateStarted?.toISOString() ?? null,
    dateFinished: book.dateFinished?.toISOString() ?? null,
  };
}

// ---------------------------------------------------------------------------
// Cover upload helpers
// ---------------------------------------------------------------------------

const coverUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter(_req, file, cb) {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("Only image files are allowed"));
  },
});

function runCoverMulter(req: Request, res: Response): Promise<void> {
  return new Promise((resolve, reject) => {
    coverUpload.single("cover")(req as any, res as any, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function parseGcsPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  const normalised = path.startsWith("/") ? path : `/${path}`;
  const parts = normalised.split("/");
  return { bucketName: parts[1], objectName: parts.slice(2).join("/") };
}

async function uploadCoverToGcs(
  buffer: Buffer,
  mimetype: string,
): Promise<string> {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) throw new Error("PRIVATE_OBJECT_DIR not set");
  const id = randomUUID();
  const fullPath = `${privateObjectDir}/covers/${id}`;
  const { bucketName, objectName } = parseGcsPath(fullPath);
  const bucket = objectStorageClient.bucket(bucketName);
  const file = bucket.file(objectName);
  await file.save(buffer, { contentType: mimetype, resumable: false });
  await file.makePublic();
  return `https://storage.googleapis.com/${bucketName}/${objectName}`;
}

// ---------------------------------------------------------------------------
// Auth middleware
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
// Routes
// ---------------------------------------------------------------------------

// GET /api/books
router.get("/", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const status = req.query.status as string | undefined;
    const userFilter = eq(booksTable.userId, userId);
    const where = status
      ? and(userFilter, eq(booksTable.status, status))
      : userFilter;
    const rows = await db
      .select()
      .from(booksTable)
      .where(where)
      .orderBy(desc(booksTable.dateAdded));
    return res.json(rows.map(formatBook));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch books" });
  }
});

// GET /api/books/stats  (must be before /:id)
router.get("/stats", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const books = await db
      .select()
      .from(booksTable)
      .where(eq(booksTable.userId, userId));

    const thisYear = new Date().getFullYear();
    const ratedBooks = books.filter((b) => b.rating != null);
    const avgRating =
      ratedBooks.length > 0
        ? ratedBooks.reduce((s, b) => s + (b.rating ?? 0), 0) /
          ratedBooks.length
        : null;

    const topGenres = aggregateGenreCounts(books.map((b) => b.genre)).slice(
      0,
      6,
    );

    return res.json({
      total: books.length,
      reading: books.filter((b) => b.status === "reading").length,
      read: books.filter((b) => b.status === "read").length,
      wantToRead: books.filter((b) => b.status === "want_to_read").length,
      readThisYear: books.filter(
        (b) =>
          b.status === "read" &&
          b.dateFinished != null &&
          new Date(b.dateFinished).getFullYear() === thisYear,
      ).length,
      totalPages: books
        .filter((b) => b.status === "read")
        .reduce((s, b) => s + (b.pages ?? 0), 0),
      avgRating,
      topGenres,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch stats" });
  }
});

// GET /api/books/isbn-lookup  (must be before /:id — no auth required)
router.get("/isbn-lookup", async (req, res) => {
  const isbn = req.query.isbn as string;
  if (!isbn) return res.status(400).json({ error: "isbn is required" });

  const cleanIsbn = isbn.replace(/[^0-9Xx]/g, "");
  if (cleanIsbn.length < 10)
    return res
      .status(400)
      .json({ error: "Invalid ISBN — must be 10 or 13 digits" });

  try {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = (await response.json()) as Record<string, unknown>;
    const key = `ISBN:${cleanIsbn}`;

    if (!data[key]) return res.status(404).json({ error: "Book not found" });

    const book = data[key] as Record<string, unknown>;
    const authors = Array.isArray(book.authors)
      ? (book.authors as { name?: string }[])
          .map((a) => a.name)
          .filter(Boolean)
          .join(", ")
      : "";
    const subjects = book.subjects as
      | { name?: string }[]
      | string[]
      | undefined;
    const genre = classifyGenre(subjects);
    const publishYear = book.publish_date
      ? (() => {
          const m = String(book.publish_date).match(/\d{4}/);
          return m ? parseInt(m[0], 10) : null;
        })()
      : null;
    const cover = book.cover as Record<string, string> | undefined;

    return res.json({
      title: (book.title as string) || "",
      author: authors,
      pages: (book.number_of_pages as number) ?? null,
      genre,
      coverUrl: cover?.large || cover?.medium || cover?.small || null,
      publishYear,
    });
  } catch (err) {
    return res.status(500).json({ error: "Failed to lookup ISBN" });
  }
});

// POST /api/books/isbn-bulk-lookup
router.post("/isbn-bulk-lookup", async (req, res) => {
  const { isbns } = req.body as { isbns?: unknown };
  if (!Array.isArray(isbns) || isbns.length === 0) {
    return res.status(400).json({ error: "isbns must be a non-empty array" });
  }
  if (isbns.length > 20) {
    return res.status(400).json({ error: "Maximum 20 ISBNs per request" });
  }

  async function lookupOne(isbn: string) {
    const clean = String(isbn).replace(/[^0-9Xx]/g, "");
    if (clean.length < 10) return { isbn, status: "invalid" as const };
    try {
      const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${clean}&format=json&jscmd=data`;
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      const data = (await response.json()) as Record<string, unknown>;
      const key = `ISBN:${clean}`;
      if (!data[key]) return { isbn: clean, status: "not_found" as const };
      const book = data[key] as Record<string, unknown>;
      const authors = Array.isArray(book.authors)
        ? (book.authors as { name?: string }[])
            .map((a) => a.name)
            .filter(Boolean)
            .join(", ")
        : "";
      const subjects = book.subjects as
        | { name?: string }[]
        | string[]
        | undefined;
      const genre = classifyGenre(subjects);
      const cover = book.cover as Record<string, string> | undefined;
      const publishYear = book.publish_date
        ? (() => {
            const m = String(book.publish_date).match(/\d{4}/);
            return m ? parseInt(m[0], 10) : null;
          })()
        : null;
      return {
        isbn: clean,
        status: "found" as const,
        title: (book.title as string) || "",
        author: authors,
        pages: (book.number_of_pages as number) ?? null,
        genre,
        coverUrl: cover?.large || cover?.medium || cover?.small || null,
        publishYear,
      };
    } catch {
      return {
        isbn: String(isbn).replace(/[^0-9Xx]/g, ""),
        status: "error" as const,
      };
    }
  }

  const results = await Promise.all((isbns as string[]).map(lookupOne));
  return res.json({ results });
});

// POST /api/books - Merged and cleaned up
router.post("/", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const data = req.body as {
      title: string;
      author: string;
      status: string;
      rating?: number | null;
      pages?: number | null;
      genre?: string | null;
      coverUrl?: string | null;
      isbn?: string | null;
    };

    if (!data.title || !data.author || !data.status) {
      return res.status(400).json({ error: "title, author and status are required" });
    }

    const cleanIsbn = data.isbn ? data.isbn.replace(/[^0-9Xx]/g, "") : null;

    if (cleanIsbn) {
      const [existing] = await db
        .select({ id: booksTable.id, title: booksTable.title })
        .from(booksTable)
        .where(and(eq(booksTable.userId, userId), eq(booksTable.isbn, cleanIsbn)));

      if (existing) {
        return res.status(409).json({
          error: "duplicate_isbn",
          message: `"${existing.title}" is already in your library.`,
          bookId: existing.id,
        });
      }
    }

    const now = new Date();
    const [book] = await db
      .insert(booksTable)
      .values({
        id: generateId(),
        userId,
        title: data.title,
        author: data.author,
        coverColor: randomColor(),
        coverUrl: data.coverUrl ?? null,
        isbn: cleanIsbn,
        status: data.status,
        rating: data.rating ?? null,
        pages: data.pages ?? null,
        genre: data.genre ?? null,
        dateAdded: now,
        dateStarted: (data.status === "reading" || data.status === "read") ? now : null,
        dateFinished: (data.status === "read") ? now : null,
      })
      .returning();

    return res.status(201).json(formatBook(book));
  } catch (err) {
    console.error("Error creating book:", err);
    return res.status(500).json({ error: "Failed to create book" });
  }
});

// GET /api/books/:id - Type-safe with explicit string casting
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const [book] = await db
      .select()
      .from(booksTable)
    .where(
      and(
        eq(booksTable.id, req.params.id as string), 
        eq(booksTable.userId, userId as string)
      )
    );
    if (!book) return res.status(404).json({ error: "Not found" });
    return res.json(formatBook(book));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch book" });
  }
});

// POST /api/books/enrich-all  (must be before /:id)
router.post("/enrich-all", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;

    // Fetch books for the authenticated user that are missing pages or genre
    const booksToEnrich = await db
      .select({
        id: booksTable.id,
        title: booksTable.title,
        author: booksTable.author,
      })
      .from(booksTable)
      .where(
        and(
          eq(booksTable.userId, userId),
          or(isNull(booksTable.pages), isNull(booksTable.genre)),
        ),
      );

    if (booksToEnrich.length === 0) {
      return res.json({ enriching: 0 });
    }

    // Fire-and-forget — do NOT await
    enrichBooksInBackground(booksToEnrich).catch((err) => {
      console.error("[enrich-all] Background enrichment failed:", err);
    });

    return res.json({ enriching: booksToEnrich.length });
  } catch (error) {
    console.error("[enrich-all] Error in enrich-all route:", error);
    return res.status(500).json({ error: "Failed to trigger bulk enrichment" });
  }
});

// POST /api/books/:id/cover  — upload an image file; stores in GCS and saves public URL
router.post("/:id/cover", requireAuth, async (req, res) => {
  try {
    await runCoverMulter(req, res);
  } catch (err: any) {
    return res.status(400).json({ error: err?.message ?? "Upload failed" });
  }

  const { userId } = req as AuthedRequest;
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: "No file uploaded" });

  try {
    const [existing] = await db
      .select()
      .from(booksTable)
    .where(
      and(
        eq(booksTable.id, req.params.id as string), 
        eq(booksTable.userId, userId as string)
      )
    );
    if (!existing) return res.status(404).json({ error: "Not found" });

    const publicUrl = await uploadCoverToGcs(file.buffer, file.mimetype);

    const [book] = await db
      .update(booksTable)
      .set({ coverUrl: publicUrl })
      .where(
        and(
          eq(booksTable.id, req.params.id as string), 
          eq(booksTable.userId, userId as string)
        )
      )
      .returning();

    return res.json({ coverUrl: publicUrl, book: formatBook(book) });
  } catch (err) {
    console.error("[cover-upload]", err);
    return res.status(500).json({ error: "Failed to upload cover" });
  }
});

// PATCH update a specific book by ID
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const id = req.params.id as string;

    // 1. Fetch the existing book record to check ownership and state transitions
    const existingBook = await db
      .select()
      .from(booksTable)
      .where(and(eq(booksTable.id, id), eq(booksTable.userId, userId)))
      .then((rows) => rows[0]);

    if (!existingBook) {
      return res.status(404).json({ error: "Book not found" });
    }

    // 2. Destructure ONLY whitelisted fields from req.body to prevent mass assignment
    const {
      title,
      author,
      genre,
      status,
      rating,
      pages,
      notes,
      coverUrl,
      isbn,
      publishedYear,
      description,
      dateStarted: rawDateStarted,
      dateFinished: rawDateFinished,
    } = req.body;

    // Build our clean update payload
    const updatePayload: Record<string, any> = {};

    if (title !== undefined) updatePayload.title = title;
    if (author !== undefined) updatePayload.author = author;
    if (genre !== undefined) updatePayload.genre = genre;
    if (rating !== undefined) updatePayload.rating = rating;
    if (pages !== undefined) updatePayload.pages = pages;
    if (notes !== undefined) updatePayload.notes = notes;
    if (coverUrl !== undefined) updatePayload.coverUrl = coverUrl;
    if (isbn !== undefined) updatePayload.isbn = isbn;
    if (publishedYear !== undefined) updatePayload.publishedYear = publishedYear;
    if (description !== undefined) updatePayload.description = description;

    // 3. Handle Status Changes and Automatic Date Tracking
    if (status !== undefined) {
      updatePayload.status = status;

      // Auto-set dateStarted if transitioning to 'reading' and not explicitly provided
      if (
        status === "reading" &&
        existingBook.status !== "reading" &&
        rawDateStarted === undefined
      ) {
        updatePayload.dateStarted = new Date();
      }

      // Auto-set dateFinished if transitioning to 'read' and not explicitly provided
      if (
        status === "read" &&
        existingBook.status !== "read" &&
        rawDateFinished === undefined
      ) {
        updatePayload.dateFinished = new Date();
      }
    }

    // 4. Handle explicitly provided dates (convert string ISO dates to Date objects/null)
    if (rawDateStarted !== undefined) {
      updatePayload.dateStarted = rawDateStarted ? new Date(rawDateStarted) : null;
    }
    if (rawDateFinished !== undefined) {
      updatePayload.dateFinished = rawDateFinished ? new Date(rawDateFinished) : null;
    }

    // If no valid update fields were provided, return early
    if (Object.keys(updatePayload).length === 0) {
      return res.json(formatBook(existingBook));
    }

    // 5. Perform the secure update
    const updatedBooks = await db
      .update(booksTable)
      .set(updatePayload)
      .where(and(eq(booksTable.id, id), eq(booksTable.userId, userId)))
      .returning();

    return res.json(formatBook(updatedBooks[0]));
  } catch (error) {
    console.error(`[PATCH /api/books/${req.params.id}] Error updating book:`, error);
    return res.status(500).json({ error: "Failed to update book" });
  }
});

// DELETE /api/books/:id
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const [existing] = await db
      .select()
      .from(booksTable)
    .where(
      and(
        eq(booksTable.id, req.params.id as string), 
        eq(booksTable.userId, userId as string)
      )
    );
    if (!existing) return res.status(404).json({ error: "Not found" });

    await db
      .delete(booksTable)
    .where(
      and(
        eq(booksTable.id, req.params.id as string), 
        eq(booksTable.userId, userId as string)
      )
    );
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete book" });
  }
});

export default router;

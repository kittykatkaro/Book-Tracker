import { Router, type Request, type Response, type NextFunction } from "express";
import { eq, desc, and, or, isNull } from "drizzle-orm";
import { getAuth } from "@clerk/express";
import { db, booksTable } from "@workspace/db";
import { enrichBooksInBackground } from "../lib/enrich.js";

const router = Router();

const COVER_COLORS = [
  "#2D6A4F", "#C8873F", "#5856D6", "#E55A4E", "#4A90D9",
  "#8B5CF6", "#D4792A", "#1D7A7A", "#B5451B", "#4C7B58",
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
    dateAdded: book.dateAdded.toISOString(),
    dateStarted: book.dateStarted?.toISOString() ?? null,
    dateFinished: book.dateFinished?.toISOString() ?? null,
  };
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
        ? ratedBooks.reduce((s, b) => s + (b.rating ?? 0), 0) / ratedBooks.length
        : null;

    const genreCounts: Record<string, number> = {};
    books.forEach((b) => {
      if (b.genre) genreCounts[b.genre] = (genreCounts[b.genre] ?? 0) + 1;
    });
    const topGenres = Object.entries(genreCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([genre, count]) => ({ genre, count }));

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
    return res.status(400).json({ error: "Invalid ISBN — must be 10 or 13 digits" });

  try {
    const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`;
    const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const data = (await response.json()) as Record<string, unknown>;
    const key = `ISBN:${cleanIsbn}`;

    if (!data[key]) return res.status(404).json({ error: "Book not found" });

    const book = data[key] as Record<string, unknown>;
    const authors = Array.isArray(book.authors)
      ? (book.authors as { name?: string }[]).map((a) => a.name).filter(Boolean).join(", ")
      : "";
    const subjects = book.subjects as { name?: string }[] | string[] | undefined;
    const genre =
      Array.isArray(subjects) && subjects.length > 0
        ? typeof subjects[0] === "string"
          ? subjects[0]
          : (subjects[0] as { name?: string }).name ?? null
        : null;
    const publishYear = book.publish_date
      ? (() => { const m = String(book.publish_date).match(/\d{4}/); return m ? parseInt(m[0], 10) : null; })()
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
        ? (book.authors as { name?: string }[]).map((a) => a.name).filter(Boolean).join(", ")
        : "";
      const subjects = book.subjects as { name?: string }[] | string[] | undefined;
      const genre =
        Array.isArray(subjects) && subjects.length > 0
          ? typeof subjects[0] === "string"
            ? subjects[0]
            : (subjects[0] as { name?: string }).name ?? null
          : null;
      const cover = book.cover as Record<string, string> | undefined;
      const publishYear = book.publish_date
        ? (() => { const m = String(book.publish_date).match(/\d{4}/); return m ? parseInt(m[0], 10) : null; })()
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
      return { isbn: String(isbn).replace(/[^0-9Xx]/g, ""), status: "error" as const };
    }
  }

  const results = await Promise.all((isbns as string[]).map(lookupOne));
  return res.json({ results });
});

// POST /api/books
router.post("/", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const data = req.body as {
      title: string; author: string; status: string;
      rating?: number | null; pages?: number | null;
      currentPage?: number | null; notes?: string | null; genre?: string | null;
    };

    if (!data.title || !data.author || !data.status) {
      return res.status(400).json({ error: "title, author and status are required" });
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
        status: data.status,
        rating: data.rating ?? null,
        pages: data.pages ?? null,
        currentPage: data.currentPage ?? null,
        notes: data.notes ?? null,
        genre: data.genre ?? null,
        dateAdded: now,
        dateStarted: data.status === "reading" || data.status === "read" ? now : null,
        dateFinished: data.status === "read" ? now : null,
      })
      .returning();

    return res.status(201).json(formatBook(book));
  } catch (err) {
    return res.status(500).json({ error: "Failed to create book" });
  }
});

// GET /api/books/:id
router.get("/:id", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const [book] = await db
      .select()
      .from(booksTable)
      .where(and(eq(booksTable.id, req.params.id), eq(booksTable.userId, userId)));
    if (!book) return res.status(404).json({ error: "Not found" });
    return res.json(formatBook(book));
  } catch (err) {
    return res.status(500).json({ error: "Failed to fetch book" });
  }
});

// PATCH /api/books/:id
router.patch("/:id", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const [existing] = await db
      .select()
      .from(booksTable)
      .where(and(eq(booksTable.id, req.params.id), eq(booksTable.userId, userId)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    const data = req.body as {
      title?: string; author?: string; status?: string;
      rating?: number | null; pages?: number | null;
      currentPage?: number | null; notes?: string | null; genre?: string | null;
      dateStarted?: string | null; dateFinished?: string | null;
    };

    const updates: Partial<typeof booksTable.$inferInsert> = {};
    if (data.title !== undefined) updates.title = data.title;
    if (data.author !== undefined) updates.author = data.author;
    if (data.status !== undefined) {
      updates.status = data.status;
      if (data.status === "reading" && !existing.dateStarted) updates.dateStarted = new Date();
      if (data.status === "read") {
        if (!existing.dateStarted) updates.dateStarted = new Date();
        if (!existing.dateFinished) updates.dateFinished = new Date();
      }
    }
    if ("rating" in data) updates.rating = data.rating ?? null;
    if ("pages" in data) updates.pages = data.pages ?? null;
    if ("currentPage" in data) updates.currentPage = data.currentPage ?? null;
    if ("notes" in data) updates.notes = data.notes ?? null;
    if ("genre" in data) updates.genre = data.genre ?? null;
    if ("dateStarted" in data)
      updates.dateStarted = data.dateStarted ? new Date(data.dateStarted) : null;
    if ("dateFinished" in data)
      updates.dateFinished = data.dateFinished ? new Date(data.dateFinished) : null;

    const [book] = await db
      .update(booksTable)
      .set(updates)
      .where(and(eq(booksTable.id, req.params.id), eq(booksTable.userId, userId)))
      .returning();

    return res.json(formatBook(book));
  } catch (err) {
    return res.status(500).json({ error: "Failed to update book" });
  }
});

// POST /api/books/enrich-all  (must be before /:id)
router.post("/enrich-all", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;

    // Find books owned by this user that are missing pages OR genre
    const toEnrich = await db
      .select({ id: booksTable.id, title: booksTable.title, author: booksTable.author })
      .from(booksTable)
      .where(
        and(
          eq(booksTable.userId, userId),
          or(isNull(booksTable.pages), isNull(booksTable.genre)),
        ),
      );

    if (toEnrich.length === 0) {
      return res.json({ enriching: 0 });
    }

    // Fire-and-forget — do NOT await
    enrichBooksInBackground(toEnrich).catch(() => {/* swallow */});

    return res.json({ enriching: toEnrich.length });
  } catch (err) {
    return res.status(500).json({ error: "Failed to start enrichment" });
  }
});

// DELETE /api/books/:id
router.delete("/:id", requireAuth, async (req, res) => {
  try {
    const { userId } = req as AuthedRequest;
    const [existing] = await db
      .select()
      .from(booksTable)
      .where(and(eq(booksTable.id, req.params.id), eq(booksTable.userId, userId)));
    if (!existing) return res.status(404).json({ error: "Not found" });

    await db
      .delete(booksTable)
      .where(and(eq(booksTable.id, req.params.id), eq(booksTable.userId, userId)));
    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: "Failed to delete book" });
  }
});

export default router;

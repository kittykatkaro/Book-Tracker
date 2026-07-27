    /**
     * POST /api/books/import/parse  — parse uploaded file, return detected books (no DB write)
     * POST /api/books/import/confirm — save selected books to the user's library & trigger enrichment
     */
    import { Router, type Request, type Response, type NextFunction } from "express";
    import { eq } from "drizzle-orm";
    import { getAuth } from "@clerk/express";
    import multer from "multer";
    import { db, booksTable } from "@workspace/db";
    import { parseCSV, parseDOCX, parsePDF, type ParsedBook } from "../import-parsers.js";
    import { enrichBooksInBackground as enrichBooks } from "../lib/enrich.js";

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
    // POST /import/confirm — Batch insert and enrichment trigger
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
        existing.map((b) => `${b.title.toLowerCase()}|${b.author.toLowerCase()}`)
      );

      let imported = 0;
      let skipped = 0;

      const insertedForEnrichment: { 
        id: string; 
        title: string; 
        author: string; 
        isbn?: string; 
        hasMissingFields: boolean 
      }[] = [];

      for (const book of books) {
        if (!book.title?.trim() || !book.author?.trim()) {
          skipped++;
          continue;
        }

        const key = `${book.title.trim().toLowerCase()}|${book.author.trim().toLowerCase()}`;
        if (existingKeys.has(key)) {
          skipped++;
          continue;
        }

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
            genre: book.genre ?? null,
            dateAdded: now,
            dateStarted: (book.status === "reading" || book.status === "read") ? now : null,
            dateFinished: (book.status === "read") ? (dateRead ?? now) : null,
          });

          existingKeys.add(key);
          imported++;

          // Check if book lacks metadata and has sufficient info (Title or ISBN) to search
          const hasSearchableInfo = Boolean(book.isbn || book.title?.trim());
          const isMissingMetadata = !book.pages || !book.genre || !book.coverUrl;
          const needsEnrichment = isMissingMetadata && hasSearchableInfo;

          if (needsEnrichment) {
            insertedForEnrichment.push({
              id: bookId,
              title: book.title.trim(),
              author: book.author.trim(),
              isbn: book.isbn,
              hasMissingFields: true,
            });
          }
        } catch (error) {
          console.error(`[import/confirm] Failed to insert book "${book.title}":`, error);
          skipped++;
        }
      }

      // Trigger background enrichment asynchronously (fire and forget)
      if (insertedForEnrichment.length > 0) {
        enrichBooks(insertedForEnrichment).catch((err) => {
          console.error("[import/confirm] Background enrichment trigger failed:", err);
        });
      }

      return res.json({ 
        imported, 
        skipped, 
        enriching: insertedForEnrichment.length 
      });
    });

    export default router;
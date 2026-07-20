/**
 * File parsers for bulk book import.
 * Supports: Goodreads CSV, generic CSV, DOCX (via mammoth), PDF (via pdf-parse).
 */

import { classifyGenre } from "./lib/genres.js";

export interface ParsedBook {
  title: string;
  author: string;
  status: "reading" | "read" | "want_to_read";
  rating?: number;
  pages?: number;
  genre?: string;
  dateRead?: string; // ISO string
  isbn?: string;
  source: "goodreads" | "csv" | "pdf" | "docx";
}

// ---------------------------------------------------------------------------
// Shared text → book heuristic
// ---------------------------------------------------------------------------

const JUNK_LINES = /^(title|author|book|name|writer|by|no\.|#|\d+|page|pages|rating|genre|status|shelf)$/i;

/**
 * Try to extract books from arbitrary plain text.
 * Looks for lines matching: "Title – Author", "Title by Author",
 * "Author: Title", or numbered/bulleted list items.
 */
export function extractBooksFromText(text: string): ParsedBook[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 3 && l.length < 300);

  const books: ParsedBook[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    // Patterns: "Title – Author", "Title - Author", "Title — Author"
    const dashMatch = line.match(/^(.+?)\s+[–—-]\s+(.+)$/);
    if (dashMatch) {
      const [, a, b] = dashMatch;
      const title = a.trim();
      const author = b.trim();
      if (isLikelyTitle(title) && isLikelyAuthor(author)) {
        addBook(books, seen, { title, author, status: "want_to_read", source: "pdf" });
        continue;
      }
      // Try flipped
      if (isLikelyTitle(b.trim()) && isLikelyAuthor(a.trim())) {
        addBook(books, seen, { title: b.trim(), author: a.trim(), status: "want_to_read", source: "pdf" });
        continue;
      }
    }

    // Pattern: "Title by Author"
    const byMatch = line.match(/^(.+?)\s+[Bb][Yy]\s+(.+)$/);
    if (byMatch) {
      const [, title, author] = byMatch;
      if (isLikelyTitle(title.trim()) && isLikelyAuthor(author.trim())) {
        addBook(books, seen, { title: title.trim(), author: author.trim(), status: "want_to_read", source: "pdf" });
        continue;
      }
    }

    // Pattern: "Author: Title" or "Author, Title"
    const colonMatch = line.match(/^([A-Z][a-zA-Z\s\-'.]+),\s+(.+)$/) ||
                       line.match(/^([A-Z][a-zA-Z\s\-'.]+):\s+(.+)$/);
    if (colonMatch) {
      const [, a, b] = colonMatch;
      if (isLikelyAuthor(a.trim()) && isLikelyTitle(b.trim())) {
        addBook(books, seen, { title: b.trim(), author: a.trim(), status: "want_to_read", source: "pdf" });
        continue;
      }
    }

    // Numbered list: "1. Title by Author" or "1. Title – Author"
    const numberedMatch = line.match(/^\d+[\.\)]\s+(.+)$/);
    if (numberedMatch) {
      const inner = numberedMatch[1].trim();
      const innerDash = inner.match(/^(.+?)\s+[–—-]\s+(.+)$/);
      const innerBy = inner.match(/^(.+?)\s+[Bb][Yy]\s+(.+)$/);
      if (innerDash && isLikelyTitle(innerDash[1]) && isLikelyAuthor(innerDash[2])) {
        addBook(books, seen, { title: innerDash[1].trim(), author: innerDash[2].trim(), status: "want_to_read", source: "pdf" });
        continue;
      }
      if (innerBy && isLikelyTitle(innerBy[1]) && isLikelyAuthor(innerBy[2])) {
        addBook(books, seen, { title: innerBy[1].trim(), author: innerBy[2].trim(), status: "want_to_read", source: "pdf" });
      }
    }
  }

  return books;
}

function addBook(
  list: ParsedBook[],
  seen: Set<string>,
  book: ParsedBook,
): void {
  const key = `${book.title.toLowerCase()}|${book.author.toLowerCase()}`;
  if (seen.has(key) || JUNK_LINES.test(book.title) || JUNK_LINES.test(book.author)) return;
  if (book.title.length < 2 || book.author.length < 2) return;
  seen.add(key);
  list.push(book);
}

function isLikelyTitle(s: string): boolean {
  if (s.length < 2 || s.length > 200) return false;
  // Reject lines that are purely numeric or look like headers
  if (/^\d+$/.test(s)) return false;
  return true;
}

function isLikelyAuthor(s: string): boolean {
  if (s.length < 2 || s.length > 100) return false;
  if (/^\d+$/.test(s)) return false;
  // Authors typically contain at least one letter word
  if (!/[A-Za-z]/.test(s)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// CSV parser (no dependencies — handles quoted fields)
// ---------------------------------------------------------------------------

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function mapGoodreadsShelf(shelf: string): ParsedBook["status"] {
  const s = shelf.toLowerCase().trim();
  if (s === "read") return "read";
  if (s === "currently-reading" || s === "reading") return "reading";
  return "want_to_read";
}

export function parseCSV(buffer: Buffer): ParsedBook[] {
  const text = buffer.toString("utf-8");
  const rawLines = text.split(/\r?\n/);
  if (rawLines.length < 2) return [];

  const headers = parseCsvLine(rawLines[0]).map((h) => h.toLowerCase().trim());

  // ---- Detect Goodreads format ----
  const isGoodreads =
    headers.includes("exclusive shelf") || headers.includes("my rating");

  const idx = (name: string) => headers.indexOf(name);

  const books: ParsedBook[] = [];
  const seen = new Set<string>();

  for (let i = 1; i < rawLines.length; i++) {
    const raw = rawLines[i].trim();
    if (!raw) continue;

    const cols = parseCsvLine(raw);
    const get = (name: string) => {
      const j = idx(name);
      return j >= 0 ? (cols[j] ?? "").trim() : "";
    };

    if (isGoodreads) {
      const title = get("title");
      const author = get("author");
      if (!title || !author) continue;

      const ratingStr = get("my rating");
      const rating = ratingStr ? parseInt(ratingStr, 10) : undefined;
      const pagesStr = get("number of pages");
      const pages = pagesStr ? parseInt(pagesStr, 10) : undefined;
      const shelf = get("exclusive shelf");
      const status = mapGoodreadsShelf(shelf);
      const dateReadStr = get("date read");
      const bookshelves = get("bookshelves");

      const key = `${title.toLowerCase()}|${author.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      books.push({
        title,
        author,
        status,
        rating: rating && rating > 0 ? rating : undefined,
        pages: pages && pages > 0 ? pages : undefined,
        genre: classifyGenre(bookshelves?.split(",").map((s) => s.trim())) ?? undefined,
        dateRead: dateReadStr || undefined,
        source: "goodreads",
      });
    } else {
      // Generic CSV: sniff title and author columns
      const titleIdx =
        headers.findIndex((h) => /^(title|book|book[\s_]?title|name)$/.test(h));
      const authorIdx =
        headers.findIndex((h) => /^(author|writer|author[\s_]?name)$/.test(h));

      if (titleIdx < 0 || authorIdx < 0) {
        // No recognised header — try first two columns as title/author, but
        // only when the values actually look like book metadata.  This prevents
        // non-book CSVs (expense reports, inventories, etc.) from silently
        // producing garbage book entries.
        const title = cols[0]?.trim();
        const author = cols[1]?.trim();
        if (!title || !author) continue;
        if (!isLikelyTitle(title) || !isLikelyAuthor(author)) continue;
        const key = `${title.toLowerCase()}|${author.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        books.push({ title, author, status: "want_to_read", source: "csv" });
        continue;
      }

      const title = (cols[titleIdx] ?? "").trim();
      const author = (cols[authorIdx] ?? "").trim();
      if (!title || !author) continue;

      const statusIdx = headers.findIndex((h) => /^status$/.test(h));
      const pagesIdx = headers.findIndex((h) => /^(pages|page[\s_]?count|num[\s_]?pages)$/.test(h));

      const rawStatus = statusIdx >= 0 ? (cols[statusIdx] ?? "").toLowerCase() : "";
      const status: ParsedBook["status"] =
        rawStatus === "read" || rawStatus === "finished" ? "read"
        : rawStatus === "reading" || rawStatus === "in progress" ? "reading"
        : "want_to_read";

      const pages = pagesIdx >= 0 ? parseInt(cols[pagesIdx] ?? "", 10) : undefined;

      const key = `${title.toLowerCase()}|${author.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);

      books.push({
        title,
        author,
        status,
        pages: pages && !isNaN(pages) ? pages : undefined,
        source: "csv",
      });
    }
  }

  return books;
}

// ---------------------------------------------------------------------------
// DOCX parser (mammoth)
// ---------------------------------------------------------------------------

export async function parseDOCX(buffer: Buffer): Promise<ParsedBook[]> {
  // Dynamic import to avoid bundling issues
  const mammoth = await import("mammoth");
  const { value: text } = await mammoth.extractRawText({ buffer });
  return extractBooksFromText(text).map((b) => ({ ...b, source: "docx" as const }));
}

// ---------------------------------------------------------------------------
// PDF parser (pdf-parse)
// ---------------------------------------------------------------------------

export async function parsePDF(buffer: Buffer): Promise<ParsedBook[]> {
  // @ts-ignore — pdf-parse has no bundled types in ESM
  const pdfParse = (await import("pdf-parse")).default;
  const data = await pdfParse(buffer);
  return extractBooksFromText(data.text).map((b) => ({ ...b, source: "pdf" as const }));
}

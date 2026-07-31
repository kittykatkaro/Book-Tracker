/**
 * Shared OpenLibrary ISBN lookup — used by both the single-ISBN
 * (`/isbn-lookup`) and bulk-ISBN (`/isbn-bulk-lookup`) routes so they
 * share one code path and one cache namespace. A book looked up via
 * either endpoint is cached for the other too.
 */
import { classifyGenre } from "./genres.js";
import { cacheGet, cacheSet, CACHE_TTL } from "./openlibrary-cache.js";

export interface OpenLibraryBookResult {
  status: "found" | "not_found";
  isbn: string;
  title?: string;
  author?: string;
  pages?: number | null;
  genre?: string | null;
  coverUrl?: string | null;
  publishYear?: number | null;
}

async function fetchIsbnFromOpenLibrary(cleanIsbn: string): Promise<OpenLibraryBookResult> {
  const url = `https://openlibrary.org/api/books?bibkeys=ISBN:${cleanIsbn}&format=json&jscmd=data`;
  const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = (await response.json()) as Record<string, unknown>;
  const key = `ISBN:${cleanIsbn}`;

  if (!data[key]) {
    return { status: "not_found", isbn: cleanIsbn };
  }

  const book = data[key] as Record<string, unknown>;
  const authors = Array.isArray(book.authors)
    ? (book.authors as { name?: string }[]).map((a) => a.name).filter(Boolean).join(", ")
    : "";
  const subjects = book.subjects as { name?: string }[] | string[] | undefined;
  const genre = classifyGenre(subjects);
  const publishYear = book.publish_date
    ? (() => {
        const m = String(book.publish_date).match(/\d{4}/);
        return m ? parseInt(m[0], 10) : null;
      })()
    : null;
  const cover = book.cover as Record<string, string> | undefined;

  return {
    status: "found",
    isbn: cleanIsbn,
    title: (book.title as string) || "",
    author: authors,
    pages: (book.number_of_pages as number) ?? null,
    genre,
    coverUrl: cover?.large || cover?.medium || cover?.small || null,
    publishYear,
  };
}

/**
 * Look up a single (already-cleaned) ISBN on OpenLibrary, checking the
 * shared cache first. Only successful fetches (found or a clean
 * not-found) are cached — network errors/timeouts are never cached, so a
 * transient failure doesn't get "stuck" as a false negative.
 */
export async function lookupIsbnCached(cleanIsbn: string): Promise<OpenLibraryBookResult> {
  const cacheKey = `isbn:${cleanIsbn}`;
  const cached = cacheGet<OpenLibraryBookResult>(cacheKey);
  if (cached) return cached;

  const result = await fetchIsbnFromOpenLibrary(cleanIsbn);
  cacheSet(cacheKey, result, result.status === "found" ? CACHE_TTL.FOUND : CACHE_TTL.NOT_FOUND);
  return result;
}

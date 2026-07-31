/**
 * Shared enrichment utilities — used by both the import flow and the
 * on-demand enrich-all endpoint.
 */
import { eq, and } from "drizzle-orm";
import { booksTable, withUserContext } from "@workspace/db";
import { classifyGenre } from "./genres.js";
import { cacheGet, cacheSet, CACHE_TTL } from "./openlibrary-cache.js";

/**
 * Look up a book by title + author on OpenLibrary's search API.
 * Returns { pages, genre } with whichever fields were found, or null on failure.
 * Cached by title+author so re-enriching (e.g. via /enrich-all, or the
 * same book appearing in more than one import) skips the external call.
 */
export async function lookupByTitleAuthor(
  title: string,
  author: string,
): Promise<{ pages: number | null; genre: string | null } | null> {
  const cacheKey = `ta:${title.trim().toLowerCase()}|${author.trim().toLowerCase()}`;
  const cached = cacheGet<{ pages: number | null; genre: string | null } | null>(cacheKey);
  if (cached !== undefined) return cached;

  try {
    const params = new URLSearchParams({
      title,
      author,
      limit: "1",
      fields: "number_of_pages_median,subject",
    });
    const url = `https://openlibrary.org/search.json?${params.toString()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null; // don't cache transient HTTP failures
    const data = (await res.json()) as {
      docs?: { number_of_pages_median?: number; subject?: string[] }[];
    };
    const doc = data.docs?.[0];
    if (!doc) {
      cacheSet(cacheKey, null, CACHE_TTL.NOT_FOUND);
      return null;
    }
    const result = {
      pages: doc.number_of_pages_median ?? null,
      genre: classifyGenre(doc.subject),
    };
    cacheSet(cacheKey, result, CACHE_TTL.FOUND);
    return result;
  } catch {
    return null; // don't cache network errors/timeouts
  }
}

/**
 * For each book id provided, query OpenLibrary and patch the DB row
 * for any fields (pages, genre) that are still null.
 * Runs entirely in the background — errors are swallowed per book.
 *
 * `userId` is required (not just for filtering — these books were already
 * fetched from a user-scoped query by the caller) so the DB writes carry
 * the same RLS session context as the rest of that user's requests; see
 * withUserContext() in lib/db. Without it, these background writes would
 * run with no app.current_user_id set, which the RLS `withCheck` policy
 * on `books` would reject once RLS is actually enforced for this role.
 *
 * `onProgress` (optional) is called after each book is processed —
 * used by the import job tracker to report "enriching X/Y" status.
 */
export async function enrichBooksInBackground(
  userId: string,
  books: { id: string; title: string; author: string }[],
  onProgress?: (done: number, total: number) => void,
): Promise<void> {
  let done = 0;
  for (const book of books) {
    try {
      const result = await lookupByTitleAuthor(book.title, book.author);
      if (!result) continue;
      if (!result.pages && !result.genre) continue;

      await withUserContext(userId, async (tx) => {
        // Only update fields that are still null in the DB
        const [current] = await tx
          .select({ pages: booksTable.pages, genre: booksTable.genre })
          .from(booksTable)
          .where(and(eq(booksTable.id, book.id), eq(booksTable.userId, userId)));
        if (!current) return;

        const patch: Partial<typeof booksTable.$inferInsert> = {};
        if (!current.pages && result.pages) patch.pages = result.pages;
        if (!current.genre && result.genre) patch.genre = result.genre;
        if (Object.keys(patch).length === 0) return;

        await tx
          .update(booksTable)
          .set(patch)
          .where(and(eq(booksTable.id, book.id), eq(booksTable.userId, userId)));
      });
    } catch {
      // swallow — enrichment is best-effort
    } finally {
      done++;
      onProgress?.(done, books.length);
    }
  }
}

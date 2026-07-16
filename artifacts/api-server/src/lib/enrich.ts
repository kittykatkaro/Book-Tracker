/**
 * Shared enrichment utilities — used by both the import flow and the
 * on-demand enrich-all endpoint.
 */
import { eq } from "drizzle-orm";
import { db, booksTable } from "@workspace/db";

/**
 * Look up a book by title + author on OpenLibrary's search API.
 * Returns { pages, genre } with whichever fields were found, or null on failure.
 */
export async function lookupByTitleAuthor(
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
 * For each book id provided, query OpenLibrary and patch the DB row
 * for any fields (pages, genre) that are still null.
 * Runs entirely in the background — errors are swallowed per book.
 */
export async function enrichBooksInBackground(
  books: { id: string; title: string; author: string }[],
): Promise<void> {
  for (const book of books) {
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

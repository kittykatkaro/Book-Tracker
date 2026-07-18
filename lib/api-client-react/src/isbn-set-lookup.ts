import { customFetch } from "./custom-fetch";
import type { IsbnBulkEntry } from "./isbn-bulk";

export type SetConfidence = "high" | "medium" | "low";

export interface BooksetLookupResult {
  isSet: boolean;
  setTitle?: string;
  seriesName?: string | null;
  author?: string;
  estimatedCount?: number | null;
  confidence?: SetConfidence;
  matchedCount?: number;
  /** Human-readable status note from the server (e.g. why no matches were found). */
  message?: string | null;
  /** Best-effort guessed individual volumes. Always review before importing. */
  books: IsbnBulkEntry[];
}

/**
 * Given the ISBN of a boxed set / omnibus edition, ask the server to guess
 * which individual books it contains.
 *
 * IMPORTANT: this is a heuristic best-effort match (there is no public API
 * that maps a boxset ISBN to its component ISBNs) — always present the
 * result to the user for review before importing, and show a disclaimer.
 */
export async function lookupIsbnSet(
  isbn: string,
  options?: RequestInit,
): Promise<BooksetLookupResult> {
  const params = new URLSearchParams({ isbn });
  return customFetch<BooksetLookupResult>(`/api/books/isbn-set-lookup?${params.toString()}`, {
    ...options,
    method: "GET",
  });
}

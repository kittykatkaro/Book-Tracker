import { customFetch } from "./custom-fetch";

export type IsbnLookupStatus = "found" | "not_found" | "invalid" | "error";

export interface IsbnBulkEntry {
  isbn: string;
  status: IsbnLookupStatus;
  title?: string;
  author?: string;
  pages?: number | null;
  genre?: string | null;
  coverUrl?: string | null;
  publishYear?: number | null;
}

export interface IsbnBulkResult {
  results: IsbnBulkEntry[];
}

/**
 * Look up multiple ISBNs in one request.
 * Maximum 20 ISBNs per call.
 */
export async function bulkLookupIsbn(
  isbns: string[],
  options?: RequestInit,
): Promise<IsbnBulkResult> {
  return customFetch<IsbnBulkResult>("/api/books/isbn-bulk-lookup", {
    ...options,
    method: "POST",
    body: JSON.stringify({ isbns }),
  });
}

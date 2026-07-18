/**
 * Canonical genre list — the single source of truth for both the web app
 * and the mobile app. Keep this in sync with the backend's copy at
 * artifacts/api-server/src/lib/genres.ts (the server can't depend on this
 * package, since it's a React-flavored client library).
 */
export const GENRES = [
  "Fiction",
  "Non-Fiction",
  "Mystery",
  "Fantasy",
  "Sci-Fi",
  "Biography",
  "History",
  "Self-Help",
  "Romance",
  "Thriller",
  "Other",
] as const;

export type Genre = (typeof GENRES)[number];

const genreByLowercase = new Map<string, string>(GENRES.map((g) => [g.toLowerCase(), g]));

/**
 * Aggregate genre counts case-insensitively, collapsing casing variants
 * (and matching them to canonical casing when possible) so stats don't
 * fragment "Fantasy" / "fantasy" / "FANTASY" into separate buckets.
 */
export function aggregateGenreCounts(
  genres: (string | null | undefined)[],
): { genre: string; count: number }[] {
  const counts = new Map<string, { label: string; count: number }>();

  for (const raw of genres) {
    const trimmed = raw?.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    const label = genreByLowercase.get(key) ?? trimmed;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { label, count: 1 });
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .map(({ label, count }) => ({ genre: label, count }));
}

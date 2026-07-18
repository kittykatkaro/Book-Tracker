/**
 * Canonical genre list — keep in sync with the frontend's copy at
 * lib/api-client-react/src/genres.ts. Duplicated rather than shared because
 * the API server shouldn't depend on a React-flavored client package.
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

// Open Library subject tags that describe format/availability/metadata
// rather than genre — never let these become a book's "genre".
const JUNK_SUBJECT_RE =
  /protected daisy|accessible book|large type|large print|overdrive|internet archive|lending library|in library|open library staff picks|nyt:|popular prints|reading level|show more|has fulltext|readerlink/i;

// Ordered most-specific-first: a subject is checked against each pattern in
// turn, so narrower genres (e.g. "historical fiction" -> Fiction) win over
// broader ones (e.g. "historical" -> History) when both could apply.
const RULES: { genre: Genre; pattern: RegExp }[] = [
  { genre: "Fiction", pattern: /historical fiction|literary fiction/i },
  { genre: "Fantasy", pattern: /\bfantasy\b|\bdragons?\b|\bwizards?\b|\bmagic\b/i },
  { genre: "Sci-Fi", pattern: /science fiction|sci-fi|space opera|\bdystopia/i },
  { genre: "Mystery", pattern: /\bmystery\b|\bdetective|crime fiction|whodunit/i },
  { genre: "Thriller", pattern: /\bthriller\b|\bsuspense\b|spy stories|espionage/i },
  { genre: "Romance", pattern: /\bromance\b|love stories/i },
  { genre: "Biography", pattern: /\bbiography\b|autobiography|\bmemoir\b/i },
  { genre: "Self-Help", pattern: /self-help|self help|personal growth|self improvement/i },
  { genre: "History", pattern: /\bhistory\b|\bhistorical\b/i },
  { genre: "Non-Fiction", pattern: /non-?fiction/i },
  { genre: "Fiction", pattern: /\bfiction\b/i },
];

/**
 * Classify a raw list of Open Library subject tags into one of our
 * canonical genres. Returns null (leave ungenred) only when every subject
 * looks like junk metadata; returns "Other" when subjects exist but none
 * matched a known genre pattern.
 */
export function classifyGenre(rawSubjects: unknown): Genre | null {
  const subjects: string[] = Array.isArray(rawSubjects)
    ? rawSubjects
        .map((s) => (typeof s === "string" ? s : (s as { name?: string })?.name))
        .filter((s): s is string => typeof s === "string" && s.trim().length > 0)
    : [];

  const clean = subjects.filter((s) => !JUNK_SUBJECT_RE.test(s));
  if (clean.length === 0) return null;

  for (const { genre, pattern } of RULES) {
    if (clean.some((s) => pattern.test(s))) return genre;
  }
  return "Other";
}

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

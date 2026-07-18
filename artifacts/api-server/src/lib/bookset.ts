/**
 * Heuristics for detecting a "boxed set" / omnibus ISBN and guessing the
 * individual books it likely contains.
 *
 * IMPORTANT: there is no public API that maps a boxset ISBN to the ISBNs of
 * its individual volumes. This module makes a best-effort guess by:
 *   1. Detecting set-like language in the title ("Boxed Set", "Trilogy",
 *      "Books 1-3", etc.) and estimating a volume count from it.
 *   2. Deriving a probable series name by stripping that language from the
 *      title.
 *   3. Letting the caller search a bibliographic API (Open Library) for
 *      other books by the same author matching that series name.
 *
 * Callers MUST treat the result as a suggestion, not a fact — surface a
 * disclaimer to the user and let them review/deselect before importing.
 */

export type SetConfidence = "high" | "medium" | "low";

export interface SetSignal {
  matched: boolean;
  /** Explicit numeric range detected, e.g. "Books 1-7" -> 7 */
  rangeCount: number | null;
  /** Word-based count, e.g. "trilogy" -> 3 */
  wordCount: number | null;
}

const WORD_COUNTS: Record<string, number> = {
  duology: 2,
  diptych: 2,
  trilogy: 3,
  triptych: 3,
  tetralogy: 4,
  quartet: 4,
  quadrilogy: 4,
  pentalogy: 5,
  quintet: 5,
  hexalogy: 6,
  septology: 7,
  heptalogy: 7,
  octology: 8,
};

// Generic set language that doesn't imply a specific count on its own.
const GENERIC_SET_RE =
  /\b(boxed?\s*set|box\s*set|box\s*edition|collection|bundle|omnibus|complete\s+(series|collection)|series\s+set)\b/i;

const WORD_COUNT_RE = new RegExp(`\\b(${Object.keys(WORD_COUNTS).join("|")})\\b`, "i");

// "Books 1-7", "Vol. 1-3", "#1-3", "1-3", "Volumes 1 to 3"
const RANGE_RE =
  /\b(?:books?|vols?\.?|volumes?|#)?\s*(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\b/i;

/**
 * Detect whether a title looks like a boxed set / omnibus, and if so,
 * estimate how many individual volumes it likely contains.
 */
export function detectSetSignal(title: string): SetSignal {
  const genericMatch = GENERIC_SET_RE.test(title);
  const wordMatch = title.match(WORD_COUNT_RE);
  const rangeMatch = title.match(RANGE_RE);

  let rangeCount: number | null = null;
  if (rangeMatch) {
    const a = parseInt(rangeMatch[1], 10);
    const b = parseInt(rangeMatch[2], 10);
    if (!isNaN(a) && !isNaN(b) && b > a && b - a < 30) {
      rangeCount = b - a + 1;
    }
  }

  const wordCount = wordMatch ? WORD_COUNTS[wordMatch[1].toLowerCase()] ?? null : null;

  const matched = genericMatch || wordMatch != null || rangeCount != null;

  return { matched, rangeCount, wordCount };
}

/**
 * Strip set-indicating language (and anything after it) from a title to
 * guess the underlying series/base name.
 *
 * "Harry Potter Paperback Boxed Set Books 1-7" -> "Harry Potter Paperback"
 * "The Mistborn Trilogy"                        -> "The Mistborn"
 */
export function deriveSeriesName(title: string): string {
  let base = title;

  // Cut at the first occurrence of any set-signal phrase.
  const cutPatterns = [GENERIC_SET_RE, WORD_COUNT_RE, RANGE_RE];
  for (const pattern of cutPatterns) {
    const match = base.match(pattern);
    if (match && match.index != null) {
      base = base.slice(0, match.index);
    }
  }

  // Clean up trailing punctuation / connector words left behind.
  base = base
    .replace(/[:\-–—(),]+\s*$/g, "")
    .replace(/\b(the|a|an)\s*$/i, "")
    .trim();

  return base || title.trim();
}

/** Estimate how many volumes a detected set likely contains. */
export function estimateVolumeCount(signal: SetSignal): number | null {
  if (signal.rangeCount) return signal.rangeCount;
  if (signal.wordCount) return signal.wordCount;
  if (signal.matched) return 3; // generic "boxed set" with no explicit count — rough guess
  return null;
}

/** Normalize a title for de-duplication / comparison purposes. */
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[:\-–—].*$/, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** True if a candidate title itself looks like another set/omnibus (skip it). */
export function looksLikeAnotherSet(title: string): boolean {
  return detectSetSignal(title).matched;
}

/**
 * Decide a confidence label for the guessed set expansion based on how the
 * estimate was derived and how many plausible matches were actually found.
 */
export function computeConfidence(
  signal: SetSignal,
  estimatedCount: number | null,
  matchedCount: number,
): SetConfidence {
  if (matchedCount === 0) return "low";
  if (signal.rangeCount && matchedCount >= signal.rangeCount - 1) return "high";
  if (signal.wordCount && matchedCount >= signal.wordCount - 1) return "medium";
  if (estimatedCount && matchedCount >= Math.min(estimatedCount, 2)) return "medium";
  return "low";
}

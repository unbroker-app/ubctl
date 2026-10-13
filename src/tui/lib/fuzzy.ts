/**
 * Score how well `query` matches `text`: contiguous matches beat scattered
 * subsequences, and matches at the start or after a separator score higher.
 * Returns -1 when `query` is not a subsequence of `text`.
 */
export function fuzzyScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (!q) return 0;
  const direct = t.indexOf(q);
  if (direct >= 0) return 1000 - direct + (direct === 0 ? 500 : 0);

  let score = 0;
  let from = 0;
  let previous = -2;
  for (const char of q) {
    const at = t.indexOf(char, from);
    if (at < 0) return -1;
    score += at === previous + 1 ? 10 : 1;
    if (at === 0 || /[\s/_.-]/.test(t[at - 1] ?? "")) score += 5;
    previous = at;
    from = at + 1;
  }
  return score;
}

/** Filter and rank items by the best score across their searchable fields. */
export function fuzzyFilter<T>(
  query: string,
  items: readonly T[],
  fields: (item: T) => string[],
): T[] {
  if (!query.trim()) return [...items];
  return items
    .map((item) => ({
      item,
      score: Math.max(...fields(item).map((f) => fuzzyScore(query.trim(), f))),
    }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.item);
}

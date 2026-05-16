/**
 * Splits `text` into segments, marking substrings that match any patch's
 * original_text. Returns an array of { text, patchId? } objects.
 *
 * Matches are found left-to-right; overlapping patches are not supported
 * (per the patch instructions).
 */
export function annotateText(text, patches) {
  if (!patches || patches.length === 0) return [{ text }]

  // Build a sorted list of [start, end, patchId] intervals
  const intervals = []
  for (const patch of patches) {
    const target = patch.original_text
    let idx = 0
    while (idx < text.length) {
      const pos = text.indexOf(target, idx)
      if (pos === -1) break
      intervals.push({ start: pos, end: pos + target.length, patchId: patch.id })
      idx = pos + target.length
    }
  }

  if (intervals.length === 0) return [{ text }]

  // Sort by start position; resolve overlaps greedily (keep first)
  intervals.sort((a, b) => a.start - b.start)
  const merged = []
  let cursor = 0
  for (const iv of intervals) {
    if (iv.start < cursor) continue // overlaps with previous — skip
    merged.push(iv)
    cursor = iv.end
  }

  // Build segments
  const segments = []
  let pos = 0
  for (const iv of merged) {
    if (pos < iv.start) segments.push({ text: text.slice(pos, iv.start) })
    segments.push({ text: text.slice(iv.start, iv.end), patchId: iv.patchId })
    pos = iv.end
  }
  if (pos < text.length) segments.push({ text: text.slice(pos) })

  return segments
}

import { annotateText } from '../lib/annotate.js'

/**
 * Renders `text` with amber-underlined spans for any patch original_text match.
 * Clicking a span calls onSpanClick(patchId).
 */
export default function AnnotatedText({ text, patches, highlightedPatchId, onSpanClick }) {
  const segments = annotateText(text, patches)

  return (
    <>
      {segments.map((seg, i) =>
        seg.patchId ? (
          <span
            key={i}
            onClick={() => onSpanClick(seg.patchId)}
            className={[
              'underline decoration-amber-400 decoration-2 cursor-pointer rounded-sm px-0.5 transition-colors',
              highlightedPatchId === seg.patchId
                ? 'bg-amber-100 text-amber-900'
                : 'hover:bg-amber-50',
            ].join(' ')}
          >
            {seg.text}
          </span>
        ) : (
          <span key={i}>{seg.text}</span>
        )
      )}
    </>
  )
}

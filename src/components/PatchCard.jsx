import { useEffect, useRef, useState } from 'react'
import { extractRubricTag, getSeverity, CATEGORY_NAMES, CATEGORY_TOOLTIPS } from '../lib/rubric.js'

// Badge: background / text / border
const SEVERITY_BADGE = {
  high:   'bg-[#FCEBEB] text-[#A32D2D] border border-[#F09595]',
  medium: 'bg-[#FAEEDA] text-[#854F0B] border border-[#EF9F27]',
  low:    'bg-gray-100  text-gray-500  border border-gray-200',
}

// Card border when not fixed / not highlighted
const SEVERITY_BORDER = {
  high:   'border-[#F09595]',
  medium: 'border-[#EF9F27]',
  low:    'border-gray-200',
}

function MCQPreview({ label, question, choices }) {
  const letters = 'ABCDEFGHIJKLMNOP'
  return (
    <div className="flex-1 rounded-lg border p-3 text-xs">
      <p className="mb-1 font-semibold text-gray-500">{label}</p>
      <p className="mb-2 font-medium text-gray-800">{question}</p>
      <ul className="space-y-0.5">
        {choices.map((c, i) => (
          <li key={i} className="text-gray-600">{letters[i]}) {c}</li>
        ))}
      </ul>
    </div>
  )
}

export default function PatchCard({
  patch,
  mcq,
  isHighlighted,
  onClick,
  onApply,
  onAcceptRewrite,
  onRewrite,
}) {
  const ref = useRef(null)
  const [rewriting, setRewriting] = useState(false)

  const rubricTag = patch.rubric_tag ?? extractRubricTag(patch.explanation)
  const severity = getSeverity(rubricTag)
  const isRewritePatch = patch.replaced_text === 'This question requires a full rewrite.'

  useEffect(() => {
    if (isHighlighted && ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [isHighlighted])

  async function handleRewrite() {
    setRewriting(true)
    try {
      await onRewrite(patch)
    } finally {
      setRewriting(false)
    }
  }

  return (
    <div
      ref={ref}
      id={patch.id}
      onClick={!patch.fixed ? onClick : undefined}
      className={[
        'rounded-xl border p-4 transition-all',
        patch.fixed
          ? 'border-green-200 bg-green-50'
          : isHighlighted
          ? 'cursor-pointer border-blue-400 bg-blue-50/40 ring-2 ring-blue-200'
          : `cursor-pointer bg-white hover:bg-gray-50/60 ${SEVERITY_BORDER[severity]}`,
      ].join(' ')}
    >
      {/* Top row: rubric tag + category badge + fixed badge */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {rubricTag && (
          <span className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-600">
            {rubricTag}
          </span>
        )}
        <span
          title={CATEGORY_TOOLTIPS[severity]}
          className={`cursor-default rounded px-1.5 py-0.5 text-xs font-medium ${SEVERITY_BADGE[severity]}`}
        >
          {CATEGORY_NAMES[severity]}
        </span>
        {patch.fixed && (
          <span className="ml-auto text-xs font-medium text-green-700">✓ Fixed</span>
        )}
      </div>

      {isRewritePatch ? (
        /* Rewrite-required card */
        <div>
          <p className="mb-2 text-xs font-medium text-amber-800">
            ⚠ This question requires a full rewrite
          </p>
          <p className="mb-3 text-xs leading-relaxed text-gray-600">{patch.explanation}</p>

          {mcq.rewrite ? (
            /* Show before/after after rewrite */
            <div>
              <div className="mb-3 flex gap-2">
                <MCQPreview label="Before" question={mcq.question} choices={mcq.choices} />
                <MCQPreview label="After" question={mcq.rewrite.question} choices={mcq.rewrite.choices} />
              </div>
              <p className="mb-3 text-xs italic text-gray-500">{mcq.rewrite.explanation}</p>
              {!patch.fixed && (
                <button
                  onClick={(e) => { e.stopPropagation(); onAcceptRewrite() }}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                >
                  Accept rewrite
                </button>
              )}
            </div>
          ) : (
            !patch.fixed && (
              <button
                onClick={(e) => { e.stopPropagation(); handleRewrite() }}
                disabled={rewriting}
                className="flex items-center gap-2 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60"
              >
                {rewriting && (
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                )}
                {rewriting ? 'Rewriting…' : 'Rewrite'}
              </button>
            )
          )}
        </div>
      ) : (
        /* Normal patch card */
        <div>
          <div className="mb-3 flex flex-wrap items-start gap-2 text-xs">
            <span className="whitespace-pre-wrap rounded bg-red-50 px-2 py-1 font-mono text-red-700 line-through">
              {patch.original_text}
            </span>
            <span className="mt-1 text-gray-400">→</span>
            <span className="whitespace-pre-wrap rounded bg-green-50 px-2 py-1 font-mono text-green-700">
              {patch.replaced_text}
            </span>
          </div>
          <p className="mb-3 text-xs leading-relaxed text-gray-600">{patch.explanation}</p>
          {patch.fixed ? (
            <span className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
              ✓ Fixed
            </span>
          ) : (
            <button
              onClick={(e) => { e.stopPropagation(); onApply() }}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Apply fix
            </button>
          )}
        </div>
      )}
    </div>
  )
}

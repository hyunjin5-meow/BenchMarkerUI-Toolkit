import { useEffect, useState } from 'react'
import PatchCard from './PatchCard.jsx'
import { fetchBlooms, fetchDetectLevel, fetchDistractors, fetchCustomRewrite } from '../lib/api.js'
import { extractRubricTag, CATEGORY_ORDER, getSeverity } from '../lib/rubric.js'

const LETTERS = 'ABCDEFGHIJKLMNOP'

function MCQPreview({ label, question, choices, answer }) {
  return (
    <div className="flex-1 rounded-lg border bg-gray-50 p-3 text-xs">
      <p className="mb-1 font-semibold text-gray-500">{label}</p>
      <p className="mb-2 font-medium text-gray-800">{question}</p>
      <ul className="space-y-0.5">
        {choices.map((c, i) => (
          <li
            key={i}
            className={LETTERS[i] === answer ? 'font-medium text-green-700' : 'text-gray-600'}
          >
            {LETTERS[i]}) {c}
          </li>
        ))}
      </ul>
    </div>
  )
}

function ChevronIcon({ open }) {
  return (
    <svg
      className={`h-3.5 w-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
      fill="none" stroke="currentColor" viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  )
}

// ── More actions (collapsible) ────────────────────────────────────────────────
function MoreActionsSection({ mcq, mcqIndex, onUpdateMCQ, onAcceptBlooms, onAcceptDistractors, onAcceptCustomRewrite }) {
  const [open, setOpen] = useState(false)

  const DIFFICULTY_OPTIONS = [
    { label: 'Much easier', value: -2 },
    { label: 'Easier',      value: -1 },
    { label: 'Keep same',   value:  0 },
    { label: 'Harder',      value:  1 },
    { label: 'Much harder', value:  2 },
  ]

  // Adjust difficulty state
  const [bloomsDelta, setBloomsDelta] = useState(0)
  const [bloomsLoading, setBloomsLoading] = useState(false)
  const [detectedLevel, setDetectedLevel] = useState(null)

  // Add distractors state
  const [distractorsCount, setDistractorsCount] = useState(1)
  const [distractorsLoading, setDistractorsLoading] = useState(false)

  // Custom rewrite state
  const [customRewriteText, setCustomRewriteText] = useState('')
  const [customRewriteLoading, setCustomRewriteLoading] = useState(false)

  // Detect Bloom's level on mount / question change
  useEffect(() => {
    if (!mcq || mcq.status === 'idle' || mcq.status === 'loading') return
    setDetectedLevel(null)
    let cancelled = false
    fetchDetectLevel(mcq)
      .then((result) => { if (!cancelled) setDetectedLevel(result) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [mcq.question])

  async function handleApplyBlooms() {
    if (bloomsDelta === 0) return
    const opt = DIFFICULTY_OPTIONS.find((o) => o.value === bloomsDelta)
    setBloomsLoading(true)
    try {
      const result = await fetchBlooms(mcq, bloomsDelta, opt.label.toLowerCase(), detectedLevel?.label ?? 'unknown')
      onUpdateMCQ(mcqIndex, { bloomsResult: result })
    } catch (err) {
      alert(`Blooms error: ${err.message}`)
    } finally {
      setBloomsLoading(false)
    }
  }

  async function handleApplyDistractors() {
    setDistractorsLoading(true)
    try {
      const result = await fetchDistractors(mcq, distractorsCount)
      onUpdateMCQ(mcqIndex, { distractorsResult: result })
    } catch (err) {
      alert(`Distractors error: ${err.message}`)
    } finally {
      setDistractorsLoading(false)
    }
  }

  async function handleCustomRewrite() {
    if (!customRewriteText.trim()) return
    setCustomRewriteLoading(true)
    try {
      const result = await fetchCustomRewrite(mcq, customRewriteText)
      onUpdateMCQ(mcqIndex, { customRewriteResult: result })
    } catch (err) {
      alert(`Custom rewrite error: ${err.message}`)
    } finally {
      setCustomRewriteLoading(false)
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border border-gray-200">
      {/* Header toggle */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between bg-gray-50 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
      >
        <span>More actions</span>
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="divide-y divide-gray-100 bg-white">
          {/* ── Adjust difficulty ── */}
          <div className="p-4">
            <p className="mb-2 text-sm font-semibold text-gray-800">Adjust difficulty</p>
            <p className="mb-3 text-xs text-gray-400">
              {detectedLevel
                ? <>Current level: <span className="font-medium text-gray-500">{detectedLevel.label} ({detectedLevel.level}/6)</span> — "{detectedLevel.reason}"</>
                : mcq.status === 'done' ? <span className="italic">Detecting level…</span> : null}
            </p>
            <div className="mb-3 flex flex-wrap items-center gap-1.5">
              {DIFFICULTY_OPTIONS.map((opt) => {
                const lvl = detectedLevel?.level ?? null
                const outOfBounds =
                  lvl !== null && (
                    (opt.value === -2 && lvl <= 2) ||
                    (opt.value === -1 && lvl <= 1) ||
                    (opt.value ===  1 && lvl >= 6) ||
                    (opt.value ===  2 && lvl >= 5)
                  )
                return (
                  <button
                    key={opt.value}
                    onClick={() => !outOfBounds && setBloomsDelta(opt.value)}
                    disabled={outOfBounds}
                    className={[
                      'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                      outOfBounds
                        ? 'cursor-not-allowed border-gray-100 text-gray-300'
                        : bloomsDelta === opt.value
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                    ].join(' ')}
                  >
                    {opt.label}
                  </button>
                )
              })}
              <button
                onClick={handleApplyBlooms}
                disabled={bloomsDelta === 0 || bloomsLoading}
                className="ml-auto flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-40"
              >
                {bloomsLoading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {bloomsLoading ? 'Applying…' : 'Apply'}
              </button>
            </div>
            {mcq.bloomsResult && (
              <div>
                <div className="mb-2 flex gap-2">
                  <MCQPreview label="Before" question={mcq.question} choices={mcq.choices} answer={mcq.answer} />
                  <MCQPreview label="After" question={mcq.bloomsResult.question} choices={mcq.bloomsResult.choices} answer={mcq.bloomsResult.answer} />
                </div>
                <p className="mb-2 text-xs italic text-gray-500">{mcq.bloomsResult.explanation}</p>
                <button
                  onClick={() => { onAcceptBlooms(mcqIndex); setBloomsDelta(0); setDetectedLevel(null) }}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                >
                  Accept
                </button>
              </div>
            )}
          </div>

          {/* ── Add distractors ── */}
          <div className="p-4">
            <p className="mb-3 text-sm font-semibold text-gray-800">Add distractors</p>
            <div className="mb-3 flex items-center gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setDistractorsCount(n)}
                  className={[
                    'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                    distractorsCount === n
                      ? 'border-blue-400 bg-blue-50 text-blue-700'
                      : 'border-gray-200 text-gray-600 hover:bg-gray-50',
                  ].join(' ')}
                >
                  +{n}
                </button>
              ))}
              <button
                onClick={handleApplyDistractors}
                disabled={distractorsLoading}
                className="ml-auto flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-40"
              >
                {distractorsLoading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                {distractorsLoading ? 'Adding…' : 'Add'}
              </button>
            </div>
            {mcq.distractorsResult && (
              <div>
                <div className="mb-2 flex gap-2">
                  <MCQPreview label="Before" question={mcq.question} choices={mcq.choices} answer={mcq.answer} />
                  <MCQPreview label="After" question={mcq.distractorsResult.question} choices={mcq.distractorsResult.choices} answer={mcq.distractorsResult.answer} />
                </div>
                <p className="mb-2 text-xs italic text-gray-500">{mcq.distractorsResult.explanation}</p>
                <button
                  onClick={() => onAcceptDistractors(mcqIndex)}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                >
                  Accept
                </button>
              </div>
            )}
          </div>

          {/* ── Custom rewrite request ── */}
          <div className="p-4">
            <p className="mb-2 text-sm font-semibold text-gray-800">Custom rewrite request</p>
            {mcq.customRewriteResult ? (
              <div>
                <div className="mb-2 flex gap-2">
                  <MCQPreview label="Before" question={mcq.question} choices={mcq.choices} answer={mcq.answer} />
                  <MCQPreview label="After" question={mcq.customRewriteResult.question} choices={mcq.customRewriteResult.choices} answer={mcq.customRewriteResult.answer} />
                </div>
                <p className="mb-3 text-xs italic text-gray-500">{mcq.customRewriteResult.explanation}</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => { onAcceptCustomRewrite(mcqIndex); setCustomRewriteText('') }}
                    className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => onUpdateMCQ(mcqIndex, { customRewriteResult: null })}
                    className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                  >
                    Discard
                  </button>
                </div>
              </div>
            ) : (
              <>
                <textarea
                  value={customRewriteText}
                  onChange={(e) => setCustomRewriteText(e.target.value)}
                  placeholder="e.g. Make this question about meiosis instead, keep the same difficulty and format…"
                  rows={3}
                  className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-xs text-gray-800 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
                <button
                  onClick={handleCustomRewrite}
                  disabled={!customRewriteText.trim() || customRewriteLoading}
                  className="flex items-center gap-2 rounded-lg bg-gray-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-900 disabled:opacity-40"
                >
                  {customRewriteLoading && <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                  {customRewriteLoading ? 'Rewriting…' : 'Rewrite ↗'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Main RightPanel ───────────────────────────────────────────────────────────
export default function RightPanel({
  mcq,
  mcqIndex,
  isEditing,
  highlightedPatchId,
  onHighlightPatch,
  onApplyFix,
  onRewrite,
  onAcceptRewrite,
  onAcceptBlooms,
  onAcceptDistractors,
  onAcceptCustomRewrite,
  onUpdateMCQ,
}) {
  if (isEditing) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-gray-400">
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
        </svg>
        <p className="text-sm font-medium">Editing in progress…</p>
        <p className="text-xs">Save or cancel the edit to view suggestions.</p>
      </div>
    )
  }

  if (mcq.status === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-20 text-gray-400">
        <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <p className="text-sm font-medium">Not analyzed yet</p>
        <p className="text-xs">Click "Analyze" on the card to get suggestions.</p>
      </div>
    )
  }

  if (mcq.status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20 text-gray-400">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-blue-500" />
        <span className="text-sm">Analyzing with GPT…</span>
      </div>
    )
  }

  const patches = mcq.patches ?? []

  return (
    <div className="space-y-4">
      {/* Patch cards */}
      {patches.length === 0 ? (
        <div className="py-8 text-center text-sm text-gray-400">
          No issues found for this question.
        </div>
      ) : (
        <div className="space-y-3">
          {[...patches].sort((a, b) => {
            const tagA = a.rubric_tag ?? extractRubricTag(a.explanation)
            const tagB = b.rubric_tag ?? extractRubricTag(b.explanation)
            return CATEGORY_ORDER[getSeverity(tagA)] - CATEGORY_ORDER[getSeverity(tagB)]
          }).map((patch) => (
            <PatchCard
              key={patch.id}
              patch={patch}
              mcq={mcq}
              isHighlighted={highlightedPatchId === patch.id}
              onClick={() => onHighlightPatch(patch.id)}
              onApply={() => onApplyFix(mcqIndex, patch.id)}
              onRewrite={(p) => onRewrite(mcqIndex, p)}
              onAcceptRewrite={() => onAcceptRewrite(mcqIndex)}
            />
          ))}
        </div>
      )}

      {/* More actions — collapsible */}
      <MoreActionsSection
        key={mcq.id}
        mcq={mcq}
        mcqIndex={mcqIndex}
        onUpdateMCQ={onUpdateMCQ}
        onAcceptBlooms={onAcceptBlooms}
        onAcceptDistractors={onAcceptDistractors}
        onAcceptCustomRewrite={onAcceptCustomRewrite}
      />
    </div>
  )
}

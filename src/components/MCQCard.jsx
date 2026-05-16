import { useEffect, useState } from 'react'
import AnnotatedText from './AnnotatedText.jsx'
import { extractRubricTag, getSeverity, CATEGORY_NAMES, CATEGORY_ORDER } from '../lib/rubric.js'

const LETTERS = 'ABCDEFGHIJKLMNOP'

// Badge colors per severity
const BADGE_COLORS = {
  high:   'bg-[#FCEBEB] text-[#A32D2D]',
  medium: 'bg-[#FAEEDA] text-[#854F0B]',
  low:    'bg-gray-100  text-gray-500',
}

// Card border per severity (unselected, with issues)
const ISSUE_BORDER = {
  high:   'border-[#F09595]',
  medium: 'border-[#EF9F27]',
  low:    'border-gray-200',
}

function getHighestSeverity(patches) {
  let highest = 'low'
  for (const p of patches) {
    const sev = getSeverity(p.rubric_tag ?? extractRubricTag(p.explanation ?? ''))
    if (CATEGORY_ORDER[sev] < CATEGORY_ORDER[highest]) highest = sev
  }
  return highest
}

function StatusBadge({ mcq }) {
  if (mcq.status === 'idle') {
    return (
      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-400">
        Not analyzed
      </span>
    )
  }
  if (mcq.status === 'loading') {
    return (
      <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
        <span className="h-2 w-2 animate-spin rounded-full border border-gray-400 border-t-transparent" />
        Analyzing
      </span>
    )
  }
  const patches = mcq.patches ?? []
  const unfixed = patches.filter((p) => !p.fixed)
  if (unfixed.length === 0) {
    return (
      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
        ✓ Clean
      </span>
    )
  }
  const highest = getHighestSeverity(unfixed)
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${BADGE_COLORS[highest]}`}>
      {CATEGORY_NAMES[highest]}
    </span>
  )
}

function ModelResults({ results }) {
  const score = results.filter((r) => r.correct).length
  const total = results.length
  const scoreColor =
    score === total ? 'bg-green-100 text-green-800'
    : score === 0   ? 'bg-red-100 text-red-800'
                    : 'bg-amber-100 text-amber-800'

  return (
    <div className="mt-3 border-t border-gray-100 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">
          Model answers
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${scoreColor}`}>
          {score} / {total} correct
        </span>
      </div>
      <div className="space-y-1.5">
        {results.map((r) => {
          const displayName = r.model.replace(/-\d{4}-\d{2}-\d{2}$/, '')
          return (
            <div key={r.model} className="flex items-center gap-2">
              <span className="flex-1 truncate font-mono text-xs text-gray-600">
                {displayName}
              </span>
              <span
                className={`rounded px-1.5 py-0.5 text-xs font-bold ${
                  r.correct ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                }`}
              >
                {r.answer}
              </span>
              <span className={`text-xs ${r.correct ? 'text-green-600' : 'text-red-500'}`}>
                {r.correct ? '✓' : '✗'}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EditForm({ mcq, onSave, onCancel }) {
  const [question, setQuestion] = useState(mcq.question)
  const [choices, setChoices] = useState([...mcq.choices])
  const [answer, setAnswer] = useState(mcq.answer)

  useEffect(() => {
    setQuestion(mcq.question)
    setChoices([...mcq.choices])
    setAnswer(mcq.answer)
  }, [mcq.id])

  function updateChoice(i, value) {
    setChoices((prev) => prev.map((c, idx) => idx === i ? value : c))
  }

  function handleSave() {
    if (!question.trim()) return
    onSave({ question: question.trim(), choices: choices.map((c) => c.trim()), answer })
  }

  return (
    <div onClick={(e) => e.stopPropagation()} className="space-y-3">
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Question stem</label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={3}
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Answer choices</label>
        <div className="space-y-2">
          {choices.map((c, i) => {
            const letter = LETTERS[i]
            return (
              <div key={i} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center text-xs font-semibold text-gray-400">
                  {letter})
                </span>
                <input
                  type="text"
                  value={c}
                  onChange={(e) => updateChoice(i, e.target.value)}
                  className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
                />
              </div>
            )
          })}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-gray-500">Correct answer</label>
        <select
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-800 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        >
          {choices.map((c, i) => (
            <option key={i} value={LETTERS[i]}>
              {LETTERS[i]}) {c || '(empty)'}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-2 pt-1">
        <button
          onClick={handleSave}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
        >
          Save &amp; re-analyze
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-gray-200 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}

export default function MCQCard({
  mcq,
  index,
  isSelected,
  isEditing,
  highlightedPatchId,
  onSelect,
  onSpanClick,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onAnalyze,
  onTestModels,
  isTestingModel,
}) {
  const visiblePatches = (mcq.patches ?? []).filter(
    (p) => !p.fixed && p.replaced_text !== 'This question requires a full rewrite.'
  )

  // Compute border based on highest severity of unfixed patches
  function getBorderClass() {
    if (isEditing || isSelected) return 'border-blue-400 ring-2 ring-blue-200'
    if (mcq.status !== 'done') return 'border-gray-200 hover:border-gray-300 hover:shadow-md'
    const unfixed = (mcq.patches ?? []).filter((p) => !p.fixed)
    if (unfixed.length === 0) return 'border-gray-200 hover:border-gray-300 hover:shadow-md'
    const highest = getHighestSeverity(unfixed)
    return `${ISSUE_BORDER[highest]} hover:shadow-md`
  }

  return (
    <div
      onClick={isEditing ? undefined : onSelect}
      className={[
        'rounded-xl border bg-white p-5 shadow-sm transition-all',
        isEditing ? '' : 'cursor-pointer',
        getBorderClass(),
      ].join(' ')}
    >
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-gray-400">Q{index + 1}</span>
        <div className="flex items-center gap-2">
          <StatusBadge mcq={mcq} />
          {!isEditing && mcq.status === 'idle' && (
            <button
              onClick={(e) => { e.stopPropagation(); onAnalyze() }}
              className="rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-600 hover:bg-blue-100"
            >
              Analyze
            </button>
          )}
          {!isEditing && (
            <button
              onClick={(e) => { e.stopPropagation(); onTestModels() }}
              disabled={isTestingModel}
              className="rounded-md border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs text-purple-600 hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isTestingModel ? 'Testing…' : 'Test models'}
            </button>
          )}
          {!isEditing && (
            <button
              onClick={(e) => { e.stopPropagation(); onStartEdit() }}
              className="rounded-md border border-gray-200 px-2 py-0.5 text-xs text-gray-500 hover:bg-gray-50"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {isEditing ? (
        <EditForm mcq={mcq} onSave={onSaveEdit} onCancel={onCancelEdit} />
      ) : (
        <>
          {/* Question stem */}
          <p className="mb-3 text-sm font-semibold leading-relaxed text-gray-800">
            <AnnotatedText
              text={mcq.question}
              patches={visiblePatches}
              highlightedPatchId={highlightedPatchId}
              onSpanClick={onSpanClick}
            />
          </p>

          {/* Choices */}
          <ul className="space-y-1">
            {mcq.choices.map((text, i) => {
              const letter = LETTERS[i]
              return (
                <li
                  key={letter}
                  className={[
                    'rounded-lg px-3 py-1.5 text-sm',
                    letter === mcq.answer
                      ? 'bg-green-50 font-medium text-green-800'
                      : 'bg-gray-50 text-gray-700',
                  ].join(' ')}
                >
                  <AnnotatedText
                    text={`${letter}) ${text}`}
                    patches={visiblePatches}
                    highlightedPatchId={highlightedPatchId}
                    onSpanClick={onSpanClick}
                  />
                </li>
              )
            })}
          </ul>

          {mcq.status === 'loading' && (
            <div className="mt-3 flex items-center gap-2 text-xs text-gray-400">
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
              Analyzing with GPT…
            </div>
          )}

          {isTestingModel && (
            <div className="mt-3 border-t border-gray-100 pt-3">
              <div className="mb-2 flex items-center justify-between">
                <div className="h-2.5 w-24 animate-pulse rounded bg-gray-200" />
                <div className="h-4 w-20 animate-pulse rounded-full bg-gray-200" />
              </div>
              <div className="space-y-1.5">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="h-3 w-32 flex-1 animate-pulse rounded bg-gray-200" />
                    <div className="h-5 w-7 animate-pulse rounded bg-gray-200" />
                    <div className="h-3 w-3 animate-pulse rounded bg-gray-200" />
                  </div>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-400">Testing models…</p>
            </div>
          )}

          {!isTestingModel && mcq.modelResults && (
            <ModelResults results={mcq.modelResults} />
          )}
        </>
      )}
    </div>
  )
}

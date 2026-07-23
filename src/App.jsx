import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import DropZone from './components/DropZone.jsx'
import PreviewModal from './components/PreviewModal.jsx'
import MCQCard from './components/MCQCard.jsx'
import RightPanel from './components/RightPanel.jsx'
import {
  fetchPatches, fetchRewrite, fetchCustomRewrite,
  createSession, saveSession, fetchSession,
  setCurrentUser, logAction, fetchTestModels,
} from './lib/api.js'
import { supabase } from './lib/supabase.js'
import LoginPage from './components/LoginPage.jsx'
import { applyPatchToMCQ } from './lib/mcqFormat.js'
import {
  CATEGORY_NAMES, CATEGORY_ORDER, getSeverity, extractRubricTag, formatRubricTag,
} from './lib/rubric.js'

// ── MCQ factory ───────────────────────────────────────────────────────────────
function makeMCQ(raw, index) {
  return {
    id: `mcq-${index}`,
    question: raw.question,
    choices: raw.choices,
    answer: raw.answer,
    patches: null,
    status: 'idle',
    rewrite: null,
    bloomsResult: null,
    distractorsResult: null,
    customRewriteResult: null,
    modelResults: null,
  }
}

function isProblematic(mcq) {
  if (mcq.status === 'loading') return true
  if (mcq.status === 'done') return (mcq.patches ?? []).some((p) => !p.fixed)
  return false
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────
function ChevronUp() {
  return (
    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
    </svg>
  )
}
function ChevronDown() {
  return (
    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
    </svg>
  )
}
function NavArrow({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        'flex h-[26px] w-[26px] items-center justify-center rounded border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors',
        disabled ? 'pointer-events-none opacity-30' : 'hover:bg-gray-50 active:bg-gray-100',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// ── Dataset nav strip ─────────────────────────────────────────────────────────
function DatasetNavStrip({ pos, total, onPrev, onNext }) {
  return (
    <div className="pointer-events-none absolute right-0 top-0 bottom-0 flex w-9 flex-col items-center py-3 opacity-40 transition-opacity duration-150 hover:opacity-100">
      <div className="pointer-events-auto">
        <NavArrow onClick={onPrev} disabled={pos === 0}>
          <ChevronUp />
        </NavArrow>
      </div>
      <div className="pointer-events-auto flex flex-1 flex-col items-center justify-center gap-px select-none">
        <span className="text-[11px] font-semibold leading-none text-gray-700 tabular-nums">
          {total === 0 ? 0 : pos + 1}
        </span>
        <span className="text-[9px] leading-none text-gray-400">/</span>
        <span className="text-[11px] leading-none text-gray-500 tabular-nums">{total}</span>
      </div>
      <div className="pointer-events-auto">
        <NavArrow onClick={onNext} disabled={pos >= total - 1}>
          <ChevronDown />
        </NavArrow>
      </div>
    </div>
  )
}

// ── Problematic footer ────────────────────────────────────────────────────────
function ProblematicFooter({ pos, total, onPrev, onNext, prevDisabled, nextDisabled }) {
  return (
    <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 px-4 py-2 opacity-40 transition-opacity duration-150 hover:opacity-100">
      <span className="text-xs text-gray-500">Problematic MCQs</span>
      <NavArrow onClick={onPrev} disabled={prevDisabled}>
        <ChevronUp />
      </NavArrow>
      <span className="min-w-[36px] text-center text-xs font-medium text-gray-600 tabular-nums">
        {pos} / {total}
      </span>
      <NavArrow onClick={onNext} disabled={nextDisabled}>
        <ChevronDown />
      </NavArrow>
    </div>
  )
}

// ── Export helpers ────────────────────────────────────────────────────────────
function buildExportRows(mcqs) {
  return mcqs.map((mcq) => {
    const patchesApplied = (mcq.patches ?? []).filter((p) => p.fixed).length
    const wasRewritten = (mcq.patches ?? []).some(
      (p) => p.fixed && p.replaced_text === 'This question requires a full rewrite.'
    )
    let patchDetails = []
    if (!wasRewritten && patchesApplied > 0) {
      patchDetails = (mcq.patches ?? [])
        .filter((p) => p.fixed)
        .map((p) => {
          const tag = p.rubric_tag ?? extractRubricTag(p.explanation ?? '')
          const severity = getSeverity(tag)
          return { rubric_tag: tag, category: CATEGORY_NAMES[severity] }
        })
    }
    return {
      question: mcq.question,
      choices: mcq.choices,
      answer: mcq.answer,
      patches_applied: patchesApplied,
      rewritten: wasRewritten,
      patch_details: patchDetails,
    }
  })
}

function exportJson(mcqs, filename) {
  const rows = buildExportRows(mcqs)
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
  const base = filename.replace(/\.[^.]+$/, '')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${base}_export.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

function exportXlsx(mcqs, filename) {
  const rows = buildExportRows(mcqs)
  const sheetData = [
    ['Question', 'Choice A', 'Choice B', 'Choice C', 'Choice D', 'Answer', 'Patches Applied', 'Rewritten', 'Patch Categories'],
    ...rows.map((r) => [
      r.question,
      r.choices[0] ?? '',
      r.choices[1] ?? '',
      r.choices[2] ?? '',
      r.choices[3] ?? '',
      r.answer,
      r.patches_applied,
      r.rewritten ? 'Yes' : 'No',
      r.patch_details.map((d) => d.category).join(', '),
    ]),
  ]
  const ws = XLSX.utils.aoa_to_sheet(sheetData)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'MCQs')
  const base = filename.replace(/\.[^.]+$/, '')
  XLSX.writeFile(wb, `${base}_export.xlsx`)
}

// ── Export dropdown ───────────────────────────────────────────────────────────
function ExportDropdown({ mcqs, filename }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  function handle(fn) {
    fn(mcqs, filename)
    setOpen(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
      >
        Export
      </button>
      {open && (
        <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-md">
          <button
            onClick={() => handle(exportJson)}
            className="w-full px-4 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
          >
            Save as JSON
          </button>
          <button
            onClick={() => handle(exportXlsx)}
            className="w-full px-4 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
          >
            Save as XLSX
          </button>
        </div>
      )}
    </div>
  )
}

// ── Filter bar ────────────────────────────────────────────────────────────────
function FilterBar({
  issuesOnly, onToggleIssuesOnly,
  fullRewrites, onToggleFullRewrites,
  selectedCategories, onToggleCategory,
  selectedRubrics, onToggleRubric,
  onClearAll,
  availableRubricTags,
  isAnalyzingAll, isApplyingAll, onAnalyzeAll, hasIdleMcqs, totalIssues, onApplyAll,
  isTestingAll, testAllProgress, onTestAll,
  onLogout,
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  const hasFilters = issuesOnly || fullRewrites || selectedCategories.size > 0 || selectedRubrics.size > 0
  const totalFilters =
    (issuesOnly ? 1 : 0) + (fullRewrites ? 1 : 0) + selectedCategories.size + selectedRubrics.size

  useEffect(() => {
    if (!open) return
    function onClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  // Build pills for active filters
  const pills = []
  if (issuesOnly) pills.push({ key: 'issuesOnly', label: 'Issues only', onRemove: onToggleIssuesOnly })
  if (fullRewrites) pills.push({ key: 'fullRewrites', label: 'Full rewrites', onRemove: onToggleFullRewrites })
  for (const cat of selectedCategories) {
    pills.push({ key: `cat-${cat}`, label: CATEGORY_NAMES[cat], onRemove: () => onToggleCategory(cat) })
  }
  for (const tag of selectedRubrics) {
    pills.push({ key: `tag-${tag}`, label: formatRubricTag(tag), onRemove: () => onToggleRubric(tag) })
  }

  return (
    <div className="shrink-0 border-b border-gray-200 bg-white">
      <div className="flex items-center gap-2 px-6 py-2">
        {/* Filter dropdown */}
        <div ref={ref} className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className={[
              'flex items-center gap-1 rounded-lg border px-3 py-1 text-xs font-medium transition-colors',
              hasFilters || open
                ? 'border-blue-400 bg-blue-50 text-blue-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50',
            ].join(' ')}
          >
            Filter{hasFilters ? ` (${totalFilters})` : ''}
            <svg
              className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {open && (
            <div
              className="absolute left-0 top-full z-30 mt-1 w-60 overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-lg"
              style={{ maxHeight: 280 }}
            >
              {/* View section */}
              <div className="px-3 pt-3 pb-2">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">View</p>
                <label className="flex cursor-pointer items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={issuesOnly}
                    onChange={onToggleIssuesOnly}
                    className="rounded border-gray-300 accent-blue-500"
                  />
                  <span className="text-xs text-gray-700">Issues only</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 py-0.5">
                  <input
                    type="checkbox"
                    checked={fullRewrites}
                    onChange={onToggleFullRewrites}
                    className="rounded border-gray-300 accent-blue-500"
                  />
                  <span className="text-xs text-gray-700">Full rewrites only</span>
                </label>
              </div>

              <div className="mx-3 border-t border-gray-100" />

              {/* Category section */}
              <div className="px-3 py-2">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Category</p>
                {['high', 'medium', 'low'].map((sev) => (
                  <label key={sev} className="flex cursor-pointer items-center gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={selectedCategories.has(sev)}
                      onChange={() => onToggleCategory(sev)}
                      className="rounded border-gray-300 accent-blue-500"
                    />
                    <span className="text-xs text-gray-700">{CATEGORY_NAMES[sev]}</span>
                  </label>
                ))}
              </div>

              <div className="mx-3 border-t border-gray-100" />
              <div className="px-3 py-2">
                <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                  Rubric type
                </p>
                {availableRubricTags.map((tag) => (
                  <label key={tag} className="flex cursor-pointer items-center gap-2 py-0.5">
                    <input
                      type="checkbox"
                      checked={selectedRubrics.has(tag)}
                      onChange={() => onToggleRubric(tag)}
                      className="rounded border-gray-300 accent-blue-500"
                    />
                    <span className="text-xs text-gray-700">{formatRubricTag(tag)}</span>
                  </label>
                ))}
              </div>

              {hasFilters && (
                <>
                  <div className="mx-3 border-t border-gray-100" />
                  <div className="px-3 py-2.5">
                    <button
                      onClick={() => { onClearAll(); setOpen(false) }}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Clear all
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Active filter pills */}
        {pills.map((pill) => (
          <span
            key={pill.key}
            className="flex items-center gap-1 rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 text-xs text-blue-700"
          >
            {pill.label}
            <button onClick={pill.onRemove} className="leading-none hover:text-blue-900">×</button>
          </span>
        ))}

        <div className="flex-1" />

        {/* Log out */}
        <button
          onClick={onLogout}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
        >
          Log out
        </button>

        {/* Test all models */}
        <button
          onClick={onTestAll}
          disabled={isAnalyzingAll || isApplyingAll || isTestingAll}
          className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isTestingAll
            ? `Testing ${testAllProgress.current}/${testAllProgress.total}…`
            : 'Test all models'}
        </button>

        {/* Analyze all / Fix all */}
        {(hasIdleMcqs || totalIssues > 0) && (
          <button
            onClick={hasIdleMcqs ? onAnalyzeAll : onApplyAll}
            disabled={isAnalyzingAll || isApplyingAll || isTestingAll}
            className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {isAnalyzingAll ? 'Analyzing…' : isApplyingAll ? 'Fixing…' : hasIdleMcqs ? 'Analyze all' : `Fix all (${totalIssues})`}
          </button>
        )}
      </div>
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  // Auth
  const [session, setSession] = useState(undefined) // undefined = loading, null = logged out

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setCurrentUser(session?.user?.id ?? null)
    }).catch(() => {
      setSession(null)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setCurrentUser(session?.user?.id ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  // Core data
  const [mcqs, setMcqs] = useState([])
  const [filename, setFilename] = useState(null)
  const [sessionId, setSessionId] = useState(null)
  const mcqsRef = useRef(mcqs)
  mcqsRef.current = mcqs

  // UI state
  const [preview, setPreview] = useState(null)
  const [isReuploading, setIsReuploading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [highlightedPatchId, setHighlightedPatchId] = useState(null)
  const [editingIndex, setEditingIndex] = useState(null)

  // Analysis
  const [isAnalyzingAll, setIsAnalyzingAll] = useState(false)
  const [isApplyingAll, setIsApplyingAll] = useState(false)

  // Model testing
  const [testingModelIndex, setTestingModelIndex] = useState(null)
  const [isTestingAll, setIsTestingAll] = useState(false)
  const [testAllProgress, setTestAllProgress] = useState({ current: 0, total: 0 })

  // History — per-MCQ and global (refs to avoid stale closure issues)
  const perMcqHistory = useRef({})  // { [index]: MCQ[] }
  const perMcqRedo    = useRef({})
  const globalHistory = useRef([])  // MCQ[][]
  const globalRedo    = useRef([])

  // Filters
  const [issuesOnly, setIssuesOnly] = useState(false)
  const [fullRewrites, setFullRewrites] = useState(false)
  const [selectedCategories, setSelectedCategories] = useState(new Set())
  const [selectedRubrics, setSelectedRubrics] = useState(new Set())

  // Scroll refs
  const scrollContainerRef = useRef(null)
  const cardRefs = useRef([])
  const suppressScrollRef = useRef(false)
  const scrollRafRef = useRef(null)

  // ── History helpers ──────────────────────────────────────────────────────────

  function withMcqHistory(index, updater) {
    const prev = mcqsRef.current[index]
    perMcqHistory.current[index] = [...(perMcqHistory.current[index] ?? []).slice(-49), prev]
    perMcqRedo.current[index] = []
    setMcqs(updater)
  }

  function withGlobalHistory(updater) {
    globalHistory.current = [...globalHistory.current.slice(-49), mcqsRef.current]
    globalRedo.current = []
    setMcqs(updater)
  }

  function undoMcq(index) {
    const stack = perMcqHistory.current[index] ?? []
    if (!stack.length) return
    const prev = stack.at(-1)
    perMcqRedo.current[index] = [mcqsRef.current[index], ...(perMcqRedo.current[index] ?? []).slice(0, 49)]
    perMcqHistory.current[index] = stack.slice(0, -1)
    setMcqs((curr) => curr.map((m, i) => i === index ? prev : m))
  }

  function redoMcq(index) {
    const stack = perMcqRedo.current[index] ?? []
    if (!stack.length) return
    const next = stack[0]
    perMcqHistory.current[index] = [...(perMcqHistory.current[index] ?? []).slice(-49), mcqsRef.current[index]]
    perMcqRedo.current[index] = stack.slice(1)
    setMcqs((curr) => curr.map((m, i) => i === index ? next : m))
  }

  function undoGlobal() {
    if (!globalHistory.current.length) return
    globalRedo.current = [mcqsRef.current, ...globalRedo.current.slice(0, 49)]
    const prev = globalHistory.current.at(-1)
    globalHistory.current = globalHistory.current.slice(0, -1)
    setMcqs(prev)
  }

  function redoGlobal() {
    if (!globalRedo.current.length) return
    globalHistory.current = [...globalHistory.current.slice(-49), mcqsRef.current]
    const next = globalRedo.current[0]
    globalRedo.current = globalRedo.current.slice(1)
    setMcqs(next)
  }

  // ── Action logging ───────────────────────────────────────────────────────────

  function logActionIfPossible(data) {
    if (!sessionId || !session?.user?.id) return
    logAction({ user_id: session.user.id, session_id: sessionId, ...data }).catch(() => {})
  }

  // ── Navigation helpers ───────────────────────────────────────────────────────
  function navigateTo(index) {
    if (index < 0 || index >= mcqsRef.current.length || editingIndex !== null) return
    setSelectedIndex(index)
    setHighlightedPatchId(null)
    const el = cardRefs.current[index]
    if (el) {
      suppressScrollRef.current = true
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      setTimeout(() => { suppressScrollRef.current = false }, 600)
    }
  }

  function handleScrollInDataset() {
    if (suppressScrollRef.current) return
    if (scrollRafRef.current) cancelAnimationFrame(scrollRafRef.current)
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = null
      const container = scrollContainerRef.current
      if (!container) return
      const containerTop = container.getBoundingClientRect().top
      let closest = selectedIndex
      let closestDist = Infinity
      cardRefs.current.forEach((el, i) => {
        if (!el) return
        const rect = el.getBoundingClientRect()
        const dist = Math.abs(rect.top - containerTop)
        if (dist < closestDist) { closestDist = dist; closest = i }
      })
      setSelectedIndex(closest)
      setHighlightedPatchId(null)
    })
  }

  // ── Dataset load ─────────────────────────────────────────────────────────────
  function handleFileReady(parsedMcqs, fname) {
    setPreview({ mcqs: parsedMcqs, filename: fname })
  }

  function handleConfirmPreview() {
    const { mcqs: rawMcqs, filename: fname } = preview
    const initialMcqs = rawMcqs.map(makeMCQ)
    cardRefs.current = []
    setMcqs(initialMcqs)
    setFilename(fname)
    setSessionId(null)
    setSelectedIndex(0)
    setHighlightedPatchId(null)
    setEditingIndex(null)
    setIsReuploading(false)
    setPreview(null)
    perMcqHistory.current = {}
    perMcqRedo.current = {}
    globalHistory.current = []
    globalRedo.current = []
    setIssuesOnly(false)
    setFullRewrites(false)
    setSelectedCategories(new Set())
    setSelectedRubrics(new Set())
    createSession(fname, rawMcqs.length)
      .then(({ session_id }) => setSessionId(session_id))
      .catch((err) => console.warn('Session create failed:', err))
  }

  function handleCancelPreview() {
    setPreview(null)
  }

  async function handleResume(sess) {
    const { mcqs: rows } = await fetchSession(sess.id)
    const restored = [...rows]
      .sort((a, b) => a.index - b.index)
      .map((row) => ({
        id: `mcq-${row.index}`,
        question: row.question,
        choices: row.choices,
        answer: row.answer,
        patches: row.patches ?? null,
        status: row.status ?? 'idle',
        rewrite: row.rewrite ?? null,
        bloomsResult: null,
        distractorsResult: null,
        customRewriteResult: null,
      }))
    cardRefs.current = []
    setMcqs(restored)
    setFilename(sess.filename)
    setSessionId(sess.id)
    setSelectedIndex(0)
    setHighlightedPatchId(null)
    setEditingIndex(null)
    setIsReuploading(false)
    perMcqHistory.current = {}
    perMcqRedo.current = {}
    globalHistory.current = []
    globalRedo.current = []
    setIssuesOnly(false)
    setFullRewrites(false)
    setSelectedCategories(new Set())
    setSelectedRubrics(new Set())
  }

  // ── Auto-save to Supabase ────────────────────────────────────────────────────
  const saveTimerRef = useRef(null)
  useEffect(() => {
    if (!sessionId || mcqs.length === 0) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      saveSession(sessionId, mcqs).catch((err) => console.warn('Session save failed:', err))
    }, 1500)
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current) }
  }, [mcqs, sessionId])

  // ── Analysis ─────────────────────────────────────────────────────────────────
  function dedupePatches(patches) {
    let sawRewrite = false
    return patches.filter((p) => {
      if (p.replaced_text === 'This question requires a full rewrite.') {
        if (sawRewrite) return false
        sawRewrite = true
      }
      return true
    })
  }

  async function analyzeAll() {
    setIsAnalyzingAll(true)
    const snapshot = mcqsRef.current
    const idleIndices = snapshot.reduce((acc, m, i) => {
      if (m.status === 'idle') acc.push(i)
      return acc
    }, [])
    for (const index of idleIndices) {
      const mcq = snapshot[index]
      setMcqs((prev) => prev.map((m, i) => (i === index ? { ...m, status: 'loading' } : m)))
      try {
        const patches = dedupePatches(await fetchPatches(mcq))
        setMcqs((prev) => prev.map((m, i) => (i === index ? { ...m, patches, status: 'done' } : m)))
      } catch {
        setMcqs((prev) => prev.map((m, i) => (i === index ? { ...m, patches: [], status: 'done' } : m)))
      }
    }
    setIsAnalyzingAll(false)
  }

  // ── Model testing ─────────────────────────────────────────────────────────────
  async function testModels(index) {
    const mcq = mcqsRef.current[index]
    if (mcq.modelResults) {
      setMcqs((prev) => prev.map((m, i) => (i === index ? { ...m, modelResults: null } : m)))
      return
    }
    setTestingModelIndex(index)
    try {
      const result = await fetchTestModels(mcq)
      setMcqs((prev) => prev.map((m, i) => (i === index ? { ...m, modelResults: result.results } : m)))
      const logObj = Object.fromEntries(
        result.results.map((r) => [r.model.replace(/-\d{4}-\d{2}-\d{2}$/, ''), r.answer])
      )
      logObj.score = `${result.score}/${result.total}`
      logActionIfPossible({
        mcq_index: index,
        action_type: 'model_test',
        original_question: mcq.question,
        patch_rubric_tag: null,
        patch_category: null,
        result_question: JSON.stringify(logObj),
      })
    } catch {
      // silently ignore failures
    } finally {
      setTestingModelIndex(null)
    }
  }

  async function testAll() {
    const snapshot = mcqsRef.current
    setIsTestingAll(true)
    setTestAllProgress({ current: 0, total: snapshot.length })
    for (let i = 0; i < snapshot.length; i++) {
      setTestingModelIndex(i)
      setTestAllProgress({ current: i + 1, total: snapshot.length })
      const mcq = snapshot[i]
      try {
        const result = await fetchTestModels(mcq)
        setMcqs((prev) => prev.map((m, idx) => (idx === i ? { ...m, modelResults: result.results } : m)))
      } catch {
        // continue to next
      }
    }
    setTestingModelIndex(null)
    setIsTestingAll(false)
    setTestAllProgress({ current: 0, total: 0 })
  }

  function analyzeSingle(index) {
    const mcq = mcqsRef.current[index]
    if (!mcq || mcq.status !== 'idle') return
    setMcqs((prev) => prev.map((m, i) => (i === index ? { ...m, status: 'loading' } : m)))
    fetchPatches(mcq)
      .then((patches) => {
        setMcqs((prev) => prev.map((m, i) => (i === index ? { ...m, patches: dedupePatches(patches), status: 'done' } : m)))
      })
      .catch(() => {
        setMcqs((prev) => prev.map((m, i) => (i === index ? { ...m, patches: [], status: 'done' } : m)))
      })
  }

  // ── Non-undoable MCQ update (intermediate states) ────────────────────────────
  function updateMCQ(index, fields) {
    setMcqs((prev) => prev.map((m, i) => (i === index ? { ...m, ...fields } : m)))
  }

  // ── Undoable mutations (per-MCQ) ─────────────────────────────────────────────
  function applyFix(mcqIndex, patchId) {
    const origMcq = mcqsRef.current[mcqIndex]
    const patch = origMcq.patches?.find((p) => p.id === patchId)
    if (!patch) return
    const resultMcq = applyPatchToMCQ(origMcq, patch)
    withMcqHistory(mcqIndex, (prev) =>
      prev.map((mcq, i) => {
        if (i !== mcqIndex) return mcq
        const p = mcq.patches.find((pp) => pp.id === patchId)
        if (!p) return mcq
        const updated = applyPatchToMCQ(mcq, p)
        return { ...updated, patches: mcq.patches.map((pp) => (pp.id === patchId ? { ...pp, fixed: true } : pp)), modelResults: null }
      })
    )
    setHighlightedPatchId(null)
    logActionIfPossible({
      mcq_index: mcqIndex,
      action_type: 'apply_fix',
      original_question: origMcq.question,
      original_choices: origMcq.choices,
      original_answer: origMcq.answer,
      result_question: resultMcq.question,
      result_choices: resultMcq.choices,
      result_answer: resultMcq.answer,
      patch_rubric_tag: patch.rubric_tag ?? null,
      patch_category: CATEGORY_NAMES[getSeverity(patch.rubric_tag)] ?? null,
    })
  }

  function applyAll(mcqIndex) {
    const origMcq = mcqsRef.current[mcqIndex]
    let resultMcq = origMcq
    ;(origMcq.patches ?? []).forEach((patch) => {
      if (!patch.fixed && patch.replaced_text !== 'This question requires a full rewrite.') {
        resultMcq = applyPatchToMCQ(resultMcq, patch)
      }
    })
    withMcqHistory(mcqIndex, (prev) =>
      prev.map((mcq, i) => {
        if (i !== mcqIndex) return mcq
        let current = mcq
        const updatedPatches = (mcq.patches ?? []).map((patch) => {
          if (patch.fixed || patch.replaced_text === 'This question requires a full rewrite.') return patch
          current = applyPatchToMCQ(current, patch)
          return { ...patch, fixed: true }
        })
        return { ...current, patches: updatedPatches, modelResults: null }
      })
    )
    setHighlightedPatchId(null)
    logActionIfPossible({
      mcq_index: mcqIndex,
      action_type: 'apply_fix',
      original_question: origMcq.question,
      original_choices: origMcq.choices,
      original_answer: origMcq.answer,
      result_question: resultMcq.question,
      result_choices: resultMcq.choices,
      result_answer: resultMcq.answer,
    })
  }

  // ── Global apply all (topbar button) ────────────────────────────────────────
  async function applyAllGlobal() {
    setIsApplyingAll(true)
    await new Promise((resolve) => setTimeout(resolve, 0))
    withGlobalHistory((prev) =>
      prev.map((mcq) => {
        let current = mcq
        const updatedPatches = (mcq.patches ?? []).map((patch) => {
          if (patch.fixed || patch.replaced_text === 'This question requires a full rewrite.') return patch
          current = applyPatchToMCQ(current, patch)
          return { ...patch, fixed: true }
        })
        return { ...current, patches: updatedPatches, modelResults: null }
      })
    )
    setHighlightedPatchId(null)
    setIsApplyingAll(false)
  }

  async function handleRewrite(mcqIndex, patch) {
    const mcq = mcqsRef.current[mcqIndex]
    const result = await fetchRewrite(mcq, patch.explanation)
    updateMCQ(mcqIndex, { rewrite: result })
  }

  function acceptRewrite(mcqIndex) {
    const origMcq = mcqsRef.current[mcqIndex]
    const rewrite = origMcq.rewrite
    withMcqHistory(mcqIndex, (prev) =>
      prev.map((mcq, i) => {
        if (i !== mcqIndex || !mcq.rewrite) return mcq
        return {
          ...mcq,
          question: mcq.rewrite.question,
          choices: mcq.rewrite.choices,
          answer: mcq.rewrite.answer,
          rewrite: null,
          patches: (mcq.patches ?? []).map((p) => ({ ...p, fixed: true })),
        }
      })
    )
    if (rewrite) {
      logActionIfPossible({
        mcq_index: mcqIndex,
        action_type: 'accept_rewrite',
        original_question: origMcq.question,
        original_choices: origMcq.choices,
        original_answer: origMcq.answer,
        result_question: rewrite.question,
        result_choices: rewrite.choices,
        result_answer: rewrite.answer,
      })
    }
  }

  function acceptBlooms(mcqIndex) {
    const origMcq = mcqsRef.current[mcqIndex]
    const r = origMcq.bloomsResult
    withMcqHistory(mcqIndex, (prev) =>
      prev.map((mcq, i) => {
        if (i !== mcqIndex || !mcq.bloomsResult) return mcq
        const res = mcq.bloomsResult
        return { ...mcq, question: res.question, choices: res.choices, answer: res.answer, bloomsResult: null }
      })
    )
    if (r) {
      logActionIfPossible({
        mcq_index: mcqIndex,
        action_type: 'accept_blooms',
        original_question: origMcq.question,
        original_choices: origMcq.choices,
        original_answer: origMcq.answer,
        result_question: r.question,
        result_choices: r.choices,
        result_answer: r.answer,
      })
    }
  }

  function acceptDistractors(mcqIndex) {
    const origMcq = mcqsRef.current[mcqIndex]
    const r = origMcq.distractorsResult
    withMcqHistory(mcqIndex, (prev) =>
      prev.map((mcq, i) => {
        if (i !== mcqIndex || !mcq.distractorsResult) return mcq
        const res = mcq.distractorsResult
        return { ...mcq, question: res.question, choices: res.choices, answer: res.answer, distractorsResult: null }
      })
    )
    if (r) {
      logActionIfPossible({
        mcq_index: mcqIndex,
        action_type: 'accept_distractors',
        original_question: origMcq.question,
        original_choices: origMcq.choices,
        original_answer: origMcq.answer,
        result_question: r.question,
        result_choices: r.choices,
        result_answer: r.answer,
      })
    }
  }

  function acceptCustomRewrite(mcqIndex) {
    const origMcq = mcqsRef.current[mcqIndex]
    const r = origMcq.customRewriteResult
    withMcqHistory(mcqIndex, (prev) =>
      prev.map((mcq, i) => {
        if (i !== mcqIndex || !mcq.customRewriteResult) return mcq
        const res = mcq.customRewriteResult
        return { ...mcq, question: res.question, choices: res.choices, answer: res.answer, customRewriteResult: null }
      })
    )
    if (r) {
      logActionIfPossible({
        mcq_index: mcqIndex,
        action_type: 'accept_custom_rewrite',
        original_question: origMcq.question,
        original_choices: origMcq.choices,
        original_answer: origMcq.answer,
        result_question: r.question,
        result_choices: r.choices,
        result_answer: r.answer,
      })
    }
  }

  function handleSaveEdit(index, { question, choices, answer }) {
    const origMcq = mcqsRef.current[index]
    withMcqHistory(index, (prev) =>
      prev.map((m, i) =>
        i === index
          ? { ...m, question, choices, answer, patches: null, status: 'idle', rewrite: null, bloomsResult: null, distractorsResult: null, customRewriteResult: null, modelResults: null }
          : m
      )
    )
    setEditingIndex(null)
    setHighlightedPatchId(null)
    logActionIfPossible({
      mcq_index: index,
      action_type: 'manual_edit',
      original_question: origMcq.question,
      original_choices: origMcq.choices,
      original_answer: origMcq.answer,
      result_question: question,
      result_choices: choices,
      result_answer: answer,
    })
  }

  // ── Derived values ───────────────────────────────────────────────────────────
  const isLoaded = mcqs.length > 0
  const showNav = isLoaded && !isReuploading

  const totalIssues = mcqs.reduce(
    (sum, m) => sum + (m.patches ?? []).filter((p) => !p.fixed).length,
    0
  )
  const hasIdleMcqs = mcqs.some((m) => m.status === 'idle')
  const selectedMcq = isLoaded ? mcqs[selectedIndex] : null
  const selectedIsEditing = editingIndex === selectedIndex

  // Fixable patches for the selected MCQ (used in right panel header)
  const fixablePatches = selectedMcq
    ? (selectedMcq.patches ?? []).filter(
        (p) => !p.fixed && p.replaced_text !== 'This question requires a full rewrite.'
      )
    : []

  // Per-MCQ undo/redo availability (checked at render from refs)
  const canUndoMcq = (perMcqHistory.current[selectedIndex]?.length ?? 0) > 0
  const canRedoMcq = (perMcqRedo.current[selectedIndex]?.length ?? 0) > 0

  // Global undo/redo availability
  const canUndoGlobal = globalHistory.current.length > 0
  const canRedoGlobal = globalRedo.current.length > 0

  // All 19 IWF rubric tags — always shown in the filter dropdown
  const ALL_FILTER_RUBRIC_TAGS = [
    'ambiguous/unclear', 'unfocused_stem', 'no_extraneous_info',
    'ordered_options', 'avoid_negatives', 'no_vague_terms',
    'avoid_k_type', 'no_none_of_the_above', 'no_all_of_the_above',
    'no_fill_in_blank', 'no_absolute_terms', 'plausible_distractors',
    'single_best_answer', 'no_logical_cues', 'no_convergence_cues',
    'equal_length_options', 'grammatical_consistency',
    'avoid_repetition', 'focused_stem',
  ]

  // Filtered indices
  const filteredIndices = mcqs.reduce((acc, mcq, i) => {
    if (issuesOnly) {
      const isClean = mcq.status === 'done' && (mcq.patches ?? []).every((p) => p.fixed)
      if (isClean) return acc
    }
    if (fullRewrites) {
      const hasUnfixedRewrite = (mcq.patches ?? []).some(
        (p) => !p.fixed && p.replaced_text === 'This question requires a full rewrite.'
      )
      if (!hasUnfixedRewrite) return acc
    }
    if (selectedCategories.size > 0) {
      // Unanalyzed MCQs stay visible; only hide analyzed ones with no matching category
      if (mcq.status === 'done') {
        const matches = (mcq.patches ?? []).some(
          (p) => !p.fixed && selectedCategories.has(getSeverity(p.rubric_tag ?? extractRubricTag(p.explanation ?? '')))
        )
        if (!matches) return acc
      }
    }
    if (selectedRubrics.size > 0) {
      // Unanalyzed MCQs stay visible; only hide analyzed ones with no matching tag
      if (mcq.status === 'done') {
        const matches = (mcq.patches ?? []).some((p) => !p.fixed && selectedRubrics.has(p.rubric_tag))
        if (!matches) return acc
      }
    }
    acc.push(i)
    return acc
  }, [])

  // Position of selected card in filtered list
  const filteredPos = filteredIndices.indexOf(selectedIndex)
  const effectiveFilteredPos = filteredPos >= 0 ? filteredPos : 0

  // Problematic nav (within filtered set)
  const problematicIndices = filteredIndices.filter((i) => isProblematic(mcqs[i]))
  const problematicTotal = problematicIndices.length
  const problematicPos = problematicIndices.filter((i) => i <= selectedIndex).length
  const prevProblematicIdx = [...problematicIndices].reverse().find((i) => i < selectedIndex) ?? -1
  const nextProblematicIdx = problematicIndices.find((i) => i > selectedIndex) ?? -1

  // Auto-navigate when filter change hides the selected card
  useEffect(() => {
    if (!isLoaded || filteredIndices.length === 0) return
    if (!filteredIndices.includes(selectedIndex)) {
      const target = filteredIndices[0]
      setSelectedIndex(target)
      setHighlightedPatchId(null)
      setTimeout(() => {
        cardRefs.current[target]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }, 0)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issuesOnly, fullRewrites, selectedRubrics, selectedCategories])

  // ── Render ───────────────────────────────────────────────────────────────────
  if (session === undefined) return null
  if (!session) return <LoginPage />

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50 font-sans">
      {preview && (
        <PreviewModal
          mcqs={preview.mcqs}
          filename={preview.filename}
          onConfirm={handleConfirmPreview}
          onCancel={handleCancelPreview}
        />
      )}

      {/* ── Topbar ── */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-gray-900">BenchMarkerUI</span>
          {isLoaded && (
            <>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                {filename}
              </span>
              <span className="text-xs text-gray-400">{mcqs.length} questions</span>
            </>
          )}
        </div>

        {isLoaded && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{session.user.email}</span>
            <span className="h-4 w-px bg-gray-200" />
            {/* Global undo / redo */}
            <button
              onClick={undoGlobal}
              disabled={!canUndoGlobal}
              title="Undo global action"
              className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-30"
            >
              ↩
            </button>
            <button
              onClick={redoGlobal}
              disabled={!canRedoGlobal}
              title="Redo global action"
              className="flex h-7 w-7 items-center justify-center rounded border border-gray-200 text-sm text-gray-500 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-30"
            >
              ↪
            </button>
            <span className="h-4 w-px bg-gray-200" />
            <ExportDropdown mcqs={mcqs} filename={filename} />
          </div>
        )}
      </div>

      {/* ── Navbar (filter + analyze) ── */}
      {showNav && (
        <FilterBar
          issuesOnly={issuesOnly}
          onToggleIssuesOnly={() => setIssuesOnly((v) => !v)}
          fullRewrites={fullRewrites}
          onToggleFullRewrites={() => setFullRewrites((v) => !v)}
          selectedCategories={selectedCategories}
          onToggleCategory={(sev) =>
            setSelectedCategories((prev) => {
              const next = new Set(prev)
              next.has(sev) ? next.delete(sev) : next.add(sev)
              return next
            })
          }
          selectedRubrics={selectedRubrics}
          onToggleRubric={(tag) =>
            setSelectedRubrics((prev) => {
              const next = new Set(prev)
              next.has(tag) ? next.delete(tag) : next.add(tag)
              return next
            })
          }
          onClearAll={() => {
            setIssuesOnly(false)
            setFullRewrites(false)
            setSelectedCategories(new Set())
            setSelectedRubrics(new Set())
          }}
          availableRubricTags={ALL_FILTER_RUBRIC_TAGS}
          isAnalyzingAll={isAnalyzingAll}
          isApplyingAll={isApplyingAll}
          onAnalyzeAll={analyzeAll}
          hasIdleMcqs={hasIdleMcqs}
          totalIssues={totalIssues}
          onApplyAll={applyAllGlobal}
          isTestingAll={isTestingAll}
          testAllProgress={testAllProgress}
          onTestAll={testAll}
          onLogout={() => supabase.auth.signOut()}
        />
      )}

      {/* ── Two-panel body ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left panel */}
        <div className="flex w-[55%] flex-col border-r border-gray-200">
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 bg-white px-5 py-3">
            <span className="text-sm font-semibold text-gray-900">Dataset</span>
            {isLoaded &&
              (isReuploading ? (
                <button
                  onClick={() => setIsReuploading(false)}
                  className="text-xs text-gray-500 hover:text-gray-700"
                >
                  Cancel
                </button>
              ) : (
                <button
                  onClick={() => setIsReuploading(true)}
                  className="rounded-lg border border-gray-200 px-3 py-1 text-xs text-gray-500 hover:bg-gray-50"
                >
                  Re-upload
                </button>
              ))}
          </div>

          <div className="relative flex flex-1 flex-col overflow-hidden">
            {!showNav ? (
              <DropZone
                onFileReady={handleFileReady}
                onResume={!isReuploading ? handleResume : undefined}
              />
            ) : (
              <>
                <div
                  ref={scrollContainerRef}
                  onScroll={handleScrollInDataset}
                  className="flex-1 overflow-y-auto py-4 pl-5 pr-12"
                >
                  {filteredIndices.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-xs text-gray-400">
                      No MCQs match the active filters.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredIndices.map((absIdx) => {
                        const mcq = mcqs[absIdx]
                        return (
                          <div key={mcq.id} ref={(el) => { cardRefs.current[absIdx] = el }}>
                            <MCQCard
                              mcq={mcq}
                              index={absIdx}
                              isSelected={selectedIndex === absIdx}
                              isEditing={editingIndex === absIdx}
                              highlightedPatchId={
                                selectedIndex === absIdx && editingIndex !== absIdx
                                  ? highlightedPatchId
                                  : null
                              }
                              onSelect={() => {
                                if (editingIndex !== null) return
                                setSelectedIndex(absIdx)
                                setHighlightedPatchId(null)
                              }}
                              onSpanClick={(patchId) => {
                                if (editingIndex !== null) return
                                setSelectedIndex(absIdx)
                                setHighlightedPatchId(patchId)
                              }}
                              onStartEdit={() => {
                                setEditingIndex(absIdx)
                                setSelectedIndex(absIdx)
                                setHighlightedPatchId(null)
                              }}
                              onSaveEdit={(fields) => handleSaveEdit(absIdx, fields)}
                              onCancelEdit={() => setEditingIndex(null)}
                              onAnalyze={() => analyzeSingle(absIdx)}
                              onTestModels={() => testModels(absIdx)}
                              isTestingModel={testingModelIndex === absIdx}
                            />
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                <DatasetNavStrip
                  pos={effectiveFilteredPos}
                  total={filteredIndices.length}
                  onPrev={() => {
                    if (effectiveFilteredPos > 0)
                      navigateTo(filteredIndices[effectiveFilteredPos - 1])
                  }}
                  onNext={() => {
                    if (effectiveFilteredPos < filteredIndices.length - 1)
                      navigateTo(filteredIndices[effectiveFilteredPos + 1])
                  }}
                />
              </>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex w-[45%] flex-col bg-white">
          {/* Right panel header */}
          <div className="flex shrink-0 items-center justify-between border-b border-gray-200 px-5 py-3">
            <p className="text-sm font-semibold text-gray-900">
              {isLoaded ? `Q${selectedIndex + 1} — Suggestions` : 'Suggestions'}
            </p>
            {isLoaded && (
              <div className="flex items-center gap-1.5">
                {/* Per-MCQ undo / redo */}
                <button
                  onClick={() => undoMcq(selectedIndex)}
                  disabled={!canUndoMcq}
                  title="Undo"
                  className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-30"
                >
                  ↩
                </button>
                <button
                  onClick={() => redoMcq(selectedIndex)}
                  disabled={!canRedoMcq}
                  title="Redo"
                  className="flex h-6 w-6 items-center justify-center rounded border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 disabled:pointer-events-none disabled:opacity-30"
                >
                  ↪
                </button>
                {fixablePatches.length > 0 && (
                  <button
                    onClick={() => applyAll(selectedIndex)}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
                  >
                    Apply all ({fixablePatches.length})
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-1 flex-col overflow-y-auto px-5 py-4">
            {isLoaded ? (
              <RightPanel
                mcq={selectedMcq}
                mcqIndex={selectedIndex}
                isEditing={selectedIsEditing}
                highlightedPatchId={highlightedPatchId}
                onHighlightPatch={setHighlightedPatchId}
                onApplyFix={applyFix}
                onRewrite={handleRewrite}
                onAcceptRewrite={acceptRewrite}
                onAcceptBlooms={acceptBlooms}
                onAcceptDistractors={acceptDistractors}
                onAcceptCustomRewrite={acceptCustomRewrite}
                onUpdateMCQ={updateMCQ}
              />
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
                <svg className="h-10 w-10 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <p className="text-sm font-medium text-gray-400">No suggestions yet</p>
                <p className="text-xs text-gray-400">Upload a dataset to start analyzing your MCQs.</p>
              </div>
            )}
          </div>

          {showNav && (
            <ProblematicFooter
              pos={problematicPos}
              total={problematicTotal}
              onPrev={() => navigateTo(prevProblematicIdx)}
              onNext={() => navigateTo(nextProblematicIdx)}
              prevDisabled={prevProblematicIdx === -1}
              nextDisabled={nextProblematicIdx === -1}
            />
          )}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import { parseCsv } from '../lib/csvParser.js'
import { fetchSessions } from '../lib/api.js'

function normalizeJson(raw) {
  if (!Array.isArray(raw)) throw new Error('JSON must be an array of MCQ objects.')

  return raw.map((item, i) => {
    if (item.question && Array.isArray(item.choices)) {
      return {
        question: String(item.question).trim(),
        choices: item.choices.map((c) => String(c).trim()),
        answer: String(item.answer ?? 'A').trim().toUpperCase().charAt(0),
      }
    }
    if (item.question && item.A !== undefined) {
      const choices = ['A', 'B', 'C', 'D']
        .filter((l) => item[l] !== undefined)
        .map((l) => String(item[l]).trim())
      return {
        question: String(item.question).trim(),
        choices,
        answer: String(item.answer ?? 'A').trim().toUpperCase().charAt(0),
      }
    }
    if ((item.stem || item.prompt) && (Array.isArray(item.options) || Array.isArray(item.choices))) {
      return {
        question: String(item.stem ?? item.prompt).trim(),
        choices: (item.options ?? item.choices).map((c) => String(c).trim()),
        answer: String(item.correct ?? item.answer ?? 'A').trim().toUpperCase().charAt(0),
      }
    }
    throw new Error(`Item at index ${i} has an unrecognised format.`)
  })
}

function parseFile(file, text) {
  if (file.name.endsWith('.csv')) return parseCsv(text)
  if (file.name.endsWith('.jsonl')) {
    const lines = text.trim().split('\n').filter(Boolean)
    return normalizeJson(lines.map((line) => JSON.parse(line)))
  }
  let raw
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Invalid JSON — could not parse the file.')
  }
  return normalizeJson(raw)
}

function formatDate(iso) {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

// ── Recent sessions list ──────────────────────────────────────────────────────
function RecentSessions({ onResume }) {
  const [sessions, setSessions] = useState(null) // null = loading
  const [resumingId, setResumingId] = useState(null)

  useEffect(() => {
    fetchSessions()
      .then((data) => setSessions(data.sessions ?? []))
      .catch(() => setSessions([]))
  }, [])

  if (sessions === null || sessions.length === 0) return null

  async function handleResume(session) {
    setResumingId(session.id)
    try {
      await onResume(session)
    } finally {
      setResumingId(null)
    }
  }

  return (
    <div className="mt-6 w-full max-w-sm">
      <p className="mb-2 text-xs font-semibold text-gray-500">Recent sessions</p>
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {sessions.map((session, i) => (
          <div
            key={session.id}
            className={[
              'flex items-center justify-between px-4 py-3',
              i < sessions.length - 1 ? 'border-b border-gray-100' : '',
            ].join(' ')}
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-gray-800">{session.filename}</p>
              <p className="text-xs text-gray-400">
                {formatDate(session.created_at)} · {session.mcq_count} questions
              </p>
            </div>
            <button
              onClick={() => handleResume(session)}
              disabled={resumingId === session.id}
              className="ml-4 shrink-0 rounded-lg border border-gray-200 px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
            >
              {resumingId === session.id ? 'Loading…' : 'Resume'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Drop zone ─────────────────────────────────────────────────────────────────
export default function DropZone({ onFileReady, onResume }) {
  const inputRef = useRef(null)
  const [error, setError] = useState(null)
  const [dragging, setDragging] = useState(false)

  function handleFile(file) {
    if (!file) return
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const mcqs = parseFile(file, e.target.result)
        if (mcqs.length === 0) {
          setError('Could not parse file. Check the format and try again.')
          return
        }
        onFileReady(mcqs, file.name)
      } catch {
        setError('Could not parse file. Check the format and try again.')
      }
    }
    reader.readAsText(file)
  }

  function onDrop(e) {
    e.preventDefault()
    setDragging(false)
    handleFile(e.dataTransfer.files[0])
  }

  return (
    <div className="flex h-full flex-col items-center overflow-y-auto px-8 py-8">
      {/* Drop zone box */}
      <div className="w-full max-w-sm">
        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={[
            'flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-8 py-12 transition-colors',
            dragging
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-gray-400',
          ].join(' ')}
        >
          <svg className="h-10 w-10 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <div className="text-center">
            <p className="text-sm font-medium text-gray-700">Drop your dataset here</p>
            <p className="mt-1 text-xs text-gray-400">
              Drag and drop a CSV or JSON file to load your MCQ benchmark
            </p>
          </div>
          <div className="flex w-full items-center gap-2">
            <div className="flex-1 border-t border-gray-200" />
            <span className="text-xs text-gray-400">or</span>
            <div className="flex-1 border-t border-gray-200" />
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); inputRef.current?.click() }}
            className="rounded-lg border border-gray-300 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Browse files
          </button>
          <p className="text-xs text-gray-400">CSV · JSON · JSONL</p>
        </div>

        {error && (
          <p className="mt-3 text-center text-sm text-red-500">{error}</p>
        )}

        <input
          ref={inputRef}
          type="file"
          accept=".json,.csv,.jsonl"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />
      </div>

      {/* Recent sessions — only shown in empty state (when onResume is provided) */}
      {onResume && <RecentSessions onResume={onResume} />}
    </div>
  )
}

const LETTERS = 'ABCDEFGHIJKLMNOP'

function MCQPreviewCard({ mcq, index }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 text-sm">
      <p className="mb-1 text-xs font-semibold text-gray-400">Q{index + 1}</p>
      <p className="mb-3 font-medium text-gray-800">{mcq.question}</p>
      <ul className="space-y-1">
        {mcq.choices.map((c, i) => (
          <li
            key={i}
            className={[
              'rounded px-2 py-1 text-xs',
              LETTERS[i] === mcq.answer
                ? 'bg-green-50 font-medium text-green-800'
                : 'text-gray-600',
            ].join(' ')}
          >
            {LETTERS[i]}) {c}
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function PreviewModal({ mcqs, filename, onConfirm, onCancel }) {
  const shown = mcqs.slice(0, 3)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 py-12 px-4">
      <div className="w-full max-w-2xl">
        <div className="rounded-2xl bg-gray-50 shadow-xl">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Preview dataset</h2>
              <p className="text-sm text-gray-500">
                {filename} · {mcqs.length} question{mcqs.length !== 1 ? 's' : ''} detected
              </p>
            </div>
            <button
              onClick={onCancel}
              className="ml-4 rounded-lg p-1 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
            >
              <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* MCQ cards */}
          <div className="space-y-3 px-6 py-4">
            {shown.map((mcq, i) => (
              <MCQPreviewCard key={i} mcq={mcq} index={i} />
            ))}
            {mcqs.length > 3 && (
              <p className="text-center text-xs text-gray-400">
                … + {mcqs.length - 3} more question{mcqs.length - 3 !== 1 ? 's' : ''}
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-gray-200 px-6 py-4">
            <span className="text-sm text-gray-500">Looks correct?</span>
            <button
              onClick={onConfirm}
              className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Looks good — load dataset
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

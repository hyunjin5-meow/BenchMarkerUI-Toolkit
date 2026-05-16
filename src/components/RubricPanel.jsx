import { useState } from 'react'

export default function RubricPanel({
  rubricMode,
  onSetMode,
  customRules,
  onAddRule,
  onDeleteRule,
  onUpdateRule,
}) {
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [editingId, setEditingId] = useState(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')

  function handleAdd() {
    const name = newName.trim()
    const description = newDesc.trim()
    if (!name || !description) return
    onAddRule({ name, description })
    setNewName('')
    setNewDesc('')
  }

  function startEdit(rule) {
    setEditingId(rule.id)
    setEditName(rule.name)
    setEditDesc(rule.description)
  }

  function commitEdit() {
    const name = editName.trim()
    const description = editDesc.trim()
    if (!name || !description) return
    onUpdateRule(editingId, { name, description })
    setEditingId(null)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  return (
    <div className="border-t border-gray-200 bg-white px-6 py-4">
      {/* Mode toggle */}
      <div className="mb-4 flex items-center gap-3">
        <span className="text-xs font-semibold text-gray-500">Rubric mode</span>
        <div className="flex rounded-lg border border-gray-200 p-0.5">
          <button
            onClick={() => onSetMode('original')}
            className={[
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              rubricMode === 'original'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            Original
          </button>
          <button
            onClick={() => onSetMode('custom')}
            className={[
              'rounded-md px-3 py-1 text-xs font-medium transition-colors',
              rubricMode === 'custom'
                ? 'bg-purple-600 text-white shadow-sm'
                : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            Custom
          </button>
        </div>
        {rubricMode === 'custom' && (
          <span className="rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-xs font-medium text-purple-700">
            Custom rubric active
          </span>
        )}
      </div>

      <div className="flex gap-6">
        {/* Add rule form — only in custom mode */}
        <div className={['w-72 shrink-0', rubricMode !== 'custom' ? 'hidden' : ''].join(' ')}>
          <p className="mb-2 text-xs font-semibold text-gray-500">Add rule</p>
          <input
            type="text"
            placeholder="Rule name (e.g. avoid_passive_voice)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 font-mono text-xs text-gray-800 placeholder-gray-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
          />
          <textarea
            placeholder="Description — what to check and how to fix it"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            rows={3}
            className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-800 placeholder-gray-400 focus:border-purple-400 focus:outline-none focus:ring-1 focus:ring-purple-400"
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim() || !newDesc.trim()}
            className="rounded-lg bg-purple-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-40"
          >
            Add rule
          </button>
        </div>

        {/* Rules list — only in custom mode */}
        <div className={['flex-1', rubricMode !== 'custom' ? 'hidden' : ''].join(' ')}>
          <p className="mb-2 text-xs font-semibold text-gray-500">
            Custom rules{customRules.length > 0 ? ` (${customRules.length})` : ''}
          </p>
          {customRules.length === 0 ? (
            <p className="text-xs text-gray-400">No custom rules yet. Add one using the form.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {customRules.map((rule) =>
                editingId === rule.id ? (
                  <div
                    key={rule.id}
                    className="w-64 rounded-lg border border-purple-300 bg-purple-50 p-3"
                  >
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="mb-1.5 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs text-gray-800 focus:border-purple-400 focus:outline-none"
                    />
                    <textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      rows={2}
                      className="mb-1.5 w-full rounded border border-gray-300 px-2 py-1 text-xs text-gray-800 focus:border-purple-400 focus:outline-none"
                    />
                    <div className="flex gap-1.5">
                      <button
                        onClick={commitEdit}
                        disabled={!editName.trim() || !editDesc.trim()}
                        className="rounded bg-purple-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-purple-700 disabled:opacity-40"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="rounded border border-gray-200 px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    key={rule.id}
                    className="w-64 rounded-lg border border-gray-200 bg-gray-50 p-3"
                  >
                    <div className="mb-1 flex items-start justify-between gap-1">
                      <span className="break-all font-mono text-xs font-medium text-gray-800">
                        {rule.name}
                      </span>
                      <div className="flex shrink-0 gap-1">
                        <button
                          onClick={() => startEdit(rule)}
                          className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => onDeleteRule(rule.id)}
                          className="rounded px-1.5 py-0.5 text-xs text-gray-400 hover:bg-red-50 hover:text-red-600"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                    <p className="text-xs leading-relaxed text-gray-500">{rule.description}</p>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

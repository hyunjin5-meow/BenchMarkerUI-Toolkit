const QUESTION_COLS = ['question', 'stem', 'prompt']
const ANSWER_COLS = ['answer', 'correct', 'correct_answer', 'key']

// Choice column patterns: each entry is an ordered list of 4 column names
const CHOICE_PATTERNS = [
  ['choice_a', 'choice_b', 'choice_c', 'choice_d'],
  ['option_a', 'option_b', 'option_c', 'option_d'],
  ['a', 'b', 'c', 'd'],
  ['1', '2', '3', '4'],
]

function parseCsvLine(line) {
  const result = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current.trim())
  return result
}

function detectHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const lower = rows[i].map((c) => c.toLowerCase().trim())
    const hasQuestion = QUESTION_COLS.some((q) => lower.includes(q))
    const hasChoice = CHOICE_PATTERNS.some((pat) => lower.includes(pat[0]))
    if (hasQuestion || hasChoice) return i
  }
  return null
}

function detectColumns(headers) {
  const lower = headers.map((h) => h.toLowerCase().trim())

  const questionCol = QUESTION_COLS.map((q) => lower.indexOf(q)).find((i) => i !== -1) ?? null
  const answerCol = ANSWER_COLS.map((q) => lower.indexOf(q)).find((i) => i !== -1) ?? null

  let choiceCols = null
  for (const pattern of CHOICE_PATTERNS) {
    const indices = pattern.map((p) => lower.indexOf(p))
    if (indices.every((i) => i !== -1)) {
      choiceCols = indices
      break
    }
  }

  const missing = []
  if (questionCol === null) missing.push('question column (expected: question / stem / prompt)')
  if (choiceCols === null) missing.push('choice columns (expected: choice_a/b/c/d, a/b/c/d, option_a/b/c/d, or 1/2/3/4)')
  if (answerCol === null) missing.push('answer column (expected: answer / correct / correct_answer / key)')

  if (missing.length > 0) {
    throw new Error(`Could not detect columns:\n• ${missing.join('\n• ')}\n\nFound columns: ${headers.filter(Boolean).join(', ')}`)
  }

  return { questionCol, answerCol, choiceCols }
}

export function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter((l) => l.trim())
  const rows = lines.map(parseCsvLine)

  const headerRowIndex = detectHeaderRow(rows)
  if (headerRowIndex === null) {
    throw new Error('Could not find a header row. Expected columns like: question, choice_a, choice_b, choice_c, choice_d, answer')
  }

  const headers = rows[headerRowIndex]
  const { questionCol, answerCol, choiceCols } = detectColumns(headers)

  const dataRows = rows.slice(headerRowIndex + 1).filter((r) => r.some((c) => c.trim()))

  if (dataRows.length === 0) {
    throw new Error('Header row was found but no data rows follow it.')
  }

  return dataRows.map((cols) => ({
    question: (cols[questionCol] ?? '').trim(),
    choices: choiceCols.map((ci) => (cols[ci] ?? '').trim()),
    answer: ((cols[answerCol] ?? 'A').trim().toUpperCase().charAt(0)),
  }))
}

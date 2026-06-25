const QUESTION_COLS = ['question', 'stem', 'prompt']
const ANSWER_COLS = ['answer', 'correct', 'correct_answer', 'key']
const CHOICES_SINGLE_COLS = ['choices', 'options']

// Choice column patterns: each entry is an ordered list of 4 column names
const CHOICE_PATTERNS = [
  ['choice_a', 'choice_b', 'choice_c', 'choice_d'],
  ['option_a', 'option_b', 'option_c', 'option_d'],
  ['a', 'b', 'c', 'd'],
  ['1', '2', '3', '4'],
]

// Parses a Python-style list string like "['foo', 'bar']" or '["foo", "bar"]'
function parsePythonList(str) {
  const trimmed = str.trim()
  if (!trimmed.startsWith('[')) return null
  try {
    // Replace single quotes with double quotes for JSON parsing, handling escaped quotes
    const jsonStr = trimmed
      .replace(/'/g, '"')
      .replace(/\\"/g, "'") // restore any escaped double quotes
    return JSON.parse(jsonStr)
  } catch {
    // Fallback: extract quoted strings manually
    const matches = [...trimmed.matchAll(/['"]([^'"]*)['"]/g)]
    return matches.length > 0 ? matches.map((m) => m[1]) : null
  }
}

function parseCsvRows(text) {
  const rows = []
  let row = []
  let current = ''
  let inQuotes = false
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"'
        i += 2
        continue
      }
      inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      row.push(current.trim())
      current = ''
    } else if ((ch === '\n' || (ch === '\r' && text[i + 1] === '\n')) && !inQuotes) {
      if (ch === '\r') i++
      row.push(current.trim())
      current = ''
      if (row.some((c) => c)) rows.push(row)
      row = []
    } else {
      current += ch
    }
    i++
  }
  if (current || row.length) {
    row.push(current.trim())
    if (row.some((c) => c)) rows.push(row)
  }
  return rows
}

function detectHeaderRow(rows) {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const lower = rows[i].map((c) => c.toLowerCase().trim())
    const hasQuestion = QUESTION_COLS.some((q) => lower.includes(q))
    const hasChoice =
      CHOICE_PATTERNS.some((pat) => lower.includes(pat[0])) ||
      CHOICES_SINGLE_COLS.some((q) => lower.includes(q))
    if (hasQuestion || hasChoice) return i
  }
  return null
}

function detectColumns(headers) {
  const lower = headers.map((h) => h.toLowerCase().trim())

  const questionCol = QUESTION_COLS.map((q) => lower.indexOf(q)).find((i) => i !== -1) ?? null
  const answerCol = ANSWER_COLS.map((q) => lower.indexOf(q)).find((i) => i !== -1) ?? null

  // Check for a single "choices"/"options" column first
  const choicesSingleCol = CHOICES_SINGLE_COLS.map((q) => lower.indexOf(q)).find((i) => i !== -1) ?? null

  let choiceCols = null
  if (choicesSingleCol === null) {
    for (const pattern of CHOICE_PATTERNS) {
      const indices = pattern.map((p) => lower.indexOf(p))
      if (indices.every((i) => i !== -1)) {
        choiceCols = indices
        break
      }
    }
  }

  const missing = []
  if (questionCol === null) missing.push('question column (expected: question / stem / prompt)')
  if (choicesSingleCol === null && choiceCols === null)
    missing.push('choice columns (expected: choices, options, choice_a/b/c/d, a/b/c/d, option_a/b/c/d, or 1/2/3/4)')
  if (answerCol === null) missing.push('answer column (expected: answer / correct / correct_answer / key)')

  if (missing.length > 0) {
    throw new Error(`Could not detect columns:\n• ${missing.join('\n• ')}\n\nFound columns: ${headers.filter(Boolean).join(', ')}`)
  }

  return { questionCol, answerCol, choiceCols, choicesSingleCol }
}

export function parseCsv(text) {
  const rows = parseCsvRows(text)

  const headerRowIndex = detectHeaderRow(rows)
  if (headerRowIndex === null) {
    throw new Error('Could not find a header row. Expected columns like: question, choice_a, choice_b, choice_c, choice_d, answer')
  }

  const headers = rows[headerRowIndex]
  const { questionCol, answerCol, choiceCols, choicesSingleCol } = detectColumns(headers)

  const dataRows = rows.slice(headerRowIndex + 1).filter((r) => r.some((c) => c.trim()))

  if (dataRows.length === 0) {
    throw new Error('Header row was found but no data rows follow it.')
  }

  return dataRows.map((cols) => {
    let choices
    if (choicesSingleCol !== null) {
      const raw = (cols[choicesSingleCol] ?? '').trim()
      choices = parsePythonList(raw) ?? [raw]
    } else {
      choices = choiceCols.map((ci) => (cols[ci] ?? '').trim())
    }
    return {
      question: (cols[questionCol] ?? '').trim(),
      choices,
      answer: ((cols[answerCol] ?? 'A').trim().toUpperCase().charAt(0)),
    }
  })
}

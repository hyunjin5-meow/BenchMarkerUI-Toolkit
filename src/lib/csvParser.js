const QUESTION_COLS = ['question', 'stem', 'prompt']
const ANSWER_COLS = ['answer', 'correct', 'correct_answer', 'key']
const CHOICES_SINGLE_COLS = ['choices', 'options', 'mc1_targets']

// Choice column patterns: each entry is an ordered list of 4 column names
const CHOICE_PATTERNS = [
  ['choice_a', 'choice_b', 'choice_c', 'choice_d'],
  ['option_a', 'option_b', 'option_c', 'option_d'],
  ['a', 'b', 'c', 'd'],
  ['1', '2', '3', '4'],
]

// Converts a Python literal (list or dict with mixed single/double quotes) to a JSON string.
// Handles Python's smart-quoting: strings containing ' are wrapped in "...", and vice versa.
// A naive global replace('/g, '"') would corrupt apostrophes inside double-quoted strings.
function pythonToJson(str) {
  let out = ''
  let i = 0
  while (i < str.length) {
    const ch = str[i]
    if (ch === "'" || ch === '"') {
      const delim = ch
      out += '"'
      i++
      while (i < str.length) {
        const c = str[i]
        if (c === '\\' && i + 1 < str.length) {
          const next = str[i + 1]
          if (next === delim) {
            // escaped delimiter → emit the raw char (no need to escape ' in JSON)
            out += delim === '"' ? '\\"' : "'"
          } else if (next === '"') {
            out += '\\"'
          } else {
            out += '\\' + next
          }
          i += 2
          continue
        }
        if (c === delim) { out += '"'; i++; break }
        if (c === '"') { out += '\\"'; i++; continue }
        out += c
        i++
      }
    } else {
      out += ch
      i++
    }
  }
  return out
    .replace(/\bTrue\b/g, 'true')
    .replace(/\bFalse\b/g, 'false')
    .replace(/\bNone\b/g, 'null')
}

function parsePythonDict(str) {
  const trimmed = str.trim()
  if (!trimmed.startsWith('{')) return null
  try { return JSON.parse(pythonToJson(trimmed)) } catch { return null }
}

function parsePythonList(str) {
  const trimmed = str.trim()
  if (!trimmed.startsWith('[')) return null
  try { return JSON.parse(pythonToJson(trimmed)) } catch { return null }
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

  // TruthfulQA: mc1_targets encodes both choices and labels; no separate answer col needed
  const mc1Idx = lower.indexOf('mc1_targets')
  const targetsCol = mc1Idx !== -1 ? mc1Idx : null

  let choicesSingleCol = null
  let choiceCols = null
  if (targetsCol === null) {
    const singleCols = CHOICES_SINGLE_COLS.filter((c) => c !== 'mc1_targets')
    choicesSingleCol = singleCols.map((q) => lower.indexOf(q)).find((i) => i !== -1) ?? null
    if (choicesSingleCol === null) {
      for (const pattern of CHOICE_PATTERNS) {
        const indices = pattern.map((p) => lower.indexOf(p))
        if (indices.every((i) => i !== -1)) {
          choiceCols = indices
          break
        }
      }
    }
  }

  const missing = []
  if (questionCol === null) missing.push('question column (expected: question / stem / prompt)')
  if (targetsCol === null && choicesSingleCol === null && choiceCols === null)
    missing.push('choice columns (expected: choices, options, mc1_targets, choice_a/b/c/d, a/b/c/d, option_a/b/c/d, or 1/2/3/4)')
  if (targetsCol === null && answerCol === null) missing.push('answer column (expected: answer / correct / correct_answer / key)')

  if (missing.length > 0) {
    throw new Error(`Could not detect columns:\n• ${missing.join('\n• ')}\n\nFound columns: ${headers.filter(Boolean).join(', ')}`)
  }

  return { questionCol, answerCol, choiceCols, choicesSingleCol, targetsCol }
}

export function parseCsv(text) {
  const rows = parseCsvRows(text)

  const headerRowIndex = detectHeaderRow(rows)
  if (headerRowIndex === null) {
    throw new Error('Could not find a header row. Expected columns like: question, choice_a, choice_b, choice_c, choice_d, answer')
  }

  const headers = rows[headerRowIndex]
  const { questionCol, answerCol, choiceCols, choicesSingleCol, targetsCol } = detectColumns(headers)

  const dataRows = rows.slice(headerRowIndex + 1).filter((r) => r.some((c) => c.trim()))

  if (dataRows.length === 0) {
    throw new Error('Header row was found but no data rows follow it.')
  }

  return dataRows.map((cols) => {
    let choices, answer
    if (targetsCol !== null) {
      const parsed = parsePythonDict((cols[targetsCol] ?? '').trim())
      if (parsed && Array.isArray(parsed.choices) && Array.isArray(parsed.labels)) {
        choices = parsed.choices.map(String)
        const correctIdx = parsed.labels.indexOf(1)
        answer = correctIdx >= 0 ? String.fromCharCode(65 + correctIdx) : 'A'
      } else {
        choices = []
        answer = 'A'
      }
    } else if (choicesSingleCol !== null) {
      const raw = (cols[choicesSingleCol] ?? '').trim()
      choices = parsePythonList(raw) ?? [raw]
      answer = (cols[answerCol] ?? 'A').trim().toUpperCase().charAt(0)
    } else {
      choices = choiceCols.map((ci) => (cols[ci] ?? '').trim())
      answer = (cols[answerCol] ?? 'A').trim().toUpperCase().charAt(0)
    }
    return {
      question: (cols[questionCol] ?? '').trim(),
      choices,
      answer,
    }
  })
}

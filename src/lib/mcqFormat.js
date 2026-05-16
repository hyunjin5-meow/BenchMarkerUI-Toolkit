const LETTERS = 'ABCDEFGHIJKLMNOP'

/** Returns the canonical text representation sent to the API. */
export function formatMCQ(mcq) {
  const choicesText = mcq.choices
    .map((c, i) => `${LETTERS[i]}) ${c}`)
    .join('\n')
  return `${mcq.question}\n\n${choicesText}\n\nAnswer: ${mcq.answer}`
}

/** Applies a patch's text replacement to the MCQ and returns an updated MCQ object. */
export function applyPatchToMCQ(mcq, patch) {
  const formatted = formatMCQ(mcq)
  const updated = formatted.replace(patch.original_text, patch.replaced_text)
  if (updated === formatted) return mcq
  return parseMCQFromFormatted(updated, mcq)
}

function parseMCQFromFormatted(text, originalMcq) {
  const lines = text.split('\n')
  const questionLines = []
  const choices = []
  let answer = originalMcq.answer
  let seenFirstBlank = false

  for (const line of lines) {
    const trimmed = line.trim()

    if (!trimmed) {
      seenFirstBlank = true
      continue
    }

    const choiceMatch = trimmed.match(/^([A-P])\) (.+)$/)
    if (choiceMatch) {
      seenFirstBlank = true
      choices.push(choiceMatch[2])
    } else if (trimmed.startsWith('Answer: ')) {
      answer = trimmed.slice('Answer: '.length).trim()
    } else if (!seenFirstBlank) {
      questionLines.push(trimmed)
    }
  }

  return {
    ...originalMcq,
    question: questionLines.join(' '),
    choices: choices.length > 0 ? choices : originalMcq.choices,
    answer,
  }
}

export const ALL_RUBRIC_ITEMS = [
  'grammatical_consistency',
  'focused_stem',
  'problem_in_stem',
  'single_best_answer',
  'no_extraneous_info',
  'avoid_k_type',
  'clear_language',
  'plausible_distractors',
  'avoid_repetition',
  'no_logical_cues',
  'no_convergence_cues',
  'equal_length_options',
  'ordered_options',
  'no_absolute_terms',
  'no_vague_terms',
  'avoid_negatives',
  'no_all_of_the_above',
  'no_none_of_the_above',
  'no_fill_in_blank',
]

// IWF cognitive-function taxonomy
// high   → Confusion-inducing (increase response time and difficulty)
// medium → Structural (alter task format, uncertain effect)
// low    → Cue-giving (hurt validity but not comprehension)

const HIGH = new Set([
  'ambiguous/unclear',
  'unfocused_stem',
  'no_extraneous_info',
  'ordered_options',
  'avoid_negatives',
  'no_vague_terms',
])

const MEDIUM = new Set([
  'avoid_k_type',
  'no_none_of_the_above',
  'no_all_of_the_above',
  'no_fill_in_blank',
  'no_absolute_terms',
  'plausible_distractors',
  'single_best_answer',
])

export const CATEGORY_NAMES = {
  high:   'Confusion-inducing',
  medium: 'Structural',
  low:    'Cue-giving',
}

export const CATEGORY_TOOLTIPS = {
  high:   'Increases student response time and difficulty',
  medium: 'Alters question format — uncertain effect',
  low:    'May allow guessing without domain knowledge',
}

export const CATEGORY_ORDER = { high: 0, medium: 1, low: 2 }

// Alias for any existing imports
export const SEVERITY_ORDER = CATEGORY_ORDER

export function formatRubricTag(tag) {
  return tag.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

export function extractRubricTag(explanation) {
  const lower = explanation.toLowerCase()
  for (const item of ALL_RUBRIC_ITEMS) {
    if (lower.includes(item)) return item
  }
  return null
}

/** Returns 'high' | 'medium' | 'low' */
export function getSeverity(rubricTag) {
  if (!rubricTag) return 'medium'
  if (HIGH.has(rubricTag)) return 'high'
  if (MEDIUM.has(rubricTag)) return 'medium'
  if (ALL_RUBRIC_ITEMS.includes(rubricTag)) return 'low'
  return 'medium' // unrecognised
}

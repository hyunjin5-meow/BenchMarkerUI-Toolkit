import { formatMCQ } from './mcqFormat.js'

export function buildPatchPrompt(mcq) {
  const mcqText = formatMCQ(mcq)

  return `<task>
You will be given a multiple-choice question that was written by a user. Your goal is to detect flaws in the question using the rubric and propose improvements as targeted patches.
</task>

<patch instructions>

# Core behavior

- Generate targeted patches instead of rewriting the entire question.
- Each patch must include:
  - 'original_text'
  - 'replaced_text'
  - 'explanation'

- Evaluate all rubric violations based only on the original MCQ.
- Do not assume the MCQ is acceptable just because it is answerable; apply the rubric strictly.

- If no rubric violations are found, return:
  { "patches": [] }

---

# CRITICAL: No-op prevention (highest priority)

- NEVER return a patch where 'original_text' and 'replaced_text' are identical.
- If applying a rubric fix would result in no change to the text, DO NOT generate a patch.
- Instead, return a single rewrite-required patch.

---

# Rewrite rule (global issues)

- If the MCQ contains multiple interacting issues OR a violation that cannot be meaningfully fixed with a localized patch, return a single patch:

  {
    "original_text": "<relevant portion>",
    "replaced_text": "This question requires a full rewrite.",
    "explanation": "..."
  }

- Do not generate additional patches in this case.

---

# Patch quality rules

Each patch must:
- fix a real rubric violation
- make a meaningful change
- directly implement the fix
- use minimal span
- be non-overlapping
- preserve MCQ structure

Do NOT:
- describe a fix without applying it
- generate duplicate or overlapping patches
- modify the same option across patches
- insert commentary into MCQ text

---

# Minimal patch rules

- Use the smallest possible substring for 'original_text'.
- If only one option is flawed: patch ONLY that option
- If multiple options must change: change the minimum number required
- Never modify the full list if only one option is wrong

---

# Structural rules

- Do not remove or add options unless explicitly required
- Modify existing options in place

---

# Common violations to check

- plausible_distractors
- ordered_options
- avoid_negatives
- single_best_answer
- no_all_of_the_above / none_of_the_above
- focused_stem / clear_language

---

# Single best answer rule

- Ensure exactly one correct answer after patch
- Do not replace a correct answer with another potentially correct answer

---

# Special handling: avoid_negatives

- If the negative is NOT clearly emphasized → apply capitalization fix
- If the negative is already clearly emphasized:
  → DO NOT create a no-op patch
  → return a rewrite-required patch instead

---

# Consistency rules

- Explanations and actions must agree
- Do not create patches that are only needed after another patch
- Do not evaluate based on patched results
- All patches must reference only text in the current MCQ

</patch instructions>

---

<rubric>
- grammatical_consistency: All options should be grammatically consistent with the stem and should be parallel in style and form.
- focused_stem: Each MCQ should have a clear and focused question; avoid unfocused stems.
- problem_in_stem: Each MCQ should have the problem in the stem, not in the options.
- single_best_answer: MCQs should have one, and only one, best answer.
- no_extraneous_info: Avoid gratuitous or unnecessary information in the stem or options.
- avoid_k_type: Avoid complex or K-type MCQs with multiple combinations of responses.
- clear_language: Questions and options should be written in clear, unambiguous language.
- plausible_distractors: Make all distractors plausible to maintain item quality.
- avoid_repetition: Avoid repeating words in the stem and the correct option.
- no_logical_cues: Avoid logical cues in the stem and correct option that reveal the answer.
- no_convergence_cues: Avoid convergence cues in options where correct components appear most frequently.
- equal_length_options: There should not be outlier options that are much longer or shorter than the others.
- ordered_options: If the options are numbers, arrange them in chronological or ascending numerical order.
- no_absolute_terms: Avoid using absolute terms in the options that turn the option's meaning into a universal truth.
- no_vague_terms: Avoid vague terms in the options that make the option's meaning confusing.
- avoid_negatives: Avoid the use of negatives in the core part of the stem that poses the question.
- no_all_of_the_above: Avoid 'all of the above' as an option.
- no_none_of_the_above: Avoid 'none of the above' as an option.
- no_fill_in_blank: Avoid fill-in-the-blank formats where the blank is not at the end of the question stem.
</rubric>

---

This is the input MCQ:
<multiple-choice question>
${mcqText}
</multiple-choice question>

Return ONLY valid JSON:
{
  "patches": [...]
}`
}

/**
 * Builds the full user message for the Anthropic API from an MCQ object.
 * @param {{ question: string, choices: Record<string, string>, answer: string }} mcq
 * @returns {string}
 */
export function buildPrompt(mcq) {
  const choicesText = Object.entries(mcq.choices)
    .map(([letter, text]) => `(${letter}) ${text}`)
    .join('\n')

  const mcqBlock = `Question: ${mcq.question}
Choices:
${choicesText}
Answer: (${mcq.answer}) ${mcq.choices[mcq.answer]}`

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

# 🚨 CRITICAL: No-op prevention (highest priority)

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

- If the explanation implies a rewrite is required, you MUST return a rewrite patch and not a localized fix.

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

- If only one option is flawed:
  → patch ONLY that option

- If multiple options must change:
  → change the minimum number required

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

# 🔥 Special handling: avoid_negatives

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

<example>
Input MCQ:
Question: What is 2 + 2?
Choices:
(A) 3
(B) 4
(C) 5
(D) 22
Answer: (B) 4

Output:
{
  "patches": [
    {
      "original_text": "(D) 22",
      "replaced_text": "(D) 6",
      "explanation": "Option (D) '22' is an implausible distractor, violating the plausible_distractors rubric item."
    }
  ]
}
</example>

---

<example>
Input MCQ:
Question: What is 2 + 2?
Choices:
(A) 5
(B) 3
(C) 4
(D) 6
Answer: (C) 4

Output:
{
  "patches": [
    {
      "original_text": "(A) 5\\n(B) 3\\n(C) 4\\n(D) 6",
      "replaced_text": "(A) 3\\n(B) 4\\n(C) 5\\n(D) 6",
      "explanation": "The answer choices are not in ascending order, violating the ordered_options rubric item."
    }
  ]
}
</example>

---

<example>
Input MCQ:
Question: Which number is even?
Choices:
(A) 2
(B) 4
(C) 6
(D) 7
Answer: (A) 2

Output:
{
  "patches": [
    {
      "original_text": "(B) 4",
      "replaced_text": "(B) 3",
      "explanation": "Multiple correct answers violate the single_best_answer rubric item."
    }
  ]
}
</example>

---

<example>
Input MCQ:
Question: Which of the following is NOT a prime number?
Choices:
(A) 2
(B) 3
(C) 4
(D) 5
Answer: (C) 4

Output:
{
  "patches": [
    {
      "original_text": "Question: Which of the following is NOT a prime number?",
      "replaced_text": "This question requires a full rewrite.",
      "explanation": "The stem uses a negative ('NOT'), which violates the avoid_negatives rubric item and cannot be meaningfully fixed with a localized patch."
    }
  ]
}
</example>

---

This is the input MCQ:
<multiple-choice question>
${mcqBlock}
</multiple-choice question>

---

This is the rubric:
<rubric>
- grammatical_consistency: All options should be grammatically consistent with the stem and should be parallel in style and form. Fix: Modify only the options. Identify the majority form (e.g., noun phrase or gerund) and convert all options to that form. Standardize articles, number, and tense to match the stem so every option fits grammatically when read after the stem.
- focused_stem: Each MCQ should have a clear and focused question; avoid unfocused stems. Fix: Modify only the question stem. Rewrite the question as a single, specific what/which/when/where/why question targeting one concept that a test-taker could easily understand without looking at the options.
- problem_in_stem: Each MCQ should have the problem in the stem, not in the options, so a test-taker can understand the question without looking at the options. Fix: Modify only the question stem. Clearly state the problem in the stem by turning it into a question. For example 'Mitochondria is...' -> 'What is the function of mitochondria?'
- single_best_answer: MCQs should have one, and only one, best answer. Fix: Modify only the choices. Replace the incorrect choice that seems like it could be the correct answer with a plausible but incorrect distractor, matching the difficulty of the other distractors.
- no_extraneous_info: Avoid gratuitous or unnecessary information in the stem or options; include only what is required. Fix: Modify only the question stem. Condense the question stem by removing uneccessary clauses and sentences to make it simpler and more concise.
- avoid_k_type: Avoid complex or K-type MCQs with multiple combinations of responses. Fix: Modify the questions and the options. Merge all correct statements into one complete correct option. Rephrase the stem to ask for one clear fact or concept. Keep other distractors plausible but individually incorrect. Example: Instead of 'Which statements about photosynthesis are true? (A-D),' rewrite as 'Which statement correctly describes photosynthesis?' with options like: 'A. It occurs in chloroplasts and uses carbon dioxide to produce oxygen.' (correct), and other distinct, incorrect alternatives.
- clear_language: Questions and options should be written in clear, unambiguous language. Fix: Modify the question and the options. Replace vague comparatives ("best," "appropriate") with criteria ("lowest cost," "highest sensitivity"). Replace deictics ("this/that") with named referents. Make the question and each option interpretable without external context.
- plausible_distractors: Make all distractors plausible to maintain item quality. No distractor should be obviously eliminated by a test-taker without any knowledge of the concepts tested in the question. Fix: Modify only the choices. Replace the choice that is obviously incorrect with a choice that is a plausible distractor.
- avoid_repetition: Avoid repeating words in the stem and the correct option. Fix: If a key term appears in the stem, either include it in all options or in none (use a synonym in options).
- no_logical_cues: Avoid logical cues in the stem and correct option that reveal the answer. Fix: Modify only the options. Primarily modify the options to satisfy the surface constraints (S). If S is missing, minimally clarify the stem (≤5 words) to specify S (e.g., 'which process')
- no_convergence_cues: Avoid convergence cues in options where correct components appear most frequently. Fix: Modify only distractors. Balance recurring components so none used in the answer is disproportionately frequent across options.
- equal_length_options: There should not be outlier options that are much longer or shorter than the others. Fix: Modify only the choices. Adjust phrasing so all options are close to median length and carry comparable detail.
- ordered_options: If the options are numbers, arrange them in chronological or ascending numerical order. Fix: Modify only the options. Sort options in ascending order.
- no_absolute_terms: Avoid using absolute terms (e.g., never, always, only, all) in the options that turn the option's meaning into a universal truth, as such truths are often incorrect. Fix: Modify only the choices. Change the problematic choices such that none use absolute terms unless they are necessary.
- no_vague_terms: Avoid vague terms in the options that make the option's meaning confusing for test-takers trying to answer the question. Fix: Modify only the options. Replace the vague terms with more specific or definite terms.
- avoid_negatives: Avoid the use of negatives (e.g., not, except, incorrect) in the core part of the stem that poses the question. The multiple-choice question should not be testing something that the test-taker does not know or asking them to pick a factually incorrect option. Fix: It is impossible to fix this flaw without rewriting the entire question and choices, so as a solution for now, make the negated part of the question explicitly capitalized so it is not missed by the test-taker, and advise the test writer to rewrite the entire multiple-choice question.
- no_all_of_the_above: Avoid 'all of the above' as an option. Fix: Modify only the question stem and the choices. If 'All of the above' is the incorrect answer, replace it with another distractor that maintains the style, difficulty, and grammar of the other distractors. If 'All of the above' is the correct answer, recommend that the test writer does a complete rewrite of the multiple-choice question.
- no_none_of_the_above: Avoid 'none of the above' as an option Fix: Modify only the choices. If 'None of the above' is the correct answer to the question, replace it with an actually correct answer. If 'None of the above' is the incorrect answer, replace it with a plausible but incorrect distractor that maintains the style, difficulty, and grammar of the other distractors.
- no_fill_in_blank: Avoid fill-in-the-blank formats where the blank is not at the end of the question stem; place all options at the end of the stem. Fix: Modify only the question stem. Rewrite the question so it is a concrete question with a question mark ('?'), and where all choices could reasonably follow the choices. For example, '____ is the capital of France' -> 'What is the capital of France?'
</rubric>

---

Return ONLY valid JSON:
{
  "patches": [...]
}`
}

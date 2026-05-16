LETTERS = "ABCDEFGHIJKLMNOP"


def format_mcq(question: str, choices: list[str], answer: str) -> str:
    choices_text = "\n".join(f"{LETTERS[i]}) {c}" for i, c in enumerate(choices))
    return f"{question}\n\n{choices_text}\n\nAnswer: {answer}"


BUILTIN_RUBRIC = """<rubric>
Severity levels reflect IWF cognitive-function research:
  HIGH [confusion-inducing] — increase response time and difficulty
  MEDIUM [structural] — alter task format with uncertain effect
  LOW [cue-giving] — hurt validity but not comprehension

- avoid_negatives [HIGH — confusion-inducing]: Avoid the use of negatives in the core part of the stem that poses the question.
- no_extraneous_info [HIGH — confusion-inducing]: Avoid gratuitous or unnecessary information in the stem or options.
- ordered_options [HIGH — confusion-inducing]: If the options are numbers, arrange them in chronological or ascending numerical order.
- no_vague_terms [HIGH — confusion-inducing]: Avoid vague terms in the options that make the option's meaning confusing.
- single_best_answer [MEDIUM — structural]: MCQs should have one, and only one, best answer.
- plausible_distractors [MEDIUM — structural]: Make all distractors plausible to maintain item quality.
- avoid_k_type [MEDIUM — structural]: Avoid complex or K-type MCQs with multiple combinations of responses.
- no_all_of_the_above [MEDIUM — structural]: Avoid 'all of the above' as an option.
- no_none_of_the_above [MEDIUM — structural]: Avoid 'none of the above' as an option.
- no_fill_in_blank [MEDIUM — structural]: Avoid fill-in-the-blank formats where the blank is not at the end of the question stem.
- no_absolute_terms [MEDIUM — structural]: Avoid using absolute terms in the options that turn the option's meaning into a universal truth.
- grammatical_consistency [LOW — cue-giving]: All options should be grammatically consistent with the stem and should be parallel in style and form.
- focused_stem [LOW — cue-giving]: Each MCQ should have a clear and focused question; avoid unfocused stems.
- problem_in_stem [LOW — cue-giving]: Each MCQ should have the problem in the stem, not in the options.
- clear_language [LOW — cue-giving]: Questions and options should be written in clear, unambiguous language.
- avoid_repetition [LOW — cue-giving]: Avoid repeating words in the stem and the correct option.
- no_logical_cues [LOW — cue-giving]: Avoid logical cues in the stem and correct option that reveal the answer.
- no_convergence_cues [LOW — cue-giving]: Avoid convergence cues in options where correct components appear most frequently.
- equal_length_options [LOW — cue-giving]: There should not be outlier options that are much longer or shorter than the others.
</rubric>"""


def build_patch_prompt(question: str, choices: list[str], answer: str, custom_rules=None) -> str:
    mcq_text = format_mcq(question, choices, answer)

    if custom_rules:
        rules_text = "\n".join(f"- {r['name']}: {r['description']}" for r in custom_rules)
        rubric_block = f"""<rubric>
Note: The following rubric was provided by the user and replaces the standard IWF rubric. Apply it strictly.

{rules_text}
</rubric>"""
    else:
        rubric_block = BUILTIN_RUBRIC

    return f"""<task>
You will be given a multiple-choice question that was written by a user. Your goal is to detect flaws in the question using the rubric and propose improvements as targeted patches.
</task>

<patch instructions>

# Core behavior

- Generate targeted patches instead of rewriting the entire question.
- Each patch must include:
  - 'original_text'
  - 'replaced_text'
  - 'explanation'
  - 'rubric_tag': the exact rubric key violated (e.g. 'plausible_distractors', 'avoid_negatives')

- Evaluate all rubric violations based only on the original MCQ.
- Do not assume the MCQ is acceptable just because it is answerable; apply the rubric strictly.

- If no rubric violations are found, return:
  {{ "patches": [] }}

---

# CRITICAL: No-op prevention (highest priority)

- NEVER return a patch where 'original_text' and 'replaced_text' are identical.
- If applying a rubric fix would result in no change to the text, DO NOT generate a patch.
- Instead, return a single rewrite-required patch.

---

# Rewrite rule (global issues)

- If the MCQ contains multiple interacting issues OR a violation that cannot be meaningfully fixed with a localized patch, return a single patch:

  {{
    "original_text": "<relevant portion>",
    "replaced_text": "This question requires a full rewrite.",
    "explanation": "..."
  }}

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

{rubric_block}

---

This is the input MCQ:
<multiple-choice question>
{mcq_text}
</multiple-choice question>

Return ONLY valid JSON:
{{
  "patches": [...]
}}"""


def build_fix_flaws_prompt(mcq_text: str, feedback: str) -> str:
    return f"""You are an expert at rewriting multiple-choice questions to correct flaws in the item.

Given a multiple-choice question and issues with the item, your goal is to rewrite the multiple-choice question to correct the issues.

Here is the multiple-choice question, choices, and correct answer:
<multiple-choice question>
{mcq_text}
</multiple-choice question>

Here are the flaws in the multiple-choice question, which are issues in the grammar, structure, or style of the item. The item should be rewritten so that these issues are corrected:
<flaws>
{feedback}
</flaws>

<rewriting guidelines>
- The rewritten multiple-choice question should have a clear question stem, an unambiguous correct answer, and plausible but ultimately incorrect distractor choices.
- Generate each choice directly, do not precede them with a letter, number, or symbol.
- Only change what is needed to correct the flaws in the multiple-choice question. For example, if the question has a grammatical error in the question stem, only change the question stem, not the choices.
- In your explanation, state the flaws that the original question had and how you corrected them in the rewritten question.
</rewriting guidelines>

<output format>
Return your output as valid JSON:
{{
  "question": "rewritten question stem",
  "choices": ["rewritten choice 1", "rewritten choice 2", "rewritten choice 3", ...],
  "answer": "letter of the correct answer",
  "explanation": "explanation of your changes"
}}
Do not include anything else.
</output format>"""


def build_detect_level_prompt(mcq_text: str) -> str:
    return f"""You are an expert in Bloom's Taxonomy. Given this multiple-choice question, identify which level of Bloom's Taxonomy it targets.

Bloom's Taxonomy levels:
1. Remember
2. Understand
3. Apply
4. Analyze
5. Evaluate
6. Create

MCQ:
{mcq_text}

Return only valid JSON:
{{
  "level": <number 1-6>,
  "label": "<level name>",
  "reason": "<one sentence explanation>"
}}"""


def build_blooms_prompt(mcq_text: str, difficulty_label: str, current_label: str) -> str:
    return f"""You are an expert at adjusting the difficulty of multiple-choice questions.

Given this MCQ which currently targets the {current_label} level of Bloom's Taxonomy, rewrite it to be {difficulty_label}.

If making it easier: use simpler vocabulary, more straightforward reasoning, and more obvious distractors.
If making it harder: require deeper reasoning, more nuanced distinctions between answer choices, and higher-order thinking skills.

MCQ:
{mcq_text}

Return only valid JSON:
{{
  "question": "rewritten question stem",
  "choices": ["choice 1", "choice 2", "..."],
  "answer": "letter of correct answer",
  "explanation": "explanation of changes made"
}}

<output format>
Return your output as valid JSON:
{{
  "question": "rewritten question stem",
  "choices": ["rewritten choice 1", "rewritten choice 2", "rewritten choice 3", ...],
  "answer": "letter of the correct answer",
  "explanation": "explanation of your changes"
}}
Do not include anything else.
</output format>"""


def build_custom_rewrite_prompt(mcq_text: str, request: str) -> str:
    return f"""You are an expert at rewriting multiple-choice questions.

Here is a multiple-choice question:
<multiple-choice question>
{mcq_text}
</multiple-choice question>

The user has requested the following change:
<request>
{request}
</request>

Rewrite the question to fulfill the request while:
- Keeping it a valid multiple-choice question
- Maintaining one unambiguous correct answer
- Keeping plausible distractors
- Preserving the original format and structure unless the request specifically asks to change it

<output format>
Return only valid JSON:
{{
  "question": "rewritten question",
  "choices": ["choice 1", "choice 2", "..."],
  "answer": "letter of correct answer",
  "explanation": "what you changed and why"
}}
Do not include anything else.
</output format>"""


def build_add_distractors_prompt(mcq_text: str, num_distractors: int) -> str:
    return f"""You are an expert at rewriting multiple-choice questions to add distractors to the question.

Given a multiple-choice question, your goal is to rewrite the multiple-choice question to add {num_distractors} new distractor(s) to the question, targeting common misconceptions and making the question more difficult to answer.

Here is the multiple-choice question, choices, and correct answer:
<multiple-choice question>
{mcq_text}
</multiple-choice question>

<rewriting guidelines>
- The rewritten multiple-choice question should have a clear question stem, an unambiguous correct answer, and plausible but ultimately incorrect distractor choices.
- Generate each choice directly, do not precede them with a letter, number, or symbol.
- Return the original distractors plus exactly {num_distractors} new distractor(s).
- The question stem and correct answer should be the same as the original question.
- The initial distractors in the original question should be kept in the rewritten question.
- The new distractors should be common misconceptions or mistakes that a test-taker would make when answering the question.
- All of the new distractors should be distinct from the original distractors, or else test-takers would be able to rule them out by process of elimination.
- In your explanation, state how the new distractors target common misconceptions and make the question more difficult to answer.
</rewriting guidelines>

<output format>
Return your output as valid JSON:
{{
  "question": "rewritten question stem",
  "choices": ["rewritten choice 1", "rewritten choice 2", "rewritten choice 3", ...],
  "answer": "letter of the correct answer",
  "explanation": "explanation of your changes"
}}
Do not include anything else.
</output format>"""

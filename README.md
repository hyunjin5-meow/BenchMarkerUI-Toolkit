# BenchMarker UI

A full-stack web application for analyzing and improving multiple-choice questions (MCQs) in AI benchmarks. Built as part of an undergraduate research project at the [CLIP Lab](https://clip.cs.umd.edu/), University of Maryland, under the supervision of [Jordan Boyd-Graber](http://users.umiacs.umd.edu/~jbg/) and mentorship of [Nishant Balepur](https://nbalepur.github.io/).

This tool is part of ongoing research into LLM benchmark evaluation methodology, with an associated paper accepted to **ACL 2026**.

---

## Overview

BenchMarker UI helps researchers and educators identify and fix writing flaws in MCQ benchmarks. Given a dataset of multiple-choice questions, the tool:

1. **Analyzes** each MCQ against a 19-rule Item Writing Flaw (IWF) rubric
2. **Suggests targeted patches** for detected flaws (original text → replacement text)
3. **Rewrites** questions that need more substantial revision
4. **Adjusts difficulty** via Bloom's Taxonomy levels
5. **Adds distractors** to increase question difficulty
6. **Logs all actions** for research analysis (before/after diffs per MCQ)
7. **Exports results** as XLSX or JSON

The interface is inspired by Google Docs suggestion mode: MCQ cards on the left, suggested fixes on the right.

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React + Vite + Tailwind CSS |
| Backend | FastAPI (Python) + Uvicorn |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth (email + password) |
| AI | OpenAI API (`gpt-4.1-2025-04-14`) |

---

## Features

### MCQ Analysis
- Upload datasets as **CSV, JSON, or JSONL** with flexible column detection
- 3-MCQ preview before full dataset load
- Per-MCQ analysis against a **19-rule IWF rubric** covering:
  - Cue-giving flaws (e.g., `longest_option_correct`, `specific_determiners`)
  - Structural flaws (e.g., `plausible_distractors`, `single_best_answer`, `avoid_negatives`)
  - Confusion-inducing flaws (e.g., `overlapping_options`, `none_of_the_above`)

### Severity Taxonomy
Flaws are classified into three severity tiers, grounded in cognitive science research on MCQ response time and comprehension:

- **High** — flaws that significantly impair reading or introduce strong response bias
- **Medium** — flaws with moderate impact on validity or fairness
- **Low** — minor style violations unlikely to affect performance

### Patch & Rewrite Flows
- **Apply Fix** — accept a targeted patch (original_text → replaced_text) for a single flaw
- **Apply All** — apply all suggested patches for an MCQ at once
- **Rewrite** — full question rewrite when patches aren't sufficient
- **Custom Rewrite** — user-provided freeform instruction for rewriting
- **Undo / Redo** — full edit history per MCQ

### Difficulty Adjustment
- **Bloom's Taxonomy** — shift difficulty up or down one or more levels (Remember → Understand → Apply → Analyze → Evaluate → Create)
- **Add Distractors** — generate +1, +2, or +3 additional answer choices

### Manual Editing
- Inline editing of question, choices, and answer
- Re-analysis after saving manual edits
- Status badges per card: `Unanalyzed` / `Has Flaws` / `Clean`

### User & Session Management
- Supabase Auth (email + password login/signup)
- Per-user session storage: each upload creates a session row
- MCQ state persisted per session (patches, applied fixes, rewrites, status)
- Full action log in `mcq_actions` table (action type, before/after question+choices+answer, rubric tag, session ID)

### Export
- **XLSX** export — one row per MCQ with original and patched versions
- **JSON** export — structured output for downstream research pipelines

---

## Database Schema (Supabase)

### `sessions`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | References `auth.users` |
| filename | text | Uploaded dataset filename |
| mcq_count | int | Number of MCQs in session |
| created_at | timestamp | |

### `mcqs`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| session_id | uuid | Foreign key → sessions |
| index | int | Position in dataset |
| question | text | Question stem |
| choices | jsonb | Answer choices |
| answer | text | Correct answer |
| patches | jsonb | Raw patch suggestions from API |
| fixed_patches | jsonb | Which patches have been applied |
| rewrite | text | Rewritten question (if any) |
| status | text | `unanalyzed` / `has_flaws` / `clean` |

### `mcq_actions`
| Column | Type | Description |
|--------|------|-------------|
| id | uuid | Primary key |
| user_id | uuid | References `auth.users` |
| session_id | uuid | Foreign key → sessions |
| mcq_index | int | Which MCQ was acted on |
| action_type | text | `apply_fix`, `accept_rewrite`, `accept_blooms`, `accept_distractors`, `accept_custom_rewrite`, `manual_edit` |
| patch_rubric_tag | text | IWF rule that triggered this action |
| patch_category | text | Severity category |
| original_question | text | Question before action |
| original_choices | jsonb | Choices before action |
| original_answer | text | Answer before action |
| result_question | text | Question after action |
| result_choices | jsonb | Choices after action |
| result_answer | text | Answer after action |
| created_at | timestamp | |

---

## API Endpoints (FastAPI Backend)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/patch` | Analyze an MCQ against the IWF rubric; returns list of patches |
| POST | `/api/rewrite` | Rewrite an MCQ (fix_flaws mode) |
| POST | `/api/blooms` | Adjust Bloom's Taxonomy difficulty level |
| POST | `/api/add-distractors` | Generate additional distractor options |
| POST | `/api/custom-rewrite` | Rewrite an MCQ using a freeform user prompt |

All endpoints call OpenAI `gpt-4.1-2025-04-14` and return structured JSON.

---

## IWF Rubric (19 Rules)

The patch analysis prompt checks each MCQ against these Item Writing Flaw categories:

**Cue-giving**
- `longest_option_correct` — correct answer is consistently the longest option
- `specific_determiners` — options contain absolute qualifiers (always, never)
- `convergence_strategy` — overlapping content across options signals correct answer
- `grammatical_cue` — grammar of stem only fits one option
- `alphabetical_order` — options not in logical/alpha order
- `absurd_options` — obviously wrong distractors that give away the answer

**Structural**
- `plausible_distractors` — distractors are not believable alternatives
- `single_best_answer` — more than one option is arguably correct
- `avoid_negatives` — negatively worded stem or options
- `none_of_the_above` — use of "none/all of the above" options
- `heterogeneous_options` — options differ too widely in format or type
- `unclear_stem` — stem is ambiguous or does not ask a clear question
- `incomplete_stem` — stem requires reading options to be understood

**Confusion-inducing**
- `overlapping_options` — options are not mutually exclusive
- `unfocused_stem` — stem covers multiple concepts
- `excessive_length` — unnecessarily verbose question or options
- `technical_jargon` — unexplained domain-specific terminology
- `double_negatives` — double negation in stem or choices
- `ordered_options` — numerical/date options not in ascending/descending order

---

## Research Context

This tool was used to run an evaluation study on **MMLU Medical Genetics** questions, finding:
- **Structural flaws** (especially `plausible_distractors`) showed the largest reduction after patching
- MCQs with patched `plausible_distractors` also showed the **largest LLM accuracy drop**, suggesting those distractors were previously too easy
- Patch acceptance rates and action logs are being used to analyze human-in-the-loop editing behavior

---

## Setup

### Prerequisites
- Node.js 18+
- Python 3.10+
- Supabase project (for auth and database)
- OpenAI API key

### Frontend

```bash
npm install
npm run dev
```

### Backend

```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Environment Variables

Create a `.env` file in the `backend/` directory:

```
OPENAI_API_KEY=your_openai_key
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key
```

Create a `.env` file in the project root:

```
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_BASE_URL=http://localhost:8000
```

---

## Project Structure

```
benchmarkerui/
├── src/
│   ├── components/       # MCQ cards, patch suggestions, modals, login
│   ├── lib/              # Supabase client, API calls, parsers, rubric
│   ├── data/             # Static MCQ data
│   └── main.jsx
├── index.html
├── vite.config.js
├── backend/
│   ├── main.py           # FastAPI app + all endpoints
│   ├── prompts.py        # IWF patch, rewrite, Bloom's prompts
│   └── requirements.txt
└── README.md
```

---

## Acknowledgments

- **Jordan Boyd-Graber** — PI, CLIP Lab, University of Maryland
- **Nishant Balepur** — graduate mentor
- **Steven Moore** — collaborator; suggested severity taxonomy research papers
- Severity taxonomy informed by cognitive science research on MCQ response time and comprehension load

---

## License

For research use. Contact the CLIP Lab for licensing inquiries.

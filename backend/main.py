import asyncio
import hashlib
import json
import os
import random
import re
from typing import Any, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from openai import AsyncOpenAI, OpenAI
from pydantic import BaseModel
from supabase import create_client

from prompts import (
    LETTERS,
    build_add_distractors_prompt,
    build_blooms_prompt,
    build_custom_rewrite_prompt,
    build_detect_level_prompt,
    build_fix_flaws_prompt,
    build_patch_prompt,
    format_mcq,
)

load_dotenv()

_key = os.getenv("OPENAI_API_KEY")
print(f"[startup] OPENAI_API_KEY loaded: {'YES (' + _key[:8] + '...)' if _key else 'NO - MISSING'}", flush=True)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:1026", "http://localhost:5173", "http://localhost:5174", "http://localhost:5175", "http://localhost:5176", "http://localhost:5177"],
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type"],
)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"), base_url="https://us.api.openai.com/v1")
async_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"), base_url="https://us.api.openai.com/v1")
MODEL = "gpt-4.1-2025-04-14"
TEST_MODELS = [
    "gpt-4.1-mini-2025-04-14",
    "gpt-4o-mini",
    "gpt-5.4-nano-2026-03-17",
]

_sb_url = os.getenv("SUPABASE_URL")
_sb_key = os.getenv("SUPABASE_KEY")
supabase = create_client(_sb_url, _sb_key) if _sb_url and _sb_key else None


# ---------- helpers ----------

def get_supabase():
    if supabase is None:
        raise HTTPException(status_code=503, detail="Supabase is not configured.")
    return supabase


def strip_fences(text: str) -> str:
    text = re.sub(r"^```json\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^```\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"\s*```$", "", text, flags=re.MULTILINE)
    return text.strip()


def call_openai(prompt: str) -> dict:
    try:
        response = client.chat.completions.create(
            model=MODEL,
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.choices[0].message.content
        return json.loads(strip_fences(raw))
    except json.JSONDecodeError as e:
        raise HTTPException(status_code=502, detail=f"Model returned invalid JSON: {e}")
    except Exception as e:
        print(f"[openai error] {type(e).__name__}: {e}", flush=True)
        raise HTTPException(status_code=502, detail=str(e))


def _resolve_answer_index(answer, choices) -> Optional[int]:
    """Map a model answer (letter / 0-index / choice text) to a choice index."""
    s = str(answer).strip()
    up = s.upper()
    if len(up) == 1 and up.isalpha():
        idx = LETTERS.find(up)
        if 0 <= idx < len(choices):
            return idx
    if s.isdigit():
        idx = int(s)
        if 0 <= idx < len(choices):
            return idx
    for i, c in enumerate(choices):
        if str(c).strip().lower() == s.lower():
            return i
    return None


def normalize_rewrite(original_choices: list[str], result: dict) -> dict:
    """Make a fix-flaws rewrite comparable to the source item.

    The rewrite model tends to (a) collapse long option lists down to ~4 and
    (b) float the correct answer to position A. Both silently break the
    original/fixed/fixed_rewrite comparison: fewer distractors makes the item
    easier, and a front-loaded gold turns accuracy into position bias.

    So we hard-fail on a changed choice count (never silently drop options) and
    deterministically shuffle the options so the gold letter is uniformly
    distributed. The shuffle is seeded by the rewritten question text, so a
    given item always produces the same layout across re-runs (reproducible).
    """
    choices = result.get("choices")
    if not isinstance(choices, list) or not choices:
        raise HTTPException(status_code=502, detail="Rewrite returned no choices list.")

    if len(choices) != len(original_choices):
        raise HTTPException(
            status_code=422,
            detail=(
                f"Rewrite changed the choice count "
                f"({len(original_choices)} -> {len(choices)}). A fix-flaws rewrite "
                "must preserve the number of options so it stays comparable to the "
                "original item."
            ),
        )

    idx = _resolve_answer_index(result.get("answer"), choices)
    if idx is None:
        raise HTTPException(
            status_code=502,
            detail=f"Rewrite answer {result.get('answer')!r} does not identify a choice.",
        )

    order = list(range(len(choices)))
    seed = int(hashlib.sha256(str(result.get("question", "")).encode()).hexdigest(), 16)
    random.Random(seed).shuffle(order)

    result["choices"] = [choices[i] for i in order]
    result["answer"] = LETTERS[order.index(idx)]
    return result


# ---------- request models ----------

class MCQBody(BaseModel):
    question: str
    choices: list[str]
    answer: str

class PatchBody(MCQBody):
    pass

class RewriteBody(MCQBody):
    feedback: str

class CustomRewriteBody(MCQBody):
    request: str

class BloomsBody(MCQBody):
    num_levels: int
    difficulty_label: str
    current_label: str

class DetectLevelBody(MCQBody):
    pass

class AddDistractorsBody(MCQBody):
    num_distractors: int

class TestModelsBody(MCQBody):
    pass

class SessionCreateBody(BaseModel):
    filename: str
    mcq_count: int
    user_id: str

class MCQRow(BaseModel):
    index: int
    question: str
    choices: list[str]
    answer: str
    patches: Optional[list[Any]] = None
    fixed_patches: int = 0
    rewrite: Optional[Any] = None
    status: str = "idle"

class SessionSaveBody(BaseModel):
    session_id: str
    mcqs: list[MCQRow]

class LogActionBody(BaseModel):
    user_id: str
    session_id: str
    mcq_index: int
    action_type: str
    original_question: Optional[str] = None
    original_choices: Optional[list] = None
    original_answer: Optional[str] = None
    result_question: Optional[str] = None
    result_choices: Optional[list] = None
    result_answer: Optional[str] = None
    patch_rubric_tag: Optional[str] = None
    patch_category: Optional[str] = None


# ---------- AI endpoints ----------

@app.post("/api/patch")
def patch(body: PatchBody):
    result = call_openai(build_patch_prompt(body.question, body.choices, body.answer))
    return {"patches": result.get("patches", [])}


@app.post("/api/rewrite")
def rewrite(body: RewriteBody):
    mcq_text = format_mcq(body.question, body.choices, body.answer)
    result = call_openai(build_fix_flaws_prompt(mcq_text, body.feedback))
    return normalize_rewrite(body.choices, result)


@app.post("/api/custom-rewrite")
def custom_rewrite(body: CustomRewriteBody):
    mcq_text = format_mcq(body.question, body.choices, body.answer)
    return call_openai(build_custom_rewrite_prompt(mcq_text, body.request))


@app.post("/api/detect-level")
def detect_level(body: DetectLevelBody):
    mcq_text = format_mcq(body.question, body.choices, body.answer)
    return call_openai(build_detect_level_prompt(mcq_text))


@app.post("/api/blooms")
def blooms(body: BloomsBody):
    mcq_text = format_mcq(body.question, body.choices, body.answer)
    return call_openai(build_blooms_prompt(mcq_text, body.difficulty_label, body.current_label))


@app.post("/api/add-distractors")
def add_distractors(body: AddDistractorsBody):
    mcq_text = format_mcq(body.question, body.choices, body.answer)
    return call_openai(build_add_distractors_prompt(mcq_text, body.num_distractors))


@app.post("/api/test-models")
async def test_models(body: TestModelsBody):
    letters = "ABCDEFGHIJKLMNOP"
    choice_lines = "\n".join(f"{letters[i]}) {c}" for i, c in enumerate(body.choices))
    prompt = (
        "Answer this multiple choice question with only the answer "
        "letter (A, B, C, or D). Do not explain.\n\n"
        f"Question: {body.question}\n"
        f"{choice_lines}"
    )

    async def call_model(model: str) -> dict:
        try:
            response = await async_client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = (response.choices[0].message.content or "").strip()
            answer_letter = raw[0].upper() if raw else "?"
            correct = answer_letter == body.answer.upper()
            return {"model": model, "answer": answer_letter, "correct": correct}
        except Exception:
            return {"model": model, "answer": "?", "correct": False}

    results = await asyncio.gather(*[call_model(m) for m in TEST_MODELS])
    score = sum(1 for r in results if r["correct"])
    return {"results": list(results), "score": score, "total": len(results)}


# ---------- session endpoints ----------

@app.post("/api/session/create")
def session_create(body: SessionCreateBody):
    sb = get_supabase()
    try:
        result = sb.table("sessions").insert({
            "user_id": body.user_id,
            "filename": body.filename,
            "mcq_count": body.mcq_count,
        }).execute()
        session_id = result.data[0]["id"]
        return {"session_id": session_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/session/save")
def session_save(body: SessionSaveBody):
    sb = get_supabase()
    try:
        rows = [
            {
                "session_id": body.session_id,
                "index": mcq.index,
                "question": mcq.question,
                "choices": mcq.choices,
                "answer": mcq.answer,
                "patches": mcq.patches,
                "fixed_patches": mcq.fixed_patches,
                "rewrite": mcq.rewrite,
                "status": mcq.status,
            }
            for mcq in body.mcqs
        ]
        sb.table("mcqs").upsert(rows, on_conflict="session_id,index").execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/session/{session_id}")
def session_get(session_id: str):
    sb = get_supabase()
    try:
        result = sb.table("mcqs").select("*").eq("session_id", session_id).order("index").execute()
        return {"mcqs": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/sessions")
def sessions_list(user_id: str = Query(...)):
    sb = get_supabase()
    try:
        result = (
            sb.table("sessions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return {"sessions": result.data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------- action logging ----------

@app.post("/api/log-action")
def log_action(body: LogActionBody):
    sb = get_supabase()
    try:
        sb.table("mcq_actions").insert({
            "user_id": body.user_id,
            "session_id": body.session_id,
            "mcq_index": body.mcq_index,
            "action_type": body.action_type,
            "original_question": body.original_question,
            "original_choices": body.original_choices,
            "original_answer": body.original_answer,
            "result_question": body.result_question,
            "result_choices": body.result_choices,
            "result_answer": body.result_answer,
            "patch_rubric_tag": body.patch_rubric_tag,
            "patch_category": body.patch_category,
        }).execute()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ---------- serve frontend ----------

_dist = os.path.join(os.path.dirname(__file__), '..', 'dist')
if os.path.isdir(_dist):
    app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        candidate = os.path.join(_dist, full_path)
        if os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_dist, "index.html"))

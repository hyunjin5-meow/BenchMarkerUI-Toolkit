const BASE = '/api'

// Set by App.jsx whenever the auth session changes
let currentUserId = null
export function setCurrentUser(userId) { currentUserId = userId }

async function call(endpoint, body) {
  const res = await fetch(`${BASE}/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${endpoint} error: ${text}`)
  }
  return res.json()
}

async function get(endpoint, params = {}) {
  const url = new URL(`${BASE}/${endpoint}`)
  Object.entries(params).forEach(([k, v]) => { if (v != null) url.searchParams.append(k, v) })
  const res = await fetch(url.toString())
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${endpoint} error: ${text}`)
  }
  return res.json()
}

// ── AI endpoints ──────────────────────────────────────────────────────────────

export async function fetchPatches(mcq) {
  const result = await call('patch', { question: mcq.question, choices: mcq.choices, answer: mcq.answer })
  return (result.patches ?? []).map((patch, i) => ({
    id: `${mcq.id}-patch-${i}`,
    fixed: false,
    ...patch,
  }))
}

export async function fetchRewrite(mcq, feedback) {
  return call('rewrite', {
    question: mcq.question,
    choices: mcq.choices,
    answer: mcq.answer,
    feedback,
  })
}

export async function fetchCustomRewrite(mcq, request) {
  return call('custom-rewrite', {
    question: mcq.question,
    choices: mcq.choices,
    answer: mcq.answer,
    request,
  })
}

export async function fetchDetectLevel(mcq) {
  return call('detect-level', {
    question: mcq.question,
    choices: mcq.choices,
    answer: mcq.answer,
  })
}

export async function fetchBlooms(mcq, numLevels, difficultyLabel, currentLabel) {
  return call('blooms', {
    question: mcq.question,
    choices: mcq.choices,
    answer: mcq.answer,
    num_levels: numLevels,
    difficulty_label: difficultyLabel,
    current_label: currentLabel,
  })
}

export async function fetchDistractors(mcq, numDistractors) {
  return call('add-distractors', {
    question: mcq.question,
    choices: mcq.choices,
    answer: mcq.answer,
    num_distractors: numDistractors,
  })
}

export async function fetchTestModels(mcq) {
  return call('test-models', {
    question: mcq.question,
    choices: mcq.choices,
    answer: mcq.answer,
  })
}

// ── Session API ───────────────────────────────────────────────────────────────

export async function createSession(filename, mcqCount) {
  return call('session/create', { filename, mcq_count: mcqCount, user_id: currentUserId })
}

export async function saveSession(sessionId, mcqs) {
  const serialized = mcqs.map((mcq, index) => ({
    index,
    question: mcq.question,
    choices: mcq.choices,
    answer: mcq.answer,
    patches: mcq.patches,
    fixed_patches: (mcq.patches ?? []).filter((p) => p.fixed).length,
    rewrite: mcq.rewrite,
    status: mcq.status,
  }))
  return call('session/save', { session_id: sessionId, mcqs: serialized })
}

export async function fetchSessions() {
  return get('sessions', { user_id: currentUserId })
}

export async function fetchSession(sessionId) {
  return get(`session/${sessionId}`)
}

// ── Action logging ────────────────────────────────────────────────────────────

export async function logAction(data) {
  return call('log-action', data)
}

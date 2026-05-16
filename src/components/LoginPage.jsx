import { useState } from 'react'
import { supabase } from '../lib/supabase.js'

export default function LoginPage() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [success, setSuccess] = useState(null)

  function switchMode(next) {
    setMode(next)
    setError(null)
    setSuccess(null)
  }

  async function handleSubmit() {
    setLoading(true)
    setError(null)
    setSuccess(null)
    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError(error.message)
      else setSuccess('Check your email to confirm your account.')
    }
    setLoading(false)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <div className="flex h-screen items-center justify-center bg-gray-50 font-sans">
      <div className="w-full max-w-sm rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        {/* Header */}
        <div className="mb-6 text-center">
          <h1 className="text-xl font-semibold text-gray-900">MCQ Benchmarker</h1>
          <p className="mt-1 text-sm text-gray-500">
            Analyze and improve your multiple-choice questions
          </p>
        </div>

        {/* Mode tabs */}
        <div className="mb-5 flex rounded-lg border border-gray-200 p-0.5">
          <button
            onClick={() => switchMode('login')}
            className={[
              'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
              mode === 'login' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            Log in
          </button>
          <button
            onClick={() => switchMode('signup')}
            className={[
              'flex-1 rounded-md py-1.5 text-sm font-medium transition-colors',
              mode === 'signup' ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-500 hover:text-gray-700',
            ].join(' ')}
          >
            Sign up
          </button>
        </div>

        {/* Inputs */}
        <div className="space-y-3">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete="email"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
          />
        </div>

        {/* Error / success */}
        {error && <p className="mt-3 text-center text-xs text-red-600">{error}</p>}
        {success && <p className="mt-3 text-center text-xs text-green-600">{success}</p>}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || !email || !password}
          className="mt-4 w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {loading ? 'Loading…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>

        {/* Switch hint */}
        <p className="mt-4 text-center text-xs text-gray-400">
          {mode === 'login' ? (
            <>No account?{' '}
              <button onClick={() => switchMode('signup')} className="text-blue-600 hover:underline">
                Sign up
              </button>
            </>
          ) : (
            <>Already have an account?{' '}
              <button onClick={() => switchMode('login')} className="text-blue-600 hover:underline">
                Log in
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  )
}

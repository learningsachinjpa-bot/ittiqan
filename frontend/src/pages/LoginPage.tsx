import { useState } from 'react'

import { Link, useNavigate } from 'react-router-dom'

import { useGoogleLogin } from '@react-oauth/google'

import { useAuth } from '../context/AuthContext'



export default function LoginPage() {

  const [email, setEmail] = useState('')

  const [password, setPassword] = useState('')

  const [error, setError] = useState('')

  const [loading, setLoading] = useState(false)

  const [googleLoading, setGoogleLoading] = useState(false)

  const { login, loginWithGoogle } = useAuth()

  const navigate = useNavigate()



  // Real Google OAuth — fetches user profile after token received

  const handleGoogleLogin = useGoogleLogin({

    onSuccess: async (tokenResponse) => {

      setGoogleLoading(true)

      setError('')

      try {

        await loginWithGoogle(tokenResponse.access_token)

        navigate('/dashboard')

      } catch (err: any) {

        setError(err.message || 'Google login failed. Please try again.')

      } finally {

        setGoogleLoading(false)

      }

    },

    onError: () => {

      setError('Google login was cancelled or failed.')

      setGoogleLoading(false)

    },

  })



  const handleSubmit = async (e: React.FormEvent) => {

    e.preventDefault()

    if (!email || !password) { setError('Please fill all fields'); return }

    setLoading(true)

    setError('')

    try {

      await login(email, password)

      navigate('/dashboard')

    } catch {

      setError('Invalid credentials')

    } finally {

      setLoading(false)

    }

  }



  return (

    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4">

      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl flex overflow-hidden">

        {/* Left — form */}

        <div className="flex-1 p-10">

          <div className="flex items-center gap-2 mb-8">

            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center">

              <span className="text-white font-bold">I</span>

            </div>

            <span className="font-bold text-gray-900 text-lg">Ittiqan</span>

          </div>



          <h1 className="text-2xl font-bold text-gray-900 mb-1">Welcome Back!</h1>

          <p className="text-gray-500 text-sm mb-6">Please enter your details</p>



          {error && (

            <div className="bg-red-50 border border-red-200 text-red-600 text-sm p-3 rounded-lg mb-4">

              {error}

            </div>

          )}



          {/* Google Button */}

          <button

            onClick={() => { setError(''); handleGoogleLogin() }}

            disabled={googleLoading}

            className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg py-2.5 text-sm text-gray-700 hover:bg-gray-50 mb-4 disabled:opacity-60 transition-colors"

          >

            {googleLoading ? (

              <span className="w-5 h-5 border-2 border-gray-400 border-t-indigo-600 rounded-full animate-spin" />

            ) : (

              <svg className="w-5 h-5" viewBox="0 0 24 24">

                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>

                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>

                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>

                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>

              </svg>

            )}

            {googleLoading ? 'Signing in with Google...' : 'Continue with Google'}

          </button>



          <div className="flex items-center gap-3 my-4">

            <div className="flex-1 h-px bg-gray-200" />

            <span className="text-xs text-gray-400">or</span>

            <div className="flex-1 h-px bg-gray-200" />

          </div>



          <form onSubmit={handleSubmit} className="space-y-4">

            <div>

              <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">Email</label>

              <input

                id="login-email"
                type="email" value={email} onChange={e => setEmail(e.target.value)}

                placeholder="Email"

                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"

              />

            </div>

            <div>

              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>

              <input

                id="login-password"
                type="password" value={password} onChange={e => setPassword(e.target.value)}

                placeholder="Password"

                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"

              />

            </div>

            <div className="flex items-center justify-between">

              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                <input type="checkbox" className="rounded accent-cyan-500" />
                <span>Remember me</span>
              </label>

              <a href="#" className="text-sm text-indigo-600 hover:underline">Forgot password?</a>

            </div>

            <button

              type="submit" disabled={loading}

              className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-60 transition-colors"

            >

              {loading ? 'Logging in...' : 'Login →'}

            </button>

          </form>



          <p className="text-center text-sm text-gray-500 mt-6">

            Don't have an account?{' '}

            <Link to="/signup" className="text-indigo-600 font-medium hover:underline">Sign Up</Link>

          </p>

          <p className="text-center text-xs text-gray-400 mt-4">Secure access to your AI evaluation platform</p>

        </div>



        {/* Right — preview panel */}

        <div className="hidden md:flex flex-1 bg-indigo-700 p-10 flex-col justify-center">

          <div className="bg-indigo-800 rounded-xl p-5 mb-6 text-white">

            <div className="text-xs text-indigo-300 mb-3 font-medium">Ittiqan Eval Runner</div>

            {[

              { label: 'Agent Evaluation', score: 87, passed: 14, failed: 2 },

              { label: 'Agent Security', score: 92, passed: 18, failed: 1 },

              { label: 'Observability & Monitoring', score: 78, passed: 11, failed: 3 },

            ].map((item) => (

              <div key={item.label} className="mb-4">

                <div className="flex justify-between items-center mb-1">

                  <span className="text-xs text-white font-medium">{item.label}</span>

                  <span className="text-xs text-green-400 font-bold">{item.score}%</span>

                </div>

                <div className="flex gap-3 text-xs text-indigo-300 mb-1">

                  <span className="text-green-400">✓ {item.passed} passed</span>

                  <span className="text-red-400">✗ {item.failed} failed</span>

                </div>

                <div className="h-1.5 bg-indigo-700 rounded">

                  <div className="h-1.5 bg-cyan-400 rounded" style={{ width: `${item.score}%` }} />

                </div>

              </div>

            ))}

          </div>

          <h2 className="text-white text-2xl font-bold mb-3">Evaluate. Secure. Observe.</h2>

          <p className="text-indigo-200 text-sm leading-relaxed">

            End-to-end AI agent testing — from automated evaluation and security scanning to real-time observability and monitoring.

          </p>

        </div>

      </div>

    </div>

  )

}




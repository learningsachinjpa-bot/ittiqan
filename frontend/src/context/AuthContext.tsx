import { createContext, useContext, useState, useEffect, type ReactNode } from 'react'
import { auth as authApi } from '../lib/api'

interface User {
  id: string
  name: string
  email: string
  picture?: string
  is_verified?: boolean
  org?: { id: string; name: string; slug: string; plan: string } | null
}

interface AuthContextType {
  user: User | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  loginWithGoogle: (googleAccessToken: string) => Promise<void>
  signup: (name: string, email: string, password: string) => Promise<void>
  logout: () => void
  setOrg: (org: User['org']) => void
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('ittiqan_access_token')
    if (token) {
      authApi.me()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('ittiqan_access_token')
          localStorage.removeItem('ittiqan_refresh_token')
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (email: string, password: string) => {
    const userData = await authApi.login(email, password)
    setUser(userData)
  }

  const loginWithGoogle = async (googleAccessToken: string) => {
    const userData = await authApi.googleAuth(googleAccessToken)
    setUser(userData)
  }

  const signup = async (name: string, email: string, password: string) => {
    const userData = await authApi.signup(name, email, password)
    setUser(userData)
  }

  const logout = () => {
    authApi.logout()
    setUser(null)
  }

  const setOrg = (org: User['org']) => {
    if (user) setUser({ ...user, org })
  }

  const refreshUser = async () => {
    const userData = await authApi.me()
    setUser(userData)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, signup, logout, setOrg, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

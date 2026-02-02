'use client'

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { getCurrentUser, getCurrentSession, onAuthStateChange } from '@/lib/supabase/auth'
import { assertSupabaseEnabled, SUPABASE_ENABLED } from '@/lib/supabase/enabled'
import { createClient as createSupabaseClient } from '@/lib/supabase/client'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!SUPABASE_ENABLED) {
      setLoading(false)
      return
    }

    // 获取初始认证状态
    const initializeAuth = async () => {
      try {
        const [currentUser, currentSession] = await Promise.all([
          getCurrentUser(),
          getCurrentSession()
        ])

        setUser(currentUser)
        setSession(currentSession)
      } catch (error) {
        console.error('初始化认证状态失败:', error)
      } finally {
        setLoading(false)
      }
    }

    initializeAuth()

    // 监听认证状态变化
    const { data: { subscription } } = onAuthStateChange(async (event, session) => {
      console.log('认证状态变化:', event, session)

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        const currentUser = await getCurrentUser()
        setUser(currentUser)
        setSession(session)
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setSession(null)
      }
    })

    return () => {
      subscription?.unsubscribe()
    }
  }, [])

  const handleSignIn = async (email: string, password: string) => {
    assertSupabaseEnabled()
    setLoading(true)
    try {
      const supabase = createSupabaseClient()
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        throw new Error(error.message || '登录失败')
      }

      setUser(data.user)
      setSession(data.session)

      if (process.env.NODE_ENV !== 'production') {
        const cookieNames = typeof document === 'undefined'
          ? []
          : document.cookie
              .split('; ')
              .map(item => item.split('=')[0])
              .filter(Boolean)
              .slice(0, 50)

        console.log('[Auth] 登录后 cookie 名称(截断):', cookieNames)
      }
    } catch (error) {
      console.error('登录失败:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const handleSignUp = async (email: string, password: string) => {
    assertSupabaseEnabled()
    setLoading(true)
    try {
      const supabase = createSupabaseClient()
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        throw new Error(error.message || '注册失败')
      }
    } catch (error) {
      console.error('注册失败:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const handleSignOut = async () => {
    assertSupabaseEnabled()
    setLoading(true)
    try {
      setUser(null)
      setSession(null)

      const supabase = createSupabaseClient()
      const { error } = await supabase.auth.signOut()
      if (error) {
        throw new Error(error.message || '登出失败')
      }
    } catch (error) {
      console.error('登出失败:', error)
      throw error
    } finally {
      setLoading(false)
    }
  }

  const refreshUser = async () => {
    if (!SUPABASE_ENABLED) {
      return
    }

    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
    } catch (error) {
      console.error('刷新用户信息失败:', error)
    }
  }

  const value: AuthContextType = {
    user,
    session,
    loading,
    signIn: handleSignIn,
    signUp: handleSignUp,
    signOut: handleSignOut,
    refreshUser,
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth 必须在 AuthProvider 内部使用')
  }
  return context
}

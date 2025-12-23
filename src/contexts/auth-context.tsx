'use client'

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react'
// TODO: 暂时注释 Supabase 功能
// import { User } from '@supabase/supabase-js'
// import { getCurrentUser, getCurrentSession, onAuthStateChange } from '@/lib/supabase/auth'

// 临时 User 类型定义
type User = {
  id: string
  email?: string
} | null

interface AuthContextType {
  user: User | null
  session: any
  loading: boolean
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // TODO: 暂时禁用 Supabase 认证初始化
    /*
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
    */
    // 暂时设置为未登录状态
    setLoading(false)
  }, [])

  const handleSignIn = async (email: string, password: string) => {
    // TODO: 暂时禁用登录功能
    console.log('登录功能已暂时禁用')
    throw new Error('Supabase 功能已暂时禁用，请稍后再试')
    /*
    setLoading(true)
    try {
      console.log('开始登录:', email)
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      console.log('登录响应状态:', response.status, response.statusText)

      let data
      try {
        data = await response.json()
        console.log('登录响应数据:', data)
      } catch (parseError) {
        console.error('解析响应失败:', parseError)
        throw new Error(`服务器返回了无效的响应 (状态码: ${response.status})`)
      }

      if (!response.ok) {
        throw new Error(data.error || `登录失败 (状态码: ${response.status})`)
      }

      // 登录成功后，认证状态会通过 onAuthStateChange 自动更新
      console.log('登录成功，刷新当前用户状态...')

      const [currentUser, currentSession] = await Promise.all([
        getCurrentUser(),
        getCurrentSession()
      ])

      setUser(currentUser)
      setSession(currentSession)
    } catch (error) {
      console.error('登录失败:', error)

      // fetch 在网络错误时会抛出 TypeError: Failed to fetch
      if (error instanceof TypeError || (error as any)?.name === 'TypeError') {
        throw new Error('网络错误：无法连接到服务器。请确认开发服务器已启动 (npm run dev)，或检查网络/代理设置。')
      }

      throw error
    } finally {
      setLoading(false)
    }
    */
  }

  const handleSignUp = async (email: string, password: string) => {
    // TODO: 暂时禁用注册功能
    console.log('注册功能已暂时禁用')
    throw new Error('Supabase 功能已暂时禁用，请稍后再试')
    /*
    setLoading(true)
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await response.json()

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('该邮箱已注册，请直接登录或尝试找回密码')
        }

        throw new Error(data?.error || '注册失败')
      }

      // 注册成功后，认证状态会通过 onAuthStateChange 自动更新
    } catch (error) {
      console.error('注册失败:', error)
      throw error
    } finally {
      setLoading(false)
    }
    */
  }

  const handleSignOut = async () => {
    // TODO: 暂时禁用登出功能
    console.log('登出功能已暂时禁用')
    throw new Error('Supabase 功能已暂时禁用，请稍后再试')
    /*
    setLoading(true)
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || '登出失败')
      }

      // 登出成功后，认证状态会通过 onAuthStateChange 自动更新
      setUser(null)
      setSession(null)
    } catch (error) {
      console.error('登出失败:', error)
      throw error
    } finally {
      setLoading(false)
    }
    */
  }

  const refreshUser = async () => {
    // TODO: 暂时禁用刷新用户功能
    console.log('刷新用户功能已暂时禁用')
    /*
    try {
      const currentUser = await getCurrentUser()
      setUser(currentUser)
    } catch (error) {
      console.error('刷新用户信息失败:', error)
    }
    */
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
import 'server-only'

import type { Session, User } from '@supabase/supabase-js'
import type { ServerCookieStore } from './server-cookies'
import { createClient } from './server'

type AuthResponse = {
  user: User | null
  session?: Session | null
}

export async function getCurrentUser(request?: Request, cookieStore?: ServerCookieStore): Promise<User | null> {
  const supabase = createClient(request, cookieStore)
  const { data, error } = await supabase.auth.getUser()
  if (error) {
    return null
  }
  return data.user
}

export async function getCurrentSession(request?: Request, cookieStore?: ServerCookieStore) {
  const supabase = createClient(request, cookieStore)
  const { data, error } = await supabase.auth.getSession()
  if (error) {
    return null
  }
  return data.session
}

export async function signUp(
  email: string,
  password: string,
  request?: Request,
  cookieStore?: ServerCookieStore
): Promise<AuthResponse> {
  const supabase = createClient(request, cookieStore)
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) {
    throw error
  }
  return { user: data.user, session: data.session }
}

export async function signIn(
  email: string,
  password: string,
  request?: Request,
  cookieStore?: ServerCookieStore
): Promise<AuthResponse> {
  const supabase = createClient(request, cookieStore)
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) {
    throw error
  }
  return { user: data.user, session: data.session }
}

export async function signOut(request?: Request, cookieStore?: ServerCookieStore) {
  const supabase = createClient(request, cookieStore)
  const { error } = await supabase.auth.signOut()
  if (error) {
    throw error
  }
}

export async function resetPassword(email: string, redirectTo?: string) {
  const supabase = createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, redirectTo ? { redirectTo } : undefined)
  if (error) {
    throw error
  }
}

export async function updatePassword(newPassword: string, request?: Request, cookieStore?: ServerCookieStore) {
  const supabase = createClient(request, cookieStore)
  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) {
    throw error
  }
}

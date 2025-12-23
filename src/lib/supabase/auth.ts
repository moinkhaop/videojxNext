// TODO: 暂时注释 Supabase 认证功能（客户端/通用）。

type User = {
  id: string
  email?: string
} | null

export async function getCurrentUser(): Promise<User> {
  return null
}

export async function getCurrentSession() {
  return null
}

export async function signUp(email: string, password: string) {
  void email
  void password
  throw new Error('Supabase 功能已暂时禁用，请稍后再试')
}

export async function signIn(email: string, password: string) {
  void email
  void password
  throw new Error('Supabase 功能已暂时禁用，请稍后再试')
}

export async function signOut() {
  throw new Error('Supabase 功能已暂时禁用，请稍后再试')
}

export async function resetPassword(email: string) {
  void email
  throw new Error('Supabase 功能已暂时禁用，请稍后再试')
}

export async function updatePassword(newPassword: string) {
  void newPassword
  throw new Error('Supabase 功能已暂时禁用，请稍后再试')
}

export function onAuthStateChange(callback: (event: string, session: any) => void) {
  void callback
  return { data: { subscription: { unsubscribe: () => {} } } }
}


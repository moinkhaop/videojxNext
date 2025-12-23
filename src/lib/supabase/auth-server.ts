import 'server-only'

// TODO: 暂时注释 Supabase 服务端认证功能（API/Server Components）。
// 保留导出以避免编译错误；当前不会实际调用 Supabase。

type User = {
  id: string
  email?: string
} | null

type AuthResponse = {
  user: User
  session?: any
}

export async function getCurrentUser(_request?: Request, _cookieStore?: unknown): Promise<User> {
  return null
}

export async function getCurrentSession(_request?: Request, _cookieStore?: unknown) {
  return null
}

export async function signUp(
  email: string,
  password: string,
  _request?: Request,
  _cookieStore?: unknown
): Promise<AuthResponse> {
  void email
  void password
  throw new Error('Supabase 功能已暂时禁用，请稍后再试')
}

export async function signIn(
  email: string,
  password: string,
  _request?: Request,
  _cookieStore?: unknown
): Promise<AuthResponse> {
  void email
  void password
  throw new Error('Supabase 功能已暂时禁用，请稍后再试')
}

export async function signOut(_request?: Request, _cookieStore?: unknown) {
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


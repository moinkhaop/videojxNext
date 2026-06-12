import { NextRequest } from 'next/server'
import {
  ensureSupabaseEnabled,
  extensionJson,
  extensionOptionsResponse,
  requireExtensionAuth,
} from '../../_shared'

export const runtime = 'nodejs'

export async function OPTIONS() {
  return extensionOptionsResponse()
}

export async function GET(request: NextRequest) {
  const unavailable = ensureSupabaseEnabled()
  if (unavailable) {
    return unavailable
  }

  const auth = await requireExtensionAuth(request)
  if (!auth.ok) {
    return auth.response
  }

  const { client } = auth.context
  const { data, error } = await client.auth.getUser()

  if (error || !data.user) {
    return extensionJson(
      { success: false, error: '会话无效，请重新登录' },
      { status: 401 }
    )
  }

  return extensionJson({
    success: true,
    user: data.user,
  })
}

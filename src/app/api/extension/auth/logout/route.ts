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

export async function POST(request: NextRequest) {
  const unavailable = ensureSupabaseEnabled()
  if (unavailable) {
    return unavailable
  }

  const auth = await requireExtensionAuth(request)
  if (!auth.ok) {
    return auth.response
  }

  try {
    const { client } = auth.context
    await client.auth.signOut()
  } catch (error) {
    return extensionJson(
      { success: false, error: error instanceof Error ? error.message : '登出失败' },
      { status: 500 }
    )
  }

  return extensionJson({
    success: true,
    message: '登出成功',
  })
}

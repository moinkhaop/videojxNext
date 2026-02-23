import { NextRequest } from 'next/server'
import {
  ensureSupabaseEnabled,
  extensionJson,
  extensionOptionsResponse,
  requireExtensionAuth,
} from '../../_shared'

type RouteContext = {
  params:
    | {
        id: string
      }
    | Promise<{
        id: string
      }>
}

export const runtime = 'nodejs'

export async function OPTIONS() {
  return extensionOptionsResponse()
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const unavailable = ensureSupabaseEnabled()
  if (unavailable) {
    return unavailable
  }

  const auth = await requireExtensionAuth(request)
  if (!auth.ok) {
    return auth.response
  }

  try {
    const params = await Promise.resolve(context.params)
    const { id } = params
    if (!id) {
      return extensionJson(
        { success: false, error: '缺少历史记录ID' },
        { status: 400 }
      )
    }

    const body = await request.json()
    const updates = body?.updates

    if (!updates || typeof updates !== 'object') {
      return extensionJson(
        { success: false, error: '缺少 updates 数据' },
        { status: 400 }
      )
    }

    const { client, userId } = auth.context
    const { data: existing, error: selectError } = await client
      .from('history_records')
      .select('record_data')
      .eq('id', id)
      .eq('user_id', userId)
      .single()

    if (selectError) {
      const status = selectError.code === 'PGRST116' ? 404 : 500
      return extensionJson(
        { success: false, error: status === 404 ? '历史记录不存在' : (selectError.message || '查询历史记录失败') },
        { status }
      )
    }

    const merged = {
      ...(existing?.record_data ?? {}),
      ...(updates ?? {}),
      id,
      updatedAt: new Date().toISOString(),
      cloudSynced: true,
    }

    const { error: updateError } = await client
      .from('history_records')
      .update({ record_data: merged })
      .eq('id', id)
      .eq('user_id', userId)

    if (updateError) {
      return extensionJson(
        { success: false, error: updateError.message || '更新历史记录失败' },
        { status: 500 }
      )
    }

    return extensionJson({
      success: true,
      data: merged,
    })
  } catch (error) {
    return extensionJson(
      { success: false, error: error instanceof Error ? error.message : '更新历史记录失败' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const unavailable = ensureSupabaseEnabled()
  if (unavailable) {
    return unavailable
  }

  const auth = await requireExtensionAuth(request)
  if (!auth.ok) {
    return auth.response
  }

  const params = await Promise.resolve(context.params)
  const { id } = params
  if (!id) {
    return extensionJson(
      { success: false, error: '缺少历史记录ID' },
      { status: 400 }
    )
  }

  const { client, userId } = auth.context
  const { error } = await client
    .from('history_records')
    .delete()
    .eq('id', id)
    .eq('user_id', userId)

  if (error) {
    return extensionJson(
      { success: false, error: error.message || '删除历史记录失败' },
      { status: 500 }
    )
  }

  return extensionJson({
    success: true,
    message: '删除成功',
  })
}

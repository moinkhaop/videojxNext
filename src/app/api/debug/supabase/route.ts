import { NextResponse } from 'next/server'
import { SUPABASE_ENABLED } from '@/lib/supabase/enabled'

export async function GET() {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  let supabaseHost: string | null = null
  if (url) {
    try {
      supabaseHost = new URL(url).host
    } catch {
      supabaseHost = null
    }
  }

  return NextResponse.json({
    SUPABASE_ENABLED,
    NEXT_PUBLIC_ENABLE_SUPABASE: process.env.NEXT_PUBLIC_ENABLE_SUPABASE ?? null,
    NEXT_PUBLIC_ENABLE_SUPABASE_AUTH: process.env.NEXT_PUBLIC_ENABLE_SUPABASE_AUTH ?? null,
    supabaseHost,
    hasAnonKey: Boolean(anonKey),
    anonKeyLength: anonKey?.length ?? 0,
  })
}


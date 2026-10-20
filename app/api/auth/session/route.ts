import { NextResponse } from 'next/server'
import { principalFromRequest } from '@/lib/auth/guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const principal = await principalFromRequest(request)
  if (!principal) return NextResponse.json({ user: null }, { status: 401 })
  return NextResponse.json({ user: principal })
}

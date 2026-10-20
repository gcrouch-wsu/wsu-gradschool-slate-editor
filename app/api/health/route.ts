import { NextResponse } from 'next/server'
import { getPool } from '@/lib/db/pool'
import { authMode, configurationProblems } from '@/lib/runtime-config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const problems = configurationProblems()
  if (problems.length > 0) {
    return NextResponse.json({ ok: false, problems }, { status: 503 })
  }
  if (!process.env.DATABASE_URL?.trim()) {
    if (authMode() === 'okta') {
      return NextResponse.json({ ok: false, problems: ['DATABASE_URL is required.'] }, { status: 503 })
    }
    return NextResponse.json({ ok: true, database: 'not-configured', authMode: authMode() })
  }
  try {
    await getPool().query('SELECT 1')
    return NextResponse.json({ ok: true, database: 'up', authMode: authMode() })
  } catch {
    return NextResponse.json({ ok: false, database: 'down' }, { status: 503 })
  }
}

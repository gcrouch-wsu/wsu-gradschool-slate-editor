import { NextResponse } from 'next/server'
import { isPrincipal, requireAdministrator } from '@/lib/auth/guard'
import { jsonError } from '@/lib/http'
import { getPool } from '@/lib/db/pool'
import { createLocalUser, createProvisionedUser, updateUserAccess, type UserRole } from '@/lib/auth/session-store'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const principal = await requireAdministrator(request)
  if (!isPrincipal(principal)) return principal
  const users = await getPool().query(
    `SELECT u.id, u.display_name, u.email, u.role, u.active, u.authorization_version,
            COALESCE(json_agg(json_build_object('issuer', i.issuer, 'subject', i.subject))
              FILTER (WHERE i.id IS NOT NULL), '[]') AS identities
     FROM users u
     LEFT JOIN user_identities i ON i.user_id = u.id
     GROUP BY u.id
     ORDER BY u.display_name`
  )
  return NextResponse.json({ users: users.rows })
}

export async function POST(request: Request) {
  const principal = await requireAdministrator(request)
  if (!isPrincipal(principal)) return principal
  try {
    const body = (await request.json()) as {
      displayName?: string
      email?: string | null
      role?: UserRole
      issuer?: string
      subject?: string
      userId?: string
      active?: boolean
      password?: string
    }
    if (body.password) {
      if (!body.displayName || !body.email || (body.role !== 'administrator' && body.role !== 'editor')) {
        return NextResponse.json({ error: 'displayName, email, role, and password are required.' }, { status: 400 })
      }
      const id = await createLocalUser({
        displayName: body.displayName,
        email: body.email,
        password: body.password,
        role: body.role,
      })
      return NextResponse.json({ id }, { status: 201 })
    }
    if (body.userId) {
      await updateUserAccess({
        userId: body.userId,
        role: body.role,
        active: body.active,
        displayName: body.displayName,
        email: body.email,
      })
      return NextResponse.json({ ok: true })
    }
    if (!body.displayName || !body.issuer || !body.subject || (body.role !== 'administrator' && body.role !== 'editor')) {
      return NextResponse.json({ error: 'displayName, role, issuer, and subject are required.' }, { status: 400 })
    }
    const id = await createProvisionedUser({
      displayName: body.displayName,
      email: body.email ?? null,
      role: body.role,
      issuer: body.issuer,
      subject: body.subject,
    })
    return NextResponse.json({ id }, { status: 201 })
  } catch (error) {
    return jsonError(error)
  }
}

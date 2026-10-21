import { NextRequest, NextResponse } from 'next/server'
import { allowContentRoute } from '@/lib/auth/guard'
import { normalizeNewsletter } from '@/lib/newsletter-document'
import { renderFullEmail } from '@/lib/email-templates'
import { auditEmailHtml } from '@/lib/email-accessibility'
import { jsonError } from '@/lib/http'

export async function POST(request: NextRequest) {
  const denied = await allowContentRoute(request)
  if (denied) return denied
  try {
    const content = normalizeNewsletter(await request.json(), {
      requireShape: true,
    })
    const issues = auditEmailHtml(renderFullEmail(content))
    return NextResponse.json({
      success: true,
      issues,
      total: issues.length,
      errors: issues.filter((issue) => issue.severity === 'error').length,
      warnings: issues.filter((issue) => issue.severity === 'warning').length,
    })
  } catch (error) {
    return jsonError(error)
  }
}

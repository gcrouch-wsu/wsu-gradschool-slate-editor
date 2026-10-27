import type { NewsletterData } from '@/types/newsletter'

const PACIFIC = 'America/Los_Angeles'

export function formatIssueDate(now = new Date()): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: PACIFIC,
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  }).format(now)
}

export function issueTitleOf(data: NewsletterData): string {
  const issue = data.issue?.title?.trim()
  if (issue) return issue
  const title = data.masthead?.title?.trim()
  return title || 'Untitled newsletter'
}

export function issueDateOf(data: NewsletterData): string | null {
  const date = data.issue?.date?.trim()
  return date || null
}

export function withNewIssue(content: NewsletterData, now = new Date()): NewsletterData {
  const label = formatIssueDate(now)
  return { ...content, issue: { title: label, date: label } }
}

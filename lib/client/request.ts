export class RequestError extends Error {
  constructor(
    message: string,
    public status = 0,
  ) {
    super(message)
  }
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, { cache: 'no-store', ...init })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error
    throw new RequestError('Connection failed. Check your connection and try again.')
  }
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    const message =
      response.status === 401
        ? 'Your session expired. Sign in again to continue.'
        : body?.error || 'The request could not be completed. Please try again.'
    throw new RequestError(message, response.status)
  }
  if (body === null) throw new RequestError('The server returned an unreadable response. Refresh before trying again.')
  return body as T
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'The request could not be completed.'
}

export function jsonBody(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }
}

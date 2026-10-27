import { AiConfigurationError, AiProviderError } from '@/lib/ai/errors'

const TIMEOUT_MS = 20_000
const MAX_RESPONSE_CHARS = 100_000

export function aiGatewayConfiguration() {
  const model = process.env.AI_GATEWAY_MODEL?.trim() ?? ''
  const base = (process.env.AI_GATEWAY_BASE_URL?.trim() || 'https://ai-gateway.vercel.sh/v1').replace(/\/+$/, '')
  const missing = [
    !model ? 'AI_GATEWAY_MODEL' : '',
    !process.env.AI_GATEWAY_API_KEY?.trim() ? 'AI_GATEWAY_API_KEY' : '',
  ].filter(Boolean)
  return {
    configured: missing.length === 0,
    model,
    endpoint: `${base}/chat/completions`,
    missing,
  }
}

export function assertAiConfigured() {
  const config = aiGatewayConfiguration()
  if (!config.configured) {
    throw new AiConfigurationError(
      `AI editing is not configured. Set ${config.missing.join(' and ')} to an AI Gateway model and key. No suggestion was invented.`,
    )
  }
  return config
}

export async function completeChat(input: {
  model: string
  endpoint: string
  messages: { role: 'system' | 'user'; content: string }[]
  fetchImpl?: typeof fetch
}): Promise<string> {
  const key = process.env.AI_GATEWAY_API_KEY?.trim()
  if (!key) throw new AiConfigurationError('AI editing is not configured. Set AI_GATEWAY_API_KEY.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await (input.fetchImpl ?? fetch)(input.endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${key}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: input.model,
        temperature: 0.2,
        max_tokens: 1500,
        messages: input.messages,
      }),
    })
    const reader = response.body?.getReader()
    const decoder = new TextDecoder()
    let raw = '',
      bytes = 0
    if (reader) {
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        bytes += chunk.value.byteLength
        if (bytes > MAX_RESPONSE_CHARS) {
          controller.abort()
          void reader.cancel().catch(() => undefined)
          throw new AiProviderError('The AI provider response was too large.')
        }
        raw += decoder.decode(chunk.value, { stream: true })
      }
      raw += decoder.decode()
    } else {
      raw = await response.text()
      if (raw.length > MAX_RESPONSE_CHARS) throw new AiProviderError('The AI provider response was too large.')
    }
    const payload = raw
      ? (JSON.parse(raw) as {
          choices?: { message?: { content?: string } }[]
          error?: { message?: string }
        })
      : {}
    if (!response.ok) {
      const message = payload.error?.message?.slice(0, 300) || `HTTP ${response.status}`
      throw new AiProviderError(`AI provider request failed: ${message}`)
    }
    const content = payload.choices?.[0]?.message?.content
    if (!content || typeof content !== 'string') throw new AiProviderError('The AI provider returned no suggestion.')
    return content
  } catch (error) {
    if (error instanceof AiProviderError || error instanceof AiConfigurationError) throw error
    if (error instanceof Error && error.name === 'AbortError') {
      throw new AiProviderError('The AI provider did not respond before the time limit. Nothing was changed.')
    }
    throw new AiProviderError('The AI provider request failed. Nothing was changed.')
  } finally {
    clearTimeout(timer)
  }
}

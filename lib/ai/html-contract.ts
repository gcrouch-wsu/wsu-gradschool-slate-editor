import { Parser } from 'htmlparser2'
import { canonicalJson } from '@/lib/canonical-json'
import { AiOutputError } from './errors'

export function htmlContract(html: string) {
  const markup: unknown[] = [],
    resources: unknown[] = [],
    layout: unknown[] = []
  let text = ''
  const fixed = /^(table|thead|tbody|tfoot|tr|th|td|h[1-6]|hr)$/
  const parser = new Parser(
    {
      onopentag(tag, attrs) {
        if (attrs.style)
          attrs = {
            ...attrs,
            style: attrs.style
              .split(';')
              .map((rule) => rule.trim().replace(/\s*:\s*/, ':'))
              .filter(Boolean)
              .sort()
              .join(';'),
          }
        markup.push([tag, attrs])
        if (tag === 'a' || tag === 'img') resources.push([tag, attrs])
        if (
          fixed.test(tag) ||
          Object.keys(attrs).some((key) => key !== 'href' && key !== 'title' && key !== 'src' && key !== 'alt')
        ) {
          layout.push([tag, attrs])
        }
      },
      onclosetag(tag) {
        if (fixed.test(tag)) layout.push(['/', tag])
      },
      ontext(value) {
        text += value + ' '
      },
    },
    { decodeEntities: true },
  )
  parser.write(html)
  parser.end()
  return { markup, resources, layout, text }
}

export function preserveTextReferences(original: string, proposed: string) {
  const references = (text: string) => ({
    urls: [...new Set(text.match(/(?:https?:\/\/|mailto:)[^\s"'<>]+/g) ?? [])].sort(),
    placeholders: (text.match(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|%%[^%]+%%/g) ?? []).sort(),
  })
  if (canonicalJson(references(original)) !== canonicalJson(references(proposed))) {
    throw new AiOutputError('The suggestion changed a URL or Slate placeholder. Generate it again.')
  }
}

export function preserveHtmlContract(original: string, proposed: string, clean: string) {
  const raw = htmlContract(proposed),
    sanitized = htmlContract(clean),
    before = htmlContract(original)
  if (canonicalJson(raw.markup) !== canonicalJson(sanitized.markup)) {
    throw new AiOutputError('The suggestion contained unsafe HTML or unsupported attributes.')
  }
  if (
    canonicalJson(before.resources) !== canonicalJson(sanitized.resources) ||
    canonicalJson(before.layout) !== canonicalJson(sanitized.layout)
  ) {
    throw new AiOutputError('The suggestion changed a link, image, or protected layout. Generate it again.')
  }
  preserveTextReferences(before.text, sanitized.text)
}

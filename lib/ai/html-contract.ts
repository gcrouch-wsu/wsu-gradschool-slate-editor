import { Parser } from 'htmlparser2'
import { AiOutputError } from './errors'

// Tables and headings keep their structure; spacing, alignment, and other formatting may change with the wording.
const STRUCTURE = /^(table|thead|tbody|tfoot|tr|th|td|h[1-6]|hr)$/
// Other unsupported tags (such as font or center) are unwrapped by the sanitizer and keep their text.
const UNSAFE = /^(script|style|iframe|frame|frameset|object|embed|applet|form|input|button|textarea|select|option|svg|math|link|meta|base|video|audio|source|template)$/

export function htmlContract(html: string) {
  const tags: string[] = [],
    links: string[] = [],
    images: { src: string; alt: string }[] = [],
    structure: string[] = []
  let text = ''
  const parser = new Parser(
    {
      onopentag(tag, attrs) {
        tags.push(tag)
        if (tag === 'a' && attrs.href) links.push(attrs.href.trim())
        if (tag === 'img') images.push({ src: (attrs.src ?? '').trim(), alt: (attrs.alt ?? '').trim() })
        if (STRUCTURE.test(tag)) structure.push(tag)
      },
      onclosetag(tag) {
        if (STRUCTURE.test(tag)) structure.push('/' + tag)
      },
      ontext(value) {
        text += value + ' '
      },
    },
    { decodeEntities: true },
  )
  parser.write(html)
  parser.end()
  return { tags, links, images, structure, text }
}

function rejected(reason: string, retry = 'Generate it again, or edit that part by hand.'): never {
  throw new AiOutputError(`This suggestion can't be used because it ${reason}. ${retry}`)
}

function missing(from: string[], to: string[]) {
  const remaining = [...to]
  return from.filter((item) => {
    const index = remaining.indexOf(item)
    if (index === -1) return true
    remaining.splice(index, 1)
    return false
  })
}

export function preserveTextReferences(original: string, proposed: string) {
  const references = (text: string) => ({
    urls: [...new Set(text.match(/(?:https?:\/\/|mailto:)[^\s"'<>]+/g) ?? [])],
    placeholders: text.match(/\{\{[\s\S]*?\}\}|\{%[\s\S]*?%\}|%%[^%]+%%/g) ?? [],
  })
  const before = references(original),
    after = references(proposed)
  const url = missing(before.urls, after.urls)[0]
  if (url) rejected(`removed or changed the web address ${url}`)
  const addedUrl = missing(after.urls, before.urls)[0]
  if (addedUrl) rejected(`added the web address ${addedUrl}, which is not in the original`)
  const placeholder = missing(before.placeholders, after.placeholders)[0]
  if (placeholder) rejected(`removed or changed the Slate placeholder ${placeholder}`)
  const addedPlaceholder = missing(after.placeholders, before.placeholders)[0]
  if (addedPlaceholder) rejected(`added the Slate placeholder ${addedPlaceholder}, which is not in the original`)
}

/**
 * Checks AI-proposed rich text against the original. Wording and formatting may change; link and image
 * destinations, table and heading structure, and Slate placeholders may not. Attributes and tags the
 * sanitizer removes harmlessly (such as target or font) are dropped quietly, because only the sanitized
 * HTML is ever used.
 */
export function preserveHtmlContract(original: string, proposed: string, clean: string) {
  const raw = htmlContract(proposed),
    sanitized = htmlContract(clean),
    before = htmlContract(original)
  const unsafe = missing(raw.tags, sanitized.tags).find((tag) => UNSAFE.test(tag))
  if (unsafe) rejected(`contained HTML that newsletters don't allow (<${unsafe}>)`, 'Generate it again.')

  const removedLink = missing([...new Set(before.links)], sanitized.links)[0]
  if (removedLink) rejected(`removed or changed the link to ${removedLink}`)
  const addedLink = missing([...new Set(sanitized.links)], before.links)[0]
  if (addedLink) rejected(`added a link to ${addedLink}, which is not in the original`)

  const image = (item: { src: string; alt: string }) => JSON.stringify([item.src, item.alt])
  const removedImage = missing(before.images.map(image), sanitized.images.map(image))[0]
  if (removedImage) {
    const [src, alt] = JSON.parse(removedImage) as [string, string]
    const replaced = sanitized.images.find((item) => item.src === src)
    if (replaced) rejected(`changed the description (alt text) of the image "${alt || src}"`)
    rejected(`removed or changed the image ${alt ? `"${alt}"` : src}`)
  }
  if (sanitized.images.length > before.images.length) rejected('added an image that is not in the original')

  if (before.structure.join() !== sanitized.structure.join()) {
    const tables = (list: string[]) => list.filter((tag) => !/^\/?(h[1-6]|hr)$/.test(tag)).join()
    rejected(
      tables(before.structure) !== tables(sanitized.structure)
        ? 'changed the layout of a table'
        : 'added, removed, or moved a heading or divider line',
    )
  }
  preserveTextReferences(before.text, sanitized.text)
}

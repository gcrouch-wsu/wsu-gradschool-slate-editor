import { diffArrays } from 'diff'
import { parseDocument } from 'htmlparser2'
import type { ChildNode, Element } from 'domhandler'
import { sanitizeRichHtml } from '@/lib/rich-html'

export type DiffMark = 'same' | 'added' | 'removed'

export type InlineNode =
  | { type: 'text'; text: string; mark: DiffMark }
  | { type: 'break'; mark: DiffMark }
  | { type: 'image'; alt: string; src: string; mark: DiffMark }
  | { type: 'link'; href: string; title: string; mark: DiffMark; children: InlineNode[] }
  | { type: 'format'; tag: 'strong' | 'em' | 'u' | 's' | 'sub' | 'sup' | 'span'; mark: DiffMark; children: InlineNode[] }

export type BlockNode =
  | { type: 'block'; tag: string; mark: DiffMark; children: InlineNode[] }
  | { type: 'list'; ordered: boolean; mark: DiffMark; items: { mark: DiffMark; children: InlineNode[]; blocks: BlockNode[] }[] }
  | { type: 'table'; mark: DiffMark; rows: { cells: { header: boolean; mark: DiffMark; children: InlineNode[] }[] }[] }
  | { type: 'rule'; mark: DiffMark }

export interface SuggestionViews {
  changes: BlockNode[]
  original: BlockNode[]
  proposed: BlockNode[]
}

type HtmlNode =
  | { type: 'text'; text: string }
  | { type: 'element'; tag: string; attrs: Record<string, string>; children: HtmlNode[] }

interface Layer {
  tag: string
  attrs: Record<string, string>
}

interface Atom {
  text: string
  stack: Layer[]
  kind: 'text' | 'break' | 'image'
  alt?: string
  src?: string
}

type FlowSource = { type: 'flow'; tag: string; nodes: HtmlNode[] }
type ItemSource = { nodes: HtmlNode[]; nested: Source[] }
type ListSource = { type: 'list'; ordered: boolean; items: ItemSource[] }
type CellSource = { header: boolean; nodes: HtmlNode[] }
type TableSource = { type: 'table'; rows: { cells: CellSource[] }[] }
type RuleSource = { type: 'rule' }
type Source = FlowSource | ListSource | TableSource | RuleSource

const INLINE = new Set(['a', 'strong', 'b', 'em', 'i', 'u', 's', 'strike', 'span', 'sub', 'sup', 'img', 'br'])
const TOKEN = /(\s+)|([\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*)|([^\s])/gu

function safeHref(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > 2000 || /[\s<>]/.test(trimmed)) return ''
  try {
    const url = new URL(trimmed)
    if (url.username || url.password) return ''
    if (url.protocol !== 'https:' && url.protocol !== 'mailto:') return ''
    return trimmed
  } catch {
    return ''
  }
}

function safeImageSrc(value: string): string {
  const href = safeHref(value)
  return href.startsWith('https:') ? href : ''
}

function tokenize(text: string): string[] {
  const pieces = text.match(TOKEN) ?? []
  const tokens: string[] = []
  for (const piece of pieces) {
    if (/^\s+$/.test(piece) && tokens.length > 0) tokens[tokens.length - 1] += piece
    else tokens.push(piece)
  }
  return tokens
}

function displayTag(tag: string): string {
  if (tag === 'b') return 'strong'
  if (tag === 'i') return 'em'
  if (tag === 'strike') return 's'
  return tag
}

function parseNodes(html: string): HtmlNode[] {
  const document = parseDocument(sanitizeRichHtml(html), { decodeEntities: true })
  return document.children.map(fromDom).filter((node): node is HtmlNode => node !== null)
}

function fromDom(node: ChildNode): HtmlNode | null {
  if (node.type === 'script' || node.type === 'style') return null
  if (node.type === 'text') return { type: 'text', text: node.data }
  if (node.type !== 'tag') return null
  const element = node as Element
  return {
    type: 'element',
    tag: element.name.toLowerCase(),
    attrs: element.attribs ?? {},
    children: element.children.map(fromDom).filter((child): child is HtmlNode => child !== null),
  }
}

function isElement(node: HtmlNode): node is Extract<HtmlNode, { type: 'element' }> {
  return node.type === 'element'
}

function containsBlock(node: Extract<HtmlNode, { type: 'element' }>): boolean {
  return node.children.some((child) => isElement(child) && !INLINE.has(child.tag))
}

function blocksFrom(nodes: HtmlNode[]): Source[] {
  const sources: Source[] = []
  let inline: HtmlNode[] = []
  const flush = () => {
    if (!inline.some((node) => node.type !== 'text' || node.text.trim())) {
      inline = []
      return
    }
    sources.push({ type: 'flow', tag: 'p', nodes: inline })
    inline = []
  }
  for (const node of nodes) {
    if (node.type === 'text') {
      if (!node.text.trim() && inline.length === 0) continue
      inline.push(node)
      continue
    }
    if (INLINE.has(node.tag)) {
      inline.push(node)
      continue
    }
    flush()
    if (node.tag === 'ul' || node.tag === 'ol') sources.push(listSource(node))
    else if (node.tag === 'table') sources.push(tableSource(node))
    else if (node.tag === 'hr') sources.push({ type: 'rule' })
    else if ((node.tag === 'div' || node.tag === 'blockquote') && containsBlock(node)) {
      sources.push(...blocksFrom(node.children))
    } else sources.push({ type: 'flow', tag: node.tag, nodes: node.children })
  }
  flush()
  return sources
}

function listSource(node: Extract<HtmlNode, { type: 'element' }>): ListSource {
  const items = node.children.filter(isElement).filter((child) => child.tag === 'li')
  return {
    type: 'list',
    ordered: node.tag === 'ol',
    items: items.map((item) => {
      const nested: Source[] = []
      const flow: HtmlNode[] = []
      for (const child of item.children) {
        if (isElement(child) && (child.tag === 'ul' || child.tag === 'ol' || child.tag === 'table')) {
          nested.push(...blocksFrom([child]))
        } else flow.push(child)
      }
      return { nodes: flow, nested }
    }),
  }
}

function tableSource(node: Extract<HtmlNode, { type: 'element' }>): TableSource {
  const rows: { cells: CellSource[] }[] = []
  const walk = (current: HtmlNode) => {
    if (!isElement(current)) return
    if (current.tag === 'tr') {
      rows.push({
        cells: current.children
          .filter(isElement)
          .filter((cell) => cell.tag === 'td' || cell.tag === 'th')
          .map((cell) => ({ header: cell.tag === 'th', nodes: cell.children })),
      })
      return
    }
    current.children.forEach(walk)
  }
  walk(node)
  return { type: 'table', rows }
}

function sourceKey(source: Source): string {
  if (source.type === 'flow') return `flow:${source.tag}`
  if (source.type === 'list') return source.ordered ? 'list:ol' : 'list:ul'
  if (source.type === 'table') return 'table'
  return 'rule'
}

function flatten(nodes: HtmlNode[], stack: Layer[] = [], atoms: Atom[] = []): Atom[] {
  for (const node of nodes) {
    if (node.type === 'text') {
      for (const token of tokenize(node.text)) {
        atoms.push({ kind: 'text', text: token, stack: stack.slice() })
      }
      continue
    }
    if (node.tag === 'br') {
      atoms.push({ kind: 'break', text: '\uE000br', stack: stack.slice() })
      continue
    }
    if (node.tag === 'img') {
      const alt = node.attrs.alt || ''
      const src = safeImageSrc(node.attrs.src || '')
      atoms.push({
        kind: 'image',
        text: `\uE000img\uE000${src}\uE000${alt}`,
        stack: stack.slice(),
        alt,
        src,
      })
      continue
    }
    if (node.tag === 'span') {
      flatten(node.children, stack, atoms)
      continue
    }
    const next = stack.slice()
    if (node.tag === 'a') {
      const href = safeHref(node.attrs.href || '')
      if (href) next.push({ tag: 'a', attrs: { href, title: (node.attrs.title || '').slice(0, 300) } })
    } else if (INLINE.has(node.tag)) {
      next.push({ tag: displayTag(node.tag), attrs: {} })
    }
    flatten(node.children, next, atoms)
  }
  return atoms
}

type Aligned<T> =
  | { kind: 'same'; left: T; right: T }
  | { kind: 'removed'; left: T }
  | { kind: 'added'; right: T }

function align<T>(left: T[], right: T[], key: (item: T) => string): Aligned<T>[] {
  const parts = diffArrays(
    left.map(key),
    right.map(key),
    { maxEditLength: 4000 },
  )
  if (!parts) {
    return [
      ...left.map((item) => ({ kind: 'removed' as const, left: item })),
      ...right.map((item) => ({ kind: 'added' as const, right: item })),
    ]
  }
  const aligned: Aligned<T>[] = []
  let leftIndex = 0
  let rightIndex = 0
  for (const part of parts) {
    if (part.added) {
      for (let index = 0; index < part.value.length; index += 1) {
        aligned.push({ kind: 'added', right: right[rightIndex++] })
      }
    } else if (part.removed) {
      for (let index = 0; index < part.value.length; index += 1) {
        aligned.push({ kind: 'removed', left: left[leftIndex++] })
      }
    } else {
      for (let index = 0; index < part.value.length; index += 1) {
        aligned.push({ kind: 'same', left: left[leftIndex++], right: right[rightIndex++] })
      }
    }
  }
  return aligned
}

function sameStack(left: Layer[], right: Layer[]): boolean {
  return (
    left.length === right.length &&
    left.every((layer, index) => layer.tag === right[index].tag && layer.attrs.href === right[index].attrs.href)
  )
}

function groupAtoms(parts: { atom: Atom; mark: DiffMark }[]): {
  text: string
  stack: Layer[]
  mark: DiffMark
  kind: Atom['kind']
  alt?: string
  src?: string
}[] {
  const groups: {
    text: string
    stack: Layer[]
    mark: DiffMark
    kind: Atom['kind']
    alt?: string
    src?: string
  }[] = []
  for (const part of parts) {
    const last = groups[groups.length - 1]
    if (
      last &&
      last.kind === 'text' &&
      part.atom.kind === 'text' &&
      last.mark === part.mark &&
      sameStack(last.stack, part.atom.stack)
    ) {
      last.text += part.atom.text
      continue
    }
    groups.push({
      text: part.atom.text,
      stack: part.atom.stack,
      mark: part.mark,
      kind: part.atom.kind,
      alt: part.atom.alt,
      src: part.atom.src,
    })
  }
  return groups
}

function inlineFromGroups(
  groups: {
    text: string
    stack: Layer[]
    mark: DiffMark
    kind: Atom['kind']
    alt?: string
    src?: string
  }[],
): InlineNode[] {
  const root: InlineNode[] = []
  const open: { layer: Layer; children: InlineNode[] }[] = []
  const container = () => (open.length ? open[open.length - 1].children : root)
  const closeUntil = (depth: number) => {
    while (open.length > depth) {
      const finished = open.pop()
      if (!finished || finished.children.length === 0) continue
      container().push(layerNode(finished.layer, finished.children))
    }
  }
  for (const group of groups) {
    let shared = 0
    while (
      shared < open.length &&
      shared < group.stack.length &&
      open[shared].layer.tag === group.stack[shared].tag &&
      open[shared].layer.attrs.href === group.stack[shared].attrs.href
    ) {
      shared += 1
    }
    closeUntil(shared)
    while (open.length < group.stack.length) open.push({ layer: group.stack[open.length], children: [] })
    if (group.kind === 'image') {
      container().push({ type: 'image', alt: group.alt || '', src: group.src || '', mark: group.mark })
    } else if (group.kind === 'break') {
      container().push({ type: 'break', mark: group.mark })
    } else if (group.text) {
      container().push({ type: 'text', text: group.text, mark: group.mark })
    }
  }
  closeUntil(0)
  return root
}

function layerNode(layer: Layer, children: InlineNode[]): InlineNode {
  if (layer.tag === 'a') {
    return { type: 'link', href: layer.attrs.href || '', title: layer.attrs.title || '', mark: 'same', children }
  }
  const tag = layer.tag
  if (tag === 'strong' || tag === 'em' || tag === 'u' || tag === 's' || tag === 'sub' || tag === 'sup') {
    return { type: 'format', tag, mark: 'same', children }
  }
  return { type: 'format', tag: 'span', mark: 'same', children }
}

function inlineFromAtoms(atoms: Atom[], mark: DiffMark): InlineNode[] {
  return inlineFromGroups(groupAtoms(atoms.map((atom) => ({ atom, mark }))))
}

function presentChanges(parts: { atom: Atom; mark: DiffMark }[]): { atom: Atom; mark: DiffMark }[] {
  const presented: { atom: Atom; mark: DiffMark }[] = []
  let index = 0
  while (index < parts.length) {
    if (parts[index].mark === 'same') {
      presented.push(parts[index])
      index += 1
      continue
    }
    const removed: { atom: Atom; mark: DiffMark }[] = []
    const added: { atom: Atom; mark: DiffMark }[] = []
    while (index < parts.length && parts[index].mark !== 'same') {
      if (parts[index].mark === 'removed') removed.push(parts[index])
      else added.push(parts[index])
      index += 1
    }
    presented.push(...removed, ...added)
  }
  return presented
}

function diffInline(original: HtmlNode[], proposed: HtmlNode[]): InlineNode[] {
  const parts = align(flatten(original), flatten(proposed), (atom) => atom.text)
  return inlineFromGroups(
    groupAtoms(
      presentChanges(
        parts.map((part) =>
          part.kind === 'removed'
            ? { atom: part.left, mark: 'removed' as const }
            : { atom: part.right, mark: part.kind === 'added' ? ('added' as const) : ('same' as const) },
        ),
      ),
    ),
  )
}

function renderSource(source: Source, mark: DiffMark): BlockNode {
  if (source.type === 'rule') return { type: 'rule', mark }
  if (source.type === 'flow') {
    return { type: 'block', tag: source.tag, mark, children: inlineFromAtoms(flatten(source.nodes), mark) }
  }
  if (source.type === 'list') {
    return {
      type: 'list',
      ordered: source.ordered,
      mark,
      items: source.items.map((item) => ({
        mark,
        children: inlineFromAtoms(flatten(item.nodes), mark),
        blocks: item.nested.map((nested) => renderSource(nested, mark)),
      })),
    }
  }
  return {
    type: 'table',
    mark,
    rows: source.rows.map((row) => ({
      cells: row.cells.map((cell) => ({
        header: cell.header,
        mark,
        children: inlineFromAtoms(flatten(cell.nodes), mark),
      })),
    })),
  }
}

function mergeSource(original: Source, proposed: Source): BlockNode {
  if (original.type === 'flow' && proposed.type === 'flow') {
    return { type: 'block', tag: proposed.tag, mark: 'same', children: diffInline(original.nodes, proposed.nodes) }
  }
  if (original.type === 'list' && proposed.type === 'list') {
    return {
      type: 'list',
      ordered: proposed.ordered,
      mark: 'same',
      items: align(original.items, proposed.items, () => 'item').map((part) => {
        if (part.kind === 'removed') {
          return {
            mark: 'removed' as const,
            children: inlineFromAtoms(flatten(part.left.nodes), 'removed'),
            blocks: part.left.nested.map((nested) => renderSource(nested, 'removed')),
          }
        }
        if (part.kind === 'added') {
          return {
            mark: 'added' as const,
            children: inlineFromAtoms(flatten(part.right.nodes), 'added'),
            blocks: part.right.nested.map((nested) => renderSource(nested, 'added')),
          }
        }
        return {
          mark: 'same' as const,
          children: diffInline(part.left.nodes, part.right.nodes),
          blocks: diffSources(part.left.nested, part.right.nested),
        }
      }),
    }
  }
  if (original.type === 'table' && proposed.type === 'table') {
    return {
      type: 'table',
      mark: 'same',
      rows: align(original.rows, proposed.rows, () => 'row').map((part) => {
        if (part.kind !== 'same') {
          const row = part.kind === 'removed' ? part.left : part.right
          const mark = part.kind === 'removed' ? 'removed' : 'added'
          return {
            cells: row.cells.map((cell) => ({
              header: cell.header,
              mark,
              children: inlineFromAtoms(flatten(cell.nodes), mark),
            })),
          }
        }
        return {
          cells: align(part.left.cells, part.right.cells, (cell) => (cell.header ? 'th' : 'td')).map((cellPart) => {
            if (cellPart.kind === 'removed') {
              return {
                header: cellPart.left.header,
                mark: 'removed' as const,
                children: inlineFromAtoms(flatten(cellPart.left.nodes), 'removed'),
              }
            }
            if (cellPart.kind === 'added') {
              return {
                header: cellPart.right.header,
                mark: 'added' as const,
                children: inlineFromAtoms(flatten(cellPart.right.nodes), 'added'),
              }
            }
            return {
              header: cellPart.right.header,
              mark: 'same' as const,
              children: diffInline(cellPart.left.nodes, cellPart.right.nodes),
            }
          }),
        }
      }),
    }
  }
  return renderSource(proposed, 'same')
}

function diffSources(original: Source[], proposed: Source[]): BlockNode[] {
  return align(original, proposed, sourceKey).map((part) => {
    if (part.kind === 'removed') return renderSource(part.left, 'removed')
    if (part.kind === 'added') return renderSource(part.right, 'added')
    return mergeSource(part.left, part.right)
  })
}

export function suggestionHasContent(blocks: BlockNode[]): boolean {
  return blocks.some((block) => {
    if (block.type === 'rule') return true
    if (block.type === 'block') return block.children.length > 0
    if (block.type === 'list') return block.items.length > 0
    return block.rows.length > 0
  })
}

function documentBlocks(html: string): BlockNode[] {
  return blocksFrom(parseNodes(html)).map((source) => renderSource(source, 'same'))
}

/** Display structure only. The original and proposed strings are not rewritten. */
export function compareSuggestions(original: string, proposed: string): SuggestionViews {
  return {
    changes: diffSources(blocksFrom(parseNodes(original)), blocksFrom(parseNodes(proposed))),
    original: documentBlocks(original),
    proposed: documentBlocks(proposed),
  }
}

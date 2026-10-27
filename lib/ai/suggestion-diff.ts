import { diffArrays } from 'diff'
import { parseDocument } from 'htmlparser2'
import type { ChildNode, Element } from 'domhandler'
import { sanitizeRichHtml } from '@/lib/rich-html'

export type DiffMark = 'same' | 'added' | 'removed'
export type EditDecision = 'accept' | 'pass'

export type InlineNode =
  | { type: 'text'; text: string; mark: DiffMark; editId?: string }
  | { type: 'break'; mark: DiffMark; editId?: string }
  | { type: 'image'; alt: string; src: string; mark: DiffMark; editId?: string }
  | { type: 'link'; href: string; title: string; mark: DiffMark; editId?: string; children: InlineNode[] }
  | {
      type: 'format'
      tag: 'strong' | 'em' | 'u' | 's' | 'sub' | 'sup' | 'span'
      mark: DiffMark
      editId?: string
      attrs?: Record<string, string>
      children: InlineNode[]
    }

export type BlockNode =
  | { type: 'block'; tag: string; mark: DiffMark; editId?: string; attrs?: Record<string, string>; children: InlineNode[] }
  | {
      type: 'list'
      ordered: boolean
      mark: DiffMark
      editId?: string
      attrs?: Record<string, string>
      items: { mark: DiffMark; editId?: string; attrs?: Record<string, string>; children: InlineNode[]; blocks: BlockNode[] }[]
    }
  | {
      type: 'table'
      mark: DiffMark
      editId?: string
      attrs?: Record<string, string>
      rows: {
        editId?: string
        attrs?: Record<string, string>
        cells: { header: boolean; mark: DiffMark; editId?: string; attrs?: Record<string, string>; children: InlineNode[] }[]
      }[]
    }
  | { type: 'rule'; mark: DiffMark; editId?: string }

export interface SuggestionEdit {
  id: string
  removed: string
  added: string
}

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

type FlowSource = { type: 'flow'; tag: string; attrs: Record<string, string>; nodes: HtmlNode[] }
type ItemSource = { attrs: Record<string, string>; nodes: HtmlNode[]; nested: Source[] }
type ListSource = { type: 'list'; ordered: boolean; attrs: Record<string, string>; items: ItemSource[] }
type CellSource = { header: boolean; attrs: Record<string, string>; nodes: HtmlNode[] }
type TableSource = { type: 'table'; attrs: Record<string, string>; rows: { attrs: Record<string, string>; cells: CellSource[] }[] }
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
    sources.push({ type: 'flow', tag: 'p', attrs: {}, nodes: inline })
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
    } else sources.push({ type: 'flow', tag: node.tag, attrs: node.attrs, nodes: node.children })
  }
  flush()
  return sources
}

function listSource(node: Extract<HtmlNode, { type: 'element' }>): ListSource {
  const items = node.children.filter(isElement).filter((child) => child.tag === 'li')
  return {
    type: 'list',
    ordered: node.tag === 'ol',
    attrs: node.attrs,
    items: items.map((item) => {
      const nested: Source[] = []
      const flow: HtmlNode[] = []
      for (const child of item.children) {
        if (isElement(child) && (child.tag === 'ul' || child.tag === 'ol' || child.tag === 'table')) {
          nested.push(...blocksFrom([child]))
        } else flow.push(child)
      }
      return { attrs: item.attrs, nodes: flow, nested }
    }),
  }
}

function tableSource(node: Extract<HtmlNode, { type: 'element' }>): TableSource {
  const rows: { attrs: Record<string, string>; cells: CellSource[] }[] = []
  const walk = (current: HtmlNode) => {
    if (!isElement(current)) return
    if (current.tag === 'tr') {
      rows.push({
        attrs: current.attrs,
        cells: current.children
          .filter(isElement)
          .filter((cell) => cell.tag === 'td' || cell.tag === 'th')
          .map((cell) => ({ header: cell.tag === 'th', attrs: cell.attrs, nodes: cell.children })),
      })
      return
    }
    current.children.forEach(walk)
  }
  walk(node)
  return { type: 'table', attrs: node.attrs, rows }
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
    const next = stack.slice()
    if (node.tag === 'a') {
      const href = safeHref(node.attrs.href || '')
      if (href) next.push({ tag: 'a', attrs: { href, title: (node.attrs.title || '').slice(0, 300) } })
    } else if (node.tag === 'span') {
      next.push({ tag: 'span', attrs: node.attrs })
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

function groupAtoms(parts: { atom: Atom; mark: DiffMark; editId?: string }[]): {
  text: string
  stack: Layer[]
  mark: DiffMark
  editId?: string
  kind: Atom['kind']
  alt?: string
  src?: string
}[] {
  const groups: {
    text: string
    stack: Layer[]
    mark: DiffMark
    editId?: string
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
      last.editId === part.editId &&
      sameStack(last.stack, part.atom.stack)
    ) {
      last.text += part.atom.text
      continue
    }
    groups.push({
      text: part.atom.text,
      stack: part.atom.stack,
      mark: part.mark,
      editId: part.editId,
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
    editId?: string
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
    const identity = group.editId ? { editId: group.editId } : {}
    if (group.kind === 'image') {
      container().push({ type: 'image', alt: group.alt || '', src: group.src || '', mark: group.mark, ...identity })
    } else if (group.kind === 'break') {
      container().push({ type: 'break', mark: group.mark, ...identity })
    } else if (group.text) {
      container().push({ type: 'text', text: group.text, mark: group.mark, ...identity })
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
  return { type: 'format', tag: 'span', mark: 'same', attrs: layer.attrs, children }
}

type MarkedAtom = { atom: Atom; mark: DiffMark; editId?: string }

function inlineFromAtoms(atoms: Atom[], mark: DiffMark, editId?: string): InlineNode[] {
  return inlineFromGroups(groupAtoms(atoms.map((atom) => ({ atom, mark, editId }))))
}

function presentChanges(parts: MarkedAtom[]): MarkedAtom[] {
  const presented: MarkedAtom[] = []
  let index = 0
  while (index < parts.length) {
    if (parts[index].mark === 'same') {
      presented.push(parts[index])
      index += 1
      continue
    }
    const removed: MarkedAtom[] = []
    const added: MarkedAtom[] = []
    while (index < parts.length && parts[index].mark !== 'same') {
      if (parts[index].mark === 'removed') removed.push(parts[index])
      else added.push(parts[index])
      index += 1
    }
    presented.push(...removed, ...added)
  }
  return presented
}

function createEditIds(): () => string {
  let count = 0
  return () => {
    count += 1
    return `e${count}`
  }
}

function diffInline(original: HtmlNode[], proposed: HtmlNode[], nextId: () => string): InlineNode[] {
  const aligned = align(flatten(original), flatten(proposed), (atom) => atom.text)
  const marked: MarkedAtom[] = []
  let index = 0
  while (index < aligned.length) {
    const part = aligned[index]
    if (part.kind === 'same') {
      marked.push({ atom: part.right, mark: 'same' })
      index += 1
      continue
    }
    const editId = nextId()
    while (index < aligned.length && aligned[index].kind !== 'same') {
      const current = aligned[index]
      marked.push(
        current.kind === 'removed'
          ? { atom: current.left, mark: 'removed', editId }
          : { atom: current.right, mark: 'added', editId },
      )
      index += 1
    }
  }
  return inlineFromGroups(groupAtoms(presentChanges(marked)))
}

function renderSource(source: Source, mark: DiffMark, editId?: string): BlockNode {
  const identity = editId ? { editId } : {}
  if (source.type === 'rule') return { type: 'rule', mark, ...identity }
  if (source.type === 'flow') {
    const children = inlineFromAtoms(flatten(source.nodes), mark, editId)
    return { type: 'block', tag: source.tag, mark, attrs: source.attrs, ...identity, children }
  }
  if (source.type === 'list') {
    return {
      type: 'list',
      ordered: source.ordered,
      mark,
      attrs: source.attrs,
      ...identity,
      items: source.items.map((item) => ({
        mark,
        ...identity,
        attrs: item.attrs,
        children: inlineFromAtoms(flatten(item.nodes), mark, editId),
        blocks: item.nested.map((nested) => renderSource(nested, mark, editId)),
      })),
    }
  }
  return {
    type: 'table',
    mark,
    attrs: source.attrs,
    ...identity,
    rows: source.rows.map((row) => ({
      ...identity,
      attrs: row.attrs,
      cells: row.cells.map((cell) => ({
        header: cell.header,
        mark,
        attrs: cell.attrs,
        ...identity,
        children: inlineFromAtoms(flatten(cell.nodes), mark, editId),
      })),
    })),
  }
}

function replacementPair<T>(parts: Aligned<T>[], index: number): { left: T; right: T } | null {
  const part = parts[index]
  const next = parts[index + 1]
  if (!next || part.kind === 'same' || next.kind === 'same') return null
  if (part.kind === 'removed' && next.kind === 'added') return { left: part.left, right: next.right }
  if (part.kind === 'added' && next.kind === 'removed') return { left: next.left, right: part.right }
  return null
}

function mergeSource(original: Source, proposed: Source, nextId: () => string): BlockNode {
  if (original.type === 'flow' && proposed.type === 'flow') {
    return {
      type: 'block',
      tag: proposed.tag,
      mark: 'same',
      attrs: proposed.attrs,
      children: diffInline(original.nodes, proposed.nodes, nextId),
    }
  }
  if (original.type === 'list' && proposed.type === 'list') {
    const parts = align(original.items, proposed.items, () => 'item')
    const items: Extract<BlockNode, { type: 'list' }>['items'] = []
    for (let index = 0; index < parts.length; index += 1) {
      const pair = replacementPair(parts, index)
      const part = parts[index]
      if (pair) {
        const editId = nextId()
        items.push({
          mark: 'removed',
          editId,
          attrs: pair.left.attrs,
          children: inlineFromAtoms(flatten(pair.left.nodes), 'removed', editId),
          blocks: pair.left.nested.map((nested) => renderSource(nested, 'removed', editId)),
        })
        items.push({
          mark: 'added',
          editId,
          attrs: pair.right.attrs,
          children: inlineFromAtoms(flatten(pair.right.nodes), 'added', editId),
          blocks: pair.right.nested.map((nested) => renderSource(nested, 'added', editId)),
        })
        index += 1
        continue
      }
      if (part.kind === 'removed' || part.kind === 'added') {
        const editId = nextId()
        const item = part.kind === 'removed' ? part.left : part.right
        items.push({
          mark: part.kind,
          editId,
          attrs: item.attrs,
          children: inlineFromAtoms(flatten(item.nodes), part.kind, editId),
          blocks: item.nested.map((nested) => renderSource(nested, part.kind, editId)),
        })
        continue
      }
      items.push({
        mark: 'same',
        attrs: part.right.attrs,
        children: diffInline(part.left.nodes, part.right.nodes, nextId),
        blocks: diffSources(part.left.nested, part.right.nested, nextId),
      })
    }
    return { type: 'list', ordered: proposed.ordered, mark: 'same', attrs: proposed.attrs, items }
  }
  if (original.type === 'table' && proposed.type === 'table') {
    const parts = align(original.rows, proposed.rows, () => 'row')
    const rows: Extract<BlockNode, { type: 'table' }>['rows'] = []
    for (let index = 0; index < parts.length; index += 1) {
      const pair = replacementPair(parts, index)
      const part = parts[index]
      if (pair || part.kind !== 'same') {
        const editId = nextId()
        const removed = pair ? pair.left : part.kind === 'removed' ? part.left : null
        const added = pair ? pair.right : part.kind === 'added' ? part.right : null
        if (removed) {
          rows.push({
            editId,
            attrs: removed.attrs,
            cells: removed.cells.map((cell) => ({
              header: cell.header,
              mark: 'removed' as const,
              editId,
              attrs: cell.attrs,
              children: inlineFromAtoms(flatten(cell.nodes), 'removed', editId),
            })),
          })
        }
        if (added) {
          rows.push({
            editId,
            attrs: added.attrs,
            cells: added.cells.map((cell) => ({
              header: cell.header,
              mark: 'added' as const,
              editId,
              attrs: cell.attrs,
              children: inlineFromAtoms(flatten(cell.nodes), 'added', editId),
            })),
          })
        }
        if (pair) index += 1
        continue
      }
      const cellParts = align(part.left.cells, part.right.cells, (cell) => (cell.header ? 'th' : 'td'))
      const cells: Extract<BlockNode, { type: 'table' }>['rows'][number]['cells'] = []
      for (let cellIndex = 0; cellIndex < cellParts.length; cellIndex += 1) {
        const cellPair = replacementPair(cellParts, cellIndex)
        const cellPart = cellParts[cellIndex]
        if (cellPair || cellPart.kind !== 'same') {
          const editId = nextId()
          const removed = cellPair ? cellPair.left : cellPart.kind === 'removed' ? cellPart.left : null
          const added = cellPair ? cellPair.right : cellPart.kind === 'added' ? cellPart.right : null
          if (removed) {
            cells.push({
              header: removed.header,
              mark: 'removed',
              editId,
              attrs: removed.attrs,
              children: inlineFromAtoms(flatten(removed.nodes), 'removed', editId),
            })
          }
          if (added) {
            cells.push({
              header: added.header,
              mark: 'added',
              editId,
              attrs: added.attrs,
              children: inlineFromAtoms(flatten(added.nodes), 'added', editId),
            })
          }
          if (cellPair) cellIndex += 1
          continue
        }
        cells.push({
          header: cellPart.right.header,
          mark: 'same',
          attrs: cellPart.right.attrs,
          children: diffInline(cellPart.left.nodes, cellPart.right.nodes, nextId),
        })
      }
      rows.push({ attrs: part.right.attrs, cells })
    }
    return { type: 'table', mark: 'same', attrs: proposed.attrs, rows }
  }
  return renderSource(proposed, 'same')
}

function diffSources(original: Source[], proposed: Source[], nextId: () => string): BlockNode[] {
  const parts = align(original, proposed, sourceKey)
  const blocks: BlockNode[] = []
  for (let index = 0; index < parts.length; index += 1) {
    const pair = replacementPair(parts, index)
    const part = parts[index]
    if (part.kind === 'same') {
      blocks.push(mergeSource(part.left, part.right, nextId))
      continue
    }
    if (pair) {
      const editId = nextId()
      blocks.push(renderSource(pair.left, 'removed', editId))
      blocks.push(renderSource(pair.right, 'added', editId))
      index += 1
      continue
    }
    const editId = nextId()
    blocks.push(part.kind === 'removed' ? renderSource(part.left, 'removed', editId) : renderSource(part.right, 'added', editId))
  }
  return blocks
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
    changes: diffSources(blocksFrom(parseNodes(original)), blocksFrom(parseNodes(proposed)), createEditIds()),
    original: documentBlocks(original),
    proposed: documentBlocks(proposed),
  }
}

function decisionKeeps(mark: DiffMark, editId: string | undefined, decisions: Record<string, EditDecision>, showPending: boolean): boolean {
  if (mark === 'same') return true
  const decision = editId ? decisions[editId] : undefined
  if (!decision) return showPending || mark === 'added'
  return decision === 'pass' ? mark === 'removed' : mark === 'added'
}

function filterInline(nodes: InlineNode[], decisions: Record<string, EditDecision>, showPending: boolean): InlineNode[] {
  const filtered: InlineNode[] = []
  for (const node of nodes) {
    if (node.type === 'link' || node.type === 'format') {
      const children = filterInline(node.children, decisions, showPending)
      if (children.length) filtered.push({ ...node, children })
      continue
    }
    if (!decisionKeeps(node.mark, node.editId, decisions, showPending)) continue
    const chosen = Boolean(node.editId && decisions[node.editId])
    filtered.push(showPending && chosen ? { ...node, mark: 'same' } : node)
  }
  return filtered
}

/** Chosen wording for display. Pending edits keep both marks. Decisions do not change the stored diff. */
export function presentDecisions(blocks: BlockNode[], decisions: Record<string, EditDecision>): BlockNode[] {
  const presented: BlockNode[] = []
  for (const block of blocks) {
    if (!decisionKeeps(block.mark, block.editId, decisions, true)) continue
    if (block.type === 'rule') {
      presented.push(block.editId && decisions[block.editId] ? { ...block, mark: 'same' } : block)
      continue
    }
    if (block.type === 'block') {
      const children = filterInline(block.children, decisions, true)
      if (children.length) presented.push({ ...block, children })
      continue
    }
    if (block.type === 'list') {
      const items = block.items.flatMap((item) => {
        if (!decisionKeeps(item.mark, item.editId, decisions, true)) return []
        const children = filterInline(item.children, decisions, true)
        const nested = presentDecisions(item.blocks, decisions)
        return children.length || nested.length ? [{ ...item, children, blocks: nested }] : []
      })
      if (items.length) presented.push({ ...block, items })
      continue
    }
    const rows = block.rows.flatMap((row) => {
      const rowMark = row.cells.every((cell) => cell.mark === 'removed')
        ? 'removed'
        : row.cells.every((cell) => cell.mark === 'added')
          ? 'added'
          : 'same'
      if (row.editId && !decisionKeeps(rowMark, row.editId, decisions, true)) return []
      const cells = row.cells.flatMap((cell) => {
        if (!decisionKeeps(cell.mark, cell.editId, decisions, true)) return []
        const children = filterInline(cell.children, decisions, true)
        return children.length ? [{ ...cell, children }] : []
      })
      return cells.length ? [{ ...row, cells }] : []
    })
    if (rows.length) presented.push({ ...block, rows })
  }
  return presented
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeAttr(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;')
}

function markupAttrs(attrs: Record<string, string> | undefined, names: string[]): string {
  if (!attrs) return ''
  return names
    .filter((name) => attrs[name])
    .map((name) => ` ${name}="${escapeAttr(attrs[name])}"`)
    .join('')
}

function inlineHtml(nodes: InlineNode[], decisions: Record<string, EditDecision>): string {
  let html = ''
  for (const node of nodes) {
    if (node.type === 'link' || node.type === 'format') {
      const children = inlineHtml(node.children, decisions)
      if (!children) continue
      if (node.type === 'link') {
        const title = node.title ? ` title="${escapeAttr(node.title)}"` : ''
        html += `<a href="${escapeAttr(node.href)}"${title}>${children}</a>`
      } else {
        html += `<${node.tag}${markupAttrs(node.attrs, ['style'])}>${children}</${node.tag}>`
      }
      continue
    }
    if (!decisionKeeps(node.mark, node.editId, decisions, false)) continue
    if (node.type === 'break') html += '<br>'
    else if (node.type === 'image') {
      if (node.src) html += `<img src="${escapeAttr(node.src)}" alt="${escapeAttr(node.alt)}">`
      else html += escapeText(node.alt || 'Image')
    } else html += escapeText(node.text)
  }
  return html
}

function blocksToHtml(blocks: BlockNode[], decisions: Record<string, EditDecision>): string {
  let html = ''
  for (const block of blocks) {
    if (!decisionKeeps(block.mark, block.editId, decisions, false)) continue
    if (block.type === 'rule') {
      html += '<hr>'
      continue
    }
    if (block.type === 'block') {
      const children = inlineHtml(block.children, decisions)
      if (!children) continue
      const tag = ['p', 'div', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(block.tag) ? block.tag : 'p'
      html += `<${tag}${markupAttrs(block.attrs, ['style'])}>${children}</${tag}>`
      continue
    }
    if (block.type === 'list') {
      const items = block.items
        .filter((item) => decisionKeeps(item.mark, item.editId, decisions, false))
        .map((item) => {
          const children = `${inlineHtml(item.children, decisions)}${blocksToHtml(item.blocks, decisions)}`
          return children ? `<li${markupAttrs(item.attrs, ['style'])}>${children}</li>` : ''
        })
        .join('')
      if (items) html += `<${block.ordered ? 'ol' : 'ul'}${markupAttrs(block.attrs, ['style'])}>${items}</${block.ordered ? 'ol' : 'ul'}>`
      continue
    }
    const rows = block.rows
      .map((row) => {
        const rowMark = row.cells.some((cell) => cell.mark === 'removed')
          ? 'removed'
          : row.cells.some((cell) => cell.mark === 'added')
            ? 'added'
            : 'same'
        if (row.editId && !decisionKeeps(rowMark, row.editId, decisions, false)) return ''
        const cells = row.cells
          .filter((cell) => decisionKeeps(cell.mark, cell.editId, decisions, false))
          .map((cell) => {
            const children = inlineHtml(cell.children, decisions)
            if (!children) return ''
            const tag = cell.header ? 'th' : 'td'
            return `<${tag}${markupAttrs(cell.attrs, ['colspan', 'rowspan', 'style', 'headers', 'scope', 'id'])}>${children}</${tag}>`
          })
          .join('')
        return cells ? `<tr${markupAttrs(row.attrs, ['style'])}>${cells}</tr>` : ''
      })
      .join('')
    if (rows) html += `<table${markupAttrs(block.attrs, ['style', 'role'])}><tbody>${rows}</tbody></table>`
  }
  return html
}

function inlineText(nodes: InlineNode[], decisions: Record<string, EditDecision>): string {
  let text = ''
  for (const node of nodes) {
    if (node.type === 'link' || node.type === 'format') {
      text += inlineText(node.children, decisions)
      continue
    }
    if (!decisionKeeps(node.mark, node.editId, decisions, false)) continue
    if (node.type === 'text') text += node.text
    else if (node.type === 'break') text += '\n'
    else text += node.alt || 'Image'
  }
  return text
}

function blocksToText(blocks: BlockNode[], decisions: Record<string, EditDecision>): string {
  const parts: string[] = []
  for (const block of blocks) {
    if (!decisionKeeps(block.mark, block.editId, decisions, false)) continue
    if (block.type === 'rule') continue
    if (block.type === 'block') {
      const text = inlineText(block.children, decisions).trim()
      if (text) parts.push(text)
      continue
    }
    if (block.type === 'list') {
      for (const item of block.items) {
        if (!decisionKeeps(item.mark, item.editId, decisions, false)) continue
        const text = `${inlineText(item.children, decisions)} ${blocksToText(item.blocks, decisions)}`.trim()
        if (text) parts.push(text)
      }
      continue
    }
    for (const row of block.rows) {
      const cells = row.cells
        .filter((cell) => decisionKeeps(cell.mark, cell.editId, decisions, false))
        .map((cell) => inlineText(cell.children, decisions).trim())
        .filter(Boolean)
      if (cells.length) parts.push(cells.join(' '))
    }
  }
  return parts.join('\n')
}

function recordEdit(edits: Map<string, { removed: string; added: string }>, order: string[], id: string | undefined, mark: DiffMark, text: string) {
  if (!id || mark === 'same') return
  if (!edits.has(id)) {
    edits.set(id, { removed: '', added: '' })
    order.push(id)
  }
  edits.get(id)![mark] += text
}

function collectInline(nodes: InlineNode[], edits: Map<string, { removed: string; added: string }>, order: string[]) {
  for (const node of nodes) {
    if (node.type === 'link' || node.type === 'format') {
      collectInline(node.children, edits, order)
      continue
    }
    const text = node.type === 'text' ? node.text : node.type === 'break' ? '\n' : node.alt || 'Image'
    recordEdit(edits, order, node.editId, node.mark, text)
  }
}

export function listEdits(blocks: BlockNode[]): SuggestionEdit[] {
  const edits = new Map<string, { removed: string; added: string }>()
  const order: string[] = []
  const walk = (list: BlockNode[]) => {
    for (const block of list) {
      if (block.type === 'rule') {
        recordEdit(edits, order, block.editId, block.mark, 'line')
        continue
      }
      if (block.type === 'block') collectInline(block.children, edits, order)
      else if (block.type === 'list') {
        for (const item of block.items) {
          collectInline(item.children, edits, order)
          walk(item.blocks)
        }
      } else {
        for (const row of block.rows) for (const cell of row.cells) collectInline(cell.children, edits, order)
      }
    }
  }
  walk(blocks)
  return order.map((id) => {
    const edit = edits.get(id)!
    return { id, removed: edit.removed.replace(/\s+/g, ' ').trim(), added: edit.added.replace(/\s+/g, ' ').trim() }
  })
}

/**
 * Wording that Apply should save. With no passed edits this is the proposed source, unchanged.
 * Passed edits keep the original wording. The result is sanitized and contains no diff marks.
 */
export function resolvedField(
  original: string,
  proposed: string,
  decisions: Record<string, EditDecision>,
  plain = false,
): string {
  if (!Object.values(decisions).some((decision) => decision === 'pass')) return proposed
  const blocks = compareSuggestions(original, proposed).changes
  if (plain) return blocksToText(blocks, decisions).trim()
  return sanitizeRichHtml(blocksToHtml(blocks, decisions))
}

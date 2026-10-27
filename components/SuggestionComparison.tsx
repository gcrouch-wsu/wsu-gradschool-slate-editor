'use client'

import { createElement, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  compareSuggestions,
  listEdits,
  presentDecisions,
  resolvedField,
  suggestionHasContent,
  type BlockNode,
  type DiffMark,
  type EditDecision,
  type InlineNode,
  type SuggestionEdit,
} from '@/lib/ai/suggestion-diff'

const button =
  'inline-flex min-h-11 items-center justify-center rounded-md border px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wsu-crimson'

export default function SuggestionComparison({
  original,
  proposed,
  plain = false,
  onResolve,
}: {
  original: string
  proposed: string
  plain?: boolean
  onResolve?: (text: string) => void
}) {
  const [view, setView] = useState<'changes' | 'side'>('changes')
  const [decisions, setDecisions] = useState<Record<string, EditDecision>>({})
  const switcherRef = useRef<HTMLDivElement>(null)
  const legendId = useId()
  const hintId = useId()
  const views = useMemo(() => compareSuggestions(original, proposed), [original, proposed])
  const edits = useMemo(
    () => listEdits(views.changes).filter((edit) => edit.removed || edit.added),
    [views],
  )
  const shown = useMemo(() => presentDecisions(views.changes, decisions), [views, decisions])
  useEffect(() => {
    onResolve?.(resolvedField(original, proposed, decisions, plain))
  }, [decisions, onResolve, original, plain, proposed])

  function selectView(next: 'changes' | 'side') {
    setView(next)
    requestAnimationFrame(() => switcherRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }))
  }

  function onViewKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
    event.preventDefault()
    const next = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? 'changes' : 'side'
    selectView(next)
    switcherRef.current?.querySelector<HTMLButtonElement>(`[data-view="${next}"]`)?.focus()
  }

  function choose(id: string, decision: EditDecision) {
    setDecisions((current) => {
      const next = { ...current }
      if (current[id] === decision) delete next[id]
      else next[id] = decision
      return next
    })
  }

  return (
    <div className="mt-2 min-w-0">
      <div ref={switcherRef} className="sticky top-0 z-10 -mx-1 border-b border-wsu-border-light bg-white px-1 pb-2">
        <div
          className="flex flex-wrap gap-2 py-2"
          role="group"
          aria-label="Comparison view"
          aria-describedby={hintId}
          onKeyDown={onViewKey}
        >
          <button
            type="button"
            data-view="changes"
            className={`${button} ${view === 'changes' ? 'border-wsu-crimson bg-wsu-crimson text-white' : 'border-wsu-crimson bg-white text-wsu-crimson'}`}
            aria-pressed={view === 'changes'}
            onClick={() => selectView('changes')}
          >
            Changes
          </button>
          <button
            type="button"
            data-view="side"
            className={`${button} ${view === 'side' ? 'border-wsu-crimson bg-wsu-crimson text-white' : 'border-wsu-crimson bg-white text-wsu-crimson'}`}
            aria-pressed={view === 'side'}
            onClick={() => selectView(view === 'side' ? 'changes' : 'side')}
          >
            Side by side
          </button>
        </div>
        <p id={hintId} className="text-sm">
          Accept or pass each edit here. These choices stay available in Changes and Side by side.
        </p>
        <section aria-label="Individual edits" className="mt-2 rounded-md border border-wsu-border-light p-2">
          <h3 className="text-sm font-semibold">Individual edits</h3>
          <p className="mt-1 text-sm">
            Accept keeps the new wording. Pass keeps the original. Apply includes every edit you have not passed.
          </p>
          {edits.length === 0 ? (
            <p className="mt-2 text-sm">This suggestion has no separate edits. Apply suggestion uses the proposed wording.</p>
          ) : (
            <ul className="mt-2 max-h-48 space-y-2 overflow-y-auto">
              {edits.map((edit, index) => (
                <EditChoice key={edit.id} edit={edit} index={index} decision={decisions[edit.id]} onChoose={choose} />
              ))}
            </ul>
          )}
        </section>
      </div>
      {view === 'changes' && (
        <p id={legendId} className="mt-2 text-sm">
          <del className="bg-red-100 line-through decoration-red-800">Removed</del> text is struck out.{' '}
          <ins className="bg-green-100 underline decoration-green-800">Added</ins> text is underlined.
        </p>
      )}
      {view === 'changes' ? (
        <div className="mt-2 min-w-0 break-words [overflow-wrap:anywhere]" aria-label="Changes" aria-describedby={legendId}>
          <Rendered blocks={shown} />
        </div>
      ) : (
        <div className="mt-2 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
          <section aria-label="Original" className="min-w-0 break-words [overflow-wrap:anywhere]">
            <h3 className="text-sm font-semibold">Original</h3>
            <Rendered blocks={views.original} />
          </section>
          <section aria-label="Proposed" className="min-w-0 break-words [overflow-wrap:anywhere]">
            <h3 className="text-sm font-semibold">Proposed</h3>
            <Rendered blocks={views.proposed} />
          </section>
        </div>
      )}
    </div>
  )
}

function changeLabel(edit: SuggestionEdit): string {
  const clip = (value: string) => (value.length > 80 ? `${value.slice(0, 77)}...` : value)
  if (edit.removed && edit.added) return `${clip(edit.removed)} to ${clip(edit.added)}`
  if (edit.removed) return `removed ${clip(edit.removed)}`
  return `added ${clip(edit.added)}`
}

function EditChoice({
  edit,
  index,
  decision,
  onChoose,
}: {
  edit: SuggestionEdit
  index: number
  decision: EditDecision | undefined
  onChoose: (id: string, decision: EditDecision) => void
}) {
  const label = changeLabel(edit)
  return (
    <li className="min-w-0 rounded-md bg-wsu-bg-light p-2">
      <p className="text-sm font-semibold">Edit {index + 1}</p>
      <div className="mt-1 flex flex-wrap gap-2">
        <button
          type="button"
          className={`${button} ${decision === 'accept' ? 'border-wsu-crimson bg-wsu-crimson text-white' : 'border-wsu-crimson bg-white text-wsu-crimson'}`}
          aria-pressed={decision === 'accept'}
          aria-label={`Accept this edit: ${label}`}
          onClick={() => onChoose(edit.id, 'accept')}
        >
          {decision === 'accept' ? 'Accepted' : 'Accept'}
        </button>
        <button
          type="button"
          className={`${button} ${decision === 'pass' ? 'border-wsu-crimson bg-wsu-crimson text-white' : 'border-wsu-border-light bg-white'}`}
          aria-pressed={decision === 'pass'}
          aria-label={`Pass on this edit: ${label}`}
          onClick={() => onChoose(edit.id, 'pass')}
        >
          {decision === 'pass' ? 'Passed' : 'Pass'}
        </button>
      </div>
      <p className="mt-1 break-words text-sm">{label}</p>
    </li>
  )
}

function Rendered({ blocks }: { blocks: BlockNode[] }) {
  if (!suggestionHasContent(blocks)) return <p className="text-sm">(Empty)</p>
  return <div className="min-w-0">{blocks.map((block, index) => renderBlock(block, index))}</div>
}

function renderBlock(block: BlockNode, key: number): ReactNode {
  if (block.type === 'rule') return <hr key={key} className="my-2" />
  if (block.type === 'list') {
    const items = block.items.map((item, index) => (
      <li key={index} className="break-words">
        <RenderInline nodes={item.children} />
        {item.blocks.map((nested, nestedIndex) => renderBlock(nested, nestedIndex))}
      </li>
    ))
    return block.ordered ? (
      <ol key={key} className="my-2 list-decimal break-words pl-5">
        {items}
      </ol>
    ) : (
      <ul key={key} className="my-2 list-disc break-words pl-5">
        {items}
      </ul>
    )
  }
  if (block.type === 'table') {
    return (
      <div key={key} className="my-2 max-w-full overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <tbody>
            {block.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.cells.map((cell, cellIndex) =>
                  cell.header ? (
                    <th key={cellIndex} className="border border-wsu-border-light p-1 align-top break-words font-semibold">
                      <RenderInline nodes={cell.children} />
                    </th>
                  ) : (
                    <td key={cellIndex} className="border border-wsu-border-light p-1 align-top break-words">
                      <RenderInline nodes={cell.children} />
                    </td>
                  ),
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }
  const className = `my-1 break-words ${block.tag.startsWith('h') ? 'font-semibold' : ''} ${
    block.tag === 'blockquote' ? 'border-l-2 border-wsu-border-light pl-3' : ''
  }`
  const tag = ['p', 'div', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(block.tag) ? block.tag : 'p'
  return createElement(tag, { key, className }, <RenderInline nodes={block.children} />)
}

function RenderInline({ nodes }: { nodes: InlineNode[] }) {
  return nodes.map((node, index) => {
    if (node.type === 'text') return <TextRun key={index} text={node.text} mark={node.mark} />
    if (node.type === 'break') return <LineBreak key={index} mark={node.mark} />
    if (node.type === 'image') return <ImageRun key={index} alt={node.alt} src={node.src} mark={node.mark} />
    if (node.type === 'link') {
      return (
        <a
          key={index}
          href={node.href}
          title={node.title || undefined}
          className="break-words text-wsu-crimson underline"
          onClick={(event) => event.preventDefault()}
          onAuxClick={(event) => event.preventDefault()}
        >
          <RenderInline nodes={node.children} />
        </a>
      )
    }
    return createElement(node.tag, { key: index }, <RenderInline nodes={node.children} />)
  })
}

function TextRun({ text, mark }: { text: string; mark: DiffMark }) {
  if (mark === 'same') return <span className="break-words">{text}</span>
  const Tag = mark === 'added' ? 'ins' : 'del'
  const className =
    mark === 'added'
      ? 'break-words bg-green-100 underline decoration-green-800'
      : 'break-words bg-red-100 line-through decoration-red-800'
  const label = text.trim() ? `${mark === 'added' ? 'Added' : 'Removed'}: ${text.trim()}` : undefined
  return (
    <Tag aria-label={label} className={className}>
      {text}
    </Tag>
  )
}

function LineBreak({ mark }: { mark: DiffMark }) {
  if (mark === 'same') return <br />
  const Tag = mark === 'added' ? 'ins' : 'del'
  return (
    <Tag aria-label={mark === 'added' ? 'Added line break' : 'Removed line break'}>
      <br />
    </Tag>
  )
}

function ImageRun({ alt, src, mark }: { alt: string; src: string; mark: DiffMark }) {
  const label =
    mark === 'added' ? `Added image: ${alt || 'Image'}` : mark === 'removed' ? `Removed image: ${alt || 'Image'}` : undefined
  const className = mark === 'added' ? 'bg-green-100 underline' : mark === 'removed' ? 'bg-red-100 line-through' : ''
  const image = src ? (
    // Comparison display only. The saved field keeps its original markup.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className="inline h-auto max-w-full" />
  ) : (
    <span>{alt || 'Image'}</span>
  )
  if (!className) return <span aria-label={label}>{image}</span>
  const Tag = mark === 'added' ? 'ins' : 'del'
  return (
    <Tag aria-label={label} className={className}>
      {image}
    </Tag>
  )
}

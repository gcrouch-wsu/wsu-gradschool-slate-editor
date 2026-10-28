'use client'

import { createElement, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import {
  compareSuggestions,
  comparisonPassages,
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

export default function SuggestionComparison(props: {
  original: string
  proposed: string
  plain?: boolean
  onResolve?: (text: string) => void
}) {
  // A new proposal gets a fresh review; changing views preserves its decisions.
  return <Comparison key={JSON.stringify([props.original, props.proposed])} {...props} />
}

function Comparison({
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
  const [active, setActive] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const prefix = useId()
  const views = useMemo(() => compareSuggestions(original, proposed), [original, proposed])
  const edits = useMemo(() => listEdits(views.changes).filter((edit) => edit.removed || edit.added), [views])
  const passages = useMemo(() => comparisonPassages(views.changes), [views])
  const accepted = edits.filter((edit) => decisions[edit.id] === 'accept').length
  const passed = edits.filter((edit) => decisions[edit.id] === 'pass').length
  useEffect(() => {
    onResolve?.(resolvedField(original, proposed, decisions, plain))
  }, [decisions, onResolve, original, plain, proposed])

  function selectView(next: 'changes' | 'side') {
    setView(next)
    setActive(null)
  }
  function onViewKey(event: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
    event.preventDefault()
    const next = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? 'changes' : 'side'
    selectView(next)
    root.current?.querySelector<HTMLButtonElement>(`[data-view="${next}"]`)?.focus()
  }
  function openEdit(id: string) {
    setActive(id)
    requestAnimationFrame(() => {
      const panel = document.getElementById(`${prefix}-${id}-choices`)
      panel?.focus({ preventScroll: true })
      panel?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    })
  }
  function closeEdit() {
    const id = active
    setActive(null)
    document.getElementById(`${prefix}-${id}-trigger`)?.focus({ preventScroll: true })
  }
  function choose(id: string, decision?: EditDecision) {
    // Reset removes its own button. Keep focus inside the still-open choices.
    if (!decision) document.getElementById(`${prefix}-${id}-choices`)?.focus({ preventScroll: true })
    setDecisions((current) => {
      const next = { ...current }
      if (decision) next[id] = decision
      else delete next[id]
      return next
    })
  }
  return (
    <div
      ref={root}
      className="mt-2 min-w-0"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && active) {
          event.preventDefault()
          event.stopPropagation()
          event.nativeEvent.stopImmediatePropagation()
          closeEdit()
        }
      }}
    >
      <div className="flex flex-wrap gap-2 py-2" role="group" aria-label="Comparison view" onKeyDown={onViewKey}>
        {(['changes', 'side'] as const).map((next) => (
          <button
            key={next}
            type="button"
            data-view={next}
            className={`${button} ${view === next ? 'border-wsu-crimson bg-wsu-crimson text-white' : 'border-wsu-crimson bg-white text-wsu-crimson'}`}
            aria-pressed={view === next}
            onClick={() => selectView(next)}
          >
            {next === 'changes' ? 'Changes' : 'Side by side'}
          </button>
        ))}
      </div>
      <p className="text-sm">
        Accept keeps the proposed wording. Pass keeps the original. Reset choice clears only that review decision.
      </p>
      <p role="status" className="my-2 text-sm font-semibold">
        {accepted} accepted; {passed} passed; {edits.length - accepted - passed} unreviewed. Unreviewed edits will also
        be included when you apply.
      </p>
      {view === 'changes' && (
        <p id={`${prefix}-legend`} className="mb-3 text-sm">
          <del className="bg-red-100 line-through">Removed</del> text is struck out.{' '}
          <ins className="bg-green-100 underline">Added</ins> text is underlined. Select a mark or use Review edit below
          its passage.
        </p>
      )}
      <div
        aria-label={view === 'changes' ? 'Changes' : 'Side by side passages'}
        aria-describedby={view === 'changes' ? `${prefix}-legend` : undefined}
        className="space-y-4"
      >
        {passages.map((blocks, index) => {
          const local = listEdits(blocks).filter((edit) => edit.removed || edit.added)
          const originalChoices = Object.fromEntries(local.map((edit) => [edit.id, 'pass' as const]))
          const proposedChoices = Object.fromEntries(local.map((edit) => [edit.id, 'accept' as const]))
          return (
            <section
              key={index}
              aria-label={`Passage ${index + 1}`}
              className={`min-w-0 break-words [overflow-wrap:anywhere] ${local.length ? 'rounded-md border border-wsu-border-light p-3' : 'py-1'}`}
            >
              {view === 'changes' ? (
                <div
                  className="mx-auto max-w-prose cursor-default"
                  onClick={(event) => {
                    const mark = (event.target as HTMLElement).closest<HTMLElement>('[data-edit-id]')
                    if (mark?.dataset.editId) openEdit(mark.dataset.editId)
                  }}
                  onContextMenu={(event) => {
                    const mark = (event.target as HTMLElement).closest<HTMLElement>('[data-edit-id]')
                    if (mark?.dataset.editId) {
                      event.preventDefault()
                      openEdit(mark.dataset.editId)
                    }
                  }}
                >
                  <Rendered blocks={presentDecisions(blocks, decisions)} />
                </div>
              ) : (
                <div className="grid min-w-0 grid-cols-1 gap-4 md:grid-cols-2">
                  <section aria-label="Original" className="min-w-0">
                    <h3 className="mb-2 text-sm font-semibold">Original</h3>
                    <Rendered blocks={presentDecisions(blocks, originalChoices)} />
                  </section>
                  <section aria-label="Proposed" className="min-w-0">
                    <h3 className="mb-2 text-sm font-semibold">Proposed</h3>
                    <Rendered blocks={presentDecisions(blocks, proposedChoices)} />
                  </section>
                </div>
              )}
              {local.length > 0 && (
                <div className="mt-3 border-t border-wsu-border-light pt-2">
                  {view === 'changes' && (
                    <div className="flex flex-wrap gap-2">
                      {local.map((edit) => {
                        const number = edits.findIndex((item) => item.id === edit.id) + 1
                        return (
                          <button
                            key={edit.id}
                            type="button"
                            id={`${prefix}-${edit.id}-trigger`}
                            aria-expanded={active === edit.id}
                            aria-controls={`${prefix}-${edit.id}-choices`}
                            className={`${button} ${active === edit.id ? 'border-wsu-crimson bg-wsu-bg-light' : 'border-wsu-border-light'}`}
                            onClick={() => (active === edit.id ? closeEdit() : openEdit(edit.id))}
                          >
                            Review edit {number}
                            {decisions[edit.id] ? ` - ${decisions[edit.id] === 'accept' ? 'Accepted' : 'Passed'}` : ''}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {local
                    .filter((edit) => view === 'side' || active === edit.id)
                    .map((edit) => (
                      <EditChoice
                        key={edit.id}
                        edit={edit}
                        index={edits.findIndex((item) => item.id === edit.id)}
                        decision={decisions[edit.id]}
                        onChoose={choose}
                        panelId={`${prefix}-${edit.id}-choices`}
                        onClose={view === 'changes' ? closeEdit : undefined}
                      />
                    ))}
                </div>
              )}
            </section>
          )
        })}
      </div>
      {edits.length === 0 && <p className="mt-2 text-sm">There are no wording changes to review.</p>}
    </div>
  )
}

function changeLabel(edit: SuggestionEdit): string {
  if (edit.removed && edit.added) return `${edit.removed} to ${edit.added}`
  return edit.removed ? `removed ${edit.removed}` : `added ${edit.added}`
}
function EditChoice({
  edit,
  index,
  decision,
  onChoose,
  panelId,
  onClose,
}: {
  edit: SuggestionEdit
  index: number
  decision?: EditDecision
  onChoose: (id: string, decision?: EditDecision) => void
  panelId: string
  onClose?: () => void
}) {
  const label = changeLabel(edit)
  return (
    <div
      id={panelId}
      role="group"
      aria-label={`Edit ${index + 1} choices`}
      tabIndex={-1}
      className="mt-2 rounded-md border border-wsu-border-light bg-wsu-bg-light p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-wsu-crimson"
    >
      <p className="text-sm font-semibold">
        Edit {index + 1}: {decision === 'accept' ? 'Accepted' : decision === 'pass' ? 'Passed' : 'Unreviewed'}
      </p>
      <div className="my-2 grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2">
        <p className="min-w-0 break-words text-sm">
          <strong>Original: </strong>
          {edit.removed || '(Nothing)'}
        </p>
        <p className="min-w-0 break-words text-sm">
          <strong>Proposed: </strong>
          {edit.added || '(Nothing)'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`${button} border-wsu-crimson ${decision === 'accept' ? 'bg-wsu-crimson text-white' : 'bg-white text-wsu-crimson'}`}
          aria-pressed={decision === 'accept'}
          aria-label={`Accept this edit: ${label}`}
          onClick={() => onChoose(edit.id, 'accept')}
        >
          Accept
        </button>
        <button
          type="button"
          className={`${button} border-wsu-border-light ${decision === 'pass' ? 'bg-wsu-crimson text-white' : 'bg-white'}`}
          aria-pressed={decision === 'pass'}
          aria-label={`Pass on this edit: ${label}`}
          onClick={() => onChoose(edit.id, 'pass')}
        >
          Pass
        </button>
        {decision && (
          <button
            type="button"
            className={`${button} border-wsu-border-light bg-white`}
            aria-label={`Reset choice for edit ${index + 1}`}
            onClick={() => onChoose(edit.id)}
          >
            Reset choice
          </button>
        )}
        {onClose && (
          <button type="button" className={`${button} border-wsu-border-light bg-white`} onClick={onClose}>
            Close choices
          </button>
        )}
      </div>
    </div>
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
                    <th
                      key={cellIndex}
                      className="border border-wsu-border-light p-1 align-top break-words font-semibold"
                    >
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
    if (node.type === 'text') return <TextRun key={index} text={node.text} mark={node.mark} editId={node.editId} />
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

function TextRun({ text, mark, editId }: { text: string; mark: DiffMark; editId?: string }) {
  if (mark === 'same') return <span className="break-words">{text}</span>
  const Tag = mark === 'added' ? 'ins' : 'del'
  const className =
    mark === 'added'
      ? 'break-words bg-green-100 underline decoration-green-800'
      : 'break-words bg-red-100 line-through decoration-red-800'
  const label = text.trim() ? `${mark === 'added' ? 'Added' : 'Removed'}: ${text.trim()}` : undefined
  return (
    <Tag data-edit-id={editId} aria-label={label} className={`${className} cursor-pointer`}>
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
    mark === 'added'
      ? `Added image: ${alt || 'Image'}`
      : mark === 'removed'
        ? `Removed image: ${alt || 'Image'}`
        : undefined
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

'use client'

import { createElement, useId, useMemo, useState, type ReactNode } from 'react'
import {
  compareSuggestions,
  suggestionHasContent,
  type BlockNode,
  type DiffMark,
  type InlineNode,
} from '@/lib/ai/suggestion-diff'

const button =
  'inline-flex min-h-11 items-center justify-center rounded-md border px-3 py-2 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-wsu-crimson'

export default function SuggestionComparison({ original, proposed }: { original: string; proposed: string }) {
  const [view, setView] = useState<'changes' | 'side'>('changes')
  const legendId = useId()
  const views = useMemo(() => compareSuggestions(original, proposed), [original, proposed])
  const selected = view === 'changes' ? views.changes : null
  return (
    <div className="mt-2 min-w-0">
      <div className="flex flex-wrap gap-2" role="group" aria-label="Comparison view">
        <button
          type="button"
          className={`${button} ${view === 'changes' ? 'border-wsu-crimson bg-wsu-crimson text-white' : 'border-wsu-crimson bg-white text-wsu-crimson'}`}
          aria-pressed={view === 'changes'}
          onClick={() => setView('changes')}
        >
          Changes
        </button>
        <button
          type="button"
          className={`${button} ${view === 'side' ? 'border-wsu-crimson bg-wsu-crimson text-white' : 'border-wsu-crimson bg-white text-wsu-crimson'}`}
          aria-pressed={view === 'side'}
          onClick={() => setView('side')}
        >
          Side by side
        </button>
      </div>
      {view === 'changes' && (
        <p id={legendId} className="mt-2 text-sm">
          <del className="bg-red-100 line-through decoration-red-800">Removed</del> text is struck out.{' '}
          <ins className="bg-green-100 underline decoration-green-800">Added</ins> text is underlined.
        </p>
      )}
      {view === 'changes' ? (
        <div
          className="mt-2 min-w-0 break-words [overflow-wrap:anywhere]"
          aria-label="Changes"
          aria-describedby={legendId}
        >
          <Rendered blocks={selected ?? []} />
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
        <a key={index} href={node.href} title={node.title || undefined} className="break-words text-wsu-crimson underline">
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
  const className =
    mark === 'added' ? 'bg-green-100 underline' : mark === 'removed' ? 'bg-red-100 line-through' : ''
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

// Preview is sandboxed so newsletter HTML cannot run scripts, submit forms, or navigate the parent page.
// allow-same-origin (without allow-scripts) lets the editor size the preview and scroll it to the part being edited.

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface PreviewPanelProps {
  html: string
  loading: boolean
  onRefresh: () => void
  error?: string | null
  /** data-preview-target of the part being edited, such as "masthead" or "story-0-1". */
  target?: string | null
}

const widths = { desktop: 600, phone: 375 } as const

export default function PreviewPanel({ html, loading, onRefresh, error = null, target = null }: PreviewPanelProps) {
  const [width, setWidth] = useState<keyof typeof widths>('desktop')
  const [height, setHeight] = useState(0)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const scrollerRef = useRef<HTMLDivElement>(null)
  const pending = useRef<string | null>(null)

  // The email sets html and body to 100% height, so measure the content instead of the document.
  const measure = useCallback(() => {
    const body = frameRef.current?.contentDocument?.body
    if (!body) return
    const bottom = Math.max(0, ...Array.from(body.children, (child) => child.getBoundingClientRect().bottom))
    if (bottom > 0) setHeight(Math.ceil(bottom))
  }, [])

  const follow = useCallback((name: string) => {
    const frame = frameRef.current
    const scroller = scrollerRef.current
    const element = frame?.contentDocument?.querySelector<HTMLElement>(`[data-preview-target="${CSS.escape(name)}"]`)
    if (!frame || !scroller || !element) return false
    // On narrow screens the page scrolls instead, and the preview is not shown beside the editor.
    if (scroller.scrollHeight > scroller.clientHeight + 1) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      scroller.scrollTo({
        top: Math.max(0, frame.offsetTop + element.getBoundingClientRect().top - 12),
        behavior: reduce ? 'auto' : 'smooth',
      })
    }
    element.style.outline = '3px solid #A60F2D'
    element.style.outlineOffset = '2px'
    window.setTimeout(() => {
      element.style.outline = ''
      element.style.outlineOffset = ''
    }, 1500)
    return true
  }, [])

  useEffect(() => {
    if (!target) return
    pending.current = follow(target) ? null : target
  }, [target, follow])

  useEffect(() => {
    const frame = requestAnimationFrame(measure)
    return () => cancelAnimationFrame(frame)
  }, [width, measure])

  useEffect(() => {
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [measure])

  const loaded = () => {
    const doc = frameRef.current?.contentDocument
    measure()
    // Late images change the height.
    doc?.addEventListener('load', measure, true)
    if (pending.current && follow(pending.current)) pending.current = null
  }

  return (
    <aside aria-label="Newsletter Preview" className="flex h-full flex-col bg-wsu-bg-light">
      <div className="flex flex-wrap justify-between items-center gap-2 p-3 bg-white border-b border-wsu-border-light">
        <span className="text-sm text-wsu-text-muted">
          <strong>Preview</strong> - Approximate. Check the message in Slate before sending.
        </span>
        <div className="flex flex-wrap gap-2">
          <div className="flex gap-1" role="group" aria-label="Preview width">
            {(Object.keys(widths) as (keyof typeof widths)[]).map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={width === option}
                onClick={() => setWidth(option)}
                className={`min-h-11 px-3 py-1.5 text-sm font-medium border rounded-md transition-colors ${
                  width === option
                    ? 'bg-wsu-crimson border-wsu-crimson text-white'
                    : 'bg-white border-wsu-border-light text-wsu-text-body hover:bg-wsu-bg-light'
                }`}
              >
                {option === 'desktop' ? 'Desktop width' : 'Phone width'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="min-h-11 px-3 py-1.5 text-sm font-medium text-wsu-text-body bg-white border border-wsu-border-light rounded-md hover:bg-wsu-bg-light transition-colors"
          >
            <RefreshCw className="w-4 h-4 inline-block mr-1" />
            Refresh Preview
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="px-3 py-2 text-sm text-red-800 bg-white border-b border-wsu-border-light">
          The preview could not be updated: {error} Choose Refresh Preview to try again.
        </p>
      )}
      {/* The preview is as tall as the newsletter; this area scrolls without a visible scroll bar. */}
      <div
        ref={scrollerRef}
        tabIndex={0}
        aria-label="Preview content"
        role="region"
        className="scrollbar-hidden relative min-h-0 flex-1 overflow-x-auto overflow-y-auto focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-wsu-crimson"
      >
        <iframe
          ref={frameRef}
          title="Newsletter Preview"
          sandbox="allow-same-origin"
          srcDoc={html}
          onLoad={loaded}
          scrolling="no"
          className="mx-auto block max-w-full border-0 bg-white"
          style={{
            width: widths[width],
            height: height || 600,
            opacity: loading ? 0.5 : 1,
            transition: 'opacity 0.2s',
          }}
        />
      </div>
    </aside>
  )
}

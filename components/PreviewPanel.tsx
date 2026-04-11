// components/editor/PreviewPanel.tsx - Preview panel component

import { useEffect, useRef } from 'react'
import { RefreshCw } from 'lucide-react'

interface PreviewPanelProps {
  html: string
  loading: boolean
  onRefresh: () => void
}

export default function PreviewPanel({
  html,
  loading,
  onRefresh,
}: PreviewPanelProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (iframeRef.current && html) {
      try {
        // Prefer srcdoc to avoid cross-origin issues
        iframeRef.current.removeAttribute('src')
        iframeRef.current.srcdoc = html
        
        // Set iframe height after content loads
        setTimeout(() => {
          if (iframeRef.current?.contentDocument?.body) {
            const height = iframeRef.current.contentDocument.body.scrollHeight
            iframeRef.current.style.height = `${Math.max(600, height)}px`
          }
        }, 120)
      } catch (e) {
        // Fallback: reset to about:blank, then inject
        try {
          if (iframeRef.current) {
            iframeRef.current.src = 'about:blank'
            iframeRef.current.onload = () => {
              const doc =
                iframeRef.current?.contentDocument ||
                iframeRef.current?.contentWindow?.document
              if (doc) {
                doc.open()
                doc.write(html)
                doc.close()
                if (doc.body) {
                  iframeRef.current!.style.height = `${Math.max(600, doc.body.scrollHeight)}px`
                }
              }
            }
          }
        } catch (fallbackError) {
          // Fallback failed silently
        }
      }
    }
  }, [html])

  return (
    <aside className="flex flex-col h-[calc(100vh-52px)] bg-wsu-bg-light">
      <div className="flex justify-between items-center p-3 bg-white border-b border-wsu-border-light">
        <span className="text-sm text-wsu-text-muted">
          <strong>Live Preview</strong> - What you see is what Slate will send
        </span>
        <button
          onClick={onRefresh}
          className="px-3 py-1.5 text-sm font-medium text-wsu-text-body bg-white border border-wsu-border-light rounded-md hover:bg-wsu-bg-light transition-colors"
        >
          <RefreshCw className="w-4 h-4 inline-block mr-1" />
          Refresh Preview
        </button>
      </div>
      <iframe
        ref={iframeRef}
        title="Newsletter Preview"
        className="flex-1 w-full border-0 bg-wsu-bg-light"
        style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}
      />
    </aside>
  )
}


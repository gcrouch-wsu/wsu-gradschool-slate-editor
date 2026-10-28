// Preview is sandboxed so newsletter HTML cannot script the editor, submit forms, or navigate the parent page.

'use client'

import { useState } from 'react'
import { RefreshCw } from 'lucide-react'

interface PreviewPanelProps {
  html: string
  loading: boolean
  onRefresh: () => void
  error?: string | null
}

const widths = { desktop: 600, phone: 375 } as const

export default function PreviewPanel({ html, loading, onRefresh, error = null }: PreviewPanelProps) {
  const [width, setWidth] = useState<keyof typeof widths>('desktop')
  return (
    <aside aria-label="Newsletter Preview" className="flex flex-col h-[calc(100vh-52px)] bg-wsu-bg-light">
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
      <div className="flex-1 min-h-0 overflow-x-auto">
        <iframe
          title="Newsletter Preview"
          sandbox=""
          srcDoc={html}
          className="mx-auto block h-full max-w-full border-0 bg-white"
          style={{ width: widths[width], opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}
        />
      </div>
    </aside>
  )
}

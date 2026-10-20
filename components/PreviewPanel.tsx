// Preview is sandboxed so newsletter HTML cannot script the editor, submit forms, or navigate the parent page.

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
  return (
    <aside aria-label="Newsletter Preview" className="flex flex-col h-[calc(100vh-52px)] bg-wsu-bg-light">
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
        title="Newsletter Preview"
        sandbox=""
        srcDoc={html}
        className="flex-1 w-full border-0 bg-white"
        style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.2s' }}
      />
    </aside>
  )
}

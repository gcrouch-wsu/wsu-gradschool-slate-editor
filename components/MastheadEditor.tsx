// components/editor/MastheadEditor.tsx - Masthead editor component

import type { NewsletterData } from '@/types/newsletter'

interface MastheadEditorProps {
  state: NewsletterData
  updateState: (
    updater: (prev: NewsletterData) => NewsletterData,
    pushHistory?: boolean
  ) => void
}

export default function MastheadEditor({
  state,
  updateState,
}: MastheadEditorProps) {
  const masthead = state.masthead || {}

  return (
    <div className="space-y-4">
      <div>
        <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
          Banner Image URL
        </label>
        <input
          type="url"
          value={masthead.banner_url || ''}
          onChange={(e) =>
            updateState((prev) => ({
              ...prev,
              masthead: { ...prev.masthead, banner_url: e.target.value },
            }))
          }
          placeholder="https://..."
          className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
        />
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
          Banner Alt Text
        </label>
        <input
          type="text"
          value={masthead.banner_alt || ''}
          onChange={(e) =>
            updateState((prev) => ({
              ...prev,
              masthead: { ...prev.masthead, banner_alt: e.target.value },
            }))
          }
          placeholder="Descriptive text for screen readers"
          className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
        />
      </div>

      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={masthead.hero_show !== false}
            onChange={(e) =>
              updateState((prev) => ({
                ...prev,
                masthead: { ...prev.masthead, hero_show: e.target.checked },
              }))
            }
            className="rounded border-wsu-border-light text-wsu-crimson focus:ring-wsu-crimson"
          />
          <span className="text-sm font-medium text-wsu-text-dark">
            Show Banner Image
          </span>
        </label>
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
          Banner Link URL (optional)
        </label>
        <input
          type="url"
          value={masthead.hero_link || ''}
          onChange={(e) =>
            updateState((prev) => ({
              ...prev,
              masthead: { ...prev.masthead, hero_link: e.target.value },
            }))
          }
          placeholder="https://..."
          className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
        />
        <p className="mt-1 text-xs text-wsu-text-muted">
          Make banner clickable by adding a link.
        </p>
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
          Banner Alignment
        </label>
        <select
          value={masthead.banner_align || 'center'}
          onChange={(e) =>
            updateState((prev) => ({
              ...prev,
              masthead: {
                ...prev.masthead,
                banner_align: e.target.value as 'left' | 'center' | 'right',
              },
            }))
          }
          className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
        >
          <option value="left">Left</option>
          <option value="center">Center (Most Compatible)</option>
          <option value="right">Right</option>
        </select>
        <p className="mt-1 text-xs text-wsu-text-muted">
          Center works best in all email clients. Right alignment may not work in older Outlook versions.
        </p>
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
          Newsletter Title
        </label>
        <input
          type="text"
          value={masthead.title || ''}
          onChange={(e) =>
            updateState((prev) => ({
              ...prev,
              masthead: { ...prev.masthead, title: e.target.value },
            }))
          }
          placeholder="e.g., Friday Focus Newsletter"
          className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
        />
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
          Tagline
        </label>
        <input
          type="text"
          value={masthead.tagline || ''}
          onChange={(e) =>
            updateState((prev) => ({
              ...prev,
              masthead: { ...prev.masthead, tagline: e.target.value },
            }))
          }
          placeholder="e.g., A bimonthly newsletter for graduate students"
          className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
        />
      </div>

      <div>
        <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
          Preheader Text
        </label>
        <input
          type="text"
          value={masthead.preheader || ''}
          onChange={(e) =>
            updateState((prev) => ({
              ...prev,
              masthead: { ...prev.masthead, preheader: e.target.value },
            }))
          }
          placeholder="Hidden preview text shown in inbox"
          className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
        />
        <p className="mt-1 text-xs text-wsu-text-muted">
          {masthead.preheader?.length || 0}/90 characters (optimal: 40–90)
          {masthead.preheader && masthead.preheader.length > 90 && (
            <span className="text-red-600 ml-1">⚠ May be truncated</span>
          )}
        </p>
        <p className="mt-1 text-xs text-wsu-text-muted">
          This text appears in email client previews but is hidden in the email itself.
        </p>
      </div>
    </div>
  )
}


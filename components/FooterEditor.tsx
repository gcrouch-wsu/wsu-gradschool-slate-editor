// components/editor/FooterEditor.tsx - Footer editor component

'use client'

import { useState, useRef, useEffect } from 'react'
import type { NewsletterData, SocialLink } from '@/types/newsletter'
import { Plus, Trash2 } from 'lucide-react'
import ColorPicker from './ColorPicker'

interface FooterEditorProps {
  state: NewsletterData
  updateState: (
    updater: (prev: NewsletterData) => NewsletterData,
    pushHistory?: boolean
  ) => void
}

// Editable tag component for social link fields
function EditableTag({
  value,
  placeholder,
  onSave,
  type = 'text',
  truncateUrl = false,
}: {
  value: string
  placeholder: string
  onSave: (value: string) => void
  type?: 'text' | 'url'
  truncateUrl?: boolean
}) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    setEditValue(value)
  }, [value])

  // Truncate URL for display: show ".tld..." after common TLDs
  const truncateUrlDisplay = (url: string): string => {
    if (!truncateUrl || !url) return url
    
    const urlLower = url.toLowerCase()
    
    // Common TLDs to check for (ordered by length descending to match longer ones first)
    // This prevents matching ".co" when ".com" exists
    const tlds = [
      '.online', '.store', '.tech', '.travel', '.info', '.biz', '.name', '.mobi', '.asia', '.jobs',
      '.com', '.net', '.org', '.edu', '.gov', '.mil', '.int',
      '.co', '.io', '.ai', '.us', '.uk', '.ca', '.au', '.de', '.fr', '.app', '.dev', '.site'
    ]
    
    // Find the first (leftmost) matching TLD in the URL
    // When multiple TLDs match at the same position, prefer the longer one
    let bestMatch: { index: number; length: number } | null = null
    
    for (const tld of tlds) {
      const index = urlLower.indexOf(tld)
      if (index !== -1) {
        // If no match yet, or this match is earlier, or same position but longer
        if (
          !bestMatch ||
          index < bestMatch.index ||
          (index === bestMatch.index && tld.length > bestMatch.length)
        ) {
          bestMatch = { index, length: tld.length }
        }
      }
    }
    
    // If no TLD found, return original URL
    if (!bestMatch) return url
    
    // Return everything up to and including the TLD plus "..."
    return url.substring(0, bestMatch.index + bestMatch.length) + '...'
  }

  const handleClick = () => {
    setIsEditing(true)
  }

  const handleBlur = () => {
    handleSave()
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleSave()
    } else if (e.key === 'Escape') {
      setEditValue(value)
      setIsEditing(false)
    }
  }

  const handleSave = () => {
    const trimmedValue = editValue.trim()
    if (trimmedValue !== value) {
      onSave(trimmedValue)
    }
    setIsEditing(false)
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type={type}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="px-3 py-1.5 text-sm border-2 border-wsu-crimson rounded-lg focus:outline-none focus:ring-2 focus:ring-wsu-crimson min-w-[150px] bg-white"
        placeholder={placeholder}
      />
    )
  }

  const displayValue = truncateUrl ? truncateUrlDisplay(value) : value
  const displayTitle = truncateUrl && value ? value : undefined // Show full URL in tooltip when truncated

  return (
    <button
      onClick={handleClick}
      type="button"
      className="px-3 py-1.5 text-sm font-medium bg-white border border-wsu-border-light rounded-lg hover:bg-wsu-bg-light hover:border-wsu-crimson/50 transition-all cursor-pointer shadow-sm text-left w-full"
      title={displayTitle || 'Click to edit'}
    >
      <span className={value ? 'text-wsu-text-dark' : 'text-wsu-text-muted italic'}>
        {displayValue || placeholder}
      </span>
    </button>
  )
}

export default function FooterEditor({
  state,
  updateState,
}: FooterEditorProps) {
  const footer = state.footer || {
    address_lines: [],
    social: [],
    background_color: '#2A3033',
    text_color: '#cccccc',
    link_color: '#ffffff',
  }

  const addAddressLine = () => {
    updateState(
      (prev) => ({
        ...prev,
        footer: {
          ...prev.footer,
          address_lines: [
            ...(prev.footer?.address_lines || []),
            'New address line',
          ],
        },
      }),
      true
    )
  }

  const updateAddressLine = (index: number, value: string) => {
    updateState((prev) => {
      const newAddressLines = [...(prev.footer?.address_lines || [])]
      newAddressLines[index] = value
      return {
        ...prev,
        footer: { ...prev.footer, address_lines: newAddressLines },
      }
    })
  }

  const removeAddressLine = (index: number) => {
    updateState(
      (prev) => {
        const newAddressLines = [...(prev.footer?.address_lines || [])]
        newAddressLines.splice(index, 1)
        return {
          ...prev,
          footer: { ...prev.footer, address_lines: newAddressLines },
        }
      },
      true
    )
  }

  const addSocialLink = () => {
    updateState(
      (prev) => ({
        ...prev,
        footer: {
          ...prev.footer,
          social: [
            ...(prev.footer?.social || []),
            {
              platform: 'Twitter',
              url: 'https://twitter.com/',
              icon: 'https://example.com/twitter-icon.png',
              alt: 'Twitter',
            },
          ],
        },
      }),
      true
    )
  }

  const updateSocialLink = (index: number, link: SocialLink) => {
    updateState((prev) => {
      const newSocial = [...(prev.footer?.social || [])]
      newSocial[index] = link
      return {
        ...prev,
        footer: { ...prev.footer, social: newSocial },
      }
    })
  }

  const removeSocialLink = (index: number) => {
    updateState(
      (prev) => {
        const newSocial = [...(prev.footer?.social || [])]
        newSocial.splice(index, 1)
        return {
          ...prev,
          footer: { ...prev.footer, social: newSocial },
        }
      },
      true
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <h4 className="mb-2 text-sm font-semibold text-wsu-text-dark">
          Address Lines
        </h4>
        <div className="space-y-2">
          {(footer.address_lines || []).map((line, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={line}
                onChange={(e) => updateAddressLine(index, e.target.value)}
                className="flex-1 px-2 py-1 text-sm border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
              />
              <button
                onClick={() => removeAddressLine(index)}
                className="p-1 text-red-600 hover:text-red-700"
                title="Remove"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
        <button
          onClick={addAddressLine}
          className="mt-2 px-3 py-1.5 text-sm font-medium text-wsu-crimson border border-wsu-crimson rounded-md hover:bg-wsu-crimson/10 transition-colors flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Add Address Line
        </button>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-wsu-text-dark">
          Social Media Links
        </h4>
        <div className="space-y-3">
          {(footer.social || []).map((link, index) => (
            <div
              key={index}
              className="p-3 bg-wsu-bg-light border border-wsu-border-light rounded-lg space-y-2"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-wsu-text-muted">
                  Link #{index + 1}
                </span>
                <button
                  onClick={() => removeSocialLink(index)}
                  className="p-1 text-red-600 hover:text-red-700 flex-shrink-0"
                  title="Remove"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                <div className="flex flex-col gap-1.5 min-w-[150px]">
                  <label className="text-xs font-medium text-wsu-text-dark">
                    Platform
                  </label>
                  <EditableTag
                    value={link.platform || ''}
                    placeholder="e.g., Twitter"
                    onSave={(value) =>
                      updateSocialLink(index, {
                        ...link,
                        platform: value,
                        alt: value || link.alt,
                      })
                    }
                    type="text"
                  />
                </div>
                <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                  <label className="text-xs font-medium text-wsu-text-dark">
                    Profile URL
                  </label>
                  <EditableTag
                    value={link.url || ''}
                    placeholder="https://..."
                    onSave={(value) =>
                      updateSocialLink(index, { ...link, url: value })
                    }
                    type="url"
                    truncateUrl={true}
                  />
                </div>
                <div className="flex flex-col gap-1.5 flex-1 min-w-[200px]">
                  <label className="text-xs font-medium text-wsu-text-dark">
                    Icon URL
                  </label>
                  <EditableTag
                    value={link.icon || ''}
                    placeholder="https://..."
                    onSave={(value) =>
                      updateSocialLink(index, { ...link, icon: value })
                    }
                    type="url"
                    truncateUrl={true}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={addSocialLink}
          className="mt-2 px-3 py-1.5 text-sm font-medium text-wsu-crimson border border-wsu-crimson rounded-md hover:bg-wsu-crimson/10 transition-colors flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Add Social Link
        </button>
      </div>

      <div>
        <h4 className="mb-2 text-sm font-semibold text-wsu-text-dark">
          Footer Styling
        </h4>
        <div className="space-y-3">
          <ColorPicker
            label="Background Color"
            value={footer.background_color || '#2A3033'}
            onChange={(color) =>
              updateState((prev) => ({
                ...prev,
                footer: {
                  ...prev.footer,
                  background_color: color,
                },
              }))
            }
          />
          <ColorPicker
            label="Text Color"
            value={footer.text_color || '#cccccc'}
            onChange={(color) =>
              updateState((prev) => ({
                ...prev,
                footer: { ...prev.footer, text_color: color },
              }))
            }
          />
          <ColorPicker
            label="Link Color"
            value={footer.link_color || '#ffffff'}
            onChange={(color) =>
              updateState((prev) => ({
                ...prev,
                footer: { ...prev.footer, link_color: color },
              }))
            }
          />
        </div>
      </div>
    </div>
  )
}


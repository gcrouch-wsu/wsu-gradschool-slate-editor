// components/editor/CardEditor.tsx - Card editor component

'use client'

import { useState } from 'react'
import type { Card, Link, Shadow } from '@/types/newsletter'
import { Plus, Trash2 } from 'lucide-react'
import { CTA_BUTTON_DEFAULTS } from '@/lib/config'
import dynamic from 'next/dynamic'
import ColorPicker from './ColorPicker'

// Dynamically import TiptapEditor to avoid SSR issues
const TiptapEditor = dynamic(() => import('./TiptapEditor'), {
  ssr: false,
  loading: () => (
    <div className="border border-wsu-border-light rounded-md p-4 bg-white min-h-[200px] flex items-center justify-center text-wsu-text-muted">
      Loading editor...
    </div>
  ),
})

interface CardEditorProps {
  card: Card
  onSave: (card: Card) => void
  onCancel: () => void
  onDelete?: () => void
}

export default function CardEditor({
  card,
  onSave,
  onCancel,
  onDelete,
}: CardEditorProps) {
  const [editedCard, setEditedCard] = useState<Card>(card)

  const updateCard = (updates: Partial<Card>) => {
    setEditedCard((prev) => ({ ...prev, ...updates } as Card))
  }

  // Helper to update padding - filters out undefined values
  const updatePadding = (key: 'top' | 'right' | 'bottom' | 'left', value: string) => {
    const numValue = value === '' ? undefined : parseInt(value) || 0
    const newPadding = { ...editedCard.padding }

    if (numValue === undefined) {
      // Remove the key entirely if value is empty
      delete newPadding[key]
    } else {
      // Set the value
      newPadding[key] = numValue
    }

    // Only set padding if there are any keys left, otherwise set to undefined
    updateCard({
      padding: Object.keys(newPadding).length > 0 ? newPadding : undefined,
    })
  }

  const updateLink = (index: number, link: Link) => {
    const newLinks = [...(editedCard.links || [])]
    newLinks[index] = link
    updateCard({ links: newLinks })
  }

  const addLink = () => {
    const newLinks = [...(editedCard.links || []), { label: '', url: '' }]
    updateCard({ links: newLinks })
  }

  const removeLink = (index: number) => {
    const newLinks = editedCard.links?.filter((_, i) => i !== index) || []
    updateCard({ links: newLinks })
  }

  // Helper to get button shadow (for CTA cards)
  const getButtonShadow = (): Shadow => {
    if (editedCard.type === 'cta' && editedCard.button_shadow) {
      return editedCard.button_shadow
    }
    return {
      enabled: false,
      color: '#000000',
      blur: 8,
      spread: 0,
      offset_x: 0,
      offset_y: 2,
      opacity: 0.3,
    }
  }

  // Helper to update button shadow
  const updateButtonShadow = (updates: Partial<Shadow>) => {
    if (editedCard.type === 'cta') {
      const currentShadow = getButtonShadow()
      updateCard({ button_shadow: { ...currentShadow, ...updates } } as Partial<Card>)
    }
  }

  const handleSave = () => {
    onSave(editedCard)
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 z-10 bg-white border-b border-wsu-border-light p-4 flex items-center justify-between shadow-sm">
          <h2 className="text-xl font-semibold text-wsu-text-dark">
            Edit Card ({editedCard.type})
          </h2>
          <div className="flex gap-2">
            {onDelete && (
              <button
                onClick={onDelete}
                className="px-3 py-1.5 text-sm font-medium text-red-600 border border-red-600 rounded-md hover:bg-red-50 transition-colors flex items-center gap-1"
              >
                <Trash2 className="w-4 h-4" />
                Delete
              </button>
            )}
            <button
              onClick={onCancel}
              className="px-3 py-1.5 text-sm font-medium text-wsu-text-muted border border-wsu-border-light rounded-md hover:bg-wsu-bg-light transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-3 py-1.5 text-sm font-medium text-white bg-wsu-crimson border border-wsu-crimson-dark rounded-md hover:bg-wsu-crimson-dark transition-colors"
            >
              Save
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4">
          {/* Title - Only show for card types that have a title property */}
          {'title' in editedCard && (
            <div>
              <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                Title *
              </label>
              <input
                type="text"
                value={editedCard.title || ''}
                onChange={(e) => updateCard({ title: e.target.value })}
                className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                placeholder="Card title"
              />
            </div>
          )}

          {/* Body HTML - Rich Text Editor */}
          <div>
            <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
              Body Content *
            </label>
            <TiptapEditor
              value={editedCard.body_html || ''}
              onChange={(value) => {
                updateCard({ body_html: value })
              }}
              placeholder="Enter card content..."
              style={{
                minHeight: '200px',
              }}
            />
            <p className="mt-1 text-xs text-wsu-text-muted">
              Use the toolbar to format your content with bold, italic, lists, links, tables, and more.
            </p>
          </div>

          {/* Location, Date, Time (for standard, event, resource cards) */}
          {(editedCard.type === 'standard' ||
            editedCard.type === 'event' ||
            editedCard.type === 'resource') && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                    Location
                  </label>
                  <input
                    type="text"
                    value={editedCard.location || ''}
                    onChange={(e) => updateCard({ location: e.target.value })}
                    className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                    placeholder="Location"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                    Date
                  </label>
                  <input
                    type="text"
                    value={editedCard.date || ''}
                    onChange={(e) => updateCard({ date: e.target.value })}
                    className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                    placeholder="Date"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                    Time
                  </label>
                  <input
                    type="text"
                    value={editedCard.time || ''}
                    onChange={(e) => updateCard({ time: e.target.value })}
                    className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                    placeholder="Time"
                  />
                </div>
              </div>
            </>
          )}

          {/* Resource Card Specific Fields */}
          {editedCard.type === 'resource' && (
            <div className="border-t border-wsu-border-light pt-4 space-y-4">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="show_icon"
                  checked={editedCard.show_icon || false}
                  onChange={(e) =>
                    updateCard({ show_icon: e.target.checked })
                  }
                  className="w-4 h-4 text-wsu-crimson border-wsu-border-light rounded focus:ring-wsu-crimson"
                />
                <label
                  htmlFor="show_icon"
                  className="text-sm font-medium text-wsu-text-dark"
                >
                  Show Icon
                </label>
              </div>
              {editedCard.show_icon && (
                <>
                  <div>
                    <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                      Icon URL
                    </label>
                    <input
                      type="url"
                      value={editedCard.icon_url || ''}
                      onChange={(e) =>
                        updateCard({ icon_url: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                      Icon Alt Text
                    </label>
                    <input
                      type="text"
                      value={editedCard.icon_alt || ''}
                      onChange={(e) =>
                        updateCard({ icon_alt: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                      placeholder="Icon description"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                      Icon Size (px)
                    </label>
                    <input
                      type="number"
                      min="20"
                      max="200"
                      value={editedCard.icon_size || 80}
                      onChange={(e) =>
                        updateCard({
                          icon_size: parseInt(e.target.value) || 80,
                        })
                      }
                      className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* Letter Card Specific Fields */}
          {editedCard.type === 'letter' && (
            <div className="border-t border-wsu-border-light pt-4 space-y-4">
              <div>
                <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                  Greeting
                </label>
                <input
                  type="text"
                  value={editedCard.greeting || ''}
                  onChange={(e) => updateCard({ greeting: e.target.value })}
                  className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                  placeholder="e.g., Dear Graduate Students,"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                  Closing
                </label>
                <input
                  type="text"
                  value={editedCard.closing || ''}
                  onChange={(e) => updateCard({ closing: e.target.value })}
                  className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                  placeholder="e.g., Sincerely,"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                  Signature Name
                </label>
                <input
                  type="text"
                  value={editedCard.signature_name || ''}
                  onChange={(e) =>
                    updateCard({ signature_name: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                  placeholder="e.g., Graduate School Leadership"
                />
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                  Signature Lines (one per line)
                </label>
                <textarea
                  value={
                    editedCard.signature_lines
                      ? editedCard.signature_lines.join('\n')
                      : ''
                  }
                  onChange={(e) => {
                    const lines = e.target.value
                      .split('\n')
                      .map((line) => line.trim())
                      .filter((line) => line.length > 0)
                    updateCard({ signature_lines: lines })
                  }}
                  rows={4}
                  className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                  placeholder="Title&#10;Department&#10;Organization"
                />
                <p className="mt-1 text-xs text-wsu-text-muted">
                  Enter each signature line on a separate line.
                </p>
              </div>
              <div>
                <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                  Signature Image URL
                </label>
                <input
                  type="url"
                  value={editedCard.signature_image_url || ''}
                  onChange={(e) =>
                    updateCard({ signature_image_url: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                  placeholder="https://..."
                />
              </div>
              {editedCard.signature_image_url && (
                <>
                  <div>
                    <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                      Signature Image Alt Text
                    </label>
                    <input
                      type="text"
                      value={editedCard.signature_image_alt || ''}
                      onChange={(e) =>
                        updateCard({ signature_image_alt: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                      placeholder="Signature"
                    />
                  </div>
                  <div>
                    <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                      Signature Image Width (px)
                    </label>
                    <input
                      type="number"
                      min="50"
                      max="500"
                      value={editedCard.signature_image_width || 220}
                      onChange={(e) =>
                        updateCard({
                          signature_image_width: parseInt(e.target.value) || 220,
                        })
                      }
                      className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                    />
                  </div>
                </>
              )}
            </div>
          )}

          {/* CTA Card Specific Fields */}
          {editedCard.type === 'cta' && (
            <div className="border-t border-wsu-border-light pt-4 space-y-4">
              {/* Button Style Selector */}
              <div>
                <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                  CTA Style
                </label>
                <select
                  value={editedCard.button_style || CTA_BUTTON_DEFAULTS.style}
                  onChange={(e) =>
                    updateCard({
                      button_style: e.target.value as 'button' | 'pill' | 'outlined' | 'ghost' | 'arrow' | 'underlined' | 'text-only',
                    })
                  }
                  className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                >
                  <option value="button">Button (Solid Background)</option>
                  <option value="pill">Pill (Fully Rounded Button)</option>
                  <option value="outlined">Outlined (Border Only)</option>
                  <option value="ghost">Ghost (Subtle Border)</option>
                  <option value="arrow">Arrow Link (Text + →)</option>
                  <option value="underlined">Underlined Link</option>
                  <option value="text-only">Text Only (Plain Link)</option>
                </select>
                <p className="mt-1 text-xs text-wsu-text-muted">
                  Choose the visual style for your call-to-action element
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                    Text Alignment
                  </label>
                  <select
                    value={editedCard.text_alignment || 'left'}
                    onChange={(e) =>
                      updateCard({
                        text_alignment: e.target.value as 'left' | 'center' | 'right',
                      })
                    }
                    className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                    Button Alignment
                  </label>
                  <select
                    value={editedCard.button_alignment || 'center'}
                    onChange={(e) =>
                      updateCard({
                        button_alignment: e.target.value as
                          | 'left'
                          | 'center'
                          | 'right',
                      })
                    }
                    className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                    Button BG Color
                  </label>
                  <input
                    type="color"
                    value={
                      editedCard.button_bg_color || CTA_BUTTON_DEFAULTS.bg_color
                    }
                    onChange={(e) =>
                      updateCard({ button_bg_color: e.target.value })
                    }
                    className="w-full h-10 border border-wsu-border-light rounded-md cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                    Button Text Color
                  </label>
                  <input
                    type="color"
                    value={
                      editedCard.button_text_color ||
                      CTA_BUTTON_DEFAULTS.text_color
                    }
                    onChange={(e) =>
                      updateCard({ button_text_color: e.target.value })
                    }
                    className="w-full h-10 border border-wsu-border-light rounded-md cursor-pointer"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="button_full_width"
                  checked={editedCard.button_full_width || false}
                  onChange={(e) =>
                    updateCard({ button_full_width: e.target.checked })
                  }
                  className="w-4 h-4 text-wsu-crimson border-wsu-border-light rounded focus:ring-wsu-crimson"
                />
                <label
                  htmlFor="button_full_width"
                  className="text-sm font-medium text-wsu-text-dark"
                >
                  Button Full Width
                </label>
              </div>

              {/* Button Typography */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                    Font Size (px)
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="32"
                    value={editedCard.button_font_size || CTA_BUTTON_DEFAULTS.font_size}
                    onChange={(e) =>
                      updateCard({ button_font_size: parseInt(e.target.value) || 16 })
                    }
                    className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                  />
                </div>
                <div>
                  <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                    Font Weight
                  </label>
                  <select
                    value={editedCard.button_font_weight || CTA_BUTTON_DEFAULTS.font_weight}
                    onChange={(e) =>
                      updateCard({
                        button_font_weight: e.target.value as 'normal' | 'bold' | '600' | '700',
                      })
                    }
                    className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                  >
                    <option value="normal">Normal</option>
                    <option value="600">Semi-Bold (600)</option>
                    <option value="bold">Bold</option>
                    <option value="700">Extra Bold (700)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                    Text Transform
                  </label>
                  <select
                    value={editedCard.button_text_transform || CTA_BUTTON_DEFAULTS.text_transform}
                    onChange={(e) =>
                      updateCard({
                        button_text_transform: e.target.value as 'none' | 'uppercase' | 'lowercase' | 'capitalize',
                      })
                    }
                    className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                  >
                    <option value="none">None</option>
                    <option value="uppercase">UPPERCASE</option>
                    <option value="lowercase">lowercase</option>
                    <option value="capitalize">Capitalize</option>
                  </select>
                </div>
                <div>
                  <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                    Letter Spacing (px)
                  </label>
                  <input
                    type="number"
                    min="-2"
                    max="10"
                    step="0.5"
                    value={editedCard.button_letter_spacing !== undefined ? editedCard.button_letter_spacing : CTA_BUTTON_DEFAULTS.letter_spacing}
                    onChange={(e) =>
                      updateCard({ button_letter_spacing: parseFloat(e.target.value) || 0 })
                    }
                    className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                  />
                </div>
              </div>

              {/* Button Border Style */}
              <div>
                <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                  Border Style
                </label>
                <select
                  value={editedCard.button_border_style || CTA_BUTTON_DEFAULTS.border_style}
                  onChange={(e) =>
                    updateCard({
                      button_border_style: e.target.value as 'solid' | 'dashed' | 'dotted' | 'double',
                    })
                  }
                  className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                >
                  <option value="solid">Solid</option>
                  <option value="dashed">Dashed</option>
                  <option value="dotted">Dotted</option>
                  <option value="double">Double</option>
                </select>
              </div>

              {/* Button Shadow */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-wsu-text-dark">Button Shadow</h4>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={getButtonShadow().enabled}
                      onChange={(e) => updateButtonShadow({ enabled: e.target.checked })}
                      className="rounded border-wsu-border-light text-wsu-crimson focus:ring-wsu-crimson"
                    />
                    <span className="text-sm text-wsu-text-dark">Enabled</span>
                  </label>
                </div>

                {getButtonShadow().enabled && (
                  <div className="space-y-3 pl-4 border-l-2 border-wsu-crimson/20">
                    <ColorPicker
                      label="Shadow Color"
                      value={getButtonShadow().color}
                      onChange={(color) => updateButtonShadow({ color })}
                    />

                    <div>
                      <label className="block mb-1 text-xs font-medium text-wsu-text-dark">
                        Blur: {getButtonShadow().blur}px
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="20"
                        value={getButtonShadow().blur}
                        onChange={(e) => updateButtonShadow({ blur: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>

                    <div>
                      <label className="block mb-1 text-xs font-medium text-wsu-text-dark">
                        Spread: {getButtonShadow().spread}px
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="20"
                        value={getButtonShadow().spread}
                        onChange={(e) => updateButtonShadow({ spread: parseInt(e.target.value) })}
                        className="w-full"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block mb-1 text-xs font-medium text-wsu-text-dark">
                          Offset X: {getButtonShadow().offset_x}px
                        </label>
                        <input
                          type="range"
                          min="-10"
                          max="10"
                          value={getButtonShadow().offset_x}
                          onChange={(e) => updateButtonShadow({ offset_x: parseInt(e.target.value) })}
                          className="w-full"
                        />
                      </div>
                      <div>
                        <label className="block mb-1 text-xs font-medium text-wsu-text-dark">
                          Offset Y: {getButtonShadow().offset_y}px
                        </label>
                        <input
                          type="range"
                          min="-10"
                          max="10"
                          value={getButtonShadow().offset_y}
                          onChange={(e) => updateButtonShadow({ offset_y: parseInt(e.target.value) })}
                          className="w-full"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block mb-1 text-xs font-medium text-wsu-text-dark">
                        Opacity: {(getButtonShadow().opacity * 100).toFixed(0)}%
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={getButtonShadow().opacity * 100}
                        onChange={(e) => updateButtonShadow({ opacity: parseInt(e.target.value) / 100 })}
                        className="w-full"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Card Styling Options */}
          <div className="border-t border-wsu-border-light pt-4 space-y-4">
            <h3 className="text-sm font-semibold text-wsu-text-dark mb-2">
              Card Styling
            </h3>
            
            <div>
              <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                Border Radius (px) - Override
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={editedCard.border_radius !== undefined ? editedCard.border_radius : ''}
                onChange={(e) => {
                  const value = e.target.value
                  updateCard({
                    border_radius: value === '' ? undefined : parseInt(value) || 0,
                  })
                }}
                className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                placeholder="Use global setting"
              />
              <p className="mt-1 text-xs text-wsu-text-muted">
                Override the global border radius for this card. Leave empty to use the global setting from Settings.
              </p>
            </div>

            <div>
              <label className="block mb-2 text-sm font-medium text-wsu-text-dark">
                Card Padding (px) - Override
              </label>
              <div className="grid grid-cols-4 gap-2">
                <div>
                  <label className="block text-xs text-wsu-text-muted mb-1">Top</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editedCard.padding?.top !== undefined ? editedCard.padding.top : ''}
                    onChange={(e) => updatePadding('top', e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                    placeholder="Global"
                  />
                </div>
                <div>
                  <label className="block text-xs text-wsu-text-muted mb-1">Right</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editedCard.padding?.right !== undefined ? editedCard.padding.right : ''}
                    onChange={(e) => updatePadding('right', e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                    placeholder="Global"
                  />
                </div>
                <div>
                  <label className="block text-xs text-wsu-text-muted mb-1">Bottom</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editedCard.padding?.bottom !== undefined ? editedCard.padding.bottom : ''}
                    onChange={(e) => updatePadding('bottom', e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                    placeholder="Global"
                  />
                </div>
                <div>
                  <label className="block text-xs text-wsu-text-muted mb-1">Left</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={editedCard.padding?.left !== undefined ? editedCard.padding.left : ''}
                    onChange={(e) => updatePadding('left', e.target.value)}
                    className="w-full px-2 py-1 text-sm border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                    placeholder="Global"
                  />
                </div>
              </div>
              <p className="mt-1 text-xs text-wsu-text-muted">
                Override the global padding for this card. Leave empty to use global settings. Useful for adding extra space below images or links.
              </p>
            </div>
          </div>

          {/* Table Styling Options */}
          <div className="border-t border-wsu-border-light pt-4 space-y-4">
            <h3 className="text-sm font-semibold text-wsu-text-dark mb-2">
              Table Styling
            </h3>
            
            <div>
              <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                Border style
              </label>
              <select
                value={editedCard.table_border_style || 'light'}
                onChange={(e) =>
                  updateCard({
                    table_border_style: e.target.value as
                      | 'none'
                      | 'light'
                      | 'medium'
                      | 'bold',
                  })
                }
                className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
              >
                <option value="none">None</option>
                <option value="light">Light (1px)</option>
                <option value="medium">Medium (2px)</option>
                <option value="bold">Bold (3px)</option>
              </select>
            </div>

            <ColorPicker
              label="Border color"
              value={editedCard.table_border_color || '#d9d9d9'}
              onChange={(color) => updateCard({ table_border_color: color })}
            />

            <div>
              <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                Table font size (px)
              </label>
              <input
                type="number"
                min="10"
                max="24"
                value={editedCard.table_font_size || 16}
                onChange={(e) =>
                  updateCard({
                    table_font_size: parseInt(e.target.value) || 16,
                  })
                }
                className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
              />
            </div>

            <ColorPicker
              label="Header background color"
              value={editedCard.table_header_bg_color || '#f4f4f4'}
              onChange={(color) =>
                updateCard({ table_header_bg_color: color })
              }
            />

            <div>
              <label className="block mb-1 text-sm font-medium text-wsu-text-dark">
                Header underline (px)
              </label>
              <input
                type="number"
                min="0"
                max="10"
                value={editedCard.table_header_underline || 0}
                onChange={(e) =>
                  updateCard({
                    table_header_underline: parseInt(e.target.value) || 0,
                  })
                }
                className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
              />
            </div>

            <ColorPicker
              label="Header underline color"
              value={editedCard.table_header_underline_color || '#d9d9d9'}
              onChange={(color) =>
                updateCard({ table_header_underline_color: color })
              }
            />
          </div>

          {/* Links */}
          <div className="border-t border-wsu-border-light pt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-wsu-text-dark">
                Links
              </label>
              <button
                onClick={addLink}
                className="px-2 py-1 text-xs font-medium text-wsu-crimson border border-wsu-crimson rounded-md hover:bg-wsu-crimson/10 transition-colors flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                Add Link
              </button>
            </div>
            {editedCard.links && editedCard.links.length > 0 ? (
              <div className="space-y-2">
                {editedCard.links.map((link, index) => (
                  <div
                    key={index}
                    className="flex gap-2 p-2 border border-wsu-border-light rounded-md"
                  >
                    <div className="flex-1 grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={link.label || ''}
                        onChange={(e) =>
                          updateLink(index, { ...link, label: e.target.value })
                        }
                        placeholder="Link label"
                        className="px-2 py-1 text-sm border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                      />
                      <input
                        type="url"
                        value={link.url || ''}
                        onChange={(e) =>
                          updateLink(index, { ...link, url: e.target.value })
                        }
                        placeholder="https://..."
                        className="px-2 py-1 text-sm border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                      />
                    </div>
                    <button
                      onClick={() => removeLink(index)}
                      className="p-1 text-red-600 hover:text-red-700"
                      title="Remove link"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-wsu-text-muted">
                No links. Click &quot;Add Link&quot; to add one.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


// components/editor/ColorPicker.tsx - Color picker with WSU palette

'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (color: string) => void
}

// WSU Brand Colors Palette
const WSU_COLORS = [
  { name: 'Crimson', value: '#A60F2D' },
  { name: 'Dark Crimson', value: '#8c0d25' },
  { name: 'Gray', value: '#4D4D4D' },
  { name: 'Light Gray', value: '#5E6A71' },
  { name: 'Text Dark', value: '#2A3033' },
  { name: 'Text Body', value: '#333333' },
  { name: 'Text Muted', value: '#5E6A71' },
  { name: 'Background Light', value: '#f4f4f4' },
  { name: 'Background Card', value: '#f9f9f9' },
  { name: 'White', value: '#ffffff' },
  { name: 'Black', value: '#000000' },
  { name: 'Border Light', value: '#e0e0e0' },
  { name: 'Border Medium', value: '#d9d9d9' },
  // Common footer colors
  { name: 'Footer Dark', value: '#2A3033' },
  { name: 'Footer Text Light', value: '#cccccc' },
  { name: 'Footer Text White', value: '#ffffff' },
]

export default function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  const [showPalette, setShowPalette] = useState(false)
  const paletteRef = useRef<HTMLDivElement>(null)

  // Close palette when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        paletteRef.current &&
        !paletteRef.current.contains(event.target as Node)
      ) {
        setShowPalette(false)
      }
    }

    if (showPalette) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }
  }, [showPalette])

  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-wsu-text-dark w-32">{label}</label>
      <div className="flex-1 relative">
        <div className="flex items-center gap-2">
          <input
            type="color"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-8 w-16 border border-wsu-border-light rounded cursor-pointer"
          />
          <button
            type="button"
            onClick={() => setShowPalette(!showPalette)}
            className="px-2 py-1 text-xs font-medium text-wsu-text-dark border border-wsu-border-light rounded hover:bg-wsu-bg-light transition-colors flex items-center gap-1"
            title="Show WSU color palette"
          >
            Palette
            {showPalette ? (
              <ChevronUp className="w-3 h-3" />
            ) : (
              <ChevronDown className="w-3 h-3" />
            )}
          </button>
        </div>
        {showPalette && (
          <div
            ref={paletteRef}
            className="absolute z-10 bottom-full mb-2 p-3 bg-white border border-wsu-border-light rounded-lg shadow-lg max-w-xs"
          >
            <div className="text-xs font-semibold text-wsu-text-dark mb-2">
              WSU Color Palette
            </div>
            <div className="grid grid-cols-4 gap-2">
              {WSU_COLORS.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => {
                    onChange(color.value)
                    setShowPalette(false)
                  }}
                  className="flex flex-col items-center gap-1 p-2 rounded hover:bg-wsu-bg-light transition-colors group"
                  title={`${color.name} (${color.value})`}
                >
                  <div
                    className="w-8 h-8 rounded border border-wsu-border-light shadow-sm group-hover:ring-2 group-hover:ring-wsu-crimson transition-all"
                    style={{ backgroundColor: color.value }}
                  />
                  <span className="text-[10px] text-wsu-text-muted text-center leading-tight">
                    {color.name}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}


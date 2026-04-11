// components/editor/TiptapEditor.tsx - Tiptap rich text editor component

'use client'

import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import { TableRow } from '@tiptap/extension-table-row'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import TextAlign from '@tiptap/extension-text-align'
import Link from '@tiptap/extension-link'
import Underline from '@tiptap/extension-underline'
import Placeholder from '@tiptap/extension-placeholder'
import ListItem from '@tiptap/extension-list-item'
import { useEffect, useState, useCallback } from 'react'
import PromptModal from './PromptModal'
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Indent,
  Outdent,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Unlink,
  Table as TableIcon,
  Plus,
  Minus,
  X,
  Undo,
  Redo,
  Code,
  Eye,
} from 'lucide-react'

interface TiptapEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  style?: React.CSSProperties
}

export default function TiptapEditor({
  value,
  onChange,
  placeholder = 'Enter content...',
  style,
}: TiptapEditorProps) {
  const [linkPromptOpen, setLinkPromptOpen] = useState(false)
  const [codeView, setCodeView] = useState(false)
  const [htmlCode, setHtmlCode] = useState('')
  const [listLineHeight, setListLineHeight] = useState('1.5')
  const [listItemSpacing, setListItemSpacing] = useState('8')
  const [isInList, setIsInList] = useState(false) // Track if cursor is in a list
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        listItem: false, // Disable default ListItem to use our custom one
      }),
      // Custom ListItem extension with style support
      ListItem.extend({
        addAttributes() {
          return {
            ...this.parent?.(),
            style: {
              default: null,
              parseHTML: element => {
                // Always preserve the style attribute exactly as it is
                const style = element.getAttribute('style')
                return style || null
              },
              renderHTML: attributes => {
                // Always render the style attribute if it exists
                if (!attributes.style) {
                  return {}
                }
                return {
                  style: attributes.style,
                }
              },
              // Ensure style is preserved through all operations
              keepOnSplit: true,
            },
          }
        },
      }),
      Underline,
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-wsu-crimson underline',
        },
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Table.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: value || '',
    editorProps: {
      attributes: {
        class: 'tiptap-editor focus:outline-none',
      },
      handleKeyDown: (view, event) => {
        if (!editor) return false
        // Handle Tab key for list indenting
        if (event.key === 'Tab' && !event.shiftKey) {
          // Tab - indent list item (create sub-list)
          if (editor.isActive('bulletList') || editor.isActive('orderedList')) {
            event.preventDefault()
            editor.chain().focus().sinkListItem('listItem').run()
            return true
          }
        }
        // Handle Shift+Tab for list outdenting
        if (event.key === 'Tab' && event.shiftKey) {
          // Shift+Tab - outdent list item (lift to parent level)
          if (editor.isActive('bulletList') || editor.isActive('orderedList')) {
            event.preventDefault()
            editor.chain().focus().liftListItem('listItem').run()
            return true
          }
        }
        return false
      },
    },
    onUpdate: ({ editor }) => {
      if (codeView) return // Don't update from editor when in code view
      const html = editor.getHTML()
      // Normalize empty content
      const normalizedValue =
        html === '<p></p>' || html.trim() === '' ? '' : html

      // Debug: Log HTML to check if list styles are preserved
      if (normalizedValue.includes('<li')) {
        console.log('[TiptapEditor] Extracted HTML with list items:', normalizedValue)
      }

      onChange(normalizedValue)
      setHtmlCode(normalizedValue) // Keep code view in sync

      // Update list detection state
      const inList = editor.isActive('bulletList') || editor.isActive('orderedList')
      setIsInList(inList)
    },
    onSelectionUpdate: ({ editor }) => {
      // Update list detection when cursor moves
      const inList = editor.isActive('bulletList') || editor.isActive('orderedList')
      setIsInList(inList)
    },
  })

  // Update content when value prop changes (but not from internal changes)
  useEffect(() => {
    if (editor && value !== undefined && !codeView) {
      const currentHtml = editor.getHTML()
      const normalizedCurrent =
        currentHtml === '<p></p>' || currentHtml.trim() === '' ? '' : currentHtml

      // Only update if the value is different (to avoid infinite loops)
      if (normalizedCurrent !== value) {
        editor.commands.setContent(value || '', { emitUpdate: false })
        setHtmlCode(value || '')
      }
    }
  }, [value, editor, codeView])

  // Sync htmlCode when value changes externally
  useEffect(() => {
    if (value !== undefined) {
      setHtmlCode(value || '')
    }
  }, [value])

  // Handle code view toggle
  const handleToggleCodeView = () => {
    if (codeView) {
      // Switching from code view to WYSIWYG
      // Update editor with code view content
      if (editor) {
        try {
          editor.commands.setContent(htmlCode || '', { emitUpdate: false })
          onChange(htmlCode || '')
        } catch (error) {
          console.error('Error setting content from code view:', error)
          // Revert to editor content on error
          setHtmlCode(editor.getHTML())
        }
      }
    } else {
      // Switching from WYSIWYG to code view
      // Get current HTML from editor
      if (editor) {
        const currentHtml = editor.getHTML()
        const normalized = currentHtml === '<p></p>' || currentHtml.trim() === '' ? '' : currentHtml
        setHtmlCode(normalized)
      }
    }
    setCodeView(!codeView)
  }

  // Handle code view changes
  const handleCodeChange = (newCode: string) => {
    setHtmlCode(newCode)
    // Update parent immediately for code view
    onChange(newCode)
  }

  /**
   * Updates inline styles on all list items in the editor.
   * 
   * This function applies line-height and margin-bottom styles directly to <li> elements
   * using inline styles with !important to override any CSS rules. This is necessary
   * because TipTap wraps list item content in <p> tags, and we need to prevent margin
   * collapse between the <li> and <p> margins.
   * 
   * @param lineHeight - Optional line-height value (e.g., "1.5"). Uses state if not provided.
   * @param itemSpacing - Optional margin-bottom value in pixels (e.g., "8"). Uses state if not provided.
   * 
   * @see AI_HANDOFF.md "List Item Gap Control - FIXED" section for detailed explanation
   */
  const updateListItemStyles = useCallback((lineHeight?: string, itemSpacing?: string) => {
    if (!editor) return

    const lineHeightValue = lineHeight !== undefined ? lineHeight : listLineHeight
    const itemSpacingValue = itemSpacing !== undefined ? itemSpacing : listItemSpacing

    editor.chain().command(({ tr, state }) => {
      let modified = false

      // Iterate through all nodes in the document
      state.doc.descendants((node, pos) => {
        if (node.type.name === 'listItem') {
          const attrs = node.attrs
          let currentStyle = attrs.style || ''

          // Remove existing line-height and margin-bottom styles before adding new ones
          // This regex handles styles with or without !important flag
          currentStyle = currentStyle
            .replace(/line-height\s*:\s*[^;]+(!important\s*)?;?\s*/gi, '')
            .replace(/margin-bottom\s*:\s*[^;]+(!important\s*)?;?\s*/gi, '')
            .trim()

          // Build new style string - margin-bottom must come first with !important
          // This ensures it overrides any CSS rules, including browser defaults
          const styles: string[] = []
          styles.push(`margin-bottom: ${itemSpacingValue}px !important`)
          if (lineHeightValue) styles.push(`line-height: ${lineHeightValue} !important`)
          
          // Preserve any other existing styles (don't remove user-added styles)
          if (currentStyle) {
            const cleaned = currentStyle.replace(/;\s*$/, '').trim()
            if (cleaned) styles.push(cleaned)
          }

          const newStyle = styles.filter(s => s).join('; ')

          // Always update the node markup, even if style appears unchanged
          // This ensures styles are applied after editor operations that might reset them
          tr.setNodeMarkup(pos, undefined, { ...attrs, style: newStyle || null })
          modified = true
        }
      })

      if (modified) {
        tr.setMeta('addToHistory', true)
      }
      return modified
    }).run()
  }, [editor, listLineHeight, listItemSpacing])

  // Handle line-height change (spacing within list item when text wraps)
  const handleLineHeightChange = (lineHeight: string) => {
    setListLineHeight(lineHeight)
    updateListItemStyles(lineHeight, undefined)
  }

  // Handle item spacing change (spacing between list items)
  const handleItemSpacingChange = (spacing: string) => {
    setListItemSpacing(spacing)
    // Apply styles immediately with the new spacing value
    updateListItemStyles(undefined, spacing)
    // Force editor update to ensure styles are rendered
    if (editor) {
      editor.view.dom.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }

  // Apply list styles when entering a list
  useEffect(() => {
    if (isInList && editor) {
      // Apply current list styles to all list items in the document
      updateListItemStyles()
    }
  }, [isInList, editor, updateListItemStyles])

  if (!editor) {
    return (
      <div
        style={style}
        className="border border-wsu-border-light rounded-md p-4 min-h-[200px] flex items-center justify-center text-wsu-text-muted"
      >
        Loading editor...
      </div>
    )
  }

  return (
    <div style={style} className="border border-wsu-border-light rounded-md bg-white">
      {/* Toolbar */}
      <div className="border-b border-wsu-border-light p-2 flex flex-wrap gap-2 bg-wsu-bg-light">
        {/* Text formatting */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={!editor.can().chain().focus().toggleBold().run() || codeView}
          className={`px-2 py-1 text-sm rounded flex items-center justify-center ${
            editor.isActive('bold')
              ? 'bg-wsu-crimson text-white'
              : 'bg-white text-wsu-text-dark hover:bg-wsu-bg-light'
          } border border-wsu-border-light disabled:opacity-50`}
          title="Bold"
        >
          <Bold className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={!editor.can().chain().focus().toggleItalic().run() || codeView}
          className={`px-2 py-1 text-sm rounded flex items-center justify-center ${
            editor.isActive('italic')
              ? 'bg-wsu-crimson text-white'
              : 'bg-white text-wsu-text-dark hover:bg-wsu-bg-light'
          } border border-wsu-border-light disabled:opacity-50`}
          title="Italic"
        >
          <Italic className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={codeView}
          className={`px-2 py-1 text-sm rounded flex items-center justify-center ${
            editor.isActive('underline')
              ? 'bg-wsu-crimson text-white'
              : 'bg-white text-wsu-text-dark hover:bg-wsu-bg-light'
          } border border-wsu-border-light disabled:opacity-50`}
          title="Underline"
        >
          <UnderlineIcon className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={!editor.can().chain().focus().toggleStrike().run() || codeView}
          className={`px-2 py-1 text-sm rounded flex items-center justify-center ${
            editor.isActive('strike')
              ? 'bg-wsu-crimson text-white'
              : 'bg-white text-wsu-text-dark hover:bg-wsu-bg-light'
          } border border-wsu-border-light disabled:opacity-50`}
          title="Strikethrough"
        >
          <Strikethrough className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-wsu-border-light mx-1" />

        {/* Headings */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          disabled={codeView}
          className={`px-2 py-1 text-sm rounded flex items-center justify-center ${
            editor.isActive('heading', { level: 1 })
              ? 'bg-wsu-crimson text-white'
              : 'bg-white text-wsu-text-dark hover:bg-wsu-bg-light'
          } border border-wsu-border-light disabled:opacity-50`}
          title="Heading 1"
        >
          <Heading1 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          disabled={codeView}
          className={`px-2 py-1 text-sm rounded flex items-center justify-center ${
            editor.isActive('heading', { level: 2 })
              ? 'bg-wsu-crimson text-white'
              : 'bg-white text-wsu-text-dark hover:bg-wsu-bg-light'
          } border border-wsu-border-light disabled:opacity-50`}
          title="Heading 2"
        >
          <Heading2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
          disabled={codeView}
          className={`px-2 py-1 text-sm rounded flex items-center justify-center ${
            editor.isActive('heading', { level: 3 })
              ? 'bg-wsu-crimson text-white'
              : 'bg-white text-wsu-text-dark hover:bg-wsu-bg-light'
          } border border-wsu-border-light disabled:opacity-50`}
          title="Heading 3"
        >
          <Heading3 className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-wsu-border-light mx-1" />

        {/* Lists */}
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          disabled={codeView}
          className={`px-2 py-1 text-sm rounded flex items-center justify-center ${
            editor.isActive('bulletList')
              ? 'bg-wsu-crimson text-white'
              : 'bg-white text-wsu-text-dark hover:bg-wsu-bg-light'
          } border border-wsu-border-light disabled:opacity-50`}
          title="Bullet List"
        >
          <List className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          disabled={codeView}
          className={`px-2 py-1 text-sm rounded flex items-center justify-center ${
            editor.isActive('orderedList')
              ? 'bg-wsu-crimson text-white'
              : 'bg-white text-wsu-text-dark hover:bg-wsu-bg-light'
          } border border-wsu-border-light disabled:opacity-50`}
          title="Numbered List"
        >
          <ListOrdered className="w-4 h-4" />
        </button>
        {isInList && !codeView && (
          <>
            <button
              type="button"
              onClick={() => editor.chain().focus().liftListItem('listItem').run()}
              disabled={!editor.can().liftListItem('listItem') || codeView}
              className="px-2 py-1 text-sm rounded flex items-center justify-center bg-white text-wsu-text-dark hover:bg-wsu-bg-light border border-wsu-border-light disabled:opacity-50"
              title="Outdent (Shift+Tab)"
            >
              <Outdent className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().sinkListItem('listItem').run()}
              disabled={!editor.can().sinkListItem('listItem') || codeView}
              className="px-2 py-1 text-sm rounded flex items-center justify-center bg-white text-wsu-text-dark hover:bg-wsu-bg-light border border-wsu-border-light disabled:opacity-50"
              title="Indent (Tab)"
            >
              <Indent className="w-4 h-4" />
            </button>
            <div className="flex items-center gap-1 px-2 border-l border-wsu-border-light">
              <label className="text-xs text-wsu-text-muted whitespace-nowrap">Line Height:</label>
              <input
                type="number"
                value={listLineHeight}
                onChange={(e) => handleLineHeightChange(e.target.value)}
                onBlur={(e) => {
                  const value = parseFloat(e.target.value)
                  if (isNaN(value) || value < 1.0 || value < 3.0) {
                    setListLineHeight('1.5')
                    handleLineHeightChange('1.5')
                  }
                }}
                min="1.0"
                max="3.0"
                step="0.1"
                className="text-xs border border-wsu-border-light rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-wsu-crimson w-14"
                title="Line height within list items (1.0-3.0). Controls spacing when text wraps."
                placeholder="1.5"
              />
            </div>
            <div className="flex items-center gap-1 px-2">
              <label className="text-xs text-wsu-text-muted whitespace-nowrap">Item Gap:</label>
              <input
                type="number"
                value={listItemSpacing}
                onChange={(e) => handleItemSpacingChange(e.target.value)}
                onBlur={(e) => {
                  const value = parseInt(e.target.value)
                  if (isNaN(value) || value < 0 || value > 50) {
                    setListItemSpacing('8')
                    handleItemSpacingChange('8')
                  }
                }}
                min="0"
                max="50"
                step="1"
                className="text-xs border border-wsu-border-light rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-wsu-crimson w-14"
                title="Vertical spacing between list items (0-50px)"
                placeholder="8"
              />
              <span className="text-xs text-wsu-text-muted">px</span>
            </div>
          </>
        )}

        <div className="w-px h-6 bg-wsu-border-light mx-1" />

        {/* Alignment */}
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          disabled={codeView}
          className={`px-2 py-1 text-sm rounded flex items-center justify-center ${
            editor.isActive({ textAlign: 'left' })
              ? 'bg-wsu-crimson text-white'
              : 'bg-white text-wsu-text-dark hover:bg-wsu-bg-light'
          } border border-wsu-border-light disabled:opacity-50`}
          title="Align Left"
        >
          <AlignLeft className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          disabled={codeView}
          className={`px-2 py-1 text-sm rounded flex items-center justify-center ${
            editor.isActive({ textAlign: 'center' })
              ? 'bg-wsu-crimson text-white'
              : 'bg-white text-wsu-text-dark hover:bg-wsu-bg-light'
          } border border-wsu-border-light disabled:opacity-50`}
          title="Align Center"
        >
          <AlignCenter className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          disabled={codeView}
          className={`px-2 py-1 text-sm rounded flex items-center justify-center ${
            editor.isActive({ textAlign: 'right' })
              ? 'bg-wsu-crimson text-white'
              : 'bg-white text-wsu-text-dark hover:bg-wsu-bg-light'
          } border border-wsu-border-light disabled:opacity-50`}
          title="Align Right"
        >
          <AlignRight className="w-4 h-4" />
        </button>

        <div className="w-px h-6 bg-wsu-border-light mx-1" />

        {/* Link */}
        <button
          type="button"
          onClick={() => {
            setLinkPromptOpen(true)
          }}
          disabled={codeView}
          className={`px-2 py-1 text-sm rounded flex items-center justify-center ${
            editor.isActive('link')
              ? 'bg-wsu-crimson text-white'
              : 'bg-white text-wsu-text-dark hover:bg-wsu-bg-light'
          } border border-wsu-border-light disabled:opacity-50`}
          title="Insert Link"
        >
          <LinkIcon className="w-4 h-4" />
        </button>
        {editor.isActive('link') && !codeView && (
          <button
            type="button"
            onClick={() => editor.chain().focus().unsetLink().run()}
            className="px-2 py-1 text-sm rounded flex items-center justify-center bg-white text-wsu-text-dark hover:bg-wsu-bg-light border border-wsu-border-light"
            title="Remove Link"
          >
            <Unlink className="w-4 h-4" />
          </button>
        )}

        <div className="w-px h-6 bg-wsu-border-light mx-1" />

        {/* Table */}
        <button
          type="button"
          onClick={() =>
            editor
              .chain()
              .focus()
              .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
              .run()
          }
          disabled={codeView}
          className="px-2 py-1 text-sm rounded flex items-center justify-center bg-white text-wsu-text-dark hover:bg-wsu-bg-light border border-wsu-border-light disabled:opacity-50"
          title="Insert Table"
        >
          <TableIcon className="w-4 h-4" />
        </button>
        {editor.isActive('table') && !codeView && (
          <>
            <button
              type="button"
              onClick={() => editor.chain().focus().addColumnBefore().run()}
              disabled={!editor.can().addColumnBefore()}
              className="px-2 py-1 text-sm rounded flex items-center justify-center bg-white text-wsu-text-dark hover:bg-wsu-bg-light border border-wsu-border-light disabled:opacity-50"
              title="Add Column Before"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().addColumnAfter().run()}
              disabled={!editor.can().addColumnAfter()}
              className="px-2 py-1 text-sm rounded flex items-center justify-center bg-white text-wsu-text-dark hover:bg-wsu-bg-light border border-wsu-border-light disabled:opacity-50"
              title="Add Column After"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteColumn().run()}
              disabled={!editor.can().deleteColumn()}
              className="px-2 py-1 text-sm rounded flex items-center justify-center bg-white text-wsu-text-dark hover:bg-wsu-bg-light border border-wsu-border-light disabled:opacity-50"
              title="Delete Column"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().addRowBefore().run()}
              disabled={!editor.can().addRowBefore()}
              className="px-2 py-1 text-sm rounded flex items-center justify-center bg-white text-wsu-text-dark hover:bg-wsu-bg-light border border-wsu-border-light disabled:opacity-50"
              title="Add Row Before"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().addRowAfter().run()}
              disabled={!editor.can().addRowAfter()}
              className="px-2 py-1 text-sm rounded flex items-center justify-center bg-white text-wsu-text-dark hover:bg-wsu-bg-light border border-wsu-border-light disabled:opacity-50"
              title="Add Row After"
            >
              <Plus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteRow().run()}
              disabled={!editor.can().deleteRow()}
              className="px-2 py-1 text-sm rounded flex items-center justify-center bg-white text-wsu-text-dark hover:bg-wsu-bg-light border border-wsu-border-light disabled:opacity-50"
              title="Delete Row"
            >
              <Minus className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteTable().run()}
              disabled={!editor.can().deleteTable()}
              className="px-2 py-1 text-sm rounded flex items-center justify-center bg-white text-wsu-text-dark hover:bg-wsu-bg-light border border-wsu-border-light disabled:opacity-50"
              title="Delete Table"
            >
              <X className="w-4 h-4" />
            </button>
          </>
        )}

        <div className="w-px h-6 bg-wsu-border-light mx-1" />

        {/* Code View Toggle */}
        <button
          type="button"
          onClick={handleToggleCodeView}
          className={`px-2 py-1 text-sm rounded flex items-center justify-center ${
            codeView
              ? 'bg-wsu-crimson text-white'
              : 'bg-white text-wsu-text-dark hover:bg-wsu-bg-light'
          } border border-wsu-border-light`}
          title={codeView ? 'Switch to Visual Editor' : 'Switch to HTML Code View'}
        >
          {codeView ? <Eye className="w-4 h-4" /> : <Code className="w-4 h-4" />}
        </button>

        <div className="w-px h-6 bg-wsu-border-light mx-1" />

        {/* Other */}
        <button
          type="button"
          onClick={() => editor.chain().focus().undo().run()}
          disabled={!editor.can().undo() || codeView}
          className="px-2 py-1 text-sm rounded flex items-center justify-center bg-white text-wsu-text-dark hover:bg-wsu-bg-light border border-wsu-border-light disabled:opacity-50"
          title="Undo"
        >
          <Undo className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => editor.chain().focus().redo().run()}
          disabled={!editor.can().redo() || codeView}
          className="px-2 py-1 text-sm rounded flex items-center justify-center bg-white text-wsu-text-dark hover:bg-wsu-bg-light border border-wsu-border-light disabled:opacity-50"
          title="Redo"
        >
          <Redo className="w-4 h-4" />
        </button>
      </div>

      {/* Editor Content or Code View */}
      {codeView ? (
        <div className="p-4">
          <textarea
            value={htmlCode}
            onChange={(e) => handleCodeChange(e.target.value)}
            className="w-full min-h-[200px] font-mono text-sm border border-wsu-border-light rounded p-3 focus:outline-none focus:ring-2 focus:ring-wsu-crimson resize-y"
            placeholder="Enter HTML code..."
            style={{ fontFamily: 'monospace', fontSize: '13px', lineHeight: '1.5' }}
          />
          <p className="mt-2 text-xs text-wsu-text-muted">
            Edit HTML directly. Click the eye icon to return to visual editor.
          </p>
        </div>
      ) : (
        <EditorContent editor={editor} />
      )}

      {/* Link Prompt Modal */}
      <PromptModal
        isOpen={linkPromptOpen}
        title="Insert Link"
        message="Enter the URL for the link:"
        defaultValue={editor.getAttributes('link').href || ''}
        placeholder="https://..."
        onConfirm={(url) => {
          if (url) {
            editor.chain().focus().setLink({ href: url }).run()
          }
          setLinkPromptOpen(false)
        }}
        onCancel={() => setLinkPromptOpen(false)}
      />
    </div>
  )
}


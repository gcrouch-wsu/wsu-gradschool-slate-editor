// app/editor/page.tsx - Main editor page

'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { useNewsletterState } from './hooks/useNewsletterState'
import { usePreview } from './hooks/usePreview'
import PreviewPanel from '@/components/PreviewPanel'
import EditorPanel from '@/components/EditorPanel'
import ConfirmModal from '@/components/ConfirmModal'
import type { NewsletterData, ValidationResult, ValidationIssue } from '@/types/newsletter'
import { defaultFFModel } from '@/lib/defaults'
import {
  Download,
  Upload,
  CheckCircle,
  FileText,
  X,
  Menu,
  ChevronDown,
} from 'lucide-react'

export default function EditorPage() {
  // All hooks must be called unconditionally at the top level
  const [templateType, setTemplateType] = useState<'ff' | 'briefing' | 'letter'>('ff')
  const [initialData, setInitialData] = useState<NewsletterData | null>(null)
  const [loading, setLoading] = useState(true)
  const [showValidation, setShowValidation] = useState(false)
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [showMenu, setShowMenu] = useState(false)
  const [backupConfirmModal, setBackupConfirmModal] = useState<{
    isOpen: boolean
    message: string
    backupData: NewsletterData | null
  }>({
    isOpen: false,
    message: '',
    backupData: null,
  })
  const [templateChangeConfirm, setTemplateChangeConfirm] = useState<{
    isOpen: boolean
    newType: 'ff' | 'briefing' | 'letter' | null
  }>({
    isOpen: false,
    newType: null,
  })
  const fileInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const hasLoadedInitialPreview = useRef(false)
  const previousTemplateRef = useRef<'ff' | 'briefing' | 'letter' | null>(null)
  const previousStateTemplateRef = useRef<string | null>(null)

  // Create a stable default model - memoize it so it doesn't change on every render
  const defaultModel = useMemo(() => defaultFFModel(), [])
  
  // Always pass a valid NewsletterData object to avoid hook ordering issues
  // Use nullish coalescing to ensure we always have valid data
  // Memoize to ensure stable reference when initialData hasn't changed
  const effectiveInitialData = useMemo(() => {
    return initialData ?? defaultModel
  }, [initialData, defaultModel])
  
  const {
    state,
    updateState,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useNewsletterState(effectiveInitialData)

  const { html, loading: previewLoading, updatePreview, debouncedUpdatePreview } =
    usePreview()

  // Load initial data
  useEffect(() => {
    async function loadInitialData() {
      try {
        // Step 1: Check URL params for template type (e.g., ?type=briefing)
        const urlParams = new URLSearchParams(window.location.search)
        const urlTemplate = urlParams.get('type')
        const urlTemplateType = (urlTemplate === 'briefing' || urlTemplate === 'letter') 
          ? urlTemplate 
          : 'ff'
        
        // Step 2: Check for auto-save backup to determine template
        const backupCheckedKey = 'wsu_newsletter_backup_checked'
        const hasCheckedBackup = sessionStorage.getItem(backupCheckedKey)
        let backupTemplate: 'ff' | 'briefing' | 'letter' | null = null
        let backupAgeMinutes = 0
        
        if (!hasCheckedBackup) {
          // Mark as checked to prevent repeated prompts in this session
          sessionStorage.setItem(backupCheckedKey, 'true')
          
          const backupStr = localStorage.getItem('wsu_newsletter_backup')
          if (backupStr) {
            try {
              const backup = JSON.parse(backupStr)
              backupTemplate = (backup.state?.template === 'briefing' || backup.state?.template === 'letter')
                ? backup.state.template
                : 'ff'
              
              const backupTime = new Date(backup.timestamp)
              const now = new Date()
              backupAgeMinutes = Math.floor(
                (now.getTime() - backupTime.getTime()) / 60000
              )

              // Only show prompt if backup is at least 1 minute old (prevents "0 minutes ago")
              if (backupAgeMinutes >= 1 && backupAgeMinutes < 1440 && backupTemplate) {
                // Less than 24 hours old and at least 1 minute old
                const templateName = backupTemplate === 'briefing' 
                  ? 'Briefing' 
                  : backupTemplate === 'letter'
                  ? 'Slate Campaign'
                  : 'Friday Focus'
                const message = `Found an auto-saved ${templateName} draft from ${backupAgeMinutes} minutes ago. Restore it?`
                setBackupConfirmModal({
                  isOpen: true,
                  message,
                  backupData: backup.state,
                })
                // Set template type to match backup BEFORE showing modal
                setTemplateType(backupTemplate)
                // Don't continue loading - wait for user response
                // Loading will be set to false in modal callbacks
                return
              } else if (backupAgeMinutes >= 1440) {
                // Backup is too old, clear it
                localStorage.removeItem('wsu_newsletter_backup')
              } else if (backupAgeMinutes < 1) {
                // Backup is too recent (less than 1 minute), likely just created
                // Clear it to prevent "0 minutes ago" prompt
                localStorage.removeItem('wsu_newsletter_backup')
              }
            } catch (e) {
              // Clear invalid backup
              localStorage.removeItem('wsu_newsletter_backup')
            }
          }
        }

        // Step 3: Determine which template to use (priority: URL param > backup > default FF)
        const finalTemplateType = urlTemplateType !== 'ff' 
          ? urlTemplateType 
          : backupTemplate || 'ff'
        
        // Set template type if it differs from current state
        if (finalTemplateType !== templateType) {
          setTemplateType(finalTemplateType)
        }

        // Step 4: Load defaults for the determined template type
        const response = await fetch(`/api/defaults/${finalTemplateType}`)
        if (response.ok) {
          const data = await response.json()
          setInitialData(data)
        } else {
          // Fallback to default FF model
          setInitialData(defaultFFModel())
        }
      } catch (error) {
        // Fallback to default FF model
        setInitialData(defaultFFModel())
      } finally {
        setLoading(false)
      }
    }

    loadInitialData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Empty dependency array - only run once on mount (templateType is set inside)

  // Track template changes to force immediate preview updates
  useEffect(() => {
    if (previousTemplateRef.current !== null && previousTemplateRef.current !== templateType) {
      // Template changed - reset preview flag to force immediate update
      hasLoadedInitialPreview.current = false
      previousStateTemplateRef.current = null // Reset state template tracking
    }
    previousTemplateRef.current = templateType
  }, [templateType])

  // Update preview when state changes - especially when template changes
  useEffect(() => {
    // Only update preview after loading is complete and we have data
    if (!loading && initialData && state) {
      const stateTemplate = state.template || 'ff'
      const stateTemplateChanged = previousStateTemplateRef.current !== null && 
                                    previousStateTemplateRef.current !== stateTemplate
      
      // Also check if initialData template changed (for template switches)
      const initialDataTemplate = initialData.template || 'ff'
      const initialDataTemplateChanged = previousStateTemplateRef.current !== null &&
                                         previousStateTemplateRef.current !== initialDataTemplate
      
      // For template switches or initial load, update immediately (not debounced)
      // For regular edits, use debounced update
      if (!hasLoadedInitialPreview.current || stateTemplateChanged || initialDataTemplateChanged) {
        // Immediate update for template changes or initial load
        hasLoadedInitialPreview.current = true
        previousStateTemplateRef.current = stateTemplate
        updatePreview(state)
      } else {
        // Debounced update for regular edits
        debouncedUpdatePreview(state)
      }
    }
  }, [state, debouncedUpdatePreview, updatePreview, loading, initialData])

  const handleRefreshPreview = () => {
    updatePreview(state)
  }

  const handleTemplateChange = async (newType: 'ff' | 'briefing' | 'letter') => {
    setTemplateChangeConfirm({
      isOpen: true,
      newType,
    })
  }

  const confirmTemplateChange = async () => {
    if (templateChangeConfirm.newType) {
      setTemplateType(templateChangeConfirm.newType)
      const response = await fetch(`/api/defaults/${templateChangeConfirm.newType}`)
      if (response.ok) {
        const data = await response.json()
        setInitialData(data)
      } else {
        setInitialData(defaultFFModel())
      }
      setTemplateChangeConfirm({ isOpen: false, newType: null })
    }
  }

  // Handler functions - defined after hooks but before conditional return
  const handleExport = useCallback(async () => {
    if (!state) return
    try {
      // Ensure template property is set correctly from templateType state
      // templateType is the source of truth for what template is selected in the UI
      // Always use templateType to ensure export filename matches the selected template
      const exportData = {
        ...state,
        template: templateType, // Always use templateType - it's the current selection in the editor
      }
      
      const response = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportData),
      })

      if (response.ok) {
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        
        // Extract filename from Content-Disposition header (server generates it with template name)
        // Format: attachment; filename="Friday_Focus_2025-12-05.html"
        const contentDisposition = response.headers.get('Content-Disposition')
        let filename = 'Newsletter.html' // Fallback filename
        
        if (contentDisposition) {
          const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i)
          if (filenameMatch && filenameMatch[1]) {
            filename = filenameMatch[1]
          }
        }
        
        // If header parsing fails, generate filename from template (fallback)
        // Note: Server handles _PRODUCTION suffix based on export_options.strip_json
        if (filename === 'Newsletter.html') {
          const templateType = state.template || 'ff'
          const prefix =
            templateType === 'ff'
              ? 'Friday_Focus_'
              : templateType === 'briefing'
              ? 'Briefing_'
              : 'Slate_Campaign_'
          // Use local time (Pacific Standard Time) and format as MM-DD-YYYY-HR:MIN (military time)
          const now = new Date()
          const month = String(now.getMonth() + 1).padStart(2, '0')
          const day = String(now.getDate()).padStart(2, '0')
          const year = now.getFullYear()
          const hours = String(now.getHours()).padStart(2, '0') // Military time (24-hour format)
          const minutes = String(now.getMinutes()).padStart(2, '0')
          const date = `${month}-${day}-${year}` // MM-DD-YYYY
          const time = `${hours}:${minutes}` // HR:MIN (military time with colon)
          filename = `${prefix}${date}-${time}.html`
        }
        
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      }
    } catch (error) {
      alert('Export failed. Please try again.')
    }
  }, [state, templateType])

  const handleImport = async (file: File) => {
    try {
      const text = await file.text()
      const response = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: text }),
      })

      const result = await response.json()
      if (result.success && result.data) {
        setInitialData(result.data)
        // State will be updated automatically by useNewsletterState
        alert('Newsletter imported successfully!')
      } else {
        alert(`Import failed: ${result.error || 'Unknown error'}`)
      }
    } catch (error) {
      alert('Import failed. Please try again.')
    }
  }

  const handleValidate = async () => {
    if (!state) return
    try {
      const response = await fetch('/api/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })

      const result = await response.json()
      if (result.success) {
        setValidationResult(result)
        setShowValidation(true)
      }
    } catch (error) {
      // Validation failed silently
    }
  }

  const handleGeneratePlainText = async () => {
    if (!state) return
    try {
      const response = await fetch('/api/generate-plaintext', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(state),
      })

      const result = await response.json()
      if (result.success) {
        // Create a new window with the plain text
        const newWindow = window.open()
        if (newWindow) {
          newWindow.document.write(
            `<pre style="padding: 20px; font-family: monospace; white-space: pre-wrap;">${result.text}</pre>`
          )
        }
      }
    } catch (error) {
      // Plain text generation failed silently
    }
  }

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false)
      }
    }

    if (showMenu) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showMenu])

  // Keyboard shortcuts
  useEffect(() => {
    if (loading || !initialData) return // Don't attach shortcuts while loading

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        undo()
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        redo()
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleExport()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [undo, redo, handleExport, loading, initialData]) // Include loading state

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top Bar */}
      <header className="flex justify-between items-center px-4 py-3 bg-white border-b border-wsu-border-light sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <h1 className="text-lg font-semibold text-wsu-crimson">
            WSU Newsletter Editor
          </h1>
          <span className="text-xs text-wsu-text-muted bg-wsu-bg-light px-2 py-1 rounded">
            v8.0
          </span>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="px-3 py-1.5 text-sm font-medium text-wsu-text-body bg-white border border-wsu-border-light rounded-md hover:bg-wsu-bg-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="px-3 py-1.5 text-sm font-medium text-wsu-text-body bg-white border border-wsu-border-light rounded-md hover:bg-wsu-bg-light disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Redo (Ctrl+Shift+Z)"
          >
            Redo
          </button>
          <button
            onClick={() => handleTemplateChange(templateType === 'ff' ? 'briefing' : 'ff')}
            className="px-3 py-1.5 text-sm font-medium text-wsu-text-body bg-white border border-wsu-border-light rounded-md hover:bg-wsu-bg-light transition-colors"
            title="Reset to template defaults"
          >
            Reset
          </button>
          
          {/* Menu Dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="px-3 py-1.5 text-sm font-medium text-wsu-text-body bg-white border border-wsu-border-light rounded-md hover:bg-wsu-bg-light transition-colors flex items-center gap-1"
              title="More actions"
            >
              <Menu className="w-4 h-4" />
              <ChevronDown className={`w-3 h-3 transition-transform ${showMenu ? 'rotate-180' : ''}`} />
            </button>
            
            {showMenu && (
              <div className="absolute right-0 mt-2 w-48 bg-white border border-wsu-border-light rounded-md shadow-lg z-50">
                <div className="py-1">
                  <button
                    onClick={() => {
                      fileInputRef.current?.click()
                      setShowMenu(false)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-wsu-text-body hover:bg-wsu-bg-light transition-colors flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    Import HTML
                  </button>
                  <button
                    onClick={() => {
                      handleExport()
                      setShowMenu(false)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-wsu-text-body hover:bg-wsu-bg-light transition-colors flex items-center gap-2"
                  >
                    <Download className="w-4 h-4" />
                    Export HTML
                  </button>
                  <button
                    onClick={() => {
                      handleGeneratePlainText()
                      setShowMenu(false)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-wsu-text-body hover:bg-wsu-bg-light transition-colors flex items-center gap-2"
                  >
                    <FileText className="w-4 h-4" />
                    Plain Text
                  </button>
                  <button
                    onClick={() => {
                      handleValidate()
                      setShowMenu(false)
                    }}
                    className="w-full text-left px-4 py-2 text-sm text-wsu-text-body hover:bg-wsu-bg-light transition-colors flex items-center gap-2"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Validate
                  </button>
                </div>
              </div>
            )}
          </div>
          
          <input
            ref={fileInputRef}
            type="file"
            accept=".html"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                handleImport(file)
                e.target.value = ''
              }
            }}
          />
        </div>
      </header>

      {/* Main Content Grid */}
      <main className="flex-1 grid grid-cols-2 gap-0 overflow-hidden">
        {/* Left Panel: Editor */}
        <EditorPanel
          state={state}
          updateState={updateState}
          templateType={templateType}
          onTemplateChange={handleTemplateChange}
        />

        {/* Right Panel: Preview */}
        <PreviewPanel
          html={html}
          loading={previewLoading}
          onRefresh={handleRefreshPreview}
        />
      </main>

      {/* Validation Modal */}
      {showValidation && validationResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-wsu-text-dark">
                Accessibility Validation
              </h2>
              <button
                onClick={() => setShowValidation(false)}
                className="text-wsu-text-muted hover:text-wsu-text-dark"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {validationResult.issues && validationResult.issues.length > 0 ? (
              <div className="space-y-2">
                <div className="p-3 bg-wsu-bg-light rounded-md mb-4">
                  <strong>Found {validationResult.total} issue(s):</strong>
                  {(validationResult.errors ?? 0) > 0 && (
                    <span className="ml-3 text-red-600">
                      {validationResult.errors} error(s)
                    </span>
                  )}
                  {(validationResult.warnings ?? 0) > 0 && (
                    <span className="ml-3 text-yellow-600">
                      {validationResult.warnings} warning(s)
                    </span>
                  )}
                </div>
                {validationResult.issues.map((issue: ValidationIssue, index: number) => (
                  <div
                    key={index}
                    className={`p-3 border-l-4 rounded ${
                      issue.severity === 'error'
                        ? 'border-red-600 bg-red-50'
                        : 'border-yellow-600 bg-yellow-50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <strong
                        className={
                          issue.severity === 'error'
                            ? 'text-red-600'
                            : 'text-yellow-600'
                        }
                      >
                        {issue.severity === 'error' ? '⚠ Error' : '⚠ Warning'}
                      </strong>
                      <span className="text-xs text-wsu-text-muted">
                        {issue.location}
                      </span>
                    </div>
                    <p className="text-sm text-wsu-text-dark mb-1">
                      {issue.message}
                    </p>
                    <p className="text-xs text-wsu-text-muted">
                      <strong>Fix:</strong> {issue.fix}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <h3 className="text-green-600 text-lg font-semibold mb-2">
                  ✓ No Issues Found
                </h3>
                <p className="text-wsu-text-muted">
                  Your newsletter passes all accessibility checks!
                </p>
              </div>
            )}
            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowValidation(false)}
                className="px-4 py-2 text-sm font-medium text-white bg-wsu-crimson rounded-md hover:bg-wsu-crimson-dark transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup Restore Confirm Modal */}
      <ConfirmModal
        isOpen={backupConfirmModal.isOpen}
        title="Restore Auto-Saved Draft"
        message={backupConfirmModal.message}
        confirmLabel="Restore"
        cancelLabel="Start Fresh"
        variant="info"
        onConfirm={async () => {
          if (backupConfirmModal.backupData) {
            // Restore backup data and sync template type
            const backupTemplate = (backupConfirmModal.backupData.template === 'briefing' || 
                                   backupConfirmModal.backupData.template === 'letter')
              ? backupConfirmModal.backupData.template
              : 'ff'
            setTemplateType(backupTemplate)
            setInitialData(backupConfirmModal.backupData)
            setLoading(false)
          }
          setBackupConfirmModal({ isOpen: false, message: '', backupData: null })
        }}
        onCancel={async () => {
          // User declined restore - load defaults for the template that was in backup
          // (templateType was already set to match backup in loadInitialData)
          localStorage.removeItem('wsu_newsletter_backup')
          setBackupConfirmModal({ isOpen: false, message: '', backupData: null })
          // Load defaults for the template type (which matches the backup template)
          try {
            const response = await fetch(`/api/defaults/${templateType}`)
            if (response.ok) {
              const data = await response.json()
              setInitialData(data)
            } else {
              setInitialData(defaultFFModel())
            }
          } catch (error) {
            setInitialData(defaultFFModel())
          } finally {
            setLoading(false)
          }
        }}
      />

      {/* Template Change Confirm Modal */}
      <ConfirmModal
        isOpen={templateChangeConfirm.isOpen}
        title="Switch Template"
        message="Are you sure you want to switch templates? This will load default content and discard your current edits."
        confirmLabel="Switch"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={confirmTemplateChange}
        onCancel={() => setTemplateChangeConfirm({ isOpen: false, newType: null })}
      />
      <footer className="border-t border-wsu-border-light bg-white">
        <div className="px-4 py-6">
          <p className="text-sm text-wsu-text-muted text-center">
            Graduate School | Washington State University
          </p>
        </div>
      </footer>
    </div>
  )
}

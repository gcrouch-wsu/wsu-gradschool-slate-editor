// app/editor/hooks/useNewsletterState.ts - State management hook with undo/redo and auto-save

import { useState, useCallback, useEffect, useRef } from 'react'
import type { NewsletterData } from '@/types/newsletter'
import { clone } from '@/lib/utils'

const UNDO_MAX = 50
const AUTO_SAVE_INTERVAL = 30000 // 30 seconds

export function useNewsletterState(initialData: NewsletterData) {
  const [state, setState] = useState<NewsletterData>(initialData)
  const [undoStack, setUndoStack] = useState<NewsletterData[]>([])
  const [redoStack, setRedoStack] = useState<NewsletterData[]>([])
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null)
  const hasUnsavedChangesRef = useRef(false)
  const lastInitialDataRef = useRef<NewsletterData | null>(null)

  // Sync state when initialData prop changes (template switch, import, etc.)
  // Always update when initialData changes (the API/component ensures it's actually new data)
  useEffect(() => {
    const current = initialData
    const previous = lastInitialDataRef.current

    // Skip if it's the same object reference (React will give us the same object if unchanged)
    if (current === previous) {
      return
    }

    // Always update state when initialData changes - this handles template switches, imports, etc.
    lastInitialDataRef.current = current
    setState(current)
    setUndoStack([])
    setRedoStack([])
    hasUnsavedChangesRef.current = false
  }, [initialData])

  // Auto-save to localStorage
  const saveToLocalStorage = useCallback(() => {
    try {
      const backup = {
        state,
        timestamp: new Date().toISOString(),
        version: '7.0.2',
      }
      localStorage.setItem('wsu_newsletter_backup', JSON.stringify(backup))
      hasUnsavedChangesRef.current = false
    } catch (e) {
      // Auto-save failed silently
      if (e instanceof Error && e.name === 'QuotaExceededError') {
        // Storage full - auto-save disabled
      }
    }
  }, [state])

  // Load from localStorage
  const loadFromLocalStorage = useCallback((): NewsletterData | null => {
    try {
      const backupStr = localStorage.getItem('wsu_newsletter_backup')
      if (!backupStr) return null

      const backup = JSON.parse(backupStr)
      const backupTime = new Date(backup.timestamp)
      const now = new Date()
      const ageMinutes = Math.floor((now.getTime() - backupTime.getTime()) / 60000)

      // Only offer restore if backup is less than 24 hours old
      if (ageMinutes > 1440) {
        return null
      }

      return backup.state
    } catch (e) {
      return null
    }
  }, [])

  // Update state and push to history
  const updateState = useCallback(
    (updater: (prev: NewsletterData) => NewsletterData, pushHistory = true) => {
      setState((prev) => {
        const newState = updater(prev)
        
        if (pushHistory) {
          // Push to undo stack
          setUndoStack((stack) => {
            const newStack = [...stack, clone(prev)]
            return newStack.slice(-UNDO_MAX)
          })
          // Clear redo stack
          setRedoStack([])
          hasUnsavedChangesRef.current = true
        }
        
        return newState
      })
    },
    []
  )

  // Undo
  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length > 0) {
        const previousState = stack[stack.length - 1]
        setRedoStack((redo) => [...redo, clone(state)])
        setState(previousState)
        hasUnsavedChangesRef.current = true
        return stack.slice(0, -1)
      }
      return stack
    })
  }, [state])

  // Redo
  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length > 0) {
        const nextState = stack[stack.length - 1]
        setUndoStack((undo) => [...undo, clone(state)])
        setState(nextState)
        hasUnsavedChangesRef.current = true
        return stack.slice(0, -1)
      }
      return stack
    })
  }, [state])

  // Reset state
  const resetState = useCallback((newState: NewsletterData) => {
    setState(newState)
    setUndoStack([])
    setRedoStack([])
    hasUnsavedChangesRef.current = false
  }, [])

  // Start auto-save
  useEffect(() => {
    // Delay initial save to allow backup check to complete first
    // This prevents overwriting the backup immediately after mount
    const initialSaveTimeout = setTimeout(() => {
      saveToLocalStorage()
    }, 1000) // 1 second delay

    // Then save every 30 seconds if there are unsaved changes
    autoSaveTimerRef.current = setInterval(() => {
      if (hasUnsavedChangesRef.current) {
        saveToLocalStorage()
      }
    }, AUTO_SAVE_INTERVAL)

    return () => {
      clearTimeout(initialSaveTimeout)
      if (autoSaveTimerRef.current) {
        clearInterval(autoSaveTimerRef.current)
      }
    }
  }, [saveToLocalStorage])

  // Warn before leaving page with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChangesRef.current) {
        e.preventDefault()
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?'
        return e.returnValue
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [])

  return {
    state,
    updateState,
    undo,
    redo,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    resetState,
    loadFromLocalStorage,
  }
}


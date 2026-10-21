import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { NewsletterData } from '@/types/newsletter'
import { clone } from '@/lib/utils'

const UNDO_MAX = 50
type History = {
  current: NewsletterData
  undo: NewsletterData[]
  redo: NewsletterData[]
  dirty: boolean
}
type Action =
  | {
      type: 'update'
      updater: (previous: NewsletterData) => NewsletterData
      history: boolean
    }
  | { type: 'reset'; value: NewsletterData }
  | { type: 'undo' | 'redo' | 'backed-up' }

function reduce(state: History, action: Action): History {
  if (action.type === 'reset') return { current: action.value, undo: [], redo: [], dirty: false }
  if (action.type === 'backed-up') return { ...state, dirty: false }
  if (action.type === 'update')
    return {
      current: action.updater(state.current),
      undo: action.history ? [...state.undo, clone(state.current)].slice(-UNDO_MAX) : state.undo,
      redo: action.history ? [] : state.redo,
      dirty: true,
    }
  if (action.type === 'undo' && state.undo.length)
    return {
      current: state.undo[state.undo.length - 1],
      undo: state.undo.slice(0, -1),
      redo: [...state.redo, clone(state.current)],
      dirty: true,
    }
  if (action.type === 'redo' && state.redo.length)
    return {
      current: state.redo[state.redo.length - 1],
      redo: state.redo.slice(0, -1),
      undo: [...state.undo, clone(state.current)].slice(-UNDO_MAX),
      dirty: true,
    }
  return state
}

export function useNewsletterState(initialData: NewsletterData, backupWritesEnabled = true) {
  const [history, dispatch] = useReducer(reduce, {
    current: initialData,
    undo: [],
    redo: [],
    dirty: false,
  })
  const initialRef = useRef(initialData)
  useEffect(() => {
    if (initialRef.current !== initialData) {
      initialRef.current = initialData
      dispatch({ type: 'reset', value: initialData })
    }
  }, [initialData])
  useEffect(() => {
    if (!backupWritesEnabled || !history.dirty) return
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(
          'wsu_newsletter_backup',
          JSON.stringify({
            state: history.current,
            timestamp: new Date().toISOString(),
            version: '7.0.2',
          }),
        )
        dispatch({ type: 'backed-up' })
      } catch {
        /* Retain dirty state when browser storage is unavailable. */
      }
    }, 30000)
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('beforeunload', warn)
    }
  }, [backupWritesEnabled, history])
  const updateState = useCallback(
    (updater: (prev: NewsletterData) => NewsletterData, pushHistory = true) =>
      dispatch({ type: 'update', updater, history: pushHistory }),
    [],
  )
  const resetState = useCallback((value: NewsletterData) => dispatch({ type: 'reset', value }), [])
  const undo = useCallback(() => dispatch({ type: 'undo' }), [])
  const redo = useCallback(() => dispatch({ type: 'redo' }), [])
  const loadFromLocalStorage = useCallback((): NewsletterData | null => {
    try {
      const raw = localStorage.getItem('wsu_newsletter_backup')
      if (!raw) return null
      const backup = JSON.parse(raw)
      const age = Date.now() - new Date(backup.timestamp).getTime()
      return Number.isFinite(age) && age < 86400000 ? backup.state : null
    } catch {
      return null
    }
  }, [])
  return {
    state: history.current,
    updateState,
    undo,
    redo,
    canUndo: history.undo.length > 0,
    canRedo: history.redo.length > 0,
    resetState,
    loadFromLocalStorage,
  }
}

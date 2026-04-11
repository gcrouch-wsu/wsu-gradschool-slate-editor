// components/editor/SectionsEditor.tsx - Sections editor component

'use client'

import { useState } from 'react'
import type { NewsletterData, Section, Card, Closure } from '@/types/newsletter'
import { Plus, Trash2, Edit2, FileText, GripVertical, Calendar } from 'lucide-react'
import CardEditor from './CardEditor'
import ClosureEditor from './ClosureEditor'
import ConfirmModal from './ConfirmModal'
import PromptModal from './PromptModal'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface SectionsEditorProps {
  state: NewsletterData
  updateState: (
    updater: (prev: NewsletterData) => NewsletterData,
    pushHistory?: boolean
  ) => void
}

// Sortable section item component
function SortableSectionItem({
  section,
  sectionIndex,
  onRemoveSection,
  children,
}: {
  section: Section
  sectionIndex: number
  onRemoveSection: (index: number) => void
  children: React.ReactNode
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `section-${sectionIndex}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-4 border-2 border-dashed border-wsu-border-light rounded-lg bg-wsu-bg-light ${
        isDragging ? 'shadow-lg ring-2 ring-wsu-crimson' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing text-wsu-text-muted hover:text-wsu-crimson transition-colors flex-shrink-0 p-1 -ml-1"
            title="Drag to reorder section"
          >
            <GripVertical className="w-5 h-5" />
          </div>
          <h4 className="font-semibold text-wsu-crimson">
            {section.title || section.key}
          </h4>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onRemoveSection(sectionIndex)}
            className="p-1 text-red-600 hover:text-red-700"
            title="Remove section"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
      {children}
    </div>
  )
}

// Sortable card item component
function SortableCardItem({
  card,
  cardIndex,
  sectionIndex,
  onEdit,
  onRemove,
}: {
  card: Card
  cardIndex: number
  sectionIndex: number
  onEdit: (sectionIndex: number, cardIndex: number) => void
  onRemove: (sectionIndex: number, cardIndex: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `card-${sectionIndex}-${cardIndex}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-2 bg-white border border-wsu-border-light rounded-md flex items-center justify-between ${
        isDragging ? 'shadow-lg ring-2 ring-wsu-crimson' : ''
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-wsu-text-muted hover:text-wsu-crimson transition-colors flex-shrink-0 p-1 -ml-1"
          title="Drag to reorder"
        >
          <GripVertical className="w-5 h-5" />
        </div>
        <FileText className="w-5 h-5 text-wsu-text-muted flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-wsu-text-dark truncate">
            {'title' in card && card.title
              ? card.title
              : `Card ${cardIndex + 1} (${card.type})`}
          </div>
          <div className="text-xs text-wsu-text-muted">{card.type}</div>
        </div>
      </div>
      <div className="flex gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit(sectionIndex, cardIndex)
          }}
          className="p-1 text-wsu-crimson hover:text-wsu-crimson-dark"
          title="Edit card"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove(sectionIndex, cardIndex)
          }}
          className="p-1 text-red-600 hover:text-red-700"
          title="Remove card"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

// Sortable closure item component
function SortableClosureItem({
  closure,
  closureIndex,
  sectionIndex,
  onEdit,
  onRemove,
}: {
  closure: Closure
  closureIndex: number
  sectionIndex: number
  onEdit: (sectionIndex: number, closureIndex: number) => void
  onRemove: (sectionIndex: number, closureIndex: number) => void
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: `closure-${sectionIndex}-${closureIndex}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`p-2 bg-white border border-wsu-border-light rounded-md flex items-center justify-between ${
        isDragging ? 'shadow-lg ring-2 ring-wsu-crimson' : ''
      }`}
    >
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div
          {...attributes}
          {...listeners}
          className="cursor-grab active:cursor-grabbing text-wsu-text-muted hover:text-wsu-crimson transition-colors flex-shrink-0 p-1 -ml-1"
          title="Drag to reorder"
        >
          <GripVertical className="w-5 h-5" />
        </div>
        <Calendar className="w-5 h-5 text-wsu-text-muted flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-wsu-text-dark truncate">
            {closure.date || `Closure ${closureIndex + 1}`}
          </div>
          <div className="text-xs text-wsu-text-muted truncate">
            {closure.reason || 'No reason specified'}
          </div>
        </div>
      </div>
      <div className="flex gap-1">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onEdit(sectionIndex, closureIndex)
          }}
          className="p-1 text-wsu-crimson hover:text-wsu-crimson-dark"
          title="Edit closure"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove(sectionIndex, closureIndex)
          }}
          className="p-1 text-red-600 hover:text-red-700"
          title="Remove closure"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}

export default function SectionsEditor({
  state,
  updateState,
}: SectionsEditorProps) {
  const sections = state.sections || []
  const [editingCard, setEditingCard] = useState<{
    sectionIndex: number
    cardIndex: number
    card: Card
  } | null>(null)
  const [editingClosure, setEditingClosure] = useState<{
    sectionIndex: number
    closureIndex: number
    closure: Closure
  } | null>(null)
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    onConfirm: () => void
    variant?: 'danger' | 'warning' | 'info'
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  })
  const [promptModal, setPromptModal] = useState<{
    isOpen: boolean
    title: string
    message: string
    defaultValue?: string
    placeholder?: string
    onConfirm: (value: string) => void
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
  })

  // Drag and drop sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const addSection = () => {
    setPromptModal({
      isOpen: true,
      title: 'Add New Section',
      message: 'Enter a title for the new section:',
      placeholder: 'Section title',
      onConfirm: (title) => {
        if (!title) return

        const key = title.toLowerCase().replace(/\s+/g, '_')
        const isClosuresSection = key === 'closures'

        updateState(
          (prev) => ({
            ...prev,
            sections: [
              ...prev.sections,
              {
                key,
                title,
                layout: {
                  padding_top: 18,
                  padding_bottom: 28,
                  background_color: '',
                  border_radius: 0,
                  divider_enabled: true,
                  divider_thickness: 2,
                  // Don't set divider_color here - let it fall back to global settings
                  divider_spacing: 24,
                  title_align: 'left',
                },
                ...(isClosuresSection ? { closures: [] } : { cards: [] }),
              },
            ],
          }),
          true
        )
        setPromptModal({ isOpen: false, title: '', message: '', onConfirm: () => {} })
      },
    })
  }

  const removeSection = (index: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remove Section',
      message: 'Are you sure you want to remove this entire section? This action cannot be undone.',
      variant: 'danger',
      onConfirm: () => {
        updateState(
          (prev) => ({
            ...prev,
            sections: prev.sections.filter((_, i) => i !== index),
          }),
          true
        )
        setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} })
      },
    })
  }

  // Handle section drag end
  const handleSectionDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const activeId = String(active.id)
    const overId = String(over.id)

    // Only handle section drags, ignore card drags (they have format "card-{sectionIndex}-{cardIndex}")
    if (!activeId.startsWith('section-') || !overId.startsWith('section-')) {
      return
    }

    // Extract indices from IDs (format: "section-{sectionIndex}")
    const activeMatch = activeId.match(/section-(\d+)/)
    const overMatch = overId.match(/section-(\d+)/)

    if (!activeMatch || !overMatch) {
      return
    }

    const activeSectionIndex = parseInt(activeMatch[1], 10)
    const overSectionIndex = parseInt(overMatch[1], 10)

    // Use the state updater function to get the latest state
    updateState(
      (prev) => {
        const newSections = arrayMove(
          [...prev.sections],
          activeSectionIndex,
          overSectionIndex
        )

        return {
          ...prev,
          sections: newSections,
        }
      },
      true
    )
  }

  const updateSection = (index: number, section: Section) => {
    updateState((prev) => {
      const newSections = [...prev.sections]
      newSections[index] = section
      return { ...prev, sections: newSections }
    })
  }

  const addCard = (sectionIndex: number, cardType: Card['type']) => {
    const newCard: Card = (() => {
      switch (cardType) {
        case 'letter':
          return {
            type: 'letter',
            greeting: '',
            body_html: '',
            closing: '',
            signature_name: '',
            signature_lines: [],
            links: [],
            spacing_bottom: 20,
            background_color: '#f9f9f9',
          }
        case 'cta':
          return {
            type: 'cta',
            title: '',
            body_html: '',
            links: [],
            text_alignment: 'center',
            button_alignment: 'center',
            button_bg_color: '#A60F2D',
            button_text_color: '#ffffff',
          }
        case 'event':
          return {
            type: 'event',
            title: '',
            body_html: '',
            links: [],
          }
        case 'resource':
          return {
            type: 'resource',
            title: '',
            body_html: '',
            links: [],
            show_icon: false,
          }
        default:
          return {
            type: 'standard',
            title: '',
            body_html: '',
            links: [],
          }
      }
    })()

    // Get current card count before adding
    const section = sections[sectionIndex]
    const cardIndex = section.cards?.length || 0

    updateState(
      (prev) => {
        const newSections = [...prev.sections]
        const section = newSections[sectionIndex]
        if (!section.cards) {
          section.cards = []
        }
        section.cards.push(newCard)
        return { ...prev, sections: newSections }
      },
      true
    )

    // Open editor for the new card
    setEditingCard({
      sectionIndex,
      cardIndex,
      card: newCard,
    })
  }

  const editCard = (sectionIndex: number, cardIndex: number) => {
    const section = sections[sectionIndex]
    const card = section.cards?.[cardIndex]
    if (card) {
      setEditingCard({ sectionIndex, cardIndex, card })
    }
  }

  const saveCard = (card: Card) => {
    if (!editingCard) return

    updateState(
      (prev) => {
        const newSections = [...prev.sections]
        const section = newSections[editingCard.sectionIndex]
        if (section.cards) {
          section.cards[editingCard.cardIndex] = card
        }
        return { ...prev, sections: newSections }
      },
      true
    )

    setEditingCard(null)
  }

  const deleteCard = () => {
    if (!editingCard) return

    updateState(
      (prev) => {
        const newSections = [...prev.sections]
        const section = newSections[editingCard.sectionIndex]
        if (section.cards) {
          section.cards.splice(editingCard.cardIndex, 1)
        }
        return { ...prev, sections: newSections }
      },
      true
    )

    setEditingCard(null)
  }

  const removeCard = (sectionIndex: number, cardIndex: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remove Card',
      message: 'Are you sure you want to remove this card? This action cannot be undone.',
      variant: 'danger',
      onConfirm: () => {
        updateState(
          (prev) => {
            const newSections = [...prev.sections]
            const section = newSections[sectionIndex]
            if (section.cards) {
              section.cards.splice(cardIndex, 1)
            }
            return { ...prev, sections: newSections }
          },
          true
        )
        setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} })
      },
    })
  }

  // Closure management functions
  const addClosure = (sectionIndex: number) => {
    const newClosure: Closure = {
      date: '',
      reason: '',
    }

    // Get current closure count before adding
    const section = sections[sectionIndex]
    const closureIndex = section.closures?.length || 0

    updateState(
      (prev) => {
        const newSections = [...prev.sections]
        const section = newSections[sectionIndex]
        if (!section.closures) {
          section.closures = []
        }
        section.closures.push(newClosure)
        return { ...prev, sections: newSections }
      },
      true
    )

    // Open editor for the new closure
    setEditingClosure({
      sectionIndex,
      closureIndex,
      closure: newClosure,
    })
  }

  const editClosure = (sectionIndex: number, closureIndex: number) => {
    const section = sections[sectionIndex]
    const closure = section.closures?.[closureIndex]
    if (closure) {
      setEditingClosure({ sectionIndex, closureIndex, closure })
    }
  }

  const saveClosure = (closure: Closure) => {
    if (!editingClosure) return

    updateState(
      (prev) => {
        const newSections = [...prev.sections]
        const section = newSections[editingClosure.sectionIndex]
        if (section.closures) {
          section.closures[editingClosure.closureIndex] = closure
        }
        return { ...prev, sections: newSections }
      },
      true
    )

    setEditingClosure(null)
  }

  const deleteClosure = () => {
    if (!editingClosure) return

    updateState(
      (prev) => {
        const newSections = [...prev.sections]
        const section = newSections[editingClosure.sectionIndex]
        if (section.closures) {
          section.closures.splice(editingClosure.closureIndex, 1)
        }
        return { ...prev, sections: newSections }
      },
      true
    )

    setEditingClosure(null)
  }

  const removeClosure = (sectionIndex: number, closureIndex: number) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remove Closure',
      message: 'Are you sure you want to remove this closure? This action cannot be undone.',
      variant: 'danger',
      onConfirm: () => {
        updateState(
          (prev) => {
            const newSections = [...prev.sections]
            const section = newSections[sectionIndex]
            if (section.closures) {
              section.closures.splice(closureIndex, 1)
            }
            return { ...prev, sections: newSections }
          },
          true
        )
        setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} })
      },
    })
  }

  // Handle closure drag end
  const handleClosureDragEnd = (event: DragEndEvent, sectionIndex: number) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const activeId = String(active.id)
    const overId = String(over.id)

    // Extract indices from IDs (format: "closure-{sectionIndex}-{closureIndex}")
    const activeMatch = activeId.match(/closure-(\d+)-(\d+)/)
    const overMatch = overId.match(/closure-(\d+)-(\d+)/)

    if (!activeMatch || !overMatch) {
      return
    }

    const activeSectionIndex = parseInt(activeMatch[1], 10)
    const activeClosureIndex = parseInt(activeMatch[2], 10)
    const overSectionIndex = parseInt(overMatch[1], 10)
    const overClosureIndex = parseInt(overMatch[2], 10)

    // Only proceed if both closures are in the same section
    if (activeSectionIndex !== overSectionIndex || activeSectionIndex !== sectionIndex) {
      return
    }

    // Use the state updater function to get the latest state
    updateState(
      (prev) => {
        const newSections = [...prev.sections]
        const section = newSections[sectionIndex]
        
        if (!section || !section.closures || section.closures.length === 0) {
          return prev
        }

        // Ensure indices are valid
        if (
          activeClosureIndex < 0 ||
          activeClosureIndex >= section.closures.length ||
          overClosureIndex < 0 ||
          overClosureIndex >= section.closures.length
        ) {
          return prev
        }

        // Create a new array with reordered closures
        const newClosures = arrayMove(
          [...section.closures],
          activeClosureIndex,
          overClosureIndex
        )

        // Update the section with the new closures array
        newSections[sectionIndex] = {
          ...section,
          closures: newClosures,
        }

        return {
          ...prev,
          sections: newSections,
        }
      },
      true
    )
  }

  // Handle card drag end
  const handleCardDragEnd = (event: DragEndEvent, sectionIndex: number) => {
    const { active, over } = event

    if (!over || active.id === over.id) {
      return
    }

    const activeId = String(active.id)
    const overId = String(over.id)

    // Extract indices from IDs (format: "card-{sectionIndex}-{cardIndex}")
    const activeMatch = activeId.match(/card-(\d+)-(\d+)/)
    const overMatch = overId.match(/card-(\d+)-(\d+)/)

    if (!activeMatch || !overMatch) {
      return
    }

    const activeSectionIndex = parseInt(activeMatch[1], 10)
    const activeCardIndex = parseInt(activeMatch[2], 10)
    const overSectionIndex = parseInt(overMatch[1], 10)
    const overCardIndex = parseInt(overMatch[2], 10)

    // Only proceed if both cards are in the same section
    if (activeSectionIndex !== overSectionIndex || activeSectionIndex !== sectionIndex) {
      return
    }

    // Use the state updater function to get the latest state
    updateState(
      (prev) => {
        const newSections = [...prev.sections]
        const section = newSections[sectionIndex]
        
        if (!section || !section.cards || section.cards.length === 0) {
          return prev
        }

        // Ensure indices are valid
        if (
          activeCardIndex < 0 ||
          activeCardIndex >= section.cards.length ||
          overCardIndex < 0 ||
          overCardIndex >= section.cards.length
        ) {
          return prev
        }

        // Create a new array with reordered cards
        const newCards = arrayMove(
          [...section.cards],
          activeCardIndex,
          overCardIndex
        )

        // Update the section with the new cards array
        newSections[sectionIndex] = {
          ...section,
          cards: newCards,
        }

        return {
          ...prev,
          sections: newSections,
        }
      },
      true
    )
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleSectionDragEnd}
      >
        <SortableContext
          items={sections.map((_, index) => `section-${index}`)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
                {sections.map((section, sectionIndex) => (
                  <SortableSectionItem
                    key={section.key || `section-${sectionIndex}`}
                    section={section}
                    sectionIndex={sectionIndex}
                    onRemoveSection={removeSection}
                  >
                <div className="space-y-2">
                  <div>
                    <label className="block text-xs font-medium text-wsu-text-dark mb-1">
                      Section Title
                    </label>
                    <input
                      type="text"
                      value={section.title || ''}
                      onChange={(e) =>
                        updateSection(sectionIndex, {
                          ...section,
                          title: e.target.value,
                        })
                      }
                      className="w-full px-2 py-1 text-sm border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson"
                    />
                  </div>

                  {/* Closures List - Draggable */}
                  {section.key === 'closures' && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-wsu-text-dark mb-2">
                        Closures ({section.closures?.length || 0})
                      </div>
                      {section.closures && section.closures.length > 0 ? (
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={(event) => handleClosureDragEnd(event, sectionIndex)}
                        >
                          <SortableContext
                            items={section.closures.map(
                              (_, index) => `closure-${sectionIndex}-${index}`
                            )}
                            strategy={verticalListSortingStrategy}
                          >
                            <div className="space-y-2">
                              {section.closures.map((closure, closureIndex) => {
                                const closureKey = `${section.key || sectionIndex}-closure-${closureIndex}-${closure.date || ''}`
                                return (
                                  <SortableClosureItem
                                    key={closureKey}
                                    closure={closure}
                                    closureIndex={closureIndex}
                                    sectionIndex={sectionIndex}
                                    onEdit={editClosure}
                                    onRemove={removeClosure}
                                  />
                                )
                              })}
                            </div>
                          </SortableContext>
                        </DndContext>
                      ) : (
                        <p className="text-xs text-wsu-text-muted mb-2">
                          No closures added yet. Click &quot;Add Closure&quot; to add one.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Add Closure Button - Only show for closures sections */}
                  {section.key === 'closures' && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-wsu-text-dark mb-2">
                        Add Closure
                      </div>
                      <button
                        onClick={() => addClosure(sectionIndex)}
                        className="px-2 py-1 text-xs font-medium text-wsu-crimson border border-wsu-crimson rounded-md hover:bg-wsu-crimson/10 transition-colors flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add Closure
                      </button>
                    </div>
                  )}

                  {/* Cards List - Draggable */}
                  {section.key !== 'closures' && section.cards && section.cards.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-wsu-text-dark mb-2">
                        Cards ({section.cards.length})
                      </div>
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(event) => handleCardDragEnd(event, sectionIndex)}
                      >
                        <SortableContext
                          items={section.cards.map(
                            (_, index) => `card-${sectionIndex}-${index}`
                          )}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="space-y-2">
                            {section.cards.map((card, cardIndex) => {
                              // Create a stable key that includes the card content to help React track changes
                              const cardKey = `${section.key || sectionIndex}-card-${cardIndex}-${card.type}-${'title' in card && card.title ? card.title.slice(0, 10) : ''}`
                              return (
                                <SortableCardItem
                                  key={cardKey}
                                  card={card}
                                  cardIndex={cardIndex}
                                  sectionIndex={sectionIndex}
                                  onEdit={editCard}
                                  onRemove={removeCard}
                                />
                              )
                            })}
                          </div>
                        </SortableContext>
                      </DndContext>
                    </div>
                  )}

                  {/* Add Card Button - Only show for non-closures sections */}
                  {section.key !== 'closures' && (
                    <div className="mt-3">
                      <div className="text-xs font-medium text-wsu-text-dark mb-2">
                        Add Card
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => addCard(sectionIndex, 'standard')}
                          className="px-2 py-1 text-xs font-medium text-wsu-crimson border border-wsu-crimson rounded-md hover:bg-wsu-crimson/10 transition-colors"
                        >
                          Standard
                        </button>
                        <button
                          onClick={() => addCard(sectionIndex, 'event')}
                          className="px-2 py-1 text-xs font-medium text-wsu-crimson border border-wsu-crimson rounded-md hover:bg-wsu-crimson/10 transition-colors"
                        >
                          Event
                        </button>
                        <button
                          onClick={() => addCard(sectionIndex, 'resource')}
                          className="px-2 py-1 text-xs font-medium text-wsu-crimson border border-wsu-crimson rounded-md hover:bg-wsu-crimson/10 transition-colors"
                        >
                          Resource
                        </button>
                        <button
                          onClick={() => addCard(sectionIndex, 'cta')}
                          className="px-2 py-1 text-xs font-medium text-wsu-crimson border border-wsu-crimson rounded-md hover:bg-wsu-crimson/10 transition-colors"
                        >
                          CTA
                        </button>
                        <button
                          onClick={() => addCard(sectionIndex, 'letter')}
                          className="px-2 py-1 text-xs font-medium text-wsu-crimson border border-wsu-crimson rounded-md hover:bg-wsu-crimson/10 transition-colors"
                        >
                          Letter
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </SortableSectionItem>
            ))}

            <button
              onClick={addSection}
              className="w-full px-4 py-2 text-sm font-medium text-wsu-crimson border-2 border-dashed border-wsu-crimson rounded-lg hover:bg-wsu-crimson/10 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add New Section
            </button>
          </div>
        </SortableContext>
      </DndContext>

      {/* Card Editor Modal */}
      {editingCard && (
        <CardEditor
          card={editingCard.card}
          onSave={saveCard}
          onCancel={() => setEditingCard(null)}
          onDelete={deleteCard}
        />
      )}

      {/* Closure Editor Modal */}
      {editingClosure && (
        <ClosureEditor
          closure={editingClosure.closure}
          onSave={saveClosure}
          onCancel={() => setEditingClosure(null)}
          onDelete={deleteClosure}
        />
      )}

      {/* Confirm Modal */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        title={confirmModal.title}
        message={confirmModal.message}
        variant={confirmModal.variant}
        onConfirm={confirmModal.onConfirm}
        onCancel={() =>
          setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: () => {} })
        }
      />

      {/* Prompt Modal */}
      <PromptModal
        isOpen={promptModal.isOpen}
        title={promptModal.title}
        message={promptModal.message}
        defaultValue={promptModal.defaultValue}
        placeholder={promptModal.placeholder}
        onConfirm={promptModal.onConfirm}
        onCancel={() =>
          setPromptModal({ isOpen: false, title: '', message: '', onConfirm: () => {} })
        }
      />
    </>
  )
}


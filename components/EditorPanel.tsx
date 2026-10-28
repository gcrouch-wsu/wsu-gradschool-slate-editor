// components/editor/EditorPanel.tsx - Main editor panel

'use client'

import { useState } from 'react'
import type { NewsletterData, TemplateType } from '@/types/newsletter'
import MastheadEditor from './MastheadEditor'
import SectionsEditor from './SectionsEditor'
import FooterEditor from './FooterEditor'
import SettingsEditor from './SettingsEditor'
import {
  Settings,
  FileText,
  Mail,
  ChevronDown,
  ChevronRight,
} from 'lucide-react'

interface EditorPanelProps {
  state: NewsletterData
  updateState: (updater: (prev: NewsletterData) => NewsletterData, pushHistory?: boolean) => void
  templateType: TemplateType
  onTemplateChange?: (type: TemplateType) => void
  readOnly?: boolean
  onAssist?: (sectionIndex: number, cardIndex: number) => void
  onSuggestPreheader?: () => void
  onReview?: () => void
  /** Shared drafts lead with the issue details and keep rarely used settings last. */
  issueFirst?: boolean
  storyRequest?: { sectionIndex: number; cardIndex: number; nonce: number } | null
}

export default function EditorPanel({
  state,
  updateState,
  templateType,
  onTemplateChange,
  readOnly = false,
  onAssist,
  onSuggestPreheader,
  onReview,
  issueFirst = false,
  storyRequest = null,
}: EditorPanelProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    settings: false,
    masthead: issueFirst,
    sections: true,
    footer: !issueFirst,
  })
  const [handledRequest, setHandledRequest] = useState(storyRequest)
  if (storyRequest !== handledRequest) {
    // Opening a story from a check result also reveals its section list.
    setHandledRequest(storyRequest)
    if (storyRequest && !openSections.sections) setOpenSections((prev) => ({ ...prev, sections: true }))
  }
  const panels = {
    settings: {
      title: 'Global Settings',
      icon: Settings,
      content: <SettingsEditor state={state} updateState={updateState} />,
    },
    masthead: {
      title: 'Masthead',
      icon: FileText,
      content: <MastheadEditor state={state} updateState={updateState} onSuggestPreheader={onSuggestPreheader} />,
    },
    sections: {
      title: 'Sections',
      icon: FileText,
      content: (
        <>
          {onReview && (
            <button
              type="button"
              className="mb-4 inline-flex min-h-11 items-center rounded-md border-2 border-wsu-crimson px-3 text-sm font-semibold text-wsu-crimson"
              onClick={onReview}
            >
              Review newsletter
            </button>
          )}
          <SectionsEditor state={state} updateState={updateState} onAssist={onAssist} storyRequest={storyRequest} />
        </>
      ),
    },
    footer: {
      title: 'Footer',
      icon: Mail,
      content: <FooterEditor state={state} updateState={updateState} />,
    },
  }

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  return (
    <fieldset disabled={readOnly} className="overflow-y-auto bg-white border-r border-wsu-border-light p-4 min-w-0">
      {/* Template Selection */}
      {onTemplateChange && (
        <div className="mb-4 p-4 bg-wsu-bg-light rounded-lg border border-wsu-border-light">
          <label htmlFor="newsletter-template" className="block mb-2 font-medium text-wsu-text-dark">Template</label>
          <select
            id="newsletter-template"
            value={templateType}
            onChange={(e) => onTemplateChange(e.target.value as TemplateType)}
            className="w-full px-3 py-2 border border-wsu-border-light rounded-md focus:outline-none focus:ring-2 focus:ring-wsu-crimson focus:border-transparent"
          >
            <option value="ff">Friday Focus (Students)</option>
            <option value="briefing">Graduate School Briefing (Faculty/Staff)</option>
            <option value="letter">Graduate School Slate Campaign</option>
          </select>
          <p className="mt-2 text-xs text-wsu-text-muted">
            Switching templates will load default content for that template type.
          </p>
        </div>
      )}

      {(issueFirst
        ? (['masthead', 'sections', 'footer', 'settings'] as const)
        : (['settings', 'masthead', 'sections', 'footer'] as const)
      ).map((key) => {
        const panel = panels[key]
        const Icon = panel.icon
        return (
          <div key={key} className="mb-4 border border-wsu-border-light rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => toggleSection(key)}
              aria-expanded={openSections[key]}
              aria-controls={`panel-${key}`}
              className="w-full flex items-center justify-between p-4 bg-wsu-bg-light hover:bg-wsu-bg-card transition-colors"
            >
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-wsu-crimson" />
                <span className="font-semibold text-wsu-text-dark">{panel.title}</span>
              </div>
              {openSections[key] ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            </button>
            {openSections[key] && (
              <div id={`panel-${key}`} className="p-4">
                {panel.content}
              </div>
            )}
          </div>
        )
      })}
    </fieldset>
  )
}

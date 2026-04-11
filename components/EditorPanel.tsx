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
  updateState: (
    updater: (prev: NewsletterData) => NewsletterData,
    pushHistory?: boolean
  ) => void
  templateType: TemplateType
  onTemplateChange: (type: TemplateType) => void
}

export default function EditorPanel({
  state,
  updateState,
  templateType,
  onTemplateChange,
}: EditorPanelProps) {
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    settings: false,
    masthead: false,
    sections: true,
    footer: true,
  })

  const toggleSection = (section: string) => {
    setOpenSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  return (
    <div className="overflow-y-auto bg-white border-r border-wsu-border-light p-4">
      {/* Template Selection */}
      <div className="mb-4 p-4 bg-wsu-bg-light rounded-lg border border-wsu-border-light">
        <label className="block mb-2 font-medium text-wsu-text-dark">
          Template
        </label>
        <select
          value={templateType}
          onChange={(e) =>
            onTemplateChange(e.target.value as TemplateType)
          }
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

      {/* Global Settings */}
      <div className="mb-4 border border-wsu-border-light rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('settings')}
          className="w-full flex items-center justify-between p-4 bg-wsu-bg-light hover:bg-wsu-bg-card transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings className="w-4 h-4 text-wsu-crimson" />
            <span className="font-semibold text-wsu-text-dark">
              Global Settings
            </span>
          </div>
          {openSections.settings ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
        {openSections.settings && (
          <div className="p-4">
            <SettingsEditor state={state} updateState={updateState} />
          </div>
        )}
      </div>

      {/* Masthead */}
      <div className="mb-4 border border-wsu-border-light rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('masthead')}
          className="w-full flex items-center justify-between p-4 bg-wsu-bg-light hover:bg-wsu-bg-card transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-wsu-crimson" />
            <span className="font-semibold text-wsu-text-dark">Masthead</span>
          </div>
          {openSections.masthead ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
        {openSections.masthead && (
          <div className="p-4">
            <MastheadEditor state={state} updateState={updateState} />
          </div>
        )}
      </div>

      {/* Sections */}
      <div className="mb-4 border border-wsu-border-light rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('sections')}
          className="w-full flex items-center justify-between p-4 bg-wsu-bg-light hover:bg-wsu-bg-card transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-wsu-crimson" />
            <span className="font-semibold text-wsu-text-dark">Sections</span>
          </div>
          {openSections.sections ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
        {openSections.sections && (
          <div className="p-4">
            <SectionsEditor state={state} updateState={updateState} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="mb-4 border border-wsu-border-light rounded-lg overflow-hidden">
        <button
          onClick={() => toggleSection('footer')}
          className="w-full flex items-center justify-between p-4 bg-wsu-bg-light hover:bg-wsu-bg-card transition-colors"
        >
          <div className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-wsu-crimson" />
            <span className="font-semibold text-wsu-text-dark">Footer</span>
          </div>
          {openSections.footer ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </button>
        {openSections.footer && (
          <div className="p-4">
            <FooterEditor state={state} updateState={updateState} />
          </div>
        )}
      </div>
    </div>
  )
}


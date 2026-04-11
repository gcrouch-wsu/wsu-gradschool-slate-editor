// defaults.ts - Default newsletter data models

import type { NewsletterData } from '@/types/newsletter'
import {
  FRIDAY_FOCUS,
  BRIEFING,
  LETTER,
  DEFAULT_BANNER_URL,
  DEFAULT_BANNER_ALT,
  ORGANIZATION,
  DEFAULT_SOCIAL_LINKS,
  SECTION_LAYOUT_DEFAULTS,
  CARD_DEFAULTS,
  CTA_BUTTON_DEFAULTS,
  FOOTER_DEFAULTS,
  LAYOUT_DEFAULTS,
  TYPOGRAPHY_DEFAULTS,
  BRAND_PRIMARY,
  TEXT_DARK,
  TEXT_BODY,
  TEXT_MUTED,
  RESOURCE_LINKS,
  RESOURCE_ICONS,
  SAMPLE_EVENT,
} from './config'

function createDefaultSectionLayout() {
  return {
    padding_top: SECTION_LAYOUT_DEFAULTS.padding_top,
    padding_bottom: SECTION_LAYOUT_DEFAULTS.padding_bottom,
    background_color: SECTION_LAYOUT_DEFAULTS.background_color,
    border_radius: SECTION_LAYOUT_DEFAULTS.border_radius,
    divider_enabled: SECTION_LAYOUT_DEFAULTS.divider_enabled,
    divider_thickness: SECTION_LAYOUT_DEFAULTS.divider_thickness,
    // Don't set divider_color here - let it fall back to global settings
    divider_spacing: SECTION_LAYOUT_DEFAULTS.divider_spacing,
    title_align: SECTION_LAYOUT_DEFAULTS.title_align,
  }
}

function applyConfigDefaults(
  modelData: NewsletterData,
  templateType: 'ff' | 'briefing' | 'letter'
): NewsletterData {
  if (templateType === 'ff') {
    modelData.masthead.title =
      modelData.masthead.title || FRIDAY_FOCUS.title
    modelData.masthead.tagline =
      modelData.masthead.tagline || FRIDAY_FOCUS.tagline
    modelData.masthead.preheader =
      modelData.masthead.preheader || FRIDAY_FOCUS.preheader
  } else if (templateType === 'briefing') {
    modelData.masthead.title = modelData.masthead.title || BRIEFING.title
    modelData.masthead.tagline =
      modelData.masthead.tagline || BRIEFING.tagline
    modelData.masthead.preheader =
      modelData.masthead.preheader || BRIEFING.preheader
  } else if (templateType === 'letter') {
    modelData.masthead.title = modelData.masthead.title || LETTER.title
    modelData.masthead.tagline =
      modelData.masthead.tagline || LETTER.tagline
    modelData.masthead.preheader =
      modelData.masthead.preheader || LETTER.preheader
  }

  // Apply branding defaults
  modelData.masthead.banner_url =
    modelData.masthead.banner_url || DEFAULT_BANNER_URL
  modelData.masthead.banner_alt =
    modelData.masthead.banner_alt || DEFAULT_BANNER_ALT

  // Apply footer defaults
  if (!modelData.footer.address_lines || modelData.footer.address_lines.length === 0) {
    modelData.footer.address_lines = [
      ORGANIZATION.name,
      ORGANIZATION.address_line_1,
      ORGANIZATION.address_line_2,
    ]
  }

  // V7: Apply social defaults (array-based)
  if (!modelData.footer.social || modelData.footer.social.length === 0) {
    modelData.footer.social = [...DEFAULT_SOCIAL_LINKS]
  }

  return modelData
}

export function defaultFFModel(): NewsletterData {
  const model: NewsletterData = {
    template: 'ff',
    masthead: {
      banner_url: DEFAULT_BANNER_URL,
      banner_alt: DEFAULT_BANNER_ALT,
      title: FRIDAY_FOCUS.title,
      tagline: FRIDAY_FOCUS.tagline,
      preheader: FRIDAY_FOCUS.preheader,
      hero_show: true,
      hero_link: '',
    },
    sections: [
      {
        key: 'deadlines',
        title: 'Deadlines and Important Information',
        layout: createDefaultSectionLayout(),
        cards: [
          {
            type: 'standard',
            title: 'Sample Announcement',
            body_html: '<p>Placeholder body copy for a standard item.</p>',
            location: 'Building / Room',
            date: '',
            time: '',
            links: [{ label: 'Read more', url: '#' }],
            background_color: CARD_DEFAULTS.background_color,
          },
        ],
      },
      {
        key: 'events',
        title: 'Upcoming Events',
        layout: createDefaultSectionLayout(),
        cards: [
          {
            type: 'event',
            title: SAMPLE_EVENT.title,
            body_html: SAMPLE_EVENT.body_html,
            location: SAMPLE_EVENT.location,
            date: SAMPLE_EVENT.date,
            time: SAMPLE_EVENT.time,
            links: [{ label: 'Learn more', url: '#' }],
            background_color: '#f9f9f9',
          },
        ],
      },
      {
        key: 'resources',
        title: 'Resources',
        layout: createDefaultSectionLayout(),
        cards: [
          {
            type: 'resource',
            title: RESOURCE_LINKS.health_counseling.title,
            body_html: RESOURCE_LINKS.health_counseling.body_html,
            location: '',
            date: '',
            time: '',
            show_icon: true,
            icon_url: RESOURCE_ICONS.health_counseling,
            icon_alt: 'Health and Counseling Services icon',
            icon_size: 80,
            links: [
              {
                label: 'Read more',
                url: RESOURCE_LINKS.health_counseling.url,
              },
            ],
          },
          {
            type: 'resource',
            title: RESOURCE_LINKS.basic_needs.title,
            body_html: RESOURCE_LINKS.basic_needs.body_html,
            show_icon: true,
            icon_url: RESOURCE_ICONS.basic_needs,
            icon_alt: 'Basic Needs icon',
            icon_size: 80,
            links: [
              { label: 'Read more', url: RESOURCE_LINKS.basic_needs.url },
            ],
          },
          {
            type: 'resource',
            title: RESOURCE_LINKS.career_services.title,
            body_html: RESOURCE_LINKS.career_services.body_html,
            show_icon: true,
            icon_url: RESOURCE_ICONS.career_services,
            icon_alt: 'Career Services icon',
            icon_size: 80,
            links: [
              { label: 'Read more', url: RESOURCE_LINKS.career_services.url },
            ],
          },
        ],
      },
      {
        key: 'submit_request',
        title: '',
        layout: createDefaultSectionLayout(),
        cards: [
          {
            type: 'cta',
            title: 'Want to advertise in Friday Focus?',
            body_html:
              '<p>Submit your events, announcements, and opportunities for the next newsletter.</p>',
            text_alignment: 'center',
            button_style: CTA_BUTTON_DEFAULTS.style,
            button_bg_color: CTA_BUTTON_DEFAULTS.bg_color,
            button_text_color: CTA_BUTTON_DEFAULTS.text_color,
            button_padding_vertical: CTA_BUTTON_DEFAULTS.padding_vertical,
            button_padding_horizontal: CTA_BUTTON_DEFAULTS.padding_horizontal,
            button_border_width: CTA_BUTTON_DEFAULTS.border_width,
            button_border_color: CTA_BUTTON_DEFAULTS.border_color,
            button_border_style: CTA_BUTTON_DEFAULTS.border_style,
            button_border_radius: CTA_BUTTON_DEFAULTS.border_radius,
            button_alignment: CTA_BUTTON_DEFAULTS.alignment,
            button_full_width: CTA_BUTTON_DEFAULTS.full_width,
            button_font_weight: CTA_BUTTON_DEFAULTS.font_weight,
            button_text_transform: CTA_BUTTON_DEFAULTS.text_transform,
            button_letter_spacing: CTA_BUTTON_DEFAULTS.letter_spacing,
            button_font_size: CTA_BUTTON_DEFAULTS.font_size,
            links: [
              {
                label: 'Please use this form',
                url: FRIDAY_FOCUS.submit_form_url,
              },
            ],
          },
        ],
      },
    ],
    footer: {
      address_lines: [
        ORGANIZATION.name,
        ORGANIZATION.address_line_1,
        ORGANIZATION.address_line_2,
      ],
      social: [...DEFAULT_SOCIAL_LINKS],
      background_color: FOOTER_DEFAULTS.background_color,
      text_color: FOOTER_DEFAULTS.text_color,
      link_color: FOOTER_DEFAULTS.link_color,
      padding_top: FOOTER_DEFAULTS.padding_top,
      padding_bottom: FOOTER_DEFAULTS.padding_bottom,
      social_margin_top: FOOTER_DEFAULTS.social_margin_top,
      social_margin_bottom: FOOTER_DEFAULTS.social_margin_bottom,
    },
    settings: {
      container_width: LAYOUT_DEFAULTS.container_width,
      section_spacing: LAYOUT_DEFAULTS.section_spacing,
      show_section_borders: LAYOUT_DEFAULTS.show_section_borders,
      padding_text: LAYOUT_DEFAULTS.padding_text,
      padding_image: LAYOUT_DEFAULTS.padding_image,
      typography: TYPOGRAPHY_DEFAULTS,
      card_spacing: LAYOUT_DEFAULTS.card_spacing,
      card_border_radius: LAYOUT_DEFAULTS.card_border_radius,
      accent_bar_enabled: true,
      accent_bar_width: LAYOUT_DEFAULTS.accent_bar_width,
      accent_bar_color: BRAND_PRIMARY,
      accent_bar_shadow: {
        enabled: false,
        color: BRAND_PRIMARY,
        blur: 8,
        spread: 0,
        offset_x: 0,
        offset_y: 2,
        opacity: 0.3,
      },
      card_shadow: {
        enabled: false,
        color: '#000000',
        blur: 8,
        spread: 0,
        offset_x: 0,
        offset_y: 2,
        opacity: 0.15,
      },
      divider_color: LAYOUT_DEFAULTS.divider_color,
      divider_margin_top: 0,
      divider_margin_bottom: 0,
      colors: {
        primary: BRAND_PRIMARY,
        text_dark: TEXT_DARK,
        text_body: TEXT_BODY,
        text_muted: TEXT_MUTED,
      },
    },
  }

  return applyConfigDefaults(model, 'ff')
}

export function defaultBriefingModel(): NewsletterData {
  const model: NewsletterData = {
    template: 'briefing',
    masthead: {
      banner_url: DEFAULT_BANNER_URL,
      banner_alt: DEFAULT_BANNER_ALT,
      title: BRIEFING.title,
      tagline: BRIEFING.tagline,
      preheader: BRIEFING.preheader,
      hero_show: true,
      hero_link: '',
    },
    sections: [
      {
        key: 'updates',
        title: 'Updates from the Graduate School',
        layout: createDefaultSectionLayout(),
        cards: [
          {
            type: 'standard',
            title: 'Sample Update',
            body_html: '<p>Plain text summary of an update.</p>',
            links: [],
          },
        ],
      },
      {
        key: 'fiscal',
        title: 'Fiscal Processor Updates',
        layout: createDefaultSectionLayout(),
        cards: [
          {
            type: 'standard',
            title: 'Sample Fiscal Note',
            body_html:
              "<p>Operational information that may impact fiscal processors.</p>",
            links: [],
          },
        ],
      },
      {
        key: 'closures',
        title: 'Graduate School Closures',
        layout: createDefaultSectionLayout(),
        closures: [
          { date: "Jan 1", reason: "Office closed for New Year's Day" },
        ],
      },
      {
        key: 'submit_request',
        title: '',
        layout: createDefaultSectionLayout(),
        cards: [
          {
            type: 'cta',
            title: 'Submit Your Post',
            body_html:
              '<p>Do you have an update or announcement to share? We encourage submissions from all graduate programs. Submit your post here. You can also access <a href="https://gradschool.wsu.edu/faculty-and-staff-updates/">current and archived updates</a>.</p>',
            text_alignment: 'center',
            button_bg_color: CTA_BUTTON_DEFAULTS.bg_color,
            button_text_color: CTA_BUTTON_DEFAULTS.text_color,
            button_padding_vertical: CTA_BUTTON_DEFAULTS.padding_vertical,
            button_padding_horizontal: CTA_BUTTON_DEFAULTS.padding_horizontal,
            button_border_width: CTA_BUTTON_DEFAULTS.border_width,
            button_border_color: CTA_BUTTON_DEFAULTS.border_color,
            button_border_radius: CTA_BUTTON_DEFAULTS.border_radius,
            button_alignment: CTA_BUTTON_DEFAULTS.alignment,
            button_full_width: CTA_BUTTON_DEFAULTS.full_width,
            links: [
              { label: 'Submit your post', url: BRIEFING.submit_form_url },
            ],
          },
        ],
      },
      {
        key: 'assistance',
        title: 'Need Assistance?',
        layout: createDefaultSectionLayout(),
        cards: [
          {
            type: 'standard',
            title: 'Contact Options',
            body_html: `<p>Submit a ticket via our Jira service desk, access resources in our Knowledge Base, email ${ORGANIZATION.email}, or call ${ORGANIZATION.phone}.</p>`,
            links: [
              { label: 'Service Desk', url: BRIEFING.jira_url },
              { label: 'Knowledge Base', url: BRIEFING.knowledge_base_url },
            ],
          },
        ],
      },
    ],
    footer: {
      address_lines: [
        ORGANIZATION.name,
        ORGANIZATION.address_line_1,
        ORGANIZATION.address_line_2,
      ],
      social: [...DEFAULT_SOCIAL_LINKS],
      background_color: FOOTER_DEFAULTS.background_color,
      text_color: FOOTER_DEFAULTS.text_color,
      link_color: FOOTER_DEFAULTS.link_color,
      padding_top: FOOTER_DEFAULTS.padding_top,
      padding_bottom: FOOTER_DEFAULTS.padding_bottom,
      social_margin_top: FOOTER_DEFAULTS.social_margin_top,
      social_margin_bottom: FOOTER_DEFAULTS.social_margin_bottom,
    },
    settings: {
      container_width: LAYOUT_DEFAULTS.container_width,
      section_spacing: LAYOUT_DEFAULTS.section_spacing,
      show_section_borders: LAYOUT_DEFAULTS.show_section_borders,
      padding_text: LAYOUT_DEFAULTS.padding_text,
      padding_image: LAYOUT_DEFAULTS.padding_image,
      typography: TYPOGRAPHY_DEFAULTS,
      card_spacing: LAYOUT_DEFAULTS.card_spacing,
      card_border_radius: LAYOUT_DEFAULTS.card_border_radius,
      accent_bar_enabled: true,
      accent_bar_width: LAYOUT_DEFAULTS.accent_bar_width,
      accent_bar_color: BRAND_PRIMARY,
      accent_bar_shadow: {
        enabled: false,
        color: BRAND_PRIMARY,
        blur: 8,
        spread: 0,
        offset_x: 0,
        offset_y: 2,
        opacity: 0.3,
      },
      card_shadow: {
        enabled: false,
        color: '#000000',
        blur: 8,
        spread: 0,
        offset_x: 0,
        offset_y: 2,
        opacity: 0.15,
      },
      divider_color: LAYOUT_DEFAULTS.divider_color,
      divider_margin_top: 0,
      divider_margin_bottom: 0,
      colors: {
        primary: BRAND_PRIMARY,
        text_dark: TEXT_DARK,
        text_body: TEXT_BODY,
        text_muted: TEXT_MUTED,
      },
    },
  }

  return applyConfigDefaults(model, 'briefing')
}

export function defaultLetterModel(): NewsletterData {
  const model: NewsletterData = {
    template: 'letter',
    masthead: {
      banner_url: DEFAULT_BANNER_URL,
      banner_alt: DEFAULT_BANNER_ALT,
      title: LETTER.title,
      tagline: LETTER.tagline,
      preheader: LETTER.preheader,
      hero_show: true,
      hero_link: '',
    },
    sections: [
      {
        key: 'letter_content',
        title: '',
        layout: createDefaultSectionLayout(),
        cards: [
          {
            type: 'letter',
            greeting: 'Dear Graduate Students,',
            body_html:
              '<p>This is a sample letter-style message. You can customize the greeting, body content, closing, and signature information.</p>',
            closing: 'Sincerely,',
            signature_name: 'Tammy D. Barry',
            signature_lines: [
              'Dean of the Graduate School',
              'Vice Provost for Graduate Education',
            ],
            signature_image_url:
              'https://futurecoug.wsu.edu/www/images/8hG3FTHdpyUZZD4ILkWxI2Z8EjhQLChenToRkB20GeeDWkUQ6k_cxhHBNhmo8Sp1G26HVWE1AYun2gBz7B2XaQ.png',
            signature_image_alt: 'Tammy D. Barry signature',
            signature_image_width: 220,
            links: [],
            background_color: '#ffffff',
          },
        ],
      },
    ],
    footer: {
      address_lines: [
        ORGANIZATION.name,
        ORGANIZATION.address_line_1,
        ORGANIZATION.address_line_2,
      ],
      social: [...DEFAULT_SOCIAL_LINKS],
      background_color: FOOTER_DEFAULTS.background_color,
      text_color: FOOTER_DEFAULTS.text_color,
      link_color: FOOTER_DEFAULTS.link_color,
      padding_top: FOOTER_DEFAULTS.padding_top,
      padding_bottom: FOOTER_DEFAULTS.padding_bottom,
      social_margin_top: FOOTER_DEFAULTS.social_margin_top,
      social_margin_bottom: FOOTER_DEFAULTS.social_margin_bottom,
    },
    settings: {
      container_width: LAYOUT_DEFAULTS.container_width,
      section_spacing: LAYOUT_DEFAULTS.section_spacing,
      show_section_borders: LAYOUT_DEFAULTS.show_section_borders,
      padding_text: LAYOUT_DEFAULTS.padding_text,
      padding_image: LAYOUT_DEFAULTS.padding_image,
      typography: TYPOGRAPHY_DEFAULTS,
      card_spacing: LAYOUT_DEFAULTS.card_spacing,
      card_border_radius: LAYOUT_DEFAULTS.card_border_radius,
      accent_bar_enabled: true,
      accent_bar_width: LAYOUT_DEFAULTS.accent_bar_width,
      accent_bar_color: BRAND_PRIMARY,
      accent_bar_shadow: {
        enabled: false,
        color: BRAND_PRIMARY,
        blur: 8,
        spread: 0,
        offset_x: 0,
        offset_y: 2,
        opacity: 0.3,
      },
      card_shadow: {
        enabled: false,
        color: '#000000',
        blur: 8,
        spread: 0,
        offset_x: 0,
        offset_y: 2,
        opacity: 0.15,
      },
      divider_color: LAYOUT_DEFAULTS.divider_color,
      divider_margin_top: 0,
      divider_margin_bottom: 0,
      colors: {
        primary: BRAND_PRIMARY,
        text_dark: TEXT_DARK,
        text_body: TEXT_BODY,
        text_muted: TEXT_MUTED,
      },
    },
  }

  return applyConfigDefaults(model, 'letter')
}


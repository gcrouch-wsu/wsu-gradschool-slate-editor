// types/newsletter.ts - TypeScript types for newsletter data structures

export type TemplateType = 'ff' | 'briefing' | 'letter'

export type TitleAlign = 'left' | 'center' | 'right'

export interface Padding {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export interface Shadow {
  enabled: boolean
  color: string
  blur: number
  spread: number
  offset_x: number
  offset_y: number
  opacity: number
}

export interface Typography {
  font_family?: string
  h2_size?: number
  h2_line_height?: number
  h3_size?: number
  h3_line_height?: number
  body_size?: number
  body_line_height?: number
  meta_size?: number
  meta_line_height?: number
}

export interface Colors {
  primary: string
  text_dark: string
  text_body: string
  text_muted: string
}

export interface Settings {
  container_width: number
  section_spacing: number
  show_section_borders: boolean
  padding_text: Padding
  padding_image: Padding
  typography: Typography
  colors: Colors
  card_border_radius?: number
  accent_bar_enabled?: boolean
  accent_bar_width?: number
  accent_bar_color?: string
  accent_bar_shadow?: Shadow
  card_shadow?: Shadow
  divider_margin_top?: number
  divider_margin_bottom?: number
  divider_color?: string
  card_spacing?: number
}

export interface Masthead {
  banner_url?: string
  banner_alt?: string
  banner_align?: TitleAlign
  banner_padding?: Padding
  title?: string
  tagline?: string
  preheader?: string
  hero_show?: boolean
  hero_link?: string
}

export interface Link {
  label: string
  url: string
}

export interface SocialLink {
  platform: string
  url: string
  icon: string
  alt: string
}

export interface SectionLayout {
  padding_top: number
  padding_bottom: number
  background_color: string
  border_radius: number
  divider_enabled: boolean
  divider_thickness: number
  divider_color?: string // Optional - falls back to global settings if not set
  divider_spacing: number
  divider_margin_top?: number // Space above the divider line
  divider_margin_bottom?: number // Space below the divider line
  title_align: TitleAlign
  padding_text?: Padding
  padding_image?: Padding
}

export interface StandardCard {
  type: 'standard'
  title: string
  body_html: string
  location?: string
  date?: string
  time?: string
  links: Link[]
  spacing_bottom?: number
  background_color?: string
  padding?: Padding
  border_width?: number
  border_color?: string
  border_radius?: number
  // Table styling options
  table_border_style?: 'none' | 'light' | 'medium' | 'bold'
  table_border_color?: string
  table_font_size?: number
  table_header_bg_color?: string
  table_header_underline?: number
  table_header_underline_color?: string
}

export interface EventCard {
  type: 'event'
  title: string
  body_html: string
  location?: string
  date?: string
  time?: string
  links: Link[]
  spacing_bottom?: number
  background_color?: string
  padding?: Padding
  border_width?: number
  border_color?: string
  border_radius?: number
  // Table styling options
  table_border_style?: 'none' | 'light' | 'medium' | 'bold'
  table_border_color?: string
  table_font_size?: number
  table_header_bg_color?: string
  table_header_underline?: number
  table_header_underline_color?: string
}

export interface ResourceCard {
  type: 'resource'
  title: string
  body_html: string
  location?: string
  date?: string
  time?: string
  links: Link[]
  show_icon?: boolean
  icon_url?: string
  icon_alt?: string
  icon_size?: number
  spacing_bottom?: number
  background_color?: string
  padding?: Padding
  border_width?: number
  border_color?: string
  border_radius?: number
  // Table styling options
  table_border_style?: 'none' | 'light' | 'medium' | 'bold'
  table_border_color?: string
  table_font_size?: number
  table_header_bg_color?: string
  table_header_underline?: number
  table_header_underline_color?: string
}

export interface CTACard {
  type: 'cta'
  title: string
  body_html: string
  links: Link[]
  button_style?: 'button' | 'pill' | 'outlined' | 'ghost' | 'arrow' | 'underlined' | 'text-only'
  button_bg_color?: string
  button_text_color?: string
  button_padding_vertical?: number
  button_padding_horizontal?: number
  button_border_width?: number
  button_border_color?: string
  button_border_style?: 'solid' | 'dashed' | 'dotted' | 'double'
  button_border_radius?: number
  button_alignment?: TitleAlign
  button_full_width?: boolean
  button_shadow?: Shadow
  button_font_weight?: 'normal' | 'bold' | '600' | '700'
  button_text_transform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize'
  button_letter_spacing?: number
  button_font_size?: number
  text_alignment?: TitleAlign
  spacing_bottom?: number
  background_color?: string
  padding?: Padding
  border_width?: number
  border_color?: string
  border_radius?: number
  // Table styling options
  table_border_style?: 'none' | 'light' | 'medium' | 'bold'
  table_border_color?: string
  table_font_size?: number
  table_header_bg_color?: string
  table_header_underline?: number
  table_header_underline_color?: string
}

export interface LetterCard {
  type: 'letter'
  greeting?: string
  body_html: string
  closing?: string
  signature_name?: string
  signature_lines?: string[]
  signature_image_url?: string
  signature_image_alt?: string
  signature_image_width?: number
  links: Link[]
  spacing_bottom?: number
  background_color?: string
  padding?: Padding
  border_width?: number
  border_color?: string
  border_radius?: number
  // Table styling options
  table_border_style?: 'none' | 'light' | 'medium' | 'bold'
  table_border_color?: string
  table_font_size?: number
  table_header_bg_color?: string
  table_header_underline?: number
  table_header_underline_color?: string
}

export type Card = StandardCard | EventCard | ResourceCard | CTACard | LetterCard

export interface Closure {
  date: string
  reason: string
}

export interface Section {
  key: string
  title: string
  layout: SectionLayout
  cards?: Card[]
  closures?: Closure[]
}

export interface Footer {
  address_lines: string[]
  social: SocialLink[]
  background_color?: string
  text_color?: string
  link_color?: string
  padding_top?: number
  padding_bottom?: number
  social_margin_top?: number
  social_margin_bottom?: number
}

export interface NewsletterData {
  template: TemplateType
  masthead: Masthead
  sections: Section[]
  footer: Footer
  settings: Settings
}

export interface ExportOptions {
  minify?: boolean
  strip_json?: boolean
}

export interface ValidationIssue {
  severity: 'error' | 'warning'
  message: string
  location: string
  fix: string
}

export interface ValidationResult {
  success: boolean
  issues?: ValidationIssue[]
  total?: number
  errors?: number
  warnings?: number
  error?: string
}

export interface Stats {
  word_count: number
  read_time_minutes: number
  image_count: number
  link_count: number
  card_count: number
  section_count: number
  social_links: number
}

export interface StatsResult {
  success: boolean
  stats?: Stats
  error?: string
}

export interface PreviewResponse {
  html: string
  success: boolean
  error?: string
}

export interface PlainTextResponse {
  text: string
  success: boolean
  error?: string
}

export interface ImportResponse {
  success: boolean
  data?: NewsletterData
  error?: string
}

export interface DefaultsResponse {
  success?: boolean
  error?: string
}


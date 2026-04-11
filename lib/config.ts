// config.ts - Centralized configuration for WSU Newsletter Editor
/**
 * This file contains all default values, URLs, and branding elements.
 * Edit these values to customize defaults for your organization.
 *
 * NOTE: Social links are array-based; includes section title alignment; organized defaults
 */

// Application version (displayed in UI and logs)
export const VERSION = '7.0'

// ============================================================
// BRAND ASSETS
// ============================================================

// Default banner image (masthead)
export const DEFAULT_BANNER_URL =
  'https://futurecoug.wsu.edu/www/images/FF_Header_Transparent.png'
export const DEFAULT_BANNER_ALT = 'WSU Graduate School'

// Default resource icons (used in Friday Focus Resources section)
export const RESOURCE_ICONS = {
  health_counseling:
    'https://futurecoug.wsu.edu/www/images/health_counseling.png',
  basic_needs: 'https://futurecoug.wsu.edu/www/images/we_can_help_ff.png',
  career_services:
    'https://futurecoug.wsu.edu/www/images/career-coach-2.png',
} as const

// ============================================================
// BRAND COLORS (WSU Official Colors)
// ============================================================

export const BRAND_PRIMARY = '#A60F2D' // WSU Crimson
export const BRAND_SECONDARY = '#8c0d25' // Dark Crimson
export const TEXT_DARK = '#2A3033'
export const TEXT_BODY = '#333333'
export const TEXT_MUTED = '#5E6A71'

// ============================================================
// TYPOGRAPHY
// ============================================================

export const TYPOGRAPHY_DEFAULTS = {
  font_family: 'Arial, Helvetica, sans-serif',
  h2_size: 22, // Section headings
  h2_line_height: 1.3,
  h3_size: 18, // Card titles
  h3_line_height: 1.3,
  body_size: 16, // Body text
  body_line_height: 1.6,
  meta_size: 15, // Location/date/time
  meta_line_height: 1.7,
} as const

// ============================================================
// NEWSLETTER METADATA
// ============================================================

// Friday Focus defaults
export const FRIDAY_FOCUS = {
  title: 'Friday Focus Newsletter',
  tagline: 'A semimonthly newsletter for graduate students',
  preheader: 'Your biweekly update from the WSU Graduate School',
  submit_form_url: 'https://gradschool.wsu.edu/request-for-ff-promotion/',
} as const

// Briefing defaults
export const BRIEFING = {
  title: 'Graduate School Briefing',
  tagline: 'Semimonthly updates for graduate program faculty and staff',
  preheader: 'Updates from the Graduate School',
  submit_form_url: 'https://gradschool.wsu.edu/listserv/',
  jira_url:
    'https://jira.esg.wsu.edu/servicedesk/customer/portal/121/group/323',
  knowledge_base_url: 'https://confluence.esg.wsu.edu/display/GRADSCHOOL',
} as const

// Letter (Slate Campaign) defaults
export const LETTER = {
  title: 'Graduate School Slate Campaign',
  tagline: 'A message from the Graduate School',
  preheader: 'Important updates from the WSU Graduate School',
} as const

// ============================================================
// CONTACT INFORMATION
// ============================================================

export const ORGANIZATION = {
  name: 'WSU Graduate School',
  address_line_1: 'French Administration Building 324',
  address_line_2: 'Pullman, WA 99164',
  phone: '509-335-6424',
  email: 'gradschool@wsu.edu',
  website: 'https://gradschool.wsu.edu',
} as const

// ============================================================
// SOCIAL MEDIA (V7 - Array-based for unlimited platforms)
// ============================================================

export const DEFAULT_SOCIAL_LINKS = [
  {
    platform: 'Instagram',
    url: 'https://www.instagram.com/gradschoolwsu/',
    icon: 'https://futurecoug.wsu.edu/www/images/insta%20icon%20.png',
    alt: 'Instagram',
  },
  {
    platform: 'LinkedIn',
    url: 'https://www.linkedin.com/school/washington-state-university-graduate-school/',
    icon: 'https://futurecoug.wsu.edu/www/images/Lin%20icon.png',
    alt: 'LinkedIn',
  },
  {
    platform: 'Facebook',
    url: 'https://www.facebook.com/WsuGraduateSchool/',
    icon: 'https://futurecoug.wsu.edu/www/images/facebook%20icon.png',
    alt: 'Facebook',
  },
] as const

// ============================================================
// LAYOUT DEFAULTS
// ============================================================

// Global layout settings
export const LAYOUT_DEFAULTS = {
  container_width: 640, // Email width in pixels (560-700)
  section_spacing: 24, // Space between border and section title
  show_section_borders: true, // Show horizontal divider lines
  card_spacing: 20, // Space between cards (margin-bottom)
  // Global padding (applied to all content unless overridden)
  padding_text: { top: 20, right: 20, bottom: 20, left: 20 },
  padding_image: { top: 20, right: 15, bottom: 20, left: 15 },
  card_border_radius: 0, // Default border radius for all cards (0 = sharp corners)
  accent_bar_width: 3, // Width of the accent bar on standard and event cards
  divider_color: '#e0e0e0', // Default color for section divider lines
} as const

// Section-specific layout defaults
export const SECTION_LAYOUT_DEFAULTS = {
  padding_top: 18,
  padding_bottom: 28,
  background_color: '', // Empty = transparent
  border_radius: 0,
  divider_enabled: true,
  divider_thickness: 2,
  divider_color: '#e0e0e0',
  divider_spacing: 24,
  title_align: 'left', // V7: Title alignment (left/center/right)
} as const

// Card-level defaults
export const CARD_DEFAULTS = {
  background_color: '#f9f9f9',
  // spacing_bottom removed - uses global card_spacing setting
  padding_top: 20,
  padding_right: 20,
  padding_bottom: 20,
  padding_left: 20,
  // border_radius removed - uses global card_border_radius setting
  border_width: 0,
  border_color: '#e0e0e0',
} as const

// ============================================================
// CARD DEFAULTS
// ============================================================

// CTA Button defaults
export const CTA_BUTTON_DEFAULTS = {
  style: 'button',
  bg_color: '#A60F2D',
  text_color: '#ffffff',
  padding_vertical: 12,
  padding_horizontal: 32,
  border_width: 0,
  border_color: '#8c0d25',
  border_style: 'solid',
  border_radius: 10,
  font_weight: 'bold',
  text_transform: 'none',
  letter_spacing: 0,
  font_size: 16,
  alignment: 'center',
  full_width: false,
} as const

// Footer defaults
export const FOOTER_DEFAULTS = {
  background_color: '#FFFFFF',
  text_color: '#000000',
  link_color: '#ffffff',
  padding_top: 0, // Footer top padding
  padding_bottom: 0, // Footer bottom padding
  social_margin_top: 0, // Social icons top margin
  social_margin_bottom: 0, // Social icons bottom margin
} as const

// ============================================================
// SAMPLE CONTENT (for default templates)
// ============================================================

export const SAMPLE_EVENT = {
  title: 'Sample Event Title',
  location: 'Pullman Campus',
  date: 'Friday, October 10, 2025',
  time: '2:00 PM – 4:00 PM',
  body_html:
    '<p>Join us for an exciting event designed to help graduate students connect and learn.</p>',
} as const

// Resource links (for default Friday Focus template)
export const RESOURCE_LINKS = {
  health_counseling: {
    title: 'Health & Counseling Resources',
    body_html:
      '<p>Support for emotional health, addiction, and medical needs is available through Cougar Health Services and Counseling & Psychological Services (CAPS).</p>',
    url: 'https://handbook.wsu.edu/communitystandards/student-resources/campus-resources-and-support/',
    icon: 'health_counseling',
  },
  basic_needs: {
    title: 'Basic Needs Benefit Navigator',
    body_html:
      '<p>A university resource to help students navigate help with childcare, financial aid, food security, housing, utility support, health resources, and more.</p>',
    url: 'https://deanofstudents.wsu.edu/student-resources',
    icon: 'basic_needs',
  },
  career_services: {
    title: 'Explore Your Interests / Self-Assessment',
    body_html:
      '<p>The Academic Success and Career Center offers self-assessments to help you find a career path that fits your interests.</p>',
    url: 'https://ascc.wsu.edu/channels/explore-your-interests-self-assessment/',
    icon: 'career_services',
  },
} as const

// ============================================================
// SLATE INTEGRATION
// ============================================================

// Hardcoded Slate variables (DO NOT CHANGE unless Slate template changes)
export const SLATE_VARIABLES = {
  view_in_browser: 'browser', // href value for "View in Browser" link
  opt_out: '{{ opt_out_link }}', // Unsubscribe link variable
} as const

// ============================================================
// EXPORT OPTIONS
// ============================================================

export const EXPORT_DEFAULTS = {
  minify: true, // Minify HTML output by default
  strip_json: false, // Keep embedded JSON for re-import by default
  filename_prefix: { ff: 'Friday_Focus_', briefing: 'Briefing_', letter: 'Slate_Campaign_' },
} as const


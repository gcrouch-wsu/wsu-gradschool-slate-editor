import sanitizeHtml from 'sanitize-html'

const MAX_BODY_HTML = 100_000

const RICH_HTML_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p',
    'br',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'ul',
    'ol',
    'li',
    'a',
    'img',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
    'span',
    'div',
    'blockquote',
    'hr',
    'sub',
    'sup',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    img: ['src', 'alt', 'width', 'height'],
    td: ['colspan', 'rowspan', 'style', 'headers'],
    th: ['colspan', 'rowspan', 'style', 'scope', 'id'],
    table: ['style', 'role'],
    '*': ['style'],
  },
  allowedStyles: {
    '*': {
      'text-align': [/^(left|right|center|justify)$/],
      color: [/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/],
      'background-color': [/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/],
      'font-size': [/^\d{1,2}(?:\.\d+)?px$/],
      'font-weight': [/^(?:normal|bold|[1-9]00)$/],
      'line-height': [/^\d+(?:\.\d+)?$/],
      margin: [/^(?:\d+(?:\.\d+)?px|0)(?:\s+(?:\d+(?:\.\d+)?px|0)){0,3}$/],
      'margin-top': [/^\d+(?:\.\d+)?px$/],
      'margin-bottom': [/^\d+(?:\.\d+)?px(?:\s*!important)?$/],
      'margin-left': [/^\d+(?:\.\d+)?px$/],
      'margin-right': [/^\d+(?:\.\d+)?px$/],
      padding: [/^(?:\d+(?:\.\d+)?px|0)(?:\s+(?:\d+(?:\.\d+)?px|0)){0,3}$/],
      'text-decoration': [/^(?:none|underline)$/],
      'vertical-align': [/^(?:top|middle|bottom)$/],
      border: [/^(?:none|\d+px\s+solid\s+#[0-9a-fA-F]{3,8})$/],
      'border-bottom': [/^\d+px\s+solid\s+#[0-9a-fA-F]{3,8}$/],
      'border-collapse': [/^collapse$/],
      width: [/^(?:\d+%|\d+px|100%)$/],
    },
  },
  allowedSchemes: ['https', 'mailto'],
  allowProtocolRelative: false,
  disallowedTagsMode: 'discard',
}

export function sanitizeRichHtml(html: string): string {
  const trimmed = html.slice(0, MAX_BODY_HTML)
  return sanitizeHtml(trimmed, RICH_HTML_OPTIONS).trim()
}

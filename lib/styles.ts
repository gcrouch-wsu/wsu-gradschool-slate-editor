// styles.ts - Email-safe inline styles for WSU newsletters
/**
 * Note: Focus on universal email client support (no dark-mode CSS for compatibility)
 */

// Brand Colors (WSU Official Colors)
export const CRIMSON = '#A60F2D'
export const DARK_CRIMSON = '#8c0d25'
export const TEXT_DARK = '#2A3033'
export const TEXT_BODY = '#333333'
export const TEXT_MUTED = '#5E6A71'
export const BG_LIGHT = '#f4f4f4'
export const BG_CARD = '#f9f9f9'
export const BG_WHITE = '#ffffff'
export const BORDER_LIGHT = '#e0e0e0'
export const BORDER_MEDIUM = '#d9d9d9'

// Common inline style strings
export const STYLE_RESET =
  'margin:0; padding:0; -ms-text-size-adjust:100%; -webkit-text-size-adjust:100%;'

export const STYLE_TABLE =
  'border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt;'

export const STYLE_IMAGE =
  '-ms-interpolation-mode:bicubic; border:0; outline:none; text-decoration:none; height:auto; line-height:100%; display:block;'

export const STYLE_LINK = `color:${CRIMSON}; text-decoration:underline; font-weight:bold;`

export const STYLE_H2 = `margin:0 0 20px 0; padding:0; font-weight:bold; font-size:22px; line-height:1.3; color:${CRIMSON};`

export const STYLE_H3 = `margin:0 0 10px 0; padding:0; font-weight:bold; font-size:18px; line-height:1.3; color:${TEXT_DARK};`

export const STYLE_BODY_TEXT = `font-size:16px; line-height:1.6; color:${TEXT_BODY}; margin:0 0 12px 0;`

export const STYLE_META = `font-size:15px; color:${TEXT_MUTED}; margin:10px 0; line-height:1.7;`

export const STYLE_LOCATION_LABEL = `margin:0 0 5px 0; color:${CRIMSON}; font-weight:bold; font-size:14px;`

export const STYLE_CARD_ACCENT = `width:4px; background-color:${CRIMSON};`

export const STYLE_CARD_BODY = 'padding:20px;'

export const STYLE_FOOTER_TEXT = 'color:#cccccc; font-size:14px; line-height:1.6; margin:0;'

export const STYLE_SOCIAL_ICON_CELL = 'padding:0 8px;'

// Full email wrapper styles
export const EMAIL_CSS = `
html, body { 
  margin: 0 !important; 
  padding: 0 !important; 
  height: 100% !important; 
  width: 100% !important; 
}
* { 
  -ms-text-size-adjust: 100%; 
  -webkit-text-size-adjust: 100%; 
}
table, td { 
  mso-table-lspace: 0pt; 
  mso-table-rspace: 0pt; 
  border-collapse: collapse; 
}
img { 
  -ms-interpolation-mode: bicubic; 
  border: 0; 
  outline: none; 
  text-decoration: none; 
  height: auto; 
  line-height: 100%; 
  display: block; 
}
a:not([data-role="footer-link"]):not([data-role="cta"]) { 
  color: ${CRIMSON} !important;
  text-decoration: underline; 
}
a[x-apple-data-detectors], 
.x-apple-data-detectors a { 
  color: inherit !important; 
  text-decoration: inherit !important; 
}
div[style*="margin: 16px 0"] { 
  margin: 0 !important; 
}
body, table, td { 
  font-family: Arial, Helvetica, sans-serif; 
}
li p {
  margin-top: 0 !important;
  margin-bottom: 0 !important;
}
@media screen and (max-width: 600px) {
  .container {
    width: 100% !important;
  }
  .content {
    padding: 18px 15px 24px !important;
  }
  h2 {
    font-size: 20px !important;
  }
  h3 {
    font-size: 17px !important;
  }
  p, li {
    font-size: 15px !important;
  }
}
`


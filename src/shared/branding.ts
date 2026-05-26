/**
 * Central brand configuration. Change values here and they propagate
 * across the whole runtime (window titles, tray, UI, prompts, etc.).
 *
 * NOTE: Build-time configs cannot import TypeScript, so when you change
 * the product name here you must ALSO update these files manually:
 *
 *   1. package.json   → "name" + "description"
 *   2. electron-builder.yml → "appId", "productName", NS* descriptions
 *   3. README.md      → main heading
 *   4. SALES_GUIDE.md → main heading and references
 *
 * Everything else in src/ pulls from this file.
 */

export const BRAND = {
  // Display
  productName: 'Whyspr',
  productNameShort: 'Whyspr',
  tagline: 'Real-time AI copilot for any meeting',
  description:
    'Live transcription and smart reply suggestions for sales, support, interviews, and more.',

  // App identity (used for tray, app user model, deep links)
  bundleId: 'com.whyspr.app',
  appUserModelId: 'com.whyspr.app',

  // URLs (replace with real ones after domain purchase)
  websiteUrl: 'https://whyspr.ai',
  supportEmail: 'support@whyspr.ai',
  docsUrl: 'https://whyspr.ai/docs',
  dashboardUrl: 'https://whyspr.ai/dashboard',

  // Window titles
  overlayWindowTitle: 'Whyspr',
  settingsWindowTitle: 'Whyspr Settings',
  loginWindowTitle: 'Sign in to Whyspr',

  // Tray
  trayTooltip: 'Whyspr'
} as const

export type Brand = typeof BRAND

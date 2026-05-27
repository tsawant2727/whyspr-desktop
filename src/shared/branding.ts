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

  // URLs — domain not purchased yet, currently hosted on Vercel.
  // Override at build/dev with WHYSPR_API_URL env var.
  websiteUrl: 'https://whyspr-web.vercel.app',
  // Backend API root. For dev set WHYSPR_API_URL=http://localhost:3000 in env.
  apiBaseUrl: 'https://whyspr-web.vercel.app',
  // No domain yet → no real support email. UI should link to the /contact
  // page instead. If you later add a mailbox, set supportEmail here.
  supportEmail: '',
  supportUrl: 'https://whyspr-web.vercel.app/contact',
  docsUrl: 'https://whyspr-web.vercel.app',
  dashboardUrl: 'https://whyspr-web.vercel.app/dashboard',
  loginUrl: 'https://whyspr-web.vercel.app/login',
  signupUrl: 'https://whyspr-web.vercel.app/signup',
  upgradeUrl: 'https://whyspr-web.vercel.app/dashboard',

  // Window titles
  overlayWindowTitle: 'Whyspr',
  settingsWindowTitle: 'Whyspr Settings',
  loginWindowTitle: 'Sign in to Whyspr',

  // Tray
  trayTooltip: 'Whyspr'
} as const

export type Brand = typeof BRAND

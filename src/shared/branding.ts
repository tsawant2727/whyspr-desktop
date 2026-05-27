/**
 * Central brand configuration. Change values here and they propagate
 * across the whole runtime (window titles, tray, UI, prompts, etc.).
 *
 * NOTE: Build-time configs cannot import TypeScript, so when you change
 * the product name here you must ALSO update these files manually:
 *
 *   1. package.json   → "name" + "description"
 *   2. electron-builder.yml → "productName", NS* descriptions
 *      (leave "appId" alone — changing it breaks auto-update for existing
 *       installs since they treat a new bundle ID as a different app)
 *   3. README.md      → main heading
 *   4. SALES_GUIDE.md → main heading and references
 *
 * Everything else in src/ pulls from this file.
 */

export const BRAND = {
  // Display
  productName: 'Whispy',
  productNameShort: 'Whispy',
  tagline: 'Real-time AI copilot for any meeting',
  description:
    'Live transcription and smart reply suggestions for sales, support, interviews, and more.',

  // App identity (used for tray, app user model, deep links).
  // ⚠️ DO NOT change these — bundle ID is what links updates to existing
  // installs. We keep com.whyspr.app even after the user-visible rename.
  bundleId: 'com.whyspr.app',
  appUserModelId: 'com.whyspr.app',

  // URLs — production on whispy.io. The WHYSPR_API_URL env var still works
  // as the override (kept that name to avoid touching CI / .env files).
  websiteUrl: 'https://whispy.io',
  // Backend API root. For dev set WHYSPR_API_URL=http://localhost:3000 in env.
  apiBaseUrl: 'https://whispy.io',
  // No support mailbox yet. UI should link to the /contact page instead.
  // If a mailbox is added later, set supportEmail here.
  supportEmail: '',
  supportUrl: 'https://whispy.io/contact',
  docsUrl: 'https://whispy.io',
  dashboardUrl: 'https://whispy.io/dashboard',
  loginUrl: 'https://whispy.io/login',
  signupUrl: 'https://whispy.io/signup',
  upgradeUrl: 'https://whispy.io/dashboard',

  // Window titles
  overlayWindowTitle: 'Whispy',
  settingsWindowTitle: 'Whispy Settings',
  loginWindowTitle: 'Sign in to Whispy',

  // Tray
  trayTooltip: 'Whispy'
} as const

export type Brand = typeof BRAND

# Thesisfy Mobile

Thesisfy ships as a **Progressive Web App** and, optionally, as native **iOS / Android** apps that wrap the same web app with Capacitor.

## 1. PWA (no build needed)

The web app is installable on Android (Chrome) and iOS (Safari → Share → *Add to Home Screen*). It includes:

- `app/manifest.ts` — name, icons, shortcuts, standalone display
- `public/sw.js` — app-shell caching + offline page (API calls are never cached)
- mobile layouts: bottom tab bar, collapsible editor toolbar, bottom-sheet AI assistant, safe-area insets

## 2. Native wrapper (Capacitor)

```bash
cd mobile
npm install
# point the wrapper at your deployment (defaults to the URL in capacitor.config.ts)
THESISFY_URL=https://your-deployment.vercel.app npx cap sync
npx cap add ios      # requires Xcode
npx cap add android  # requires Android Studio
npx cap open ios / android
```

The wrapper loads the deployed web app (`server.url`) so auth, API and updates are shared with the web version; only the shell is native. Add plugins (push notifications, biometrics) here when needed.

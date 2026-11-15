MY FINANCE — ANDROID PWA

Files:
- index.html: the finance tracker
- manifest.webmanifest: Android install metadata
- sw.js: offline app-shell caching
- icon.svg: app icon

Install:
1. Host these files together on an HTTPS website (for example, a private static hosting site).
2. Open the HTTPS address in Chrome on Android.
3. Use Chrome's menu > Install app (or Add to Home screen, depending on Chrome version).
4. Open the installed app and create a passphrase.
5. Save an encrypted backup regularly from More > Backup.

Important:
- This version stores encrypted finance data locally in the browser on this device.
- The service worker caches the app shell for offline opening; it does not provide cloud data sync.
- Clearing browser/site data can remove the local data. Keep encrypted backups.
- The HTML file alone opened with file:// will not install as a PWA; HTTPS hosting is required.

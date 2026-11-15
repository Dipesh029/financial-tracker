# My Finance — updated Android PWA package

This package continues the supplied version 4 application; it does not replace its vault or accounting data model.

## Added in this package
- **Backup Location** in Settings.
- Chromium File System Access API directory selection (`showDirectoryPicker`) where available.
- Selected directory handle persisted in a separate IndexedDB database (`myfinance.backup-destination`); no finance records or encryption key are placed in this database.
- Backup export seals the current vault with the existing AES-GCM vault key before writing the `.enc` envelope to the chosen directory.
- Folder status display, re-select/change and forget controls, read/write permission check and renewal request.
- Download fallback when directory picker support or access is unavailable.
- PWA manifest and service worker shell cache version bumped to `myfinance-shell-v5`.

## Existing security/accounting functionality preserved
The original supplied application code remains in place aside from backup destination UI and logic. Existing AES-256-GCM / PBKDF2 scheme, passphrase unlock/change, optional WebAuthn PRF flow, vault data model, transaction logic, and encrypted restore are preserved.

## Android and browser notes
The File System Access API is browser- and platform-dependent and requires a secure context (HTTPS, or localhost). This code checks feature presence at runtime. Folder handles may be retained by IndexedDB but browser permission can be revoked or require user interaction on later sessions. Android Chrome support for directory selection varies by browser/version and device. When unavailable or blocked, the existing browser download flow remains available; Android may route the download to its own picker/download UI. Verify behavior on the target device/browser before relying on it.

No background cloud upload, synchronization, or scheduled backup is implemented. Manually sync the encrypted backup file using the user's chosen storage application.

## Update safely on the existing hosting origin
1. From the installed old app, create and verify an encrypted backup file first.
2. Upload `index.html`, `manifest.webmanifest`, `sw.js`, and `icon.svg` together to the **same HTTPS origin and path** currently used. Do not change the origin, app scope, or app storage keys.
3. Open the existing app's exact hosted URL, reload, then fully close/reopen the installed PWA.
4. Unlock with the current passphrase. Confirm existing accounts and transactions remain present. If data appears missing, stop and restore the verified encrypted backup; do not erase site data.
5. Open Settings and choose the folder, if the picker is supported. Test an export and confirm the resulting `.enc` file is encrypted and readable by restore.

## Automated checks / verification boundaries
The package creator performs basic HTML/script parse checks and ZIP integrity checks. This is not a live Android-device test, a complete browser API simulation, a migration suite against a real pre-existing vault, or an independent security audit. Folder permission revocation, WebAuthn PRF, Android system picker integration, offline launch and backup restoration require device/browser testing.

## Existing documented gaps
The supplied README listed full Excel workbook import, full folio-specific transaction/reporting depth, SIP actual/missed payment tracking, and several advanced analytics as incomplete. Those areas were not silently rewritten in this backup-location-focused update. The app still uses manually maintained EUR/INR rates and historical transaction FX values when captured.

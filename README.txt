MY FINANCE — ANDROID PWA PACKAGE
Version: 4 (15 November 2026)

CONTENTS
- index.html: the app
- manifest.webmanifest: installable app metadata
- sw.js: app-shell caching for offline launch
- icon.svg: home-screen icon

NEW IN VERSION 4
- Bank accounts now support branch name, IFSC and branch code.
- Bank accounts can store linked debit-card details. Entering a card number only saves its last four digits; the full number is not retained.
- Card expiry is supported in MM/YY format. CVV/CVC and PIN are deliberately never collected or stored.
- A Friends / recipient bank-account directory stores account holder, bank, account number/IBAN, IFSC, branch, branch code and currency. Account numbers are masked in the app's list.
- Transfers can reference a saved recipient account. This is a record/reference only; it does not send money or automatically update the external recipient's bank balance.
- Settings includes an in-app App Guide/README describing features, accounting rules, security and limitations.

INSTALL / UPDATE ON ANDROID
1. Back up your current vault first using More/Settings > Backup > Save backup file.
2. Host all four files together at the SAME HTTPS address as the existing installation.
3. Open that exact address in Chrome on Android and reload it.
4. Fully close and reopen the installed home-screen app. The service-worker cache version has been incremented.
5. Confirm your existing data is present before continuing. If it is not, stop and restore your encrypted backup.

SECURITY AND PRIVACY
- The vault is encrypted locally using AES-256-GCM. New vaults use PBKDF2-HMAC-SHA-256 with 600,000 iterations and a fresh random salt.
- Account and recipient bank details are inside the encrypted vault. Recipient account numbers are masked in the UI but remain present in encrypted vault data and encrypted backups. Treat backups as sensitive.
- Card number entry is used only to extract the last four digits; the full card number is not stored. CVV/CVC and PIN are never requested or stored.
- Your financial data is stored in this browser's local storage and is not sent to a server by this app. The service worker caches app files, not vault data.
- Change passphrase in More/Settings. Biometric unlock is disabled after changing the passphrase; enable it again if supported.
- Biometric unlock is an optional WebAuthn PRF key-wrap. Support varies by device/authenticator/browser and HTTPS origin. Keep the passphrase and an encrypted backup.
- Clearing browser/site data, uninstalling or resetting the device/browser can delete the local vault.

FUNCTIONALITY CHECKLIST / KNOWN GAPS
Included: accounts and balances; linked debit-card and credit-card metadata; bank IFSC/branch details; friends' recipient bank-account directory; income, expense and own-account transfers; recipient reference on transfers; transaction edit/void/restore/refunds; reconciliation; family owners and owner filter; cash-flow and asset-mix charts; manual net-worth snapshots and trend; mutual funds/stocks, buy/sell, supported stock CSV import and SIP reminders; insurance policies and premium tracking; informal friends/family lending and repayments; purchases/warranties; currency conversion using manually maintained EUR/INR rate; encrypted backup/restore; transaction CSV export/import; app guide.
Not included: full migration/import of every sheet from the original Excel workbook; automatic bank feeds or payment initiation; automatic live investment prices; automatic cloud sync; native push notifications; formal loan/EMI schedules; multi-device sync; independent security audit.

ACCOUNTING NOTES
- Credit-card purchases are expenses and increase card liability. Paying the card bill reduces the bank balance and card liability; it must not be recorded as a second expense.
- Transfers between your own accounts are not income or expenses. A recipient bank account is only a reference on a transfer; no external money movement occurs in this app.
- Lending principal and principal repayments are not income/expenses; interest is. The interest-to-date figure is an estimate using simple interest on remaining principal, not a full daily reducing-balance/compounding engine.
- Historical FX rates are retained on transactions where captured. Missing old FX rates cannot be reconstructed exactly.

IMPORTANT LIMITATIONS
This is a local-first PWA, not a native APK. It has no automatic cloud sync, bank feeds, live market prices, push notifications or server-side recovery. Encryption choices have not undergone an independent security audit or penetration test. Keep a current encrypted backup and do not use the app on a shared/public device.

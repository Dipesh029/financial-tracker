# My Finance

Local-first, encrypted family finance **Progressive Web App** (PWA).  
Designed for Android (and desktop browsers): accounts, cards, transfers, investments, SIPs, salaries, and lending — all stored on the device.

**Current version:** 2.2.7

---

## What it is

- **Private:** AES-256-GCM vault; passphrase never stored. Optional fingerprint unlock (WebAuthn PRF where supported).
- **Offline-first:** No server, no cloud sync, no bank feeds.
- **Family-aware:** Owners (Me, Father, Mother, …) on accounts and holdings; Home filter by person.
- **Installable:** Standard PWA (`manifest` + service worker).

Vault storage key: `myfinance.v1` (do not change origin or this key when updating).

---

## Features

### Money
- Bank, cash, and **credit card** accounts (limit, statement/due days, last-4, network, expiry).
- Bank details: account number/IBAN, IFSC, branch; **copy** for own accounts and for saved recipients.
- Optional **linked debit card** on a bank account (not a separate balance).
- Income, expense, transfer, refund; **set current balance** (adjustment posting).
- Friends’ / recipients’ bank details for transfer notes.

### Investments
- Stocks and mutual funds (owner, folio/ISIN/symbol, cost, units, manual price).
- Historical opening positions (no bank debit).
- Stock CSV import with owner.
- Returns, portfolio summary, growth from import snapshots.
- Per-holding **future value** estimate (rate, years, optional monthly top-up).

### Recurring
- **SIPs:** debit account + fund; **auto-posted on unlock** when due (units from price if set). Can mark missed or stop.
- **Salaries:** member + account + amount + schedule; **auto-credited on unlock** when due.
- Toggles under **More → Automatic postings**.
- Insurance premiums and purchase warranty reminders on **Due soon**.

### Other
- Lending / borrowing with simple interest estimates.
- Encrypted `.enc` backup (download or device folder where the browser allows).
- EUR/INR display rate (manual); release notes from the small version control on unlock/Home.

---

## Files

| File | Role |
|------|------|
| `index.html` | App (UI + logic + encryption) |
| `sw.js` | Service worker (network-first HTML so updates show) |
| `manifest.webmanifest` | PWA install metadata |
| `icon.svg` | App icon |
| `FUNCTIONAL_AUDIT.md` | Technical notes / known limits |

---

## Deploy / update (same origin)

1. **Backup** from the app (Settings → Save backup file) and verify you can keep the file safe.
2. Upload **all** of: `index.html`, `sw.js`, `manifest.webmanifest`, `icon.svg` to the **same HTTPS path** as before.
3. Hard-refresh or clear **cache** for the site (not necessarily all site data if you want to keep the vault).
4. Fully close and reopen the installed PWA.
5. Confirm the unlock screen shows the expected version (e.g. **v1.5.0**).
6. Unlock with your existing passphrase.

If the UI looks old, the service worker is still serving a cached shell — clear cache and reopen once more.

---

## Accounting behaviour (short)

- Balances come from **postings** on posted transactions (plus opening balance).
- **Transfers** move value between your accounts only; not income/expense.
- **Credit cards** are liabilities (negative balance). Paying the card reduces bank and liability.
- Holdings use **average cost**; historical `open` positions have empty postings (no bank debit).
- Auto SIP posts a `buy` + bank debit; auto salary posts `income` into the chosen account.
- Auto runs **when you unlock**, not in the background while the app is closed.

---

## Security notes

- Use a strong, unique passphrase (12+ characters recommended).
- Prefer HTTPS and the installed PWA.
- CVV/PIN are never collected.
- Account numbers and backups live only in the encrypted vault / your `.enc` files.
- This project is not an independently audited banking product.

---

## Known limitations

- No live market prices or bank APIs.
- No multi-device sync (use encrypted backup to move data).
- SIP units on auto-post need a **fund price**; otherwise cost is stored with 0 units until you set a price.
- Folder backup needs a browser with the File System Access API; otherwise use download.
- No Excel workbook importer, FIFO lots, or full dividend/switch transaction types yet.

---

## Version highlights

| Version | Notes |
|---------|--------|
| **2.0.0** | Premium mobile UI, Home wealth breakdown, themes, Activity pages |
| **1.6.0** | Segmented Money & Plan tabs (less scrolling) |
| **1.5.0** | Auto SIP debit + salary schedules on unlock |
| 1.4.x | Account numbers, debit card meta, folder backup fix, unlock/crypto fixes, UI polish |
| 1.3.0 | SIP paid/missed ledger, stronger Due soon |
| 1.2.x | Credit-card fields, projections, release notes |
| 1.1.x | Historical holdings, set balance, copy recipients |
| 1.0.0 | Core encrypted vault, accounts, transfers, stocks/MF |

Tap the small **v…** control on unlock or Home for in-app release notes.


## Changelog

### 2.2.7 — 2026-11-17
- Lending: edit principal amount on existing records; blocks amount below total repaid; date edit unchanged.

### 2.2.6 — 2026-11-17
- Lending: edit lending date on existing records; original lend/borrow activity date updated; creation time preserved.
- Redesigned add-lending form into Lending details / Payment details / Additional sections.

### 2.2.5 — 2026-11-17
- Card expiry: enter digits only (0829 → 08/29) or use month/year pickers; validation for month and past dates.

### 2.2.4 — 2026-11-17
- App-wide form validation: fixed **New purchase** save (`fpur` handler was missing).
- Salary “mark received” includes `salaryId` for safer dedupe.
- Added FUNCTIONAL_VALIDATION_REPORT.md.

### 2.2.3 — 2026-11-17
- **Fix:** Contact name & notes save (`fcontact` / `fcontactedit` handlers).
- **Fix:** Demat account form save (`fdemat`).
- Multiline notes; functional test record added.

### 2.2.2 — 2026-11-17
- **Fix:** Contact UPI/bank methods now save correctly (form submit handlers were missing).
- **Feature:** UPI name (display label) + optional description; UPI ID validation (`name@provider`).
- Copy on UPI methods copies the UPI ID only.
- Edit/delete with confirmation; multiple UPI IDs per contact.

### 2.2.1 — 2026-11-17
- Salary schedule edit/update, weekly/biweekly, pause/delete, revision history without altering past payments.

### 2.2.0 — 2026-11-17
- Home net-worth consolidated; full privacy mask on Home; cleaner contact method cards.


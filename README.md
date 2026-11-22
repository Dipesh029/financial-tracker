# My Finance

Local-first, encrypted family finance **Progressive Web App** (PWA).  
Designed for Android (and desktop browsers): accounts, cards, transfers, investments, SIPs, salaries, and lending — all stored on the device.

**Current version:** 2.9.9

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
- **Optional Forex features:** Forex cards under Cards, separate from credit and debit. Multiple currency wallets, last-4 only (no CVV or PIN), balances you update yourself. Net worth converts each wallet once using your rates. Turn Forex visibility off under **More → Display** if you only use INR; this hides Forex-specific screens and choices without deleting stored data or changing net worth.
- Bank details: account number/IBAN, IFSC, branch; **copy** for own accounts and for saved recipients.
- Optional **linked debit card** on a bank account (not a separate balance).
- Income, expense, transfer, refund; linked purchase/warranty records stay synchronised when expenses are edited and warranty reminders suspend when the linked expense is voided; Forex card expenses, edits and refunds post to the selected currency wallet; wallet identity and historical currency references are protected; void/restore reverses the wallet movement; **set current balance** (adjustment posting).
- Friends’ / recipients’ bank details for transfer notes. Informal Give & Take is separate from formal Lending; balances use each transaction’s stored FX rate, and settlements link to one specific outstanding item (older unlinked records are grouped by person and currency).

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
2. Replace **only** `index.html` and `sw.js` at the **same HTTPS path** as before. Keep `manifest.webmanifest`, `icon.svg`, the site origin, and the existing vault data unchanged.
3. Hard-refresh or clear **cache** for the site (not necessarily all site data if you want to keep the vault).
4. Fully close and reopen the installed PWA.
5. Confirm the unlock screen shows the expected version (**v2.9.9**).
6. Unlock with your existing passphrase.

### Recommended hosting response headers

The page CSP already restricts scripts to the two SHA-256-allowlisted inline scripts. For clickjacking protection, configure the hosting provider to send this additional HTTP response header (do not replace the page CSP):

`Content-Security-Policy: frame-ancestors 'none'`

Also recommended: `X-Content-Type-Options: nosniff`. These are hosting-level headers and cannot be reliably applied from this static HTML file.

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
| **2.5.10** | Card UI gate + real tests |
| **2.5.9** | Ambiguous CSV + cardMeta fix |
| **2.5.8** | Auto SIP debit + salary schedules on unlock |
| 1.4.x | Account numbers, debit card meta, folder backup fix, unlock/crypto fixes, UI polish |
| 1.3.0 | SIP paid/missed ledger, stronger Due soon |
| 1.2.x | Credit-card fields, projections, release notes |
| 1.1.x | Historical holdings, set balance, copy recipients |
| 1.0.0 | Core encrypted vault, accounts, transfers, stocks/MF |

Tap the small **v…** control on unlock or Home for in-app release notes.


## Changelog

### 2.9.9 — 2026-11-22
- **Fix:** Lending PDF and CSV ledgers leave out repayments dated after today, matching the balance on screen. A repayment dated before the loan keeps its original date and states the effective interest date. The stored transaction is not changed.
- **Fix:** Currency totals add the unrounded balances, then round once. INR, EUR and USD each use their own grouping. Currencies are not added together.
- **Fix:** Exports drop invisible control characters but keep real joiners (ZWJ and ZWNJ), so Hindi and emoji names stay intact.
- **Fix:** The check under More reports duplicate transaction ids, missing loans, unbalanced transfers, a posting currency that does not match its account, an amount that is not a real number, and contact names that no longer match. It does not change or delete records.
- **UI:** Plan and Money tabs wrap on a narrow screen. Wider layout on tablet. Lending summary states that exports keep currencies separate. Printed lending rows stay together where the browser allows it.

### 2.9.8 — 2026-11-22
- **Fix:** Give & Take outstanding amounts stay in net worth. Giving money no longer looks like spending, and receiving money you owe no longer looks like income.
- **Fix:** Contact names with extra spaces or tabs match the same person.
- **Fix:** If a Give & Take edit cannot be saved, the previous amount is kept.
- **Fix:** The service worker stores the new page for offline use. A transaction with no postings no longer blanks Home or Money.

### 2.6.0 — 2026-11-18
- **Fix:** Indian amount entry (`1,00,000`) no longer collapses to 1. The entry sheet shows the number that will be saved.
- **Fix:** “Forget folder” works. Saves that fail (including a full phone) are shown, not only logged.
- **Fix:** Salary “Add” button. Weekly salaries and missing-price SIPs no longer skip or double-advance the wrong way.
- **Fix:** Renaming a person updates accounts, holdings, salaries, lending, and activity. Final insurance premium closes on the term end date.
- **Fix:** Net-worth tiles add up to the hero. Demat cash is not treated as the stock portfolio.
- **Security:** Passphrase entry for fingerprint, restore, and erase no longer uses the browser prompt. Plain backups need the current passphrase. CSV export warns that it is not encrypted. Record ids are escaped in the page.
- **UI:** Pay this card, Lock now, archive/delete confirms, clearer privacy mask, blue hero in dark mode.

### 2.5.7 — 2026-11-18
- Removed Reorder/Move controls; sort-only (incl. Manual Order); Contacts render fix; CSV key includes exchange; Demat sort bar.

### 2.5.6 — 2026-11-18
- Policy edit: apply all fields then recalc; CSV identity owner+ISIN+exchange; reorder on all list sections.

### 2.5.5 — 2026-11-18
- Policy create/edit: Paid Through Date; simplified form; compact sort chips; reorder forces manual; CSV batch skipSave.

### 2.5.4 — 2026-11-18
- Sort button + Manual Reorder (↑↓); removed drag-and-drop; fixed premium paidThrough corruption; CSV keeps exchange.

### 2.5.3 — 2026-11-18
- Critical: container-scoped drag-sort with handles; CSV parser + no auto-sold; independent loan/interest NW prefs; premium schedule count; legacy personPos filters.

### 2.5.2 — 2026-11-18
- Sort order applied to contacts, SIPs, salaries, policies, lending; drag targets expanded.

### 2.5.1 — 2026-11-18
- Fix: lending repayments no longer create phantom liabilities via personPos.
- Insurance: full premium schedule, historical paid-through date, consistent next-due status.

### 2.5.0 — 2026-11-18
- Net worth prefs: four toggles only (no personal-use); CSV holdings import fixed (`holdParse`); MF units adjustment; SIP pre-fill on forecast; policy premiums paid + clearer detail; demat cash label; long-press reorder; lending interest on cards.

### 2.4.3 — 2026-11-18
- Card expiry: exactly two fields — Month (MM) and Year (YY); removed combined/duplicate inputs.

### 2.4.2 — 2026-11-17
- UI polish aligned with Lending: SIPs, Salaries, Accounts, Investments summary heroes + record cards; Home NW and net-worth prefs layout.

### 2.4.1 — 2026-11-17
- Net worth preferences (More): toggles for insurance cash, loans receivable, accrued interest, personal assets, and insurance cover on adjusted position only.

### 2.4.0 — 2026-11-17
- Net worth classification: loans receivable as assets; borrowed as liabilities; insurance sum assured excluded; optional fund/surrender value in assets; investments counted once.

### 2.3.3 — 2026-11-17
- Lending landing UI polish: compact status pills, dual principal/interest progress, cleaner card hierarchy.

### 2.3.2 — 2026-11-17
- Lending: interest accrues only while principal is outstanding (stops after full principal repayment); Adjust interest / round-off with audit trail.

### 2.3.1 — 2026-11-17
- Lending: principal vs interest tracked separately; “Fully Settled” only when both cleared; dual progress (principal % and total %).

### 2.3.0 — 2026-11-17
- Lending UI redesign: summary hero (outstanding, total lent, repaid, active), progress bars on cards, structured detail sheet with repayment history.

### 2.2.7 — 2026-11-17
- Lending: edit principal amount on existing records; blocks amount below total repaid; date edit unchanged.

### 2.2.6 — 2026-11-17
- Lending: edit lending date on existing records; original lend/borrow activity date updated; creation time preserved.
- Redesigned add-lending form into Lending details / Payment details / Additional sections.

### 2.2.5 — 2026-11-17
- Card expiry: enter digits only (0829 → 08/29) or use month/year pickers; validation for month and past dates.

### 2.5.8 — 2026-11-17
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



## Tests

```bash
node regression.mjs
```


### 2.9.4 — 2026-11-22
- Lending export from the Lending overview: all records, money lent, money borrowed, or all loans for one person.
- Individual loan detail now includes Export statement.
- Summary CSV includes original principal, principal repaid/outstanding, annual rate, interest accrued/paid, net adjustments, interest outstanding, total outstanding, status and as-of date.
- Detailed ledger CSV includes the original loan record, posted principal repayments, posted interest settlements, and dated manual interest adjustments/waivers.
- Each loan remains a separate row and retains its original currency; no mixed-currency totals are calculated.
- Voided repayment transactions are excluded. Export is read-only and uses `lendingPosition()` for summary calculations.


### 2.9.6 — 2026-11-22
- Sort controls and direction menus use a consistent compact layout across Contacts, Investments, Accounts, Salaries, Lending, Insurance and SIPs, retaining each section's saved sort preference and available sort keys.
- Lending Sort and Export now share one toolbar.
- Lending summary and ledger CSVs use human-readable headings and omit internal loan/contact/transaction/adjustment IDs and reference columns.
- Transaction CSV uses clear labels, removes duplicated technical IDs/references, and retains numeric amounts and formula-injection protection.


## v2.9.6 — Sort controls and shareable lending statements
- Sort and Export controls are aligned beside sortable page headings; the separate Arrange label/row is removed.
- Lending CSV text is sanitized for invisible/control and common mojibake artefacts while preserving legitimate Unicode names.
- Added locally generated print-to-PDF lending summary and detailed statement exports.
- Service worker shell cache advanced to v86.

### v2.9.6 upload
Replace `index.html` and `sw.js` on the existing HTTPS origin. Keep the manifest, icon, encrypted vault and backups unchanged.


### 2.9.7 — 2026-11-22
- Redesigned Lending Summary PDF as a compact A4 portrait overview with principal outstanding, interest outstanding and total outstanding.
- Totals are grouped by currency and Lent/Borrowed direction; currencies are never combined.
- Redesigned Detailed Lending Statement for A4 landscape, with fixed column widths, normal word wrapping, repeated table headers and a closing-balance table per loan.
- PDF figures continue to use the existing `lendingPosition()` output via the lending export rows; no lending, storage, encryption or backup logic changed.
- Service-worker shell cache advanced to v87.

## v2.9.7 — Lending PDF readability and totals
- Summary PDF: A4 portrait, compact per-loan table, currency/direction-specific principal, interest and total outstanding.
- Detailed PDF: A4 landscape transaction history and per-loan closing balances.
- Improved fixed-width tables, wrapping and print pagination.

### v2.9.7 upload
Replace `index.html` and `sw.js` on the existing HTTPS origin. Keep the manifest, icon, encrypted vault and backups unchanged.

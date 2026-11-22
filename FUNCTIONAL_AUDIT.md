# Functional audit — My Finance PWA

Last reviewed against app version **2.12.6**.

## Architecture

- Single-page PWA: `index.html` (HTML/CSS/JS), `sw.js`, `manifest.webmanifest`.
- Vault: `localStorage` key `myfinance.v1`, payload `{ enc, salt, iterations, iv, data, bio? }`.
- Crypto: PBKDF2-HMAC-SHA-256 → AES-256-GCM. Optional WebAuthn PRF biometric key wrap.
- Service worker: **network-first** for HTML navigation so deploys are visible; shell assets cache-first.
- Optional backup folder handle in IndexedDB (`myfinance.backup-destination`).

## Data model (high level)

| Collection | Purpose |
|------------|---------|
| `accounts` | Bank / cash / card / demat / Forex; opening; optional `accountNumber`, `cardMeta`, limits, and Forex `wallets[]` |
| `txns` | Postings-based ledger (`posted` / `voided`) |
| `holdings` | Stock / fund positions; price manual |
| `sips` | Recurring invest; `history[]`; auto on unlock if `autoSip` |
| `salaries` | Recurring income; `history[]`; auto on unlock if `autoSalary` |
| `lending` | Friends & family principal + simple interest estimate |
| `bankContacts` | Recipient bank reference details |
| `people` | Owner / member names |
| `history` | Net-worth snapshots |
| `policies` / `purchases` | Premium / warranty due dates |

Bank/cash/card balances are **derived** from opening + posted postings. Forex wallet balances are stored per currency and reconciled from `openingBalance` + posted Forex wallet movements.

## Verified behaviours

- Unlock / create vault; migrate defaults; save re-seals.
- Set current balance → adjustment transaction.
- Transfer, income, expense, refund; void/restore.
- Credit card liability and limit bar; bank account number + copy.
- Linked debit card metadata on bank accounts; expiry on Due soon.
- Holdings open/historical, buy/sell, CSV stock import with owner.
- SIP confirm paid/missed; **auto SIP** when `next ≤ today` on unlock.
- **Salary schedules** + auto credit on unlock.
- Folder backup write via `directory.getFileHandle` + file `createWritable`.
- Release notes via `"releases" in d` (empty `data-releases` attribute).

## Intentionally not automated

- No background jobs while the app is closed.
- No live NAV/price feeds or bank aggregation.
- Auto SIP units require a holding price for a non-zero unit count.

## Residual gaps (product backlog)

- Excel workbook import.
- Dividend / switch-in / switch-out transaction types.
- FIFO / tax lots (currently average cost only).
- Deep folio reports and multi-statement reconciliation history UI.
- Cross-device sync (encrypted file exchange only).

## Safe change rules

1. Never change `KEY` (`myfinance.v1`) or hosted origin without a migration plan.
2. Prefer additive fields + `migrate()` defaults.
3. Bump `APP_VERSION`, `RELEASES[]`, and service worker `CACHE` name together on each ship.
4. Always recommend an encrypted backup before deploy.


## 2.5.3 Critical fixes (2026-11-18)
See FUNCTIONAL_VALIDATION_REPORT.md for detail.


## 2.5.10
- Card UI gated by account type in acctSheet.
- Regression: `node regression.mjs`.


## 2.8.1 — Forex ledger integrity and safe unlock

- Expense payment picker includes Forex cards in a dedicated group; each expense records the selected wallet currency.
- Editing a Forex expense reverses the old movement and applies the new account/wallet/amount movement.
- Refunds credit the original Forex wallet; legacy refunds from v2.8.0 are linked to their original wallet as history-only movements while the current wallet balance is preserved; the app does not guess whether users manually reflected them. Void and restore reverse/reapply expense and refund movements.
- Expense, purchase/warranty row, and wallet movement are persisted in one save operation. A failed save restores the in-memory state snapshot.
- Forex wallets now carry `openingBalance`; posted expense/refund movements reconcile against the current wallet balance.
- Wallet edits recalculate the baseline without rewriting transaction history.
- Migration rejects malformed, duplicate-currency, duplicate-ID, unsupported-currency, and non-numeric wallet rows before replacing wallet data.
- Biometric unlock now uses the same migration guard as passphrase unlock and does not run automations or save after a migration failure.
- Vault key, AES-GCM envelope, PBKDF2 format, and backup envelope remain unchanged. `openingBalance` is an additive wallet field.

Validation in this archive:
- Inline application JavaScript syntax: PASS.
- `regression.mjs` syntax: PASS.
- `node regression.mjs`: PASS — production logic regression suite runs with a minimal DOM shim; no third-party DOM package required.
- Real browser/device, WebAuthn, and real-vault upgrade tests: NOT RUN.


## 2.8.2 — Wallet history protection and purchase synchronisation

- Forex wallet IDs are stable. A wallet with any transaction history (including voided transactions) cannot be removed or have its currency changed. Keep it with a zero balance or archive the Forex card.
- Negative wallet balances are accepted consistently with the existing explicit overspending confirmation.
- Editing an expense updates linked purchase amount, currency, account and date in the same atomic save. Warranty expiry is shifted by the preserved warranty duration when the purchase date changes.
- Voiding an expense suspends its linked warranty reminder; restoring the expense resumes it. Existing linked purchase flags are normalised during migration.
- Legacy card-number migration now strips non-digits correctly before discarding a full PAN and retaining only last four digits.
- Integrity checks include archived Forex cards and orphaned/mismatched purchase references. Refund and wallet movement totals are indexed in one pass rather than repeatedly scanning the transaction list.
- The vault key, encrypted envelope, encryption algorithms and backup format are unchanged.


## 2.9.1 — Give & Take correctness and navigation

- Give & Take remains a separate transaction type and never creates or changes a formal Lending record.
- New Give & Take entries carry an additive schema marker. Each settlement links to one specific outstanding transaction, is restricted to the same currency, and rejects over-settlement instead of silently capping the amount.
- Pre-2.9.1 Give & Take entries had no reliable settlement-to-source reference. They are therefore grouped into one legacy balance per contact and currency; the migration does not guess which historical transaction a settlement belonged to.
- Give & Take person balances and totals convert each transaction using its stored FX rate before aggregating into the selected display currency.
- Person history is visible under Plan → Give & Take. Posted entries can be edited, voided and restored through Activity; original entries cannot be voided while linked settlements remain posted.
- Contact names are normalized for lookup. Duplicate normalized names are preserved rather than merged; ambiguous matches require the user to resolve them. Existing formal loans and their transactions receive stable contact IDs only when a unique contact match exists.
- Closing or cancelling the Give & Take sheet resets the centre + quick-add mode, preventing the next tap on + from reopening the stale Give & Take form. Escape also closes an active sheet.
- Regression coverage includes mixed-currency aggregation, transaction-specific and legacy-bucket settlements, duplicate-name handling, formal-loan contact migration, linked-settlement void protection, and quick-add close-state reset.

Validation in this archive:
- `node regression.mjs`: PASS — all existing and added regression checks pass.
- Browser/device interaction, encrypted-vault upgrade with real user data, and WebAuthn: NOT RUN.


## 2.9.3 — security and reliability hardening

- Encrypted vault and backup metadata are validated before PBKDF2 or AES-GCM work. PBKDF2 iterations are bounded (1,000–2,000,000); salts, IVs and ciphertext lengths are checked. Existing 250,000-iteration and 600,000-iteration envelopes remain supported.
- CSV text cells that could be interpreted as spreadsheet formulas are prefixed safely. Numeric amount and FX-rate cells remain numeric.
- Biometric unlock does not silently claim to upgrade legacy passphrase KDF strength. It preserves biometric access and tells the user to perform a passphrase unlock for the safe KDF upgrade.
- Browser/Android Back closes the current sheet. Explicit close removes the sheet history entry, and Give & Take mode is reset.
- Service-worker cache writes are attached to the fetch event lifetime and cache failures do not fail successful network responses. Cache version is v83.
- A 15-minute visible-session inactivity lock is added, alongside the existing lock after the app has been backgrounded for more than two minutes.
- Inline scripts are now authorised by SHA-256 CSP hashes instead of `script-src 'unsafe-inline'`. Inline styles remain permitted because the current UI uses extensive inline style attributes. `frame-ancestors` must be set as an HTTP response header by the hosting provider; a CSP meta tag cannot enforce it.


## 2.9.4 — Lending exports

- Lending overview provides CSV exports for all loans, money lent, money borrowed, and all loans associated with one contact/person.
- Individual lending detail provides a statement export scoped to that loan ID.
- Summary export uses the production `lendingPosition()` calculation and includes an explicit as-of date.
- Detailed ledger includes original loan record, posted principal repayments, posted interest settlements, and dated interest adjustments/waivers.
- Voided repayment transactions are excluded; exports do not modify the vault.
- Currency is retained per loan; no cross-currency totals are produced.
- CSV text fields use the existing formula-injection protection. Account names are exported, not account numbers or recipient bank/UPI details.
- Automated regression coverage: PASS. Browser/device download behaviour: NOT RUN.


## 2.9.6 — Sort and export presentation
- Standardised the compact sort toolbar across Contacts, Demat, Holdings, Accounts, Salaries, Lending, Insurance policies and SIPs. Existing section-specific sort keys and persisted preferences are unchanged.
- Sort sheets now present one compact row per sort field with ascending/descending controls; Manual order remains available.
- Lending summary and ledger exports use human-readable headings and omit internal loan/contact/transaction/adjustment identifiers. The detailed ledger includes loan date, original principal and report date to distinguish multiple loans for one person.
- General transaction CSV omits transaction IDs and duplicate references and labels transaction types/statuses for readers.
- No lending calculations, account postings, encrypted vault format, storage key, or backup format changed.


## v2.9.6 — Sort controls and shareable lending statements
- Sort and Export controls are aligned beside sortable page headings; the separate Arrange label/row is removed.
- Lending CSV text is sanitized for invisible/control and common mojibake artefacts while preserving legitimate Unicode names.
- Added locally generated print-to-PDF lending summary and detailed statement exports.
- Service worker shell cache advanced to v86.

### v2.9.6 upload
Replace `index.html` and `sw.js` on the existing HTTPS origin. Keep the manifest, icon, encrypted vault and backups unchanged.


## 2.12.6 — PDF pages, direct export and lending summary
- Module PDF buttons build that report immediately and open the preview. The options screen is kept for the complete report, and for Customize inside a preview. Lending export still asks summary or statement and which loans.
- Reports are one flowing document. The title, report date and contents are on the first page. There is no separate cover and no forced blank page. Print CSS repeats table headers, keeps a normal row together, and may split one unusually long row.
- The preview counts pages from the A4 content box after layout. Print / Save PDF sends that same HTML to the browser print dialog. A printed table header can move a row onto the next page compared with the preview.
- Lending summary shows outstanding principal, interest and total by currency and direction, each loan, and each movement once. The detailed statement adds the chronological ledger and closing balances. Totals still come from `lendingPosition()`. Records are not rewritten.
- CSV export, vault key, encryption and backup format are unchanged.

## 2.12.5 — PDF preview and report scope
- Every module PDF and the complete report are built once, then shown in an in-app preview (pages, zoom, fit width, print, save). The print dialog receives that same HTML. There is no second calculation and no upload.
- The options sheet shows the selected sections, detail level, dates and layout before generation. Defaults match the screen: a complete report is detailed and landscape; Home starts as a portrait summary.
- Account balances in a report use `balanceAsOf` through the chosen end date, never later than today. Future-dated and voided transactions stay out. Lending positions still come from `lendingPosition()` / `buildLendingExportRows()` as of today.
- Contents entries are real links to section headings inside the document. A saved PDF does not gain a bookmark outline; print-to-PDF cannot add one. User text is escaped. Internal ids, account numbers and UPI IDs are not printed.
- CSV export, vault key, encryption and backup format are unchanged.

## 2.12.4 — Schedule dates, forecast limits and integrity warnings
- An active SIP with no valid next date is excluded from the forecast and labelled "No next date". Instalments are not invented from the frequency.
- Monthly SIP and salary advances keep the original day. A 31st or other month-end date stays at month end, including February in leap and non-leap years. A 30th that did not start on a month end stays on the 30th. Weekly and daily salaries still move by days.
- `addM()` is unchanged. The schedule rule is `addMonthsOnRule()`. The anchor is stored only when a schedule is saved or when a due instalment is actually advanced. Forecasting does not write it, and an instalment that is not yet due is left untouched.
- Forecast sliders and typed checks use the same limits: 1–50 years, −50% to 50% return, and an extra monthly amount of 0–1000000.
- The projection label is "Current value + future contributions". The calculation is unchanged. Cost-basis labels stay "Total invested amount (cost basis)" and "Total invested (cost)".
- One SIP schedule is reused for the conservative, expected and optimistic results. The month-by-month table is built when that section is opened.
- The integrity check reports missing and duplicate ids and invalid prices, units, amounts, dates, frequencies and orphan links for accounts, holdings, SIPs, salaries, policies, contacts and purchases. It does not correct records.
- A schedule that already drifted and has no stored anchor keeps the day of its current next date. The forgotten original day is not reconstructed.

## 2.12.3 — Fewer repeated calculations
- Home uses the wealth breakdown already produced for net worth.
- The accounts list totals every balance in one pass. `balance()` is unchanged and the pass matches it.
- Investment and lending screens remember a position while drawing that screen. Nothing is cached after the screen is built.

## 2.12.2 — Forex edit room and schedule currency
- `forexSpendRoom()` adds the expense being edited back to its own wallet before the negative-balance warning. Other wallets are unchanged.
- Due SIPs and salaries whose currency differs from the account are marked missed and are not posted. A matching SIP still posts.

## 2.12.1 — Incomplete transactions no longer blank Home
- `monthTotals()`, the Home spending chart and `txnRow()` skip a posted row that has no date or no numeric posting. Sorting no longer assumes `created` is present.
- Records are not repaired automatically. The integrity check still reports the bad date or missing postings.

## 2.12.0 — Mutual fund forecast and near-black dark theme
- `projectHolding()` grows the current market value, then adds that month’s cash. Monthly rate remains `(1+annual)^(1/12)-1`.
- A SIP with `next` is walked with `advanceSipNext()` and `sipTermsAt()`. Past dates are skipped. `end` or `until` is honoured only if already stored. Stopped, paused, cancelled and completed SIPs contribute nothing. A different currency is excluded.
- The SIP form still does not collect a step-up or an end date. Revisions already saved on the SIP change later instalments.
- Dark tokens are near-black with blue `#3B82F6`. Light tokens are unchanged. Vault key and backup format are unchanged. Shell cache is v92.

## 2.11.0 — Blue theme, PDF reports and fund forecast
- One blue token set for light, dark and system. The later teal override was removed.
- Shareable PDFs reuse `netWorth()`, `wealthBreakdown()`, `lendingPosition()` via `buildLendingExportRows()`, `holdPos()` and `balanceAsOf()` (posted rows on or before today). They do not replace `balance()` on screen.
- `projectHolding()` uses monthly rate `(1+annual)^(1/12)-1`. Contributions are added at month end. SIPs use their saved frequency. The calculation does not write transactions.
- Shell cache is v91. Vault key and backup format are unchanged.

## 2.10.0 — Visual system
- Presentation only. CSS tokens and shared components restyle Home, Money, Plan (SIPs, salaries, Give & Take, lending, insurance), Activity, More, forms and the lock screen.
- Net worth, lendingPosition(), exports, sorting, Forex visibility and vault storage are unchanged.
- Shell cache is v90.

## 2.9.9 — Lending reports, currency formatting and integrity warnings
- Detailed lending CSV and PDF omit principal repayments and interest settlements dated after the report date. `lendingPosition()` already ignored those rows. Closing balances in the PDF are the same `lendingPosition()` figures.
- A repayment stored before the loan date stays on its original date. The ledger description and note state that date and the effective interest date (the loan start). Stored transactions are not rewritten.
- `cleanShareText()` removes invisible controls, zero-width spaces, bidi overrides and byte-order marks. It keeps U+200C ZWNJ and U+200D ZWJ so Indic names and emoji sequences survive export.
- PDF currency totals sum the unrounded outstanding principal, interest and total per currency and direction, then format once. INR uses `en-IN`, EUR uses `de-DE`, USD uses `en-US`. JPY uses no decimal fraction. CSV amount cells stay numeric, rounded to the currency's decimal places.
- Printed lending rows use `break-inside:avoid` and `page-break-inside:avoid`. The summary remains A4 portrait and the statement remains A4 landscape.
- `runCheck()` warns about duplicate or missing ids, missing loan links, invalid repayments, currency mismatches (including an ordinary posting whose currency differs from its non-Forex account), non-finite posting amounts, unbalanced same-currency transfers, and contact names that disagree with the contact record. It does not modify the vault.
- Vault key, AES-GCM envelope, backup format and service-worker strategy are unchanged. Shell cache is v89.

## 2.9.8 — Give & Take net worth and save/cache fixes
- Outstanding Give & Take is included in net worth per person, after settlements net out. It does not create a lending record and is not double-counted with legacy transfer IOUs.
- Contact lookup collapses internal whitespace. Duplicate names that differ only by spacing are reported as ambiguous instead of being treated as different people.
- Give & Take edits wait for the save and restore the previous row if storage rejects it.
- Service worker clones the network response before opening the cache. Shell cache is v88.
- `balance()` skips a posted transaction that has no postings array.
- Vault key, AES-GCM envelope, and backup format are unchanged.

## 2.9.7 — Lending PDF output
- PDF rendering only; no changes to lending data structures, calculations, encryption, vault key, origin or backup format.
- Summary totals are grouped by currency and direction (Lent/Borrowed). Do not add amounts across currencies.
- Detailed PDF includes per-loan closing balances derived from the summary export rows.
- Print-to-PDF is still browser-driven; browser print settings may override CSS page-size hints.

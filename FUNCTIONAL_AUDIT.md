# Functional audit — My Finance PWA

Last reviewed against app version **2.9.3**.

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

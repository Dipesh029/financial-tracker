# Functional audit — My Finance PWA

Last reviewed against app version **2.8.2**.

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

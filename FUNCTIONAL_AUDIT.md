# Functional audit — My Finance PWA

Last reviewed against app version **2.6.0**.

## Architecture

- Single-page PWA: `index.html` (HTML/CSS/JS), `sw.js`, `manifest.webmanifest`.
- Vault: `localStorage` key `myfinance.v1`, payload `{ enc, salt, iterations, iv, data, bio? }`.
- Crypto: PBKDF2-HMAC-SHA-256 → AES-256-GCM. Optional WebAuthn PRF biometric key wrap.
- Service worker: **network-first** for HTML navigation so deploys are visible; shell assets cache-first.
- Optional backup folder handle in IndexedDB (`myfinance.backup-destination`).

## Data model (high level)

| Collection | Purpose |
|------------|---------|
| `accounts` | Bank / cash / card; opening; optional `accountNumber`, `cardMeta`, limits |
| `txns` | Postings-based ledger (`posted` / `voided`) |
| `holdings` | Stock / fund positions; price manual |
| `sips` | Recurring invest; `history[]`; auto on unlock if `autoSip` |
| `salaries` | Recurring income; `history[]`; auto on unlock if `autoSalary` |
| `lending` | Friends & family principal + simple interest estimate |
| `bankContacts` | Recipient bank reference details |
| `people` | Owner / member names |
| `history` | Net-worth snapshots |
| `policies` / `purchases` | Premium / warranty due dates |

Balances are **derived** from opening + posted postings (not stored as a separate running total).

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

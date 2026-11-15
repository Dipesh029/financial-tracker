# My Finance — Android PWA (Priority-1 update)

Local-first, encrypted family finance Progressive Web App. Continues the existing application; does **not** replace the vault or accounting data model.

## What this package changes

### Added in v1.1.0 (this package)
- Version badge on Home with **Release notes** sheet (tracks each update).
- **Investments** summary on Home: count, cost, current value, unrealized P/L %.
- **Portfolio growth** chart from stock import snapshots (value vs invested).
- Mutual fund / stock detail: returns %, **Estimate future value** calculator (current value + optional monthly SIP, expected return, years).
- Balance adjustments labeled clearly in Activity.
- Holdings list shows owner and return %.


### Priority-1 fixes implemented
- **Set current balance** on every account (opens the existing reconcile flow with clearer wording). Enter the real balance from your bank/statement; the difference is posted as one adjustment transaction so history stays consistent.
- **Copy** button on friend/recipient bank accounts. Copies a ready-to-paste block: name, account holder, bank, full account number, IFSC, branch, currency.

- **New holding form expanded**
  - Stock fields: symbol/ticker, exchange (NSE / BSE / Other), demat/broker reference.
  - Mutual-fund fields: AMC/platform, folio, ISIN.
  - Owner required (Self / Father / Mother / other people already in the vault).
  - Notes field.
- **Explicit historical / existing holding path**
  - Checkbox “This is an existing / historical holding”.
  - Enter purchase/acquisition date, units/shares already owned, and total invested amount (cost basis).
  - Optional current market price.
  - Creates an `open` transaction with **empty postings** — no bank account is debited.
  - Correctly reflected in net worth and investment value.
- **Stock CSV import**
  - Owner selector before import.
  - New holdings receive the selected owner.
  - Existing matching logic (symbol / ISIN), preview, quantity/cost adjust, optional “treat missing as sold” preserved.
- **Holding detail sheet**
  - Shows owner, type, symbol, exchange, folio, ISIN, demat, AMC.
  - Units, average cost, total cost basis, current price, market value, unrealized P/L.
- **Schema migration**
  - New optional fields (`symbol`, `exchange`, `demat`, `broker`, `amc`, `notes`) default to empty strings on existing holdings.
  - Vault version remains compatible; no data wipe.

### Preserved (unchanged)
- AES-256-GCM + PBKDF2-HMAC-SHA-256 vault encryption.
- Optional WebAuthn PRF biometric unlock.
- All existing transaction types and postings model.
- Account balances, transfers, income, expenses, refunds.
- Lending / borrowing with simple interest.
- SIP reminders (still confirmation-based).
- Encrypted backup export/restore + Backup Location (File System Access API).
- Storage key `myfinance.v1`, origin, and PWA identity.
- Manual EUR/INR rate and per-transaction `fxRate`.

## Accounting notes (documented behaviour)
- **Average-cost method** for holdings: buys / opens increase units and cost; sells reduce units and cost proportionally.
- Historical / imported opening positions use type `open` (or `adjust` on portfolio sync) with empty `postings` so bank balances are not touched.
- A normal buy from the Invest sheet still debits the chosen account.
- Transfers move value between own accounts only; they never create income or expense.
- Lending principal is not an expense; interest received is income; interest paid is expense.
- Credit-card purchases increase liability (negative balance); bill payment reduces bank balance and liability without double-counting the expense.

## Remaining limitations (not in this Priority-1 drop)
- Full Excel workbook import workflow.
- SIP actual-payment / missed-payment ledger (reminders only).
- Folio-wise deep transaction history and switch-in/out / dividend types.
- Multiple tax lots / FIFO cost basis.
- Full transaction field editing with automatic reverse accounting.
- Account statement reconciliation.
- Live market prices (manual price entry only).
- Advanced owner-wise investment reports beyond the existing Home filter and Money tab.

## Safe update on the existing hosted origin
1. From the installed app, create and verify an encrypted backup first.
2. Upload `index.html`, `manifest.webmanifest`, `sw.js`, and `icon.svg` together to the **same HTTPS origin and path**. Do not change the origin, scope, or storage keys.
3. Open the exact hosted URL, reload, then fully close and reopen the installed PWA.
4. Unlock with the current passphrase. Confirm accounts, holdings, and transactions are still present. If anything looks missing, stop and restore the verified backup; do not erase site data.
5. Optional: open Settings → Backup Location and re-select the folder if the browser asks for permission again.
6. Test: create a historical stock holding and a historical mutual-fund holding; run a stock CSV import with an owner selected.

## Verification boundaries
- Basic HTML/JS structure and ZIP integrity checked.
- This is **not** a live Android-device test, a full browser API simulation against a real pre-existing vault, or an independent security audit.
- Folder permission revocation, WebAuthn PRF, offline launch, and backup restore require testing on the target Android device/browser.

## Cache version
Service worker shell cache: `myfinance-shell-v8`.

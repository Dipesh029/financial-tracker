# My Finance — Functional Audit & Priority-1 Delivery Notes

Date: 2026-11-15  
Package: myfinance-updated (Priority-1)

## 1. Fully implemented and working (pre-existing + preserved)
- Local AES-256-GCM vault (PBKDF2-HMAC-SHA-256, optional WebAuthn PRF).
- Encrypted backup export/restore + Backup Location (directory picker).
- Accounts (bank, cash, credit card) with owner and bank details.
- Income, expense, transfer (linked postings), refund.
- Balance from opening + postings.
- Family net-worth and owner filter on Home.
- Holdings model, buy/sell, average-cost `holdPos`.
- Stock broker CSV import (preview + apply).
- SIP reminders.
- Informal lending/borrowing with simple interest.
- Recipient bank contacts.
- INR/EUR with stored per-transaction FX rate.
- PWA shell and offline shell cache.

## 2. Partially implemented (improved in this drop)
- New holding creation → now includes symbol, exchange, demat, AMC, notes, and historical path.
- Historical positions → one-step form that creates `open` with no bank debit.
- Stock CSV import → owner selection and assignment to new holdings.
- Holding detail view → richer metrics and metadata.

## 3. Missing (intentionally deferred; Priority 2–4)
- Excel workbook import with sheet/column mapping.
- SIP paid / missed ledger.
- Folio-wise deep reports, switch, dividend.
- Full transaction edit with reverse accounting.
- Account reconciliation.
- Live prices / FIFO lots.
- Advanced analytics beyond existing dashboard.

## 4. Incorrect calculations / integrity notes
- Average-cost method is consistent and now documented.
- Historical and import `open`/`adjust` correctly leave bank balances untouched.
- Owner on imported stocks previously defaulted incorrectly; fixed.
- No double-counting of transfers or investment cost observed in the postings model.

## 5. Broken / incomplete UI actions addressed
- Missing fields on new holding form → added.
- Stock import without owner → owner selector added.
- Historical entry was multi-step and easy to misuse → single form with explicit checkbox.

## 6. Security
- Architecture unchanged and preserved.
- No CVV/PIN storage; only last-4 for cards.
- Backup folder handle stored outside the finance vault.
- Sensitive data remains encrypted locally.

## 7. Implemented features in this package
1. Expanded new-holding form (stock + fund fields).
2. Historical holding entry (units + cost + date, no bank debit).
3. Owner selection on stock CSV import.
4. Owner assignment on newly imported stocks.
5. Richer holding detail sheet (units, average cost, unrealized P/L).
6. Migration defaults for new optional fields.
7. Service worker cache bumped to `myfinance-shell-v6`.
8. Updated README with accounting notes and safe-update steps.

## 8. Fixed bugs
- Stock import created holdings without an owner.
- No clear path to record pre-app investments without affecting today’s cash.
- Holding form lacked required stock/MF identity fields.

## 9. Remaining limitations
See README “Remaining limitations”.

## 10. Test results (automated / static)
- HTML/JS structure loads; key markers present after edit.
- Migration line sets defaults for new fields.
- Historical path emits `open` with empty postings.
- Import path stores selected owner on new holdings.
- **Not tested on a physical Android device or against a real pre-existing encrypted vault in this environment.**

## 11. Database / schema migration details
- Vault version remains `v:2`.
- New optional holding fields: `symbol`, `exchange`, `demat`, `broker`, `amc`, `notes`.
- `migrate()` sets empty-string defaults; existing records stay valid.
- No change to storage key `myfinance.v1` or encryption envelope format.

## 12. Safe update instructions
See README section “Safe update on the existing hosted origin”.


## Additional updates (same package)
- **Set current balance** button on account detail sheet (clearer label + wording for the existing adjustment flow).
- **Copy** on recipient bank contacts — copies full account number, IFSC, holder, bank, branch into the clipboard for pasting into UPI / NEFT forms or messages.


### v1.1.0 extras
- Home version badge + release notes.
- Investment summary + portfolio growth chart.
- Holding future-value projection calculator.
- Clearer adjustment labels in activity.

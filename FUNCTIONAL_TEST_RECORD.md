# Functional test record — My Finance

**App version at last update:** 2.8.2  
**Storage:** encrypted localStorage key `myfinance.v1` (no remote API)  
**Last audit date:** 2026-11-19  

Status legend: **OK** working · **PARTIAL** limited · **FIXED** was broken, repaired this cycle · **N/A** not in product scope

## Contacts
| Feature | Expected | Status | Notes |
|---------|----------|--------|-------|
| Add person | Creates contact with name/notes | **FIXED** 2.2.3 | `fcontact` handler was missing |
| Edit name & notes | Persists name + notes (incl. empty clear) | **FIXED** 2.2.3 | `fcontactedit` handler was missing |
| Multiline notes | Textarea, shown on contact card | **OK** 2.2.3 | |
| Add bank method | Saves under contact | **OK** 2.2.2 | |
| Add UPI + UPI name | Validates `@`, saves | **OK** 2.2.2 | |
| Edit method | Updates bank/UPI | **OK** 2.2.2 | |
| Copy UPI | Copies UPI ID only | **OK** 2.2.2 | |
| Delete method | Confirm then remove | **OK** | |
| Remove contact | Registry only; bankContacts recoverable | **OK** | |

## Family / members
| Feature | Status | Notes |
|---------|--------|-------|
| Manage people list | **OK** | More → Family members |
| Home family filter | **OK** | |
| Member net worth tiles | **OK** | Masked when privacy on |
| Move contact ↔ family | **OK** | Name-based |

## Accounts & money
| Feature | Status | Notes |
|---------|--------|-------|
| Add bank/cash/card | **OK** | form `f` / related |
| Demat account | **FIXED** 2.2.3 | `fdemat` handler was missing |
| Balance from postings | **OK** | Integrity check recon |
| Set balance / adjust | **OK** | |
| Copy own account details | **OK** | |

## Transactions
| Feature | Status | Notes |
|---------|--------|-------|
| Expense / income | **OK** | |
| Internal transfer | **OK** | |
| External send | **OK** | expense Sent externally |
| Activity search/filter/page | **OK** | |
| Void / restore | **OK** | |

## Salary schedules
| Feature | Status | Notes |
|---------|--------|-------|
| Create / edit | **OK** 2.2.1 | |
| Pause / remove | **OK** | history kept |
| Auto on unlock | **OK** | capped, idempotent |

## Home & privacy
| Feature | Status | Notes |
|---------|--------|-------|
| Single net-worth block | **OK** 2.2.0 | |
| Hide balances whole Home | **OK** 2.2.0 | |
| Theme light/dark/system | **OK** 2.0.1 | |

## Security / backup
| Feature | Status | Notes |
|---------|--------|-------|
| Passphrase unlock | **OK** | |
| Encrypted backup .enc | **OK** | |
| fmtHide after unlock | **OK** 2.1.1 | |

## Known limitations (not bugs)
- No cloud sync, bank feeds, or live market prices
- Contacts linked by name string, not formal FKs
- SIP units need holding price for non-zero units

## Root-cause pattern (saves)
Several forms had UI but **no `submit` handler** for their `form id`.  
**Process:** after any new form, ensure `e.target.id==="…"` exists and calls `save()` only after state mutation.


## 2.8.1 — Forex ledger
- Forex cards are selectable only in the expense flow, not generic payment flows.
- Legacy refunds recorded in v2.8.0 are linked to the original Forex wallet as history-only movements; migration preserves the current wallet balance and does not guess whether the user manually reflected old refunds.
- New/edit expense and refund update the selected wallet.
- Void/restore reverse/reapply Forex wallet movements.
- Migration validates wallet rows before replacement.
- Wallet reconciliation uses opening baseline plus posted movements.
- `node regression.mjs` runs without `linkedom`; all included logic regression groups pass. See `FUNCTIONAL_VALIDATION_REPORT.md`.


## 2.8.2 — wallet identity, warranty links and migration

- PASS: a Forex wallet with posted or voided history cannot be removed or have its currency changed.
- PASS: negative Forex wallet balances are accepted and retain two-decimal rounding.
- PASS: editing a linked expense synchronises purchase amount, currency, account and date; inferred warranty duration is preserved when the date changes.
- PASS: void/restore toggles linked warranty reminder suspension without deleting the purchase record.
- PASS: legacy PAN migration removes punctuation and retains only last four digits.
- PASS: integrity checks index refunds and wallet movements in one pass and inspect archived Forex cards.
- Automated coverage: `node regression.mjs` (minimal DOM shim; production logic, not full browser rendering).
- Not run: real Android device, WebAuthn biometric prompt, browser-level form dispatch, and real encrypted-vault restore on a personal dataset.

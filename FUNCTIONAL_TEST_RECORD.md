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


## 2.9.1 — Give & Take and navigation

- PASS: Give & Take remains separate from formal Lending; formal loan records and linked transactions use stable contact IDs when a unique contact match exists.
- PASS: balances and person summaries convert each transaction using its stored FX rate before aggregation.
- PASS: a new settlement is linked to one selected outstanding item, must use the same currency, and cannot exceed its remaining amount.
- PASS: legacy Give & Take records are shown as one aggregate outstanding balance per person and currency; no historical source transaction is guessed.
- PASS: per-person history is retained; Give & Take transactions can be edited, voided and restored, with source/settlement consistency guards.
- PASS: duplicate normalized contacts are not silently merged; orphaned IDs are repaired only when the name has one unique match.
- PASS: closing the Give & Take sheet resets quick-add state; regression verifies the next centre + action no longer inherits Give & Take mode.
- PASS: `node regression.mjs` — all regression groups pass, including the added Give & Take currency, settlement, migration, and close-state checks.
- Not run: real browser/device interaction, real encrypted-vault upgrade using the user's personal data, and WebAuthn.


## 2.9.2 — optional Forex visibility

- PASS: More → Display includes a persistent Show Forex features On/Off preference; existing vaults default to On to preserve current behaviour.
- PASS: Off hides Forex cards from Money, Forex-specific net-worth breakdown labels, Forex wallet-rate inputs, Forex account creation choice, and Forex payment options for new transactions.
- PASS: Turning visibility back On restores those UI options.
- PASS: Hiding Forex does not delete or rewrite Forex accounts, wallets, transaction history, exchange rates, or net-worth calculations.
- PASS: `node regression.mjs` — all regression groups pass, including the new Forex visibility checks.
- Not run: real browser/device interaction and a live encrypted-vault upgrade using personal data.


## 2.9.3 — security and reliability regression coverage

- Valid encrypted envelopes remain accepted; excessive PBKDF2 iterations and malformed salt/IV fields are rejected before key derivation.
- Hostile backup metadata is rejected without attempting expensive PBKDF2 work.
- CSV formula-leading text is neutralised while numeric amounts remain numeric.
- Browser Back closes a sheet and resets Give & Take quick-add state; explicit close removes the sheet history entry.
- Service-worker cache writes are registered with `event.waitUntil()` and the shell cache version is incremented.
- CSP regression verifies both inline-script SHA-256 hashes and confirms `script-src` no longer contains `unsafe-inline`.
- Full existing regression suite rerun after changes. Browser layout, actual Android hardware Back, real biometric hardware, and deployed-host header configuration remain manual/device tests.

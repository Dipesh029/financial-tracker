# Functional test record — My Finance

**App version at last update:** 2.2.3  
**Storage:** encrypted localStorage key `myfinance.v1` (no remote API)  
**Last audit date:** 2026-11-17  

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

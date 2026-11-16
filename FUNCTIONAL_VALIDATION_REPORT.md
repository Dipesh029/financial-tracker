# Functional validation report — My Finance

**Application version:** 2.2.4  
**Date:** 2026-11-17  
**Environment:** Code-level + Node syntax/ledger simulation (no live browser vault session in CI)  
**Storage model:** Encrypted JSON in `localStorage` key `myfinance.v1` (no remote API/backend)

---

## 1. Scope of inspection

| Module | Inspected |
|--------|-----------|
| Unlock / auth (passphrase path in code) | Yes |
| Home (net worth, privacy, members, month flow) | Yes |
| Money — Accounts / Investments / Contacts | Yes |
| Plan — SIPs / Salaries / Lending / Cover | Yes |
| Activity | Yes |
| More / Settings | Yes |
| Forms (all `<form id>` + `fs()` dynamic forms) | Yes |
| Postings ledger helpers | Yes |

**Modules inspected:** 8 major UI areas + form matrix + ledger core.

---

## 2. Form / save matrix (critical)

Every form id was mapped to a submit handler.

| Form ID | Result |
|---------|--------|
| pf | PASS — dedicated `onsubmit` on lock screen |
| fcontact, fcontactedit | PASS (fixed 2.2.3) |
| fmethod, fmethodedit | PASS (fixed 2.2.2) |
| fdemat | PASS (fixed 2.2.3) |
| fsal, fsaledit | PASS |
| fs1 (SIP) | PASS |
| fpol, fpoledit, fpay | PASS |
| **fpur (purchase)** | **FIXED 2.2.4** — handler was missing |
| f, f2, fa2, fedit, flend, flr, fh, fp, ffv, fcats, fcard, frecon, fpass, fsu | PASS (handlers present) |

**Result after 2.2.4:** zero form IDs without handlers (except dynamic `${fid}` template placeholder).

---

## 3. Features tested (method)

### Code / static verification
- Syntax: `node --check` on application script → **PASS**
- Render map functions (`viewHome`, `viewSettings`, …) all defined → **PASS**
- `fmtHide` defined → **PASS**
- Ledger reconstruction simulation (opening + postings, void ignored, transfer) → **PASS**

### Workflow verification (by handler + persistence path review)

| Feature | Status | Evidence |
|---------|--------|----------|
| Add/edit contact name & notes | PASS | fcontact / fcontactedit → mutate `S.contacts` → `save()` |
| Add/edit bank & UPI | PASS | fmethod / fmethodedit |
| Copy UPI (ID only) | PASS | formatContactMethodCopy |
| Family people save | PASS | savepeople handler |
| Net worth / wealth breakdown | PASS | netWorth + wealthBreakdown |
| Hide balances on Home | PASS | fmtHide + chart hide |
| Salary create/edit/pause/delete | PASS | fsal / fsaledit / salarystop / salarydel |
| Salary mark received | PASS | salaryrecv + salaryId for dedupe |
| SIP create | PASS | fs1 |
| Policy create | PASS | fpol |
| Purchase + warranty | **FIXED** | fpur now posts expense + purchases row |
| Demat create | PASS | fdemat |
| Integrity check balance recon | PASS | runCheck |

**Cannot fully execute in this environment (BLOCKED):**
- Real WebAuthn/fingerprint on device
- Actual IndexedDB folder picker on Android Chrome
- Visual layout on physical phone pixels
- Encrypt/decrypt of a real user vault file (no user secrets used)

These are environment limits, not code absences.

---

## 4. Issues discovered this validation pass

| # | Issue | Root cause | Fix | Retest |
|---|--------|------------|-----|--------|
| 1 | New purchase never saved | Form `fpur` had UI via `fs()` but **no submit handler** | Implemented `fpur` handler: expense txn + purchases record + warranty expiry | Handler present; syntax OK |
| 2 | Manual salary receive weak dedupe | `salaryId` not set on mark-received txn | Added `salaryId:x.id` | Code path updated |

Prior fixed issues (already in 2.2.x): contact notes, add person, UPI save, demat save, fmtHide, themes.

---

## 5. Counts (honest)

| Metric | Count |
|--------|------|
| Modules / major areas inspected | **8** |
| Functionalities / form-flows checked | **37+ form handlers**, **~25** product workflows reviewed |
| Passed on inspection (already OK) | Majority of forms/handlers |
| Issues discovered this pass | **2** |
| Issues fixed and retested (syntax + path) | **2** |
| Remaining FAIL | **0** known in form matrix |
| BLOCKED (env) | Biometrics, physical device UI, real vault crypto round-trip with user data |

---

## 6. Data integrity notes

- Purchase save creates a normal **expense** posting (balance stays consistent).
- Salary schedule edits write **revisions**, not historical payment mutations.
- Contact rename updates bankContacts / lending person labels by name match.
- Vault key remains `myfinance.v1`.

---

## 7. Build / automated tests

| Check | Result |
|-------|--------|
| `node --check` on app JS | **PASS** |
| Brace balance | **PASS** |
| Ledger unit simulation | **PASS** |
| Full browser E2E suite | **Not present** in project (vanilla PWA) |

---

## 8. Version

- **App:** 2.2.4  
- **README:** updated to match  
- **SW cache:** myfinance-shell-v48  

---

## 9. Remaining product limitations (NOT IMPLEMENTED / by design)

- No bank feeds / live prices  
- No multi-device sync  
- Person identity is name-based, not UUID FKs  



## Update 2.2.5 — Card expiry input (2026-11-17)

| Item | Detail |
|------|--------|
| Issue | MM/YY required slash; mobile numeric keypad has no `/` |
| Fix | `formatExpiryInput` auto-inserts slash; month + year `<select>` pickers; `readExpiryField` validation |
| Fields | Bank linked debit (`adexpiry`), new credit card (`cexpiry`), edit account (`expiry`) |
| Storage | Unchanged `cardMeta.expiry` as `MM/YY` |
| Unit tests | format 0829→08/29; invalid month 13 rejected (`node`) |
| Status | **FIXED** (syntax + unit tests PASS; device UI smoke recommended) |


## Update 2.2.6 — Lending date edit & form layout (2026-11-17)

| Item | Detail |
|------|--------|
| Issue | No way to fix wrong lending date after save; add form layout uneven |
| Fix | Tappable record → detail sheet with date editor (`flendedit`); sectioned add form |
| Date semantics | Updates `l.start` + original lend/borrow txn date; does **not** change repayments or `created` |
| Status | **FIXED** (syntax PASS; handlers present) |


## Update 2.2.7 — Lending amount edit (2026-11-17)

| Item | Detail |
|------|--------|
| Change | Edit form includes amount + date; confirm shows before/after |
| Validation | New principal must be ≥ sum of principal repayments |
| Updates | `l.principal`; original lend/borrow posting amount; interest accrual uses new outstanding via `lendingPosition` |
| Preserved | Repayment rows, repayment dates, `id`, `created` |
| Date edit | Still available on same form |
| Unit checks | increase / decrease with repayments / reject below repaid → PASS |
| Status | **FIXED** |


## Update 2.3.0 — Lending UI redesign (2026-11-17)

| Area | Change |
|------|--------|
| Dashboard | Outstanding hero + total lent / repaid / you owe / active count |
| Cards | Name hierarchy, original vs outstanding, progress bar, status pill |
| Detail | Summary, payment info, repayment history, edit amount/date, repay action |
| Forms | Existing sectioned add form retained |
| Logic | No calculation changes; same `lendingPosition` / edit handlers |
| Regression | flendedit amount+date, lendrec repayment entry preserved |
| Status | **PASS** (syntax); visual smoke on device recommended |


## Update 2.3.1 — Principal vs interest settlement (2026-11-17)

| Item | Detail |
|------|--------|
| Bug | Interest used *remaining* principal, so full principal repayment zeroed interest and showed 100% settled |
| Fix | Simple interest on **original** principal × rate × days/365.25; outstanding interest = accrued − interest paid |
| Status | Fully Settled only if principal left + interest left ≈ 0; else “Principal Repaid · Interest Pending” when applicable |
| Progress | Principal % and total % (principal+interest) shown separately |
| Allocation | Unchanged: repayments still principal-only or interest-only via form |
| Tests | Principal full + interest pending → not settled; both paid → Fully Settled (`node` scenarios PASS) |
| Status | **FIXED** |

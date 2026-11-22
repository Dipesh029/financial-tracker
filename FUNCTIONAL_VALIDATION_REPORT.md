# Functional validation report — My Finance

**Application version:** 2.8.2  
**Date:** 2026-11-19  
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


## Update 2.3.2 — Date-based interest & adjustments (2026-11-17)

| Item | Detail |
|------|--------|
| Bug | Interest kept accruing until *today* even after full principal repayment |
| Fix | Interval simple interest on outstanding principal between start → each principal repayment → (today only if principal remains) |
| Example | ₹50k @ 12% from 15 Sep → 15 Oct ≈ ₹493; no further accrual after 15 Oct |
| Adjust | “Adjust interest / round off”: set agreed outstanding, waive, or add; stored in `interestAdjustments[]` |
| Formula | Interest left = accrued + adjustments − interest paid |
| Tests | Sep→Oct full repay; interest pending; interest+adj settle → PASS |
| Status | **FIXED** |


## Update 2.3.3 — Lending landing UI polish (2026-11-17)

| Item | Detail |
|------|--------|
| Change | Cards: outstanding hero amount, 2-column principal/interest stats + bars, short status (Interest pending / Settled / Partial) |
| Full status | Still on detail sheet; card `title` has full status string |
| Logic | Unchanged |
| Layout | `min-width:0`, word-break, flex-wrap foot; ≤360px stacks stats |
| Checked | Card template structure for long status cases; `node --check` PASS |
| Status | **PASS** (UI) |


## Update 2.4.0 — Net worth classification (2026-11-17)

| Rule | Implementation |
|------|----------------|
| Loans receivable | `lendingPosition` outstanding (lent) → assets; borrowed → liabilities |
| Insurance cover | `sum` / sum assured **not** in net worth |
| Insurance cash | Optional `fundValue` / surrender → assets & investments once |
| Investments | Demat cash + holdings mark-to-market + insurance cash (no double-count) |
| Demat debit card | Not on demat form (bank-only linked debit) |
| Tests | NW unit: 100k bank + 50k holdings + 25k receivable + 5M cover → assets 175k PASS |
| Status | **FIXED** / classification logic verified in Node |


## Update 2.4.1 — Net worth preferences (2026-11-17)

| Pref | Default | Effect |
|------|---------|--------|
| Insurance cash/surrender | ON | In actual assets |
| Loans receivable | ON | Principal outstanding in assets |
| Accrued interest receivable | ON | Interest left in assets (with loans) |
| Personal-use assets | OFF | Vehicles/personal if recorded |
| Insurance coverage (sum assured) | OFF | Adjusted position only — never actual NW |
| Restore defaults | — | Resets all five |
| Persistence | `S.nwPrefs` in encrypted vault |
| Status | **FIXED** (syntax PASS; prefs applied in `loansReceivable` / `insuranceValues` / `netWorth`) |


## Update 2.4.2 — SIPs, Salaries, Accounts, Investments, Home UI (2026-11-17)

| Module | UI change |
|--------|-----------|
| SIPs | Monthly commitment hero; active count; rec-cards with status pills |
| Salaries | Monthly inflow hero; schedule cards; status |
| Accounts | Bank+cash hero; type filters; balance cards; card limit bar |
| Investments | Value/cost/gain hero; demat + holding cards |
| Home | Actual NW focal; adjusted cover note; cleaner breakdown |
| NW prefs | pref-row layout with short explanations |
| Logic | Unchanged |
| Status | **PASS** (syntax); workflow smoke on device recommended |


## Update 2.4.3 — Card expiry fields (2026-11-18)

| Item | Detail |
|------|--------|
| Issue | Duplicate expiry UI (combined MM/YY + month + year selects) and validation errors |
| Fix | Exactly **two** inputs: Month (MM) and Year (YY/YYYY); hidden stores `MM/YY` for compatibility |
| Forms | Linked debit (`adexpiry`), new credit card (`cexpiry`), edit account (`expiry`) |
| Validation | Month 01–12; year 2 or 4 digits; past expiry blocked on new cards |
| Status | **FIXED** (syntax PASS) |


## Update 2.5.0 — Comprehensive functional pack (2026-11-18)

| Area | Change | Status |
|------|--------|--------|
| NW prefs | 4 toggles only; personal-use removed from UI/calc | FIXED |
| CSV import | `csvimp` opens import sheet; **holdParse** implemented | FIXED (code); needs device file pick smoke |
| MF units | Adjust total units via adjustment txn | FIXED |
| Forecast | SIP monthly pre-filled from active SIPs | FIXED |
| Policy | Structured detail + premiums paid to date | FIXED |
| Demat | Cash/settlement label | FIXED |
| Lending cards | Interest paid/left on summary | FIXED |
| Sort | Long-press reorder + `sortOrder` persistence | FIXED (basic); multi-list device test recommended |
| Data | No vault key change; additive fields only | PASS |


## Update 2.5.1 — Liabilities & insurance schedule (2026-11-18)

### Liabilities root cause
Lending principal/interest repayments set `pd` on transactions. `personPos()` summed those into informal IOUs **and** `loansReceivable()` already counted outstanding loans → **negative `pd` after repayments appeared as liabilities**.

**Fix:** `personPos` ignores any txn with `loanId`, `lendingId`, `principalReduction`, `interestSettlement`, or types `lend`/`borrow`/`lendback`/`repay`.

### Insurance premiums
- `policyScheduleDates` builds full instalment list from commencement + frequency through PPT end.
- `paidThrough` on policy = user-confirmed historical paid-through date (no bank txns created).
- `policyNextUnpaidDue` reconciles schedule + paidThrough + recorded payments.
- Status: “No further premiums due” when PPT complete / all paid.

### Tests executed
- personPos exclusion asserts → PASS
- PPT end 2016-04-28 + 10y → 2026-04-28 PASS
- node --check → PASS


## Update 2.5.2 — Pending-scope completion pass (2026-11-18)

### Audit summary
| Area | Status before 2.5.2 | Now |
|------|---------------------|-----|
| personPos / liabilities | FIXED 2.5.1 | OK |
| Insurance schedule + paidThrough | FIXED 2.5.1 | OK |
| NW 4 prefs | OK 2.5.0 | OK |
| holdParse CSV | OK 2.5.0 | OK |
| MF units adjust | OK 2.5.0 | OK |
| SIP forecast prefill | OK 2.5.0 | OK |
| Sort on accounts/holdings | Partial | **Expanded** to contacts, SIPs, salaries, policies, lending |
| sortedList rendering | Partial | **All major lists** |
| Full visual redesign Part 13 | Incomplete | Still limited (polish modules exist; not full redesign) |

### Tests
- node --check PASS
- sortedList present for contacts/sips/salaries/policies/lending PASS


## Update 2.5.3 — Critical bug fixes (2026-11-18)

| Item | Root cause | Fix | Test |
|------|------------|-----|------|
| Sort leaves container | Root-wide insertBefore | Group by parent; drag handle only | Code review PASS |
| CSV sold-missing | killMissing with empty P.missing | Disabled auto-sold | PASS |
| CSV parsing | Line-split CSV | `parseCsvRows` quoted newlines | Structure PASS |
| File duplicates | None | seenInFile by ISIN/symbol+exch | PASS |
| Qty 0 silent | parse failed→0 | Reject non-positive qty | PASS |
| NW loan prefs | `continue` skipped interest | Independent principal/interest | Assert PASS |
| Premium count | Inclusive end drift | n = ppt*12/freq instalments | Annual 10 PASS |
| Month-end | addM already clamps | Kept | Jan31→Feb29 PASS |
| Legacy liabilities | pd on loan notes | personPos note+lending person filter | PASS |


## Update 2.5.4 — Sort system & critical fixes (2026-11-18)

| Requirement | Status |
|-------------|--------|
| Remove drag-and-drop | COMPLETE |
| Sort button per section | COMPLETE (accounts, holdings, SIPs, salaries, lending, policies, contacts) |
| Manual Reorder ↑↓ | COMPLETE (accounts, holdings, lending, SIPs) |
| Sort prefs in S.ui vault | COMPLETE |
| Premium prinTxns corruption | FIXED |
| CSV exchange preserved | FIXED |
| doHolds single save | COMPLETE (1 save) |
| Numeric sort unit test | PASS |
| node --check | PASS |
| Manual Android UI | PENDING user device |


## Update 2.5.5 (2026-11-18)

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Paid Through on create | COMPLETE | `newPolicySheet` + `ppaidthrough` → `pol.paidThrough` |
| Paid Through on edit | COMPLETE | `pepaidthrough` + next recalc |
| No bank txn for historical | COMPLETE | paidThrough only updates coverage, no addTxn |
| Next due after paidThrough | COMPLETE | `policyNextUnpaidDue` |
| Simplified policy form | COMPLETE | Essentials + collapsible Additional |
| Compact sort controls | COMPLETE | `.sort-chip` right-aligned |
| Reorder → manual order | COMPLETE | `setReorderMode` sets key manual |
| Move up/down | COMPLETE | `moveItemInArray` reindex |
| CSV skipSave batch | COMPLETE | open/adjust `{skipSave:true}`; final `save()` |
| Exchange preserved | COMPLETE | `exchange:p.it.exch` |
| Vault key myfinance.v1 | COMPLETE | unchanged |
| node --check | PASS | |
| Paid-through unit schedule | PASS | 10 annual covered through 2025-04-28 |
| Android UI | PENDING | user device |


## Update 2.5.6 (2026-11-18) — Mandatory fixes

| Requirement | Status | Test |
|-------------|--------|------|
| Policy edit apply-all-then-recalc | COMPLETE | Code path ordered; nextOverride respected |
| Not finalPremiumPaid when schedule incomplete | COMPLETE | hasSchedule gate |
| CSV owner+ISIN+exchange | COMPLETE | CSV_MATCH_OK asserts |
| Different exchange not merged | COMPLETE | assert PASS |
| Different owner not merged | COMPLETE | assert PASS |
| skipSave bulk import | COMPLETE | doHolds uses skipSave |
| Reorder accounts/holdings/sips/lending | COMPLETE | controls present |
| Reorder salaries/policies/demat/contacts | COMPLETE | controls present |
| Move first/last blocked | COMPLETE | REORDER_OK |
| Compact sort UI | COMPLETE | sort-chip CSS |
| node --check | COMPLETE | PASS |
| Vault myfinance.v1 | COMPLETE | unchanged |


## Update 2.5.7 (2026-11-18)

| Requirement | Status | Test result |
|-------------|--------|-------------|
| Remove Reorder/Done/Move | COMPLETE | Search: no Reorder UI, no moveItemInArray |
| Sort control per section | COMPLETE | sortBarHtml chip only |
| Manual Order = saved sortOrder | COMPLETE | SORT_OK restore abc |
| Contacts no undefined ci | COMPLETE | map(c=>...); CONTACTS_OK 0/1/many |
| CSV fileKey includes exchange | COMPLETE | NSE≠BSE keys |
| CSV no wildcard empty exchange | COMPLETE | empty exch only matches empty |
| Ambiguous matches not merged | COMPLETE | candidates.length===2 case |
| Demat independent sort bar | COMPLETE | sortBarHtml("demat") when filter demat |
| node --check | COMPLETE | PASS |
| Insurance paid-through logic | COMPLETE | unchanged from 2.5.6 (prior PREMIUM_OK) |


## Update 2.5.8 (2026-11-18)

| # | Requirement | Status | Test |
|---|-------------|--------|------|
| 1 | Manual Order = array order not sortOrder | COMPLETE | MANUAL_OK: xyz restored; orig not mutated |
| 2 | Sort never mutates saved array | COMPLETE | JSON.stringify equality after sorts |
| 3 | Ambiguous CSV before mutation | COMPLETE | continue before H create |
| 4 | Different ISIN never symbol-match | COMPLETE | CSV_OK assert length 0 |
| 5 | Same ISIN different exchange separate | COMPLETE | CSV_OK |
| 6 | Empty exchange not wildcard | COMPLETE | CSV_OK |
| 7 | Demat no debit UI (create) | COMPLETE | fdemat has no last4 |
| 8 | Demat save no cardMeta/debit | COMPLETE | fcard demat branch only broker/id/invested |
| 9 | Bank still supports debit | COMPLETE | bank branch keeps debitCard path |
| 10 | node --check | COMPLETE | PASS |


## Update 2.5.9 (2026-11-18)

| Issue | Fix | Test |
|-------|-----|------|
| Ambiguous CSV created holdings | `doHolds` skips `kind==="ambiguous"` **before** create | `PASS ambiguous_skip_before_create` |
| Snapshot included ambiguous | Snap from non-ambiguous plan rows only | assert snapItems |
| Bank debit wrote `debitCard` | Writers use `a.cardMeta` | `PASS cardMeta_structure` |
| Demat card fields | Create/edit demat paths have no card UI; save ignores cardMeta | code path + test |
| Manual sort | unchanged | `PASS manual_sort` |

Commands: `node regression.mjs` → ALL_REGRESSION_PASS; `node --check` on extracted script → PASS


## Update 2.5.10 (2026-11-18)

Production tests via `node regression.mjs` (extracts real functions from index.html):

| Test | Result |
|------|--------|
| PASS acctSheet_card_gating | demat/cash empty; bank debit; card credit |
| PASS csv_production_matcher | ISIN/exchange rules |
| PASS ambiguous_before_create | no holding create |
| PASS manual_sort_production | array order, no mutate |
| PASS cardMeta_not_debitCard | source has cardMeta only |

`acctSheet` uses `acctSheetCardSectionHtml(a)` — no unconditional card fields.


## Update 2.8.1 — Forex ledger completion and migration safety (2026-11-19)

| Area | Change |
|------|--------|
| Expense picker | Forex cards shown in a dedicated group; per-wallet currency and balance are visible |
| New expense | Selected wallet is debited in its own currency; historical conversion rate retained |
| Edit expense | Old Forex movement reversed, new selected wallet movement applied; account/wallet/currency metadata updated |
| Refund | Refund references and credits the original Forex wallet; legacy v2.8.0 refunds are linked as history-only movements; the existing balance is preserved because prior manual adjustments cannot be inferred |
| Void / restore | Expense and refund movements reverse/reapply; failed persistence rolls back the in-memory snapshot |
| Purchase / warranty | Purchase currency follows selected wallet currency rather than `MULTI` card currency |
| Migration | Rejects malformed wallet lists, duplicate currencies/IDs, unsupported currencies, and invalid balances before replacing wallet data |
| Reconciliation | Wallet opening baseline + posted expenses/refunds compared with current balance |
| Biometric unlock | Migration failure aborts unlock processing; no automation or save of partial state |
| Compatibility | `myfinance.v1`, AES-256-GCM envelope, PBKDF2 fields, and encrypted backup envelope unchanged |

### Validation performed
- Application inline JavaScript `node --check`: PASS.
- `regression.mjs` `node --check`: PASS.
- `sw.js` `node --check`: PASS.
- `node regression.mjs`: PASS — all production logic regression groups pass using the no-dependency DOM shim.
- Chromium UI smoke test: BLOCKED by environment browser policy (`ERR_BLOCKED_BY_ADMINISTRATOR`).
- Physical Android UI, WebAuthn fingerprint, and a real encrypted-vault upgrade/restore: NOT RUN.

No claim is made that the full browser/device regression suite passed.


## Update 2.8.2 — wallet identity and linked warranty integrity (2026-11-19)

| Area | Change |
|------|--------|
| Forex wallet identity | Historical wallet IDs/currencies are immutable once any transaction (including voided) references them; removal/change is blocked with an explanation |
| Negative balances | Wallet editing accepts negative values consistently with the explicit overspending confirmation in the expense flow |
| Linked purchases | Expense edits synchronise purchase amount, currency, account and date; warranty duration is preserved when date changes |
| Warranty lifecycle | Voiding a linked expense suspends its reminder; restoring resumes it without deleting the purchase |
| Legacy card migration | Correct non-digit stripping ensures full card numbers are removed and last four digits retained |
| Integrity checks | Archived Forex cards and linked purchase references are checked; refund totals and wallet movements are aggregated in one pass |
| Compatibility | `myfinance.v1`, AES-256-GCM envelope, PBKDF2 fields and encrypted backup format remain unchanged |

### Validation performed for 2.8.2
- Application inline JavaScript syntax: PASS.
- `regression.mjs` syntax: PASS.
- `sw.js` syntax: PASS.
- `node regression.mjs`: PASS — all production-logic regression groups pass using the no-dependency DOM shim.
- Full browser UI, Android device, WebAuthn and real encrypted-vault upgrade/restore: NOT RUN.


## Update 2.9.4 — Lending exports (2026-11-22)

| Area | Change |
|------|--------|
| Lending overview | Export all, money lent, money borrowed, or all loans for a selected person |
| Individual loan | Export statement scoped to the selected loan ID |
| Summary CSV | Principal, repayments, accrued/paid/adjusted interest, outstanding balances, rate, status and as-of date |
| Detailed ledger CSV | Original loan record, posted principal repayments, posted interest settlements and dated interest adjustments |
| Currency safety | Each loan remains in its original currency; no cross-currency addition |
| Data integrity | Export is read-only; voided repayment transactions are excluded; CSV text formula injection protection reused |

### Validation performed for 2.9.4
- `node regression.mjs`: PASS — `ALL_REGRESSION_PASS`, including new lending export scope, currency separation, calculation, ledger and CSV safety tests.
- Application inline JavaScript syntax and CSP inline-script hash validation: PASS via regression harness.
- `sw.js` cache version incremented to v84.
- Actual browser downloads, iOS/Android file handling, visual layout and physical-device testing: NOT RUN.
- Storage key, encryption format, encrypted backup envelope and Lending calculation logic: unchanged.


## Update 2.9.5 — Sort and export presentation (2026-11-22)

### Changes
- Compact, consistent sort toolbars across all existing sortable pages; Lending Sort and Export share one action row.
- Sort selection sheet redesigned into compact per-field ascending/descending controls plus Manual order. Existing sort keys and persisted preferences are preserved.
- Lending summary and ledger CSVs use readable labels and omit internal IDs/references. Detailed ledger includes loan date, original principal and report date.
- Transaction CSV removes transaction IDs and duplicate reference IDs and uses readable transaction type/status labels.
- APP_VERSION advanced to 2.9.5; service-worker shell cache advanced to v85; CSP hash updated for the changed inline script.

### Validation performed for 2.9.5
- `node --check regression.mjs` — passed.
- `node --check sw.js` — passed.
- `node regression.mjs` — `ALL_REGRESSION_PASS`.
- CSP regression confirms every inline script hash matches the page policy.
- Browser/device visual inspection and physical CSV download/opening tests were not performed.

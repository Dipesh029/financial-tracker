# My Finance — Application Blueprint (Audit)

**Document type:** Functional & technical audit (read-only)  
**App version audited:** 1.8.5  
**Date:** 2026-11-17  
**Scope:** Local package under `myfinance/` (`index.html`, `sw.js`, `manifest.webmanifest`, `icon.svg`)  
**Constraint:** No code was changed for this audit.

---

## 1. Application overview

### Purpose & vision
**My Finance** is a **local-first, encrypted family finance Progressive Web App (PWA)** aimed primarily at Android (also usable in desktop browsers). It tracks:

- Personal and family **cash / bank / credit card** balances  
- **Income, expenses, transfers**  
- **Investments** (stocks, mutual funds, demat-style accounts)  
- **Recurring** SIPs and salaries  
- **Lending / borrowing** among friends and family  
- **Insurance** premiums and **purchase warranties**  
- **Contacts** with bank/UPI reference details  

There is **no server, no cloud sync, and no bank API integration**. All durable data lives in an **AES-256-GCM encrypted vault** in browser storage on the device.

### Core principles (as implemented)
1. **Privacy:** Passphrase never stored; optional WebAuthn PRF biometric unlock.  
2. **Offline-first:** Works without network after install (service worker caches shell).  
3. **Postings-based ledger:** Account balances are derived from opening balance + posted transaction postings.  
4. **Family-aware labels:** Owner strings on accounts/holdings; Home can filter by person.  
5. **Safe updates:** Same origin + storage key `myfinance.v1`; backups are encrypted `.enc` files.

### Primary user journeys
1. **Create vault** → strong passphrase → add accounts → record spend/income.  
2. **Daily unlock** → passphrase or fingerprint → due-soon strip + auto SIP/salary (if enabled).  
3. **Transfer** between own accounts or “external send” to a contact method.  
4. **Invest** via holdings / demat / SIP plan.  
5. **Lend** to a contact with optional recipient account/UPI.  
6. **Backup** encrypted export to Downloads or chosen folder.  
7. **Family view** filter net worth by member.

---

## 2. Module-by-module functionality

### 2.1 Authentication & security
| Item | Status |
|------|--------|
| Passphrase unlock | **Implemented** |
| Create vault (min 12 chars) | **Implemented** |
| Fingerprint / passkey (WebAuthn PRF) | **Implemented** where browser supports |
| Lock screen hides bottom nav | **Implemented** (v1.8.3+) |
| Session clear after ~2 min background | **Implemented** (`visibilitychange`) |
| Change passphrase (re-encrypt) | **Implemented** |
| Wipe local vault | **Implemented** |

**Crypto:** PBKDF2-HMAC-SHA-256 → AES-256-GCM. Storage envelope includes `enc`, `salt`, `iterations`, `iv`, `data`, optional `bio`.

**Known limitations:** No remote auth; lose passphrase + no bio + no backup ⇒ data unrecoverable. Bio must be re-enabled after passphrase change.

---

### 2.2 Navigation (bottom bar)
**Current tabs (v1.8.x):** `Home · Money · + · Plan · More`

| Tab | Maps to | Notes |
|-----|---------|--------|
| Home | `viewHome` | Dashboard |
| Money | `viewAccounts` | Segmented: Accounts / Investments / Contacts |
| + | Add sheet | expense / income / transfer / invest / lend |
| Plan | `viewPlan` | SIPs / Salaries / Lending / Cover |
| More | `viewSettings` | Settings & secondary entry points |

**Activity** is **not** a primary tab; reachable via Home (“See all activity”) and More.

---

### 2.3 Home / dashboard
**Purpose:** Snapshot of wealth and near-term dues.

**Shows:**
- Family view selector (`All family` or one person)  
- Member net-worth tiles (when All family) + filters: All / With net worth / Zero  
- Due-soon strip (SIPs, salaries, card dues, premiums, warranties, card expiry)  
- Investment summary + simple portfolio growth from import snapshots  
- Net-worth history snapshots  

**Depends on:** accounts, holdings, txns, sips, salaries, policies, purchases, history.

**Limits:** No live market data; EUR/INR uses manual rate; growth chart depends on stored snaps.

---

### 2.4 Money → Accounts
**Account types:** `bank`, `cash`, `card` (credit). **`demat` accounts are shown under Investments**, not the Accounts list.

**Features:** Add/edit nickname & owner; bank number/IFSC/branch; credit limit & due days; linked debit meta on bank; linked **bank for bill pay** on cards; set current balance (adjustment txn); copy own bank details; archive (via handlers where present).

**Balances:** `opening + sum(postings)` for non-voided txns.

---

### 2.5 Money → Investments
**Filters:** All · Demat · Stocks · Mutual funds  

**Holdings:** stock/fund; owner; folio/ISIN/symbol; average-cost units; manual price; historical open; CSV stock import; future value estimate UI.

**Demat account:** nickname, broker, invested cost, current value as balance.

**Limits:** No live NAV/price feed; MF not “primary” in UX but fully supported; FIFO/tax lots not implemented.

---

### 2.6 Money → Contacts (people registry)
**Model:** `S.contacts[]` with `methods[]` (`bank` | `upi`).

**Legacy:** `S.bankContacts[]` still exists; `migrateContactsFromBank()` merges both ways on unlock.

**Features:** Add person; open card; edit name/notes; add/edit/remove bank or UPI; copy method (full number + IFSC); move to Family view; remove from Contacts (bank rows retained for restore).

**Not balances:** Contact methods do not affect net worth.

**Depends on:** used by external transfer + lending recipient method.

---

### 2.7 Family view
**Model:** `S.people[]` string labels (default Me, Father, Mother).

**Interaction:** Home filter + member tiles; **Manage family members** under More (not on Home).

**Move:** Family → Contacts (remove from `people`, ensure contact); Contacts → Family (push name into `people`).

**Important distinction:** Account **owner** labels and **Contacts** are related by **name string**, not foreign keys.

---

### 2.8 Income, expenses, transfers (+)
**Sheet types:** expense, income, transfer, invest, lend.

**Categories:** Customizable `expenseCats` / `incomeCats` (defaults provided).

**Expense extras:** Optional “also track as purchase/warranty”.

**Transfer modes:**
- **Between my accounts** — two own accounts, type `transfer`  
- **To external person** — expense `Sent externally` + contact method note  

**Limits:** External transfer is not double-entry to the counterparty (they have no ledger balance in-app).

---

### 2.9 Activity
Full transaction list with search, account filter, void/restore. Types include income, expense, transfer, buy/sell, lend-related, adjustments, etc.

---

### 2.10 Plan → SIPs
Recurring invest: fund + debit account + amount + frequency + next date. Auto-post on unlock if enabled. Paid/missed history; stop/resume. Fund list shows folio.

**Limit:** Auto units require holding **price**; else 0 units with cost recorded.

---

### 2.11 Plan → Salaries
Member + credit account + amount + schedule; auto on unlock if enabled.

---

### 2.12 Plan → Lending
Record lend/borrow with **your** account, person name, optional **recipient method** (contact bank/UPI), principal, optional simple interest rate, start date.

**Display:** Your account, their method (if set), outstanding/partial/repaid, est. interest.

**Repayments:** Separate record flow (principal vs interest settlement).

**Limit:** Interest is **simple estimate**, not day-count product-grade accrual.

---

### 2.13 Plan → Cover (insurance & warranties)
**Policies:** commencement, PPT, term, premium, frequency, next due, payment history, mark paid, edit fields.

**PPT logic (v1.8.1+):** Payable date and “final premium” flags affect overdue; mark paid advances `next` and can set `finalPremiumPaid`.

**Purchases:** item, amount, warranty months; can be created from expense checkbox.

---

### 2.14 More (settings)
Version/release notes, user guide, family members, activity link, auto SIP/salary toggles, category editors, EUR/INR rate, biometric enable/disable, change passphrase, backup folder + save/restore `.enc`, integrity check, CSV export, wipe vault.

---

## 3. Architecture

### 3.1 Stack (actual)
| Layer | Technology |
|-------|------------|
| UI | Single **`index.html`** (HTML + CSS + vanilla JS) |
| App shell | PWA: `manifest.webmanifest`, `sw.js`, `icon.svg` |
| Backend | **None** |
| Database | **None** (no SQL). Encrypted JSON in **`localStorage`** key `myfinance.v1` |
| Optional | IndexedDB for backup folder handle only |
| APIs | **None** (no REST). Web Crypto, optional WebAuthn, File System Access API |
| Framework | **None** (no React/Vue) |

### 3.2 Project structure
```
index.html          # Entire application
sw.js               # Service worker (network-first HTML)
manifest.webmanifest
icon.svg
README.md / FUNCTIONAL_AUDIT.md  # docs (may lag version)
```

### 3.3 State management
- Global in-memory object **`S`** (vault plaintext after unlock).  
- **`CK`** CryptoKey; **`SALT`**, **`KDF_ITER`**, **`BIO`**.  
- UI globals: `tab`, `sheetType`, `moneySeg`, `planSeg`, filters, etc.  
- Persistence: `save()` → `seal(S)` → `localStorage`.  
- Write chain: Promise chain to serialize seals.

### 3.4 Service worker
Cache name bumped per release (e.g. `myfinance-shell-v35`). HTML navigation intended **network-first** so updates appear after deploy.

---

## 4. Data model & relationships

### 4.1 Root vault object (`S`)
| Collection | Role |
|------------|------|
| `accounts` | bank / cash / card / demat |
| `txns` | ledger with `postings[]` |
| `holdings` | stock / fund positions |
| `sips` | recurring investments |
| `salaries` | recurring income |
| `policies` | insurance |
| `purchases` | warranty tracking |
| `lending` | F&F loans |
| `contacts` | person registry + `methods[]` |
| `bankContacts` | **legacy** recipient rows (still migrated) |
| `people` | Family view name list |
| `history` | net-worth snapshots |
| `snaps` | portfolio import snapshots |
| `expenseCats` / `incomeCats` | category lists |
| `autoSip` / `autoSalary` | booleans |
| `rate` / `display` | FX display helpers |

### 4.2 Relationship map (logical)

```
people[] ──────────── name string ──────── accounts.owner
   │                                         holdings.owner
   │                                         policies.owner
   │
contacts[].name ───── same string convention ─── lending.person
   │                                              txn.person (optional)
   └── methods[]  ←── migrate ──→ bankContacts[]
            │
            ├── external transfer recipient
            └── lending.recipientMethod

accounts ←── postings ──→ txns
holdings ←── buy/sell/open txns
sips.hold → holdings; sips.acct → accounts
salaries.acct → accounts
policies ←── payments[] + expense txns (policyId)
```

**There are no formal foreign-key constraints.** Integrity is soft (IDs may dangle if deleted carelessly).

### 4.3 Duplicate / parallel structures
| Topic | Issue |
|-------|--------|
| Contacts vs bankContacts | Dual storage; migration keeps both in sync best-effort |
| People vs contacts | Overlapping names; different purposes |
| Owner vs contact | Family owner on *your* accounts ≠ counterparty contact |
| Transaction types | Some historical labels (`loanId` vs `lendingId`) may coexist in code paths |

### 4.4 Net worth (conceptual)
Typically assets (positive bank/cash/demat/holdings) minus card liabilities and similar — computed in `netWorth(owner)` style helpers from balances and holdings (owner filter optional).

---

## 5. UI / design system (as coded)

### Tokens (`:root`)
- Light: `--bg #f0f2f6`, `--card #fff`, `--ink #121a24`, `--accent #2f4fd8`, `--in` green, `--out` red, `--warn` amber  
- Dark: `prefers-color-scheme: dark` overrides  
- Radius ~14px; light shadow; shared easing  

### Patterns
- **Cards** for list rows; **chips** for filters; **seg** for segmented controls  
- **Bottom sheet** (`openSheet`) for forms  
- **Toast** for lightweight feedback  
- **Empty states** with title + short hint (partial coverage)  
- Fixed **bottom nav**; lock state forces `display:none` on nav  

### Inconsistencies / UX notes
- README version text may lag app version  
- Activity discoverability weaker after nav simplification  
- Some long sheets (policy edit) are dense on small screens  
- Not a full design-system library (no component package)

---

## 6. Functional & technical audit

### Confirmed / recently fixed (historical)
- Missing `viewSettings` broke unlock (fixed 1.8.4)  
- Policy overdue vs pay mismatch (PPT clamp) fixed 1.8.1+  
- Nav visible under lock (1.8.3)  
- Contact copy newline bug (1.8.5)

### Known limitations (product)
- No multi-device sync  
- No live prices / bank feeds  
- Average cost only (no FIFO)  
- Simple interest on lending  
- SIP auto units need price  
- Dual contact storage complexity  
- Service worker / cache can hide updates if not bumped/hard-refreshed  

### Risks
- String-matched person names (rename edge cases)  
- Auto postings on unlock can create multiple txns if many due dates backlog  
- Large `txns` arrays: all client-side, no pagination virtualization  
- Integrity check exists but is not a full accounting proof system  

### Security notes
- XSS mitigated partially via `esc()` in templates — continued discipline required  
- Passphrase strength only lightly enforced (length)  
- Backups are only as safe as passphrase + file storage location  

---

## 7. UX workflow observations

| Friction | Note |
|----------|------|
| Concepts: Family vs Contacts vs Owners | Powerful but easy to confuse |
| Activity not in bottom nav | Extra step via More/Home |
| External transfer as expense | Correct accounting, but wording must stay clear |
| Policy PPT | Users must understand commencement + PPT |
| Demat vs holdings | Two investment metaphors |

**Automation already present:** SIP/salary on unlock; due-soon aggregation.

---

## 8. Improvement recommendations (prioritized)

### P0 — Critical / integrity
1. Single person identity model (unify contacts + bankContacts + stabilize IDs).  
2. Accounting invariants tests (balance rebuild, void symmetry).  
3. Stronger unlock regression tests (render map always defined).

### P1 — Functional
1. Virtualized activity list for large ledgers.  
2. Explicit “counterparty account” on more flows (transfer notes).  
3. Policy schedule preview (all due dates in PPT).  
4. Safer bulk auto-post (cap + summary confirmation).

### P2 — UI/UX
1. Onboarding for Family vs Contacts.  
2. Consistent empty states and section headers.  
3. Optional 5th nav or clearer Activity entry.  
4. Keep README/version in sync with `APP_VERSION`.

### P3 — Scale / future
1. Optional encrypted sync (user-controlled).  
2. Price import helpers.  
3. Accessibility audit (focus order, contrast, screen readers).

---

## 9. Deliverables checklist

| Deliverable | Location in this doc |
|-------------|----------------------|
| Overview | §1 |
| Module docs | §2 |
| Architecture | §3 |
| Data & relationships | §4 |
| UI/UX system | §5 |
| Bugs/limits | §6 |
| UX analysis | §7 |
| Roadmap | §8 |

### Not available / not verified in this audit
- Production hosting configuration beyond PWA files  
- Real-device biometric matrix (only code paths reviewed)  
- User’s private vault contents  
- Screenshots of a running session (static code audit)

---

## 10. Summary for independent reviewers

**My Finance v1.8.5** is a **single-file encrypted PWA** with a **postings ledger**, **family owner filters**, **contacts registry**, **investments**, **recurring SIP/salary**, **lending**, and **insurance**. There is **no backend**. Complexity is concentrated in `index.html` state mutations and name-string relationships between people, contacts, and accounts.

Highest-value next engineering investments: **identity model cleanup**, **automated unlock/render smoke tests**, and **ledger performance** — not a framework rewrite.

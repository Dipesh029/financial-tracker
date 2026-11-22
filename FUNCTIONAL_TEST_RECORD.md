# Functional test record — My Finance

**App version at last update:** 2.12.6  
**Storage:** encrypted localStorage key `myfinance.v1` (no remote API)  
**Last audit date:** 2026-11-22  

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


## 2.9.4 — Lending export regression coverage

- PASS: all-loan summary keeps every loan as an independent row.
- PASS: person filter includes multiple loans and preserves INR/EUR as separate currencies.
- PASS: lent and borrowed filters return only the selected direction.
- PASS: individual-loan filter exports only the selected loan ID.
- PASS: summary uses production `lendingPosition()` outputs for principal, interest paid, adjustments and outstanding values.
- PASS: detailed ledger includes posted principal repayments, interest settlements, positive interest adjustments and waivers.
- PASS: voided repayment transactions are excluded.
- PASS: formula-leading text in lending CSV is neutralised; numeric amounts remain numeric.
- PASS: Lending overview export action and individual detail statement action are present.
- PASS: `node regression.mjs` — `ALL_REGRESSION_PASS`.
- Not run: actual browser download prompts, iOS/Android file handling and visual layout on physical devices.


## 2.9.6 — Sort and shareable export regression coverage
- Regression confirms Lending Export shares the sort toolbar and each existing sortable section retains its section-specific sort configuration.
- Regression validates friendly lending headers, removal of technical identifier columns, separate currencies, original loan identity context in the ledger, report date, repayment/interest/adjustment entries, and exclusion of voided repayments.
- Regression validates readable transaction type and status labels.
- Full regression suite: `ALL_REGRESSION_PASS`.
- Browser/device visual checks and actual download handling were not run in this validation.


## v2.9.6 — Sort controls and shareable lending statements
- Sort and Export controls are aligned beside sortable page headings; the separate Arrange label/row is removed.
- Lending CSV text is sanitized for invisible/control and common mojibake artefacts while preserving legitimate Unicode names.
- Added locally generated print-to-PDF lending summary and detailed statement exports.
- Service worker shell cache advanced to v86.

### v2.9.6 upload
Replace `index.html` and `sw.js` on the existing HTTPS origin. Keep the manifest, icon, encrypted vault and backups unchanged.


## 2.9.7 — Lending PDF layout and totals (2026-11-22)
- Regression coverage verifies summary PDF principal, interest and total outstanding labels.
- Regression coverage verifies totals remain separated by currency and Lent/Borrowed direction.
- Regression coverage verifies A4 portrait summary layout, A4 landscape detailed layout, normal word wrapping and per-loan closing balances.
- Full `node regression.mjs` suite passed after implementation.


## 2.9.9 — Lending reports, Unicode exports and integrity warnings (2026-11-22)
- PASS: future-dated principal repayments and interest settlements are omitted from the lending ledger. Closing figures match `lendingPosition()`.
- PASS: a repayment recorded before the loan start keeps that original date. The description and note name the original date and the effective interest date. The stored transaction is not changed.
- PASS: PDF totals add unrounded balances per currency and direction, then format once. INR, EUR and USD grouping is checked. Currencies are not added together.
- PASS: `cleanShareText()` keeps Devanagari, Arabic, Japanese, accented Latin, ZWNJ and ZWJ (including an emoji family). Zero-width space, bidi override and the replacement character are still removed.
- PASS: the integrity check reports a posting currency that differs from its account, and non-finite amounts (`"nope"` and `Infinity`). It does not rewrite those postings.
- PASS: detailed PDF HTML is A4 landscape and summary PDF HTML is A4 portrait. Print CSS asks the browser not to split a table row.
- PASS: Give & Take remains separate from formal lending.
- Automated coverage: `node regression.mjs` and `node --check` on `regression.mjs` and `sw.js`.
- Not run: a real browser print preview, a device screen, and a personal encrypted vault.


## 2.10.0 — Design system (2026-11-22)
- PASS: Home still shows net worth, the wealth breakdown and quick actions.
- PASS: Activity still has search, account and type filters, and groups rows in a ledger.
- PASS: More still exposes backup, integrity check, wipe, theme and Forex visibility.
- PASS: Lending still exposes export. Give & Take does not show the lending export.
- PASS: wide-screen CSS bounds the app and centres sheets. Reduced motion and visible focus remain.
- PASS: `node regression.mjs` — ALL_REGRESSION_PASS.
- Not run: a visual pass in a real browser at phone, tablet and desktop widths. No personal vault was opened.


## 2.11.0 — Blue theme, PDF reports and forecast (2026-11-22)
- PASS: zero, positive and negative annual returns; quarterly SIP included and excluded; a six-month duration.
- PASS: complete PDF keeps INR and EUR apart, drops a future expense and a voided expense, and omits an account number and a UPI id.
- PASS: building the PDF and reading the SIP plan does not change stored records.
- PASS: accent colour in the source is blue, not teal. CSV export remains.
- PASS: `node regression.mjs` — ALL_REGRESSION_PASS.
- Not run: a real browser print of the PDF, phone/tablet/desktop layout, and a personal encrypted vault.


## 2.12.0 — Forecast schedule (2026-11-22)
- PASS: ₹2,00,000 plus ₹3,000 a month for 5 years is ₹3,80,000 at 0%, and matches the closed-form 12% annuity.
- PASS: two monthly SIPs, a quarterly SIP, SIP plus a top-up, a future start, a stored end date, stopped/paused/cancelled/completed, a revision, and a debit outside the horizon.
- PASS: scenarios share contributions. The donut sums to the projected value. Negative growth hides the donut. The SIP object is not rewritten. A euro SIP and a zero amount are excluded.
- PASS: `node --check` and `node regression.mjs` — ALL_REGRESSION_PASS.
- Not run: a visual check of the calculator on a phone, tablet or desktop, and no personal vault.


## 2.12.1 — Incomplete transactions (2026-11-22)
- PASS: an expense with no date and no postings, an income with no created time, and a one-sided transfer do not throw in Home, Activity or `txnRow`.
- PASS: the complete income is still counted. The broken expense is not counted as spending. Rendering does not add postings.
- PASS: `node regression.mjs` — ALL_REGRESSION_PASS.
- Not run: a phone or desktop visual pass, and no personal vault.


## 2.12.2 — Forex edit and schedule currency (2026-11-22)
- PASS: a USD wallet at 10 with a 40 expense being edited has 50 available. A different wallet stays at 10.
- PASS: a euro SIP and a euro salary on an INR account create no transaction and do not change the balance. A matching INR SIP still posts 100 and buys 10 units.
- PASS: `node regression.mjs` — ALL_REGRESSION_PASS.
- Not run: the confirm dialog in a browser, and no personal vault.


## 2.12.3 — Repeated calculations (2026-11-22)
- PASS: one-pass balances are 85 and -16, matching `balance()`, and a voided transaction is ignored.
- PASS: `netWorth().total` equals `netWorth().breakdown.total` and `wealthBreakdown().total`.
- PASS: `node regression.mjs` — ALL_REGRESSION_PASS.
- Not run: a timing measurement on a phone. The change removes repeated work; it does not change a formula.


## 2.12.4 — Schedule reliability (2026-11-22)
- PASS: month-end, 29th, 30th and leap-year advances keep the original day rule. Weekly salary still moves by days.
- PASS: a forecast walk of 31 January 2024 does not write `scheduleAnchor`. A SIP or salary that is not due is not rewritten.
- PASS: a SIP with no next date is excluded. One prepared SIP schedule is shared by the 0% and 10% scenarios.
- PASS: the integrity check reports the new invalid-record warnings and does not change the vault JSON.
- PASS: `node --check` and `node regression.mjs` — ALL_REGRESSION_PASS, including `PASS render-caches` and `PASS schedule-and-integrity`.
- Not run: the month-by-month toggle in a browser, and no personal vault. A schedule that already drifted without an anchor keeps its current day.


## 2.12.5 — PDF preview, scope and layout (2026-11-22)
- PASS: lending summary stays A4 portrait and the detailed statement stays A4 landscape. Totals still add unrounded balances per currency, then format once. A future repayment stays out. An early repayment keeps its original date.
- PASS: the complete report still separates INR and EUR, drops future and voided rows, and omits an account number, a UPI id and internal ids.
- PASS: 60 transaction rows produce multiple pages and a repeated table header. Contents links target the transaction section. Summary mode drops individual notes. A date range drops an older row. A category filter keeps only that category.
- PASS: an account balance as of an earlier date ignores later postings. A long name is kept and `<` is escaped. An empty contacts report returns no document. A second export does not keep text from a filter that was not used.
- PASS: `node --check` on `sw.js` and `regression.mjs`, and `node regression.mjs` — ALL_REGRESSION_PASS, including `PASS pdf-preview-and-scope`.
- Not run: the preview on a phone, tablet or desktop, and no print-to-PDF from a real browser. No personal vault was opened. PDF bookmark outlines are not produced by the print dialog.

## 2.12.6 — Direct PDF, first-page content and lending summary (2026-11-22)
- PASS: a lending summary is one document, A4 portrait, with outstanding principal, interest and total, an individual loan list, and each principal repayment once. A single loan and a money-lent filter stay inside that selection. An early repayment keeps its explanation. A future repayment stays out.
- PASS: the detailed lending statement stays A4 landscape, with the transaction history and closing balances. `tr{break-inside:avoid;page-break-inside:avoid}` remains.
- PASS: 60 transaction rows stay in one table. Print CSS repeats the header. The title and contents come before the table. There is no `page-break-after:always` cover.
- PASS: a short accounts report is one article. Summary mode, date range, category filter, as-of balance, escaping and empty contacts behave as before.
- PASS: module PDF buttons call `exportReportPdf` directly. Only `data-pdf="all"` opens the options screen first. The preview still has fit width, customize, and Print / Save PDF.
- PASS: `node --check` on the app script, `sw.js` and `regression.mjs`, and `node regression.mjs` — ALL_REGRESSION_PASS.
- Not run in a browser: measured preview page breaks, and Save as PDF from the print dialog. No personal vault was opened. A saved PDF still has no bookmark outline. A repeated printed table header can shift one row relative to the preview.



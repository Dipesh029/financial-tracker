/**
 * Exercises production functions from index.html.
 * Run from this folder: node regression.mjs
 * Needs the linkedom package (installed automatically is not required if
 * node_modules/linkedom or /tmp/ft-test/node_modules/linkedom is present).
 */
import fs from "fs";
import vm from "vm";
import path from "path";
import { pathToFileURL } from "url";

function assert(cond, msg){
  if(!cond) throw new Error(msg || "assert failed");
}
function near(a, b, msg){
  if(!(Math.abs(a-b) < 1e-6)) throw new Error((msg||"near")+" got "+a+" expected "+b);
}

let parseHTML;
const candidates = [
  "linkedom",
  pathToFileURL("/tmp/ft-test/node_modules/linkedom/esm/index.js").href
];
let lastErr;
for(const spec of candidates){
  try{ ({parseHTML} = await import(spec)); break; }
  catch(e){ lastErr=e; }
}
if(!parseHTML) throw new Error("linkedom is required to load the app for tests: "+(lastErr&&lastErr.message));

const {window, document} = parseHTML("<!doctype html><html><head></head><body><main id=\"app\"></main><nav id=\"nav\"></nav><div id=\"layer\"></div></body></html>");
function makeStorage(){
  const data = new Map();
  const api = {
    getItem(k){ return data.has(k) ? data.get(k) : null; },
    setItem(k, v){
      if(api.failSet){
        const e = new Error("quota");
        e.name = "QuotaExceededError";
        throw e;
      }
      data.set(k, String(v));
    },
    removeItem(k){ data.delete(k); },
    _data: data
  };
  return api;
}
const storage = makeStorage();
window.matchMedia = () => ({matches:false, addEventListener(){}, removeEventListener(){}, addListener(){}});
window.isSecureContext = true;
window.alert = (m) => { window.__alerts.push(String(m)); };
window.confirm = () => true;
window.prompt = () => null;
window.__alerts = [];
const nav = window.navigator || {};
nav.clipboard = null;
try{ Object.defineProperty(window, "navigator", {value: nav, configurable:true}); }catch(e){}
globalThis.window = window;
globalThis.document = document;
globalThis.localStorage = storage;
globalThis.alert = window.alert;
globalThis.confirm = window.confirm;
globalThis.prompt = window.prompt;
try { Object.defineProperty(globalThis, "location", {value:{protocol:"file:"}, configurable:true}); } catch(e) {}
globalThis.__MF_TEST = true;
window.localStorage = storage;
window.document = document;

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const src = blocks.sort((a,b)=>b.length-a.length)[0];
vm.runInThisContext(src, {filename:"index.html"});
const mf = globalThis.__mf;
assert(mf && mf.parseAmt, "production exports missing");

// ---------- amounts ----------
{
  const cases = [
    ["1,00,000", 100000],
    ["₹1,00,000.50", 100000.5],
    ["1,000", 1000],
    ["1,00", 100],
    ["12,00", 1200],
    ["10,50", 10.5],
    ["10,5", 10.5],
    ["1.234,56", 1234.56],
    ["1,234.56", 1234.56],
    ["-20", -20],
    ["(20)", -20],
    ["", 0],
    ["100000", 100000]
  ];
  for(const [raw, exp] of cases){
    const got = mf.parseAmt(raw);
    assert(got !== null && Math.abs(got-exp) < 1e-9, "parseAmt "+JSON.stringify(raw)+" got "+got);
  }
  for(const bad of ["abc", "1.2.3", "1,2,3", "1,,000", "12.3456789", "-", "1,"]){
    assert(mf.parseAmt(bad) === null, "expected reject "+JSON.stringify(bad));
  }
  const money = mf.readAmt("10.999", {required:true, positive:true, maxDecimals:2});
  assert(!money.ok, "too many money decimals");
  const neg = mf.readAmt("-5", {required:true, positive:true, maxDecimals:2});
  assert(!neg.ok, "negative money rejected");
  const ok = mf.readAmt("1,00,000.50", {required:true, positive:true, maxDecimals:2});
  assert(ok.ok && ok.value === 100000.5, "indian money ok");
  console.log("PASS amounts");
}

// ---------- calendar days, including a US spring-forward gap ----------
{
  assert(mf.calendarDays("2026-03-07", "2026-03-09") === 2, "two calendar days across DST start");
  assert(mf.calendarDays("2026-03-09", "2026-03-07") === -2, "signed calendar days");
  assert(mf.addM("2016-04-28", 120) === "2026-04-28", "ten years by months");
  assert(mf.addM("2026-01-31", 1) === "2026-02-28", "month clamp");
  console.log("PASS calendar");
}

async function bootVault(){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await mf.deriveKey("correct horse battery", salt, 600000);
  mf.setCrypto(key, salt, 600000);
  mf.setS(mf.blank());
  mf.migrate();
  const ok = await mf.save();
  assert(ok === true, "initial save persists");
  assert(storage.getItem("myfinance.v1"), "vault key written");
  return mf.getS();
}

// ---------- persistence ----------
{
  const S = await bootVault();
  S.accounts.push({id:"a", name:"Bank", type:"bank", owner:"Me", cur:"INR", opening:10, archived:false});
  storage.failSet = true;
  const ok = await mf.save();
  assert(ok === false, "failed storage must not report success");
  const disk = storage.getItem("myfinance.v1");
  storage.failSet = false;
  const env = JSON.parse(disk);
  const diskData = await mf.unseal(env, mf.getCK());
  assert(diskData.accounts.length === 0, "failed save must leave the previous vault on disk");
  assert(mf.getS().accounts.length === 1, "in-session edit is kept for retry");
  const retry = await mf.save();
  assert(retry === true, "retry persists");
  const again = await mf.unseal(JSON.parse(storage.getItem("myfinance.v1")), mf.getCK());
  assert(again.accounts.length === 1, "retry wrote the account");
  console.log("PASS persistence");
}

// ---------- schedules ----------
{
  const S = mf.getS();
  S.txns = [];
  S.sips = [];
  S.salaries = [];
  S.holdings = [{id:"h", name:"Fund", type:"fund", owner:"Me", cur:"INR", price:0}];
  S.accounts = [{id:"a", name:"Bank", type:"bank", owner:"Me", cur:"INR", opening:0, archived:false}];
  const yday = mf.addDays(mf.today(), -1);
  S.sips.push({id:"sip1", hold:"h", acct:"a", amt:1000, cur:"INR", freq:1, next:yday, status:"active", history:[]});
  let auto = mf.processDueAutomations();
  assert(auto.skipped >= 1 && S.sips[0].next === yday, "SIP without a price stays due");
  S.holdings[0].price = 50;
  S.holdings[0].priceAsOf = mf.today();
  auto = mf.processDueAutomations();
  assert(auto.sips === 1, "SIP posts once a price exists");
  assert(S.txns.filter(t => t.sip==="sip1" && t.status==="posted").length === 1, "one SIP txn");
  const postedDate = S.sips[0].history.find(h => h.status==="paid").date;
  S.sips[0].next = postedDate;
  auto = mf.processDueAutomations();
  assert(S.txns.filter(t => t.sip==="sip1" && t.status==="posted").length === 1, "duplicate SIP date is not posted twice");
  S.sips[0].status = "stopped";
  S.sips[0].next = yday;
  const before = S.txns.length;
  auto = mf.processDueAutomations();
  assert(S.txns.length === before && S.sips[0].next === yday, "paused SIP is not posted");

  S.accounts[0].archived = true;
  S.sips[0].status = "active";
  S.sips[0].next = yday;
  S.sips[0].history = [];
  auto = mf.processDueAutomations();
  assert(S.sips[0].history.some(h => h.status==="missed"), "missing account is recorded as missed");
  assert(S.sips[0].next !== yday, "missed SIP moves forward");

  S.accounts[0].archived = false;
  const d0 = mf.addM(mf.today(), -2);
  const effect = mf.addM(d0, 1);
  S.salaries = [{
    id:"sal1", person:"Me", label:"Salary", acct:"a", amt:200, cur:"INR",
    freq:1, freqUnit:"week", next:d0, status:"active", history:[],
    revisions:[{date:effect, prev:{amt:100, freq:1, freqUnit:"month", acct:"a", next:d0}}]
  }];
  auto = mf.processDueAutomations();
  const pays = S.txns.filter(t => t.salaryId==="sal1" && t.status==="posted");
  assert(pays.length >= 2, "overdue salary dates are caught up");
  assert(pays[0].postings[0].amt === 100, "date before the revision uses the old amount");
  assert(pays[0].date === d0, "first salary date is the overdue date");
  const second = pays.find(t => t.date === effect);
  assert(second && second.postings[0].amt === 200, "revision date uses the new amount");
  assert(mf.calendarDays(effect, pays.find(t => t.date > effect).date) === 7, "weekly frequency applies after the revision");
  const n = pays.length;
  mf.processDueAutomations();
  assert(S.txns.filter(t => t.salaryId==="sal1" && t.status==="posted").length === n, "salary dates are not duplicated");
  S.salaries[0].status = "stopped";
  S.salaries[0].next = yday;
  const n2 = S.txns.length;
  mf.processDueAutomations();
  assert(S.txns.length === n2, "paused salary is not posted");
  console.log("PASS schedules");
}

// ---------- lending ----------
{
  const S = mf.getS();
  S.txns = [];
  S.lending = [{id:"L", person:"Sam", direction:"lent", principal:36525, rate:10, cur:"INR", start:"2026-03-07", account:"a", interestAdjustments:[]}];
  S.txns.push({id:"p1", status:"posted", type:"lendback", loanId:"L", date:"2026-03-08", created:"2026-03-08T00:00:00.000Z", principalReduction:10000, postings:[{acct:"a", amt:10000, cur:"INR"}]});
  S.txns.push({id:"p0", status:"posted", type:"lendback", loanId:"L", date:"2026-03-09", created:"2026-03-09T00:00:00.000Z", principalReduction:40000, postings:[{acct:"a", amt:40000, cur:"INR"}]});
  let pos = mf.lendingPosition(S.lending[0]);
  near(pos.principalLeft, 0, "principal cleared including overpay");
  const stepped = 36525*0.10*1/365.25 + 26525*0.10*1/365.25;
  near(pos.accrued, stepped, "accrual follows calendar intervals, not a DST-shortened span");
  near(pos.interestLeft, 0, "principal overpay is applied to interest");
  assert(pos.status === "Fully Settled", pos.status);
  // fresh loan, one full repayment on the DST boundary, no further accrual
  S.txns = [{id:"full", status:"posted", type:"lendback", loanId:"L2", date:"2026-03-09", created:"1", principalReduction:36525, postings:[{acct:"a", amt:36525, cur:"INR"}]}];
  S.lending = [{id:"L2", person:"Sam", direction:"lent", principal:36525, rate:10, cur:"INR", start:"2026-03-07", account:"a", interestAdjustments:[]}];
  pos = mf.lendingPosition(S.lending[0]);
  near(pos.accrued, 20, "full repayment accrues exactly two calendar days");
  near(pos.principalLeft, 0, "principal zero");
  near(pos.interestLeft, 20, "interest remains after principal is cleared");
  assert(pos.status === "Principal Repaid · Interest Pending", pos.status);
  S.lending[0].interestAdjustments.push({id:"w", date:"2026-03-09", amount:-20});
  pos = mf.lendingPosition(S.lending[0]);
  near(pos.interestLeft, 0, "waiver clears remaining interest");
  assert(pos.status === "Fully Settled", pos.status);
  console.log("PASS lending");
}

// ---------- insurance ----------
{
  const p = {start:"2016-04-28", premium:1000, ppt:10, freq:12, payments:[], paidThrough:"", status:"active", finalPremiumPaid:false};
  const dates = mf.policyScheduleDates(p);
  assert(dates.length === 10, "10 annual premiums in a 10 year PPT");
  assert(dates[0] === "2016-04-28" && dates[9] === "2025-04-28", "first and last premium");
  assert(mf.policyPptEnd(p) === "2026-04-28", "PPT end is the anniversary, not an extra premium");
  assert(!dates.includes("2026-04-28"));
  p.paidThrough = "2018-04-28";
  let info = mf.policyPremiumsPaidToDate(p);
  assert(info.count === 3 && info.total === 3000, "historical paid-through");
  assert(mf.policyNextUnpaidDue(p) === "2019-04-28");
  p.payments.push({id:"r1", date:"2020-04-28", amount:1000});
  info = mf.policyPremiumsPaidToDate(p);
  assert(info.count === 4, "late payment covers the oldest unpaid instalment, not a later one");
  assert(mf.policyNextUnpaidDue(p) === "2020-04-28");
  p.payments.push({id:"dup", date:"2018-04-28", amount:1000});
  info = mf.policyPremiumsPaidToDate(p);
  assert(info.count === 4, "a receipt inside paid-through does not create another instalment");
  p.payments.push({id:"dup2", date:"2018-04-28", amount:1000});
  info = mf.policyPremiumsPaidToDate(p);
  assert(info.count === 4 && info.unmatched === 1, "a second receipt for the same historical instalment is not applied again");
  p.payments.push({id:"r2", date:"2020-04-01", amount:1000});
  assert(mf.policyNextUnpaidDue(p) === "2021-04-28", "early payment covers the next open instalment");
  console.log("PASS insurance");
}

// ---------- net worth ----------
{
  const S = mf.getS();
  S.display = "INR";
  S.rate = 100;
  S.nwPrefs = {insuranceCoverage:false, insuranceCash:true, loansReceivable:true, accruedInterest:true};
  S.accounts = [
    {id:"b", name:"Bank", type:"bank", owner:"Me", cur:"INR", opening:1000, archived:false},
    {id:"od", name:"OD", type:"bank", owner:"Me", cur:"INR", opening:-50, archived:false},
    {id:"eu", name:"EUR", type:"bank", owner:"Father", cur:"EUR", opening:10, archived:false},
    {id:"c", name:"Card", type:"card", owner:"Me", cur:"INR", opening:-200, archived:false}
  ];
  S.holdings = [{id:"h", name:"Stock", type:"stock", owner:"Me", cur:"INR", price:5, priceAsOf:"2020-01-01"}];
  S.txns = [{id:"op", status:"posted", type:"open", hold:"h", units:2, cost:8, postings:[]}];
  S.policies = [{owner:"Me", sum:1000000, premium:0, cur:"INR", fundValue:300, payments:[]}];
  S.lending = [];
  S.people = ["Me", "Father"];
  const fam = mf.wealthBreakdown(null);
  const me = mf.wealthBreakdown("Me");
  const father = mf.wealthBreakdown("Father");
  near(fam.bank, 2000, "INR bank plus converted EUR");
  near(fam.overdraft, 50, "negative bank is a liability");
  near(fam.cardLiab, 200, "card debt");
  near(fam.holdings, 10, "units times price");
  near(fam.insuranceCash, 300, "surrender value is an asset");
  assert(fam.insuranceCoverage === 1000000, "cover is reported separately");
  near(fam.total, fam.assets-fam.liabilities, "breakdown balances");
  near(mf.netWorth(null).total, fam.total, "net worth matches breakdown");
  near(mf.netWorth(null).adjusted, fam.total, "cover stays out until the preference is on");
  near(me.total + father.total, fam.total, "family total equals the members");
  const notes = mf.valuationNotes(null);
  assert(notes.old === 1, "old price is flagged");
  S.nwPrefs.insuranceCoverage = true;
  assert(mf.netWorth(null).adjusted === mf.netWorth(null).total + 1000000, "adjusted view adds cover only there");
  console.log("PASS networth");
}

// ---------- backup ----------
{
  const S = mf.getS();
  S.accounts = [{id:"keep", name:"Keep", type:"bank", owner:"Me", cur:"INR", opening:5, archived:false}];
  S.txns = [];
  assert(await mf.save() === true, "baseline backup save");
  const good = await mf.seal(mf.getS());
  const wrong = await mf.openBackupPayload(good, "not the passphrase");
  assert(!wrong.ok, "wrong passphrase rejected");
  assert(mf.getS().accounts[0].id === "keep", "wrong passphrase does not touch the open vault");
  const damaged = await mf.openBackupPayload(good.slice(0, 40), "correct horse battery");
  assert(!damaged.ok, "truncated backup rejected");
  const older = JSON.parse(good);
  older.iterations = 250000;
  const oldKey = await mf.deriveKey("correct horse battery", mf.unb64 ? null : new Uint8Array(16), 250000);
  // Re-seal at the older iteration with the production derive/seal by temporarily switching the key.
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key250 = await mf.deriveKey("older backup passphrase", salt, 250000);
  const snapshot = JSON.parse(JSON.stringify(mf.getS()));
  snapshot.accounts[0].name = "From old backup";
  const oldEnv = await mf.seal(snapshot, key250, salt, 250000, null);
  const opened = await mf.openBackupPayload(oldEnv, "older backup passphrase");
  assert(opened.ok && opened.data.accounts[0].name === "From old backup", "older iteration opens");
  const badOpen = await mf.openBackupPayload(oldEnv, "correct horse battery");
  assert(!badOpen.ok, "other passphrase does not open an older backup");
  storage.failSet = true;
  const rolled = await mf.commitRestore(opened);
  assert(!rolled.ok, "restore that cannot be stored fails");
  assert(mf.getS().accounts[0].name === "Keep", "failed restore puts the previous vault back");
  storage.failSet = false;
  const applied = await mf.commitRestore(opened);
  assert(applied.ok, "restore persists");
  assert(mf.getS().accounts[0].name === "From old backup");
  const disk = await mf.unseal(JSON.parse(storage.getItem("myfinance.v1")), mf.getCK());
  assert(disk.accounts[0].name === "From old backup", "restored vault is what is stored");
  const junk = await mf.openBackupPayload("{", "");
  assert(!junk.ok);
  console.log("PASS backup");
}

// ---------- holdings matcher still used by import ----------
{
  const row = mf.buildHoldPlanRow(
    [{owner:"Me", isin:"INE1", exchange:"NSE", symbol:"FOO"}, {owner:"Me", isin:"INE1", exchange:"NSE", symbol:"FOO2"}],
    {isin:"INE1", exch:"NSE", sym:"FOO", qty:1, avg:1, prev:1},
    "Me"
  );
  assert(row.kind === "ambiguous", "ambiguous import is not silently merged");
  console.log("PASS import-match");
}

assert(mf.calendarDays("2026-10-24", "2026-10-26") === 2, "two calendar days across DST end");
console.log("PASS calendar-dst-end");

{
  assert(mf.parseAmt("1.000.000") === 1000000, "grouped dots");
  assert(mf.parseAmt("1.2.3") === null, "malformed dots");
  assert(Math.abs(mf.parseAmt("€1.234,56") - 1234.56) < 1e-9, "euro format");
  const eu = mf.readAmt("1.000", {required:true, positive:true, maxDecimals:2});
  assert(eu.ok && eu.value === 1000, "money 1.000 is one thousand");
  const units = mf.readAmt("12.345", {required:true, positive:true, maxDecimals:6});
  assert(units.ok && Math.abs(units.value - 12.345) < 1e-9, "units keep three decimals");
  const asMoney = mf.readAmt("12.345", {required:true, positive:true, maxDecimals:2});
  assert(!asMoney.ok, "three non-zero decimals are not silently regrouped");
  assert(mf.readAmt("12.000", {required:true, positive:true, maxDecimals:2}).value===12000, "12.000 is twelve thousand");
  assert(!mf.readAmt("12.3456", {required:true, positive:true, maxDecimals:2}).ok, "four decimals rejected");
  assert(!mf.readAmt("-5", {required:true, positive:true, maxDecimals:2}).ok, "negative rejected");
  assert(mf.readAmt("", {required:false, allowNegative:false, maxDecimals:2}).value === 0, "empty optional is zero");
  assert(!mf.readAmt("1,,000", {required:true, positive:true, maxDecimals:2}).ok, "double comma rejected");
  console.log("PASS amount-edges");
}

{
  const S = mf.getS();
  S.txns = [];
  S.holdings = [{id:"h", name:"Fund", type:"fund", owner:"Me", cur:"INR", price:10, priceAsOf:mf.today()}];
  S.accounts = [{id:"a", name:"Bank", type:"bank", owner:"Me", cur:"INR", opening:0, archived:false}];
  const d0 = mf.addM(mf.today(), -3);
  const effect = mf.addM(d0, 1);
  S.autoSip = true;
  S.sips = [{id:"sipF", hold:"h", acct:"a", amt:300, cur:"INR", freq:3, next:d0, status:"active", history:[], revisions:[{date:effect, prev:{amt:100, freq:1, acct:"a", next:d0}}]}];
  mf.processDueAutomations();
  const pays = S.txns.filter(t => t.sip==="sipF" && t.status==="posted");
  assert(pays[0] && pays[0].date===d0 && pays[0].postings[0].amt===-100, "SIP before the revision uses the old amount");
  const second = pays.find(t => t.date===effect);
  assert(second && second.postings[0].amt===-300, "SIP on the revision date uses the new amount");
  assert(S.sips[0].next===mf.addM(effect, 3), "quarterly step applies after the frequency change");
  const n = pays.length;
  mf.processDueAutomations();
  assert(S.txns.filter(t => t.sip==="sipF" && t.status==="posted").length===n, "changed SIP is not posted twice");
  S.sips[0].status = "stopped";
  S.sips[0].next = mf.addDays(mf.today(), -2);
  const paused = S.txns.length;
  const pausedAuto = mf.processDueAutomations();
  assert(S.txns.length===paused && pausedAuto.sipBacklog===0, "paused SIP is not caught up");
  S.sips[0].status = "active";
  S.sips[0].revisions = [];
  S.sips[0].freq = 1;
  S.sips[0].amt = 10;
  S.sips[0].next = mf.addM(mf.today(), -40);
  S.txns = S.txns.filter(t => t.sip!=="sipF");
  const backlog = mf.processDueAutomations();
  assert(backlog.sipBacklog>=1, "SIP catch-up reports dates still overdue");
  assert(mf.calendarDays(mf.today(), S.sips[0].next)<=0, "the leftover SIP date is still in the past");
  console.log("PASS sip-frequency");
}

{
  const S = mf.getS();
  const future = mf.addDays(mf.today(), 40);
  S.txns = [{id:"fut", status:"posted", type:"lendback", loanId:"LF", date:future, created:"9", principalReduction:100, postings:[{acct:"a", amt:100, cur:"INR"}]}];
  S.lending = [{id:"LF", person:"Sam", direction:"lent", principal:36525, rate:10, cur:"INR", start:"2024-01-01", account:"a", interestAdjustments:[]}];
  const pos = mf.lendingPosition(S.lending[0]);
  const expectAcc = 36525*0.10*mf.calendarDays("2024-01-01", mf.today())/365.25;
  near(pos.accrued, expectAcc, "a future-dated repayment does not accrue past today");
  S.txns = [
    {id:"later", status:"posted", type:"lendback", loanId:"LO", date:"2026-03-09", created:"2", principalReduction:100, postings:[{acct:"a", amt:100, cur:"INR"}]},
    {id:"earlier", status:"posted", type:"lendback", loanId:"LO", date:"2026-03-08", created:"1", principalReduction:100, postings:[{acct:"a", amt:100, cur:"INR"}]}
  ];
  S.lending = [{id:"LO", person:"Sam", direction:"lent", principal:1000, rate:10, cur:"INR", start:"2026-03-07", account:"a", interestAdjustments:[]}];
  const ordered = mf.lendingPosition(S.lending[0]);
  const stepped = 1000*0.10/365.25 + 900*0.10/365.25 + 800*0.10*mf.calendarDays("2026-03-09", mf.today())/365.25;
  near(ordered.accrued, stepped, "out-of-order repayments use calendar order");
  near(ordered.principalLeft, 800, "both principal payments count");
  console.log("PASS lending-edges");
}

{
  const base = {start:"2016-04-28", premium:1000, ppt:10, freq:12, payments:[], paidThrough:"", status:"active", finalPremiumPaid:false};
  const matured = Object.assign({}, base, {maturity:"2020-04-28", term:20});
  const md = mf.policyScheduleDates(matured);
  assert(md.length===4 && md[3]==="2019-04-28" && !md.includes("2020-04-28"), "no premium on or after maturity");
  const shortTerm = Object.assign({}, base, {term:5});
  const td = mf.policyScheduleDates(shortTerm);
  assert(td.length===5 && td[4]==="2020-04-28" && !td.includes("2021-04-28"), "policy term caps the schedule");
  matured.paidThrough = "2017-04-28";
  matured.paidThroughPremium = 1000;
  let info = mf.policyPremiumsPaidToDate(matured);
  assert(info.count===2 && info.remainingCount===2, "remaining instalments after paid-through and maturity");
  assert(mf.policyNextUnpaidDue(matured)==="2018-04-28");
  matured.premium = 2000;
  info = mf.policyPremiumsPaidToDate(matured);
  assert(info.total===2000, "historical paid-through keeps the snapshotted premium");
  assert(info.remaining===4000, "unpaid instalments use the current premium");
  console.log("PASS insurance-edges");
}

{
  const S = mf.getS();
  S.display = "INR";
  S.rate = 90;
  S.people = ["Me", "Father"];
  S.nwPrefs = {insuranceCoverage:false, insuranceCash:true, loansReceivable:true, accruedInterest:true};
  S.accounts = [
    {id:"b", name:"Bank", type:"bank", owner:"Me", cur:"INR", opening:100, archived:false},
    {id:"loose", name:"Cash", type:"cash", cur:"INR", opening:40, archived:false},
    {id:"od", name:"OD", type:"bank", owner:"Father", cur:"EUR", opening:-2, archived:false}
  ];
  S.holdings = [{id:"hx", name:"Stock", type:"stock", cur:"INR", price:5, priceAsOf:"2020-01-01"}];
  S.txns = [{id:"opx", status:"posted", type:"open", hold:"hx", units:2, cost:8, postings:[]}];
  S.policies = [{owner:"Aunt", sum:500, premium:1, cur:"INR", fundValue:30, fundAsOf:"2020-01-01", payments:[], start:"2020-01-01"}];
  S.lending = [];
  S.sips = [];
  S.salaries = [];
  const fam = mf.wealthBreakdown(null);
  let sum = 0;
  for(const o of ["Me", "Father", "Aunt"]) sum += mf.wealthBreakdown(o).total;
  near(sum, fam.total, "every owner, including blank-owner defaults, adds up to the family total");
  near(mf.wealthBreakdown("Me").holdings, 10, "a holding with no owner is Me");
  near(mf.wealthBreakdown("Me").cash, 40, "cash with no owner is Me");
  near(mf.wealthBreakdown("Aunt").insuranceCash, 30, "surrender value stays on the policy owner");
  near(mf.netWorth("Aunt").total, 30, "sum assured is not actual net worth");
  assert(mf.netWorth(null).adjusted === fam.total, "cover stays out until the preference is on");
  const notes = mf.valuationNotes(null);
  assert(notes.old===1 && notes.insOld===1, "stale investment prices and insurance values are both flagged");
  near(fam.holdings, 10, "investments are not the insurance value");
  near(fam.insuranceCash, 30, "insurance value is its own total");
  near(fam.insuranceCoverage, 500, "cover is reported separately");
  console.log("PASS networth-edges");
}

{
  storage.failSet = true;
  const S = mf.getS();
  const before = S.accounts.length;
  S.accounts.push({id:"temp", name:"Temp", type:"bank", owner:"Me", cur:"INR", opening:1, archived:false});
  const ok = await mf.save();
  assert(ok===false, "second failed save is not success");
  const session = await mf.unseal(JSON.parse(mf.store.get()), mf.getCK());
  assert(session.accounts.some(a => a.id==="temp"), "unsaved edit remains readable in this session");
  storage.failSet = false;
  S.accounts = S.accounts.filter(a => a.id!=="temp");
  assert(await mf.save()===true, "removing the unsaved edit can be stored");
  console.log("PASS session-fallback");
}

{
  const records = new Map();
  function request(result){
    const r = {result, error:null, onsuccess:null, onerror:null};
    queueMicrotask(()=>{ if(r.onsuccess) r.onsuccess(); });
    return r;
  }
  function makeStore(){
    return {
      get(k){ return request(records.has(k)?records.get(k):undefined); },
      put(v,k){ records.set(k,v); return request(undefined); },
      delete(k){ records.delete(k); return request(undefined); }
    };
  }
  const db = {
    objectStoreNames:{ contains(){ return true; } },
    transaction(){
      const tx = { objectStore(){ return makeStore(); }, oncomplete:null, onerror:null, onabort:null, error:null };
      queueMicrotask(()=>{ if(tx.oncomplete) tx.oncomplete(); });
      return tx;
    },
    close(){}
  };
  globalThis.indexedDB = { open(){ const r=request(db); return r; } };
  await mf.forgetBackupFolder();
  assert(!records.has("directory"), "forget removes the saved folder handle");
  console.log("PASS backup-folder");
}

{
  const S = mf.getS();
  S.display = "INR";
  S.rate = 90;
  S.people = ["Me", "Father"];
  S.nwPrefs = {insuranceCoverage:false, insuranceCash:true, loansReceivable:true, accruedInterest:true};
  S.txns = [];
  S.holdings = [];
  S.policies = [];
  S.lending = [];
  S.sips = [];
  S.salaries = [];
  S.lastAcct = "card1";
  S.onboardingDone = true;
  S.accounts = [
    {id:"dem", name:"Zerodha", type:"demat", owner:"Me", cur:"INR", opening:0, invested:100000, manualValue:125000, valuationMode:"manual", archived:false},
    {id:"bank1", name:"HDFC", type:"bank", owner:"Me", cur:"INR", opening:500, archived:false},
    {id:"cash1", name:"Wallet", type:"cash", owner:"Me", cur:"INR", opening:40, archived:false},
    {id:"card1", name:"Axis", type:"card", owner:"Me", cur:"INR", opening:-20, archived:false}
  ];
  const groups = mf.paymentAccounts("out").map(g => g.key);
  assert(groups.join(",") === "bank,card,cash", "pay-from groups are bank, card, then cash");
  const ids = mf.paymentAccounts("out").flatMap(g => g.accounts.map(a => a.id));
  assert(!ids.includes("dem"), "demat is excluded from payment sources");
  assert(ids.includes("bank1") && ids.includes("cash1") && ids.includes("card1"), "bank, cash, and card stay available");
  const incoming = mf.paymentAccounts("in").flatMap(g => g.accounts.map(a => a.id));
  assert(!incoming.includes("card1") && !incoming.includes("dem") && incoming.includes("bank1"), "income accounts are bank and cash only");
  assert(mf.payAccountAllowed(S.accounts[0], "out") === false, "demat cannot pay");
  assert(mf.payAccountAllowed(S.accounts[1], "out") === true, "bank can pay");
  const html = mf.paySelectHtml("from", "bank1", "out");
  assert(html.includes("Bank accounts") && html.includes("Credit / debit cards") && html.includes("Cash accounts"), "picker shows the three section headings");
  assert(!html.includes("Zerodha"), "picker does not list the demat account");
  assert(html.includes('value="bank1"') && html.includes("pay-opt on"), "the selected account is marked");
  const pos = mf.dematPosition(S.accounts[0]);
  assert(pos.mode === "manual" && pos.estimated === false, "explicit manual value is not an estimate");
  near(pos.invested, 100000, "invested stays the recorded cost");
  near(pos.value, 125000, "manual current value");
  near(pos.pl, 25000, "profit is value minus invested");
  const wb = mf.wealthBreakdown(null);
  near(wb.demat, 125000, "manual demat value is in net worth once");
  near(wb.holdings, 0, "no holdings are invented for a manual value");
  near(wb.bank, 500, "bank cash is unchanged");
  near(wb.total, 500 + 40 - 20 + 125000, "net worth is cash plus one demat value");
  const beforeTxn = S.txns.length;
  const beforeHold = S.holdings.length;
  S.accounts[0].manualValue = 130000;
  const after = mf.dematPosition(S.accounts[0]);
  near(after.value, 130000, "updating the value changes only the current value");
  near(after.invested, 100000, "updating the value does not change invested");
  assert(S.txns.length === beforeTxn && S.holdings.length === beforeHold, "updating the value creates no transaction or holding");
  S.accounts[0].manualValue = null;
  S.accounts[0].manualCleared = true;
  const est = mf.dematPosition(S.accounts[0]);
  assert(est.estimated === true && est.value === 100000, "missing manual value uses invested and is marked as an estimate");
  S.holdings = [{id:"h1", name:"Reliance", type:"stock", owner:"Me", cur:"INR", price:50, demat:"Zerodha", priceAsOf:"2020-01-01"}];
  S.txns = [{id:"op", status:"posted", type:"open", date:"2020-01-01", hold:"h1", units:10, cost:400, postings:[]}];
  S.accounts[0].valuationMode = "manual";
  S.accounts[0].manualValue = 125000;
  S.accounts[0].manualCleared = false;
  const manualLinked = mf.wealthBreakdown(null);
  near(manualLinked.demat, 125000, "manual value is used");
  near(manualLinked.holdings, 0, "a linked holding is not added on top of the manual value");
  assert(S.holdings.length === 1 && S.holdings[0].id === "h1", "switching methods does not delete the holding");
  S.accounts[0].valuationMode = "holdings";
  const viaHold = mf.wealthBreakdown(null);
  near(viaHold.holdings, 500, "holdings mode uses the holding market value");
  near(viaHold.demat, 0, "holdings mode does not also add the manual value");
  near(viaHold.total, 500 + 40 - 20 + 500, "family total uses the holding once");
  S.accounts[0].valuationMode = "holdings";
  S.holdings[0].demat = "";
  const external = mf.wealthBreakdown(null);
  near(external.holdings, 500, "unlinked holdings still count when the demat is in holdings mode");
  near(external.demat, 0, "the demat lump is not added on top of those holdings");
  S.accounts.push({id:"dad", name:"Dad demat", type:"demat", owner:"Father", cur:"INR", opening:0, invested:10, manualValue:15, valuationMode:"manual", archived:false});
  const fam = mf.wealthBreakdown(null);
  const me = mf.wealthBreakdown("Me");
  const father = mf.wealthBreakdown("Father");
  near(me.total + father.total, fam.total, "members still add up to the family total with demat values");
  near(father.demat, 15, "a manual demat stays with its owner");
  mf.setPlanSeg("lending");
  const lend = mf.viewPlan();
  const titleAt = lend.indexOf(">Lending<");
  const sortAt = lend.indexOf('data-sortopen="lending"');
  assert(titleAt > 0 && sortAt > titleAt, "lending title comes before the sort control");
  for(const seg of ["sips", "salaries", "cover"]){
    mf.setPlanSeg(seg);
    const page = mf.viewPlan();
    const h = page.indexOf("<h2");
    const s = page.indexOf("data-sortopen=");
    assert(h > 0 && s > h, seg + " title comes before its sort control");
  }
  const home = mf.viewHome();
  const familyAt = home.indexOf("Family view");
  const versionAt = home.indexOf("v" + "2.7.2");
  assert(familyAt > 0 && versionAt > familyAt && versionAt - familyAt < 400, "family view and version sit in the same header");
  assert(home.includes("Hide") || home.includes("Show"), "balance privacy control remains");
  assert(home.includes("actual net worth"), "net worth card remains");
  console.log("PASS pay-from-and-valuation");
}

console.log("ALL_REGRESSION_PASS");

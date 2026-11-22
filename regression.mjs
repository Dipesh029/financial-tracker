/**
 * Exercises production functions from index.html.
 * Run from this folder: node regression.mjs
 * Uses a minimal DOM shim because these checks exercise production logic and
 * HTML render strings, not browser layout or event dispatch.
 */
import fs from "fs";
import vm from "vm";
import { createHash } from "node:crypto";

function assert(cond, msg){
  if(!cond) throw new Error(msg || "assert failed");
}
function near(a, b, msg){
  if(!(Math.abs(a-b) < 1e-6)) throw new Error((msg||"near")+" got "+a+" expected "+b);
}

const historyCalls = {push:0, back:0};
const window = {
  matchMedia: () => ({matches:false}), navigator: {},
  history: {state:null, pushState(state){ historyCalls.push++; this.state=state; }, back(){ historyCalls.back++; }},
  addEventListener(type, fn){ (window.__listeners ||= {})[type]=fn; }
};
const testLayer = {innerHTML:""};
const document = {
  addEventListener(){},
  getElementById(){ return null; },
  querySelector(sel){ return sel==="#layer" ? testLayer : (sel==="#layer .sheet" && testLayer.innerHTML.includes('class="sheet"') ? {} : null); },
  createElement(){ return {setAttribute(){}, remove(){}, querySelector(){return null;}}; },
  body: { appendChild(){}, classList:{add(){},remove(){}} },
  documentElement: { setAttribute(){}, style:{} }
};
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
const rawSrc = blocks.sort((a,b)=>b.length-a.length)[0];
const bootAt = rawSrc.lastIndexOf("\nboot();");
assert(bootAt >= 0, "application boot call found");
const src = rawSrc.slice(0, bootAt); // Keep boot/UI event startup out of the logic harness.
vm.runInThisContext(src, {filename:"index.html"});
const mf = globalThis.__mf;
assert(mf && mf.parseAmt, "production exports missing");

// ---------- amounts ----------
{
  const cases = [
    ["1,00,000", 100000],
    ["₹1,00,000.50", 100000.5],
    ["1,000", 1000],
    ["1,00", 1],
    ["12,00", 12],
    ["100,00", 100],
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
  const goodEnvelope=JSON.parse(good);
  assert(mf.inspectEncryptedEnvelope(goodEnvelope).ok, "valid encrypted envelope metadata is accepted");
  assert(!mf.inspectEncryptedEnvelope({...goodEnvelope,iterations:999999999}).ok, "unbounded PBKDF2 iterations are rejected before derivation");
  assert(!mf.inspectEncryptedEnvelope({...goodEnvelope,salt:"AA=="}).ok, "undersized encryption salts are rejected");
  assert(!mf.inspectEncryptedEnvelope({...goodEnvelope,iv:"AA=="}).ok, "malformed AES-GCM IV is rejected");
  const hostileBackup=await mf.openBackupPayload(JSON.stringify({...goodEnvelope,iterations:999999999}),"correct horse battery");
  assert(!hostileBackup.ok && /iteration count/.test(hostileBackup.error), "hostile backup metadata is rejected without PBKDF2 work");
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
  assert(lend.includes('data-lendexport-open') && lend.includes("sort-export"), "Lending Export shares the compact sort toolbar");
  for(const section of ["contacts","demat","holdings","accounts","salaries","policies","sips"]){
    const pageSource=fs.readFileSync(new URL("./index.html",import.meta.url),"utf8");
    assert(pageSource.includes(`sortBarHtml("${section}"`), `${section} keeps its section-specific sort control`);
  }
  const home = mf.viewHome();
  const familyAt = home.indexOf("Family view");
  const versionAt = home.indexOf("v" + "2.12.0");
  assert(familyAt > 0 && versionAt > familyAt && versionAt - familyAt < 400, "family view and version sit in the same header");
  assert(home.includes("Hide") || home.includes("Show"), "balance privacy control remains");
  assert(home.includes("actual net worth"), "net worth card remains");
  console.log("PASS pay-from-and-valuation");
}

{
  const S = mf.getS();
  S.display = "INR";
  S.rate = 90;
  S.fx = {USD:84, GBP:106, SGD:63};
  S.people = ["Me", "Father"];
  S.txns = [];
  S.holdings = [];
  S.policies = [];
  S.lending = [];
  S.sips = [];
  S.salaries = [];
  S.onboardingDone = true;
  S.nwPrefs = {insuranceCoverage:false, insuranceCash:true, loansReceivable:true, accruedInterest:true};
  const pan = mf.maskCardLast4("4111111111114242");
  assert(pan.ok && pan.last4 === "4242", "full card number keeps only the last 4");
  assert(mf.maskCardLast4("123").ok === false, "a short card number is rejected");
  assert(mf.maskCardLast4("4242").last4 === "4242", "last 4 is accepted");
  assert(mf.collectForexWallets([{cur:"USD", balance:10},{cur:"usd", balance:5}]).ok === false, "the same currency cannot be added twice");
  assert(mf.collectForexWallets([{cur:"USD", balance:-1}]).ok === true, "negative forex balances are supported consistently with confirmed overspending");
  const wallets = mf.collectForexWallets([
    {cur:"USD", balance:100},
    {cur:"EUR", balance:40},
    {cur:"INR", balance:500}
  ]);
  assert(wallets.ok && wallets.wallets.length === 3, "three currency wallets");
  const card = {id:"fx1", type:"forex", name:"Niyo", owner:"Me", cur:"MULTI", opening:99999, accountNumber:"4111111111114242", archived:false, wallets:[], cardMeta:{}, bank:"Niyo"};
  const credit = {id:"card1", name:"Axis", type:"card", owner:"Me", cur:"INR", opening:-20, archived:false, cardMeta:{cardType:"Credit", last4:"1188"}};
  const bank = {id:"bank1", name:"HDFC", type:"bank", owner:"Me", cur:"INR", opening:500, archived:false};
  S.accounts = [card, credit, bank];
  mf.applyForexWallets(card, wallets.wallets);
  assert(card.opening === 0, "the old opening is not kept as a second forex balance");
  assert(card.wallets.every(w=>Number.isFinite(w.openingBalance)), "each Forex wallet stores an opening ledger baseline");
  assert(card.accountNumber === "", "the full card number is not stored");
  assert(card.cardMeta.cardType === "Forex", "card type is Forex");
  assert(!JSON.stringify(card).includes("4111111111114242"), "the PAN is not stored on the account");
  const firstUsd=card.wallets.find(w=>w.cur==="USD");
  S.txns.push({id:"wallet-history",type:"expense",status:"voided",forexAcct:card.id,walletId:firstUsd.id,amount:2,postings:[{acct:card.id,amt:-2,cur:"USD"}]});
  const removedWallet=mf.validateForexWalletChanges(card,card.wallets.filter(w=>w.id!==firstUsd.id));
  assert(!removedWallet.ok&&removedWallet.error.includes("cannot be removed"),"wallet with voided history cannot be removed");
  const changedCurrency=mf.validateForexWalletChanges(card,card.wallets.map(w=>w.id===firstUsd.id?{...w,cur:"JPY"}:w));
  assert(!changedCurrency.ok&&changedCurrency.error.includes("currency cannot be changed"),"wallet currency with historical references cannot be changed");
  assert(mf.validateForexWalletChanges(card,card.wallets.map(w=>w.id===firstUsd.id?{...w,cur:"USD",balance:-2}:w)).ok,"existing wallet can retain a negative balance");
  S.txns=[];
  const first = mf.wealthBreakdown(null);
  near(first.forex, 100*84 + 40*90 + 500, "each wallet converts on its own and the opening is ignored");
  near(first.cardLiab, 20, "the credit card is still money owed");
  near(first.bank, 500, "the bank balance is unchanged");
  near(first.total, 500 - 20 + 100*84 + 40*90 + 500, "forex is added to net worth once");
  const eur = card.wallets.find(w => w.cur === "EUR");
  const usd = card.wallets.find(w => w.cur === "USD");
  const inr = card.wallets.find(w => w.cur === "INR");
  mf.applyForexWallets(card, [
    {cur:"USD", balance:80, id:usd.id, asOf:usd.asOf},
    {cur:"EUR", balance:40, id:eur.id, asOf:eur.asOf},
    {cur:"INR", balance:500, id:inr.id, asOf:inr.asOf}
  ]);
  assert(card.wallets.find(w => w.cur === "EUR").balance === 40, "the euro wallet is unchanged");
  assert(card.wallets.find(w => w.cur === "INR").balance === 500, "the rupee wallet is unchanged");
  assert(card.wallets.find(w => w.cur === "USD").balance === 80, "only the dollar wallet changes");
  assert(S.txns.length === 0 && S.holdings.length === 0, "updating a wallet creates no transaction or holding");
  const moved = mf.wealthBreakdown(null);
  near(moved.forex, 80*84 + 40*90 + 500, "net worth follows the updated dollar balance only");
  assert(mf.payAccountAllowed(card, "out") === false, "a forex card is not a generic payment source");
  assert(mf.payAccountAllowed(card, "expense") === true, "a forex card is allowed in the dedicated expense flow");
  assert(mf.payAccountAllowed(credit, "out") === true, "a credit card can still be used to pay");
  const pay = mf.paySelectHtml("from", "bank1", "out");
  assert(!pay.includes("Niyo"), "generic pay-from does not list the forex card");
  assert(pay.includes("Axis"), "pay-from still lists the credit card");
  const expensePay = mf.paySelectHtml("from", "bank1", "expense");
  assert(expensePay.includes("Niyo") && expensePay.includes("Forex card"), "expense picker exposes Forex cards in their own group");
  const getUsd=()=>card.wallets.find(w=>w.cur==="USD");
  const walletBefore=getUsd().balance;
  const fxExpense={id:"fx-exp-1",type:"expense",status:"posted",forexAcct:card.id,walletId:getUsd().id,walletCur:"USD",amount:10,postings:[{acct:card.id,amt:-10,cur:"USD"}]};
  S.txns.push(fxExpense);
  assert(mf.forexTxnMovement(fxExpense,false)===true,"Forex expense movement applies");
  near(getUsd().balance,walletBefore-10,"Forex expense debits selected wallet");
  near(mf.forexWalletNetMovement(card.id,getUsd().id),-10,"wallet ledger tracks posted expense");
  const fxRefund={id:"fx-ref-1",type:"refund",status:"posted",forexAcct:card.id,walletId:getUsd().id,walletCur:"USD",amount:4,postings:[{acct:card.id,amt:4,cur:"USD"}]};
  S.txns.push(fxRefund);
  assert(mf.forexTxnMovement(fxRefund,false)===true,"Forex refund movement applies");
  near(getUsd().balance,walletBefore-6,"Forex refund credits the original wallet");
  near(mf.forexWalletNetMovement(card.id,getUsd().id),-6,"refund reduces net wallet outflow");
  near(mf.forexWalletLedgerBalance(card.id,getUsd().id),walletBefore-6,"wallet ledger baseline reconciles posted expenses and refunds");
  getUsd().balance+=1;
  assert(Math.abs(mf.forexWalletLedgerBalance(card.id,getUsd().id)-getUsd().balance)>0.02,"wallet ledger helper detects balance drift");
  getUsd().balance-=1;
  assert(mf.forexTxnMovement(fxExpense,true)===true,"void reverses Forex expense");
  near(getUsd().balance,walletBefore+4,"reversing an expense restores its debit");
  assert(mf.forexTxnMovement(fxRefund,true)===true,"void reverses Forex refund");
  near(getUsd().balance,walletBefore,"reversing refund restores prior wallet balance");
  S.txns=[];
  S.purchases=[{id:"purchase-linked",item:"Phone",amt:800,cur:"EUR",date:"2026-01-15",expiry:"2028-01-15",acct:bank.id,txnId:"purchase-txn"}];
  const purchaseTxn={id:"purchase-txn",type:"expense",date:"2026-01-15",postings:[{acct:bank.id,amt:-800,cur:"EUR"}]};
  S.txns=[purchaseTxn];
  mf.syncLinkedPurchaseForTxn(purchaseTxn,"2026-01-15");
  purchaseTxn.date="2026-02-20";purchaseTxn.postings=[{acct:credit.id,amt:-750,cur:"INR"}];
  mf.syncLinkedPurchaseForTxn(purchaseTxn,"2026-01-15");
  assert(S.purchases[0].amt===750&&S.purchases[0].cur==="INR"&&S.purchases[0].acct===credit.id&&S.purchases[0].date==="2026-02-20","editing linked expense synchronises purchase amount, currency, account and date");
  assert(S.purchases[0].expiry==="2028-02-20","editing purchase date preserves inferred warranty duration");
  mf.setLinkedPurchaseTxnVoided(purchaseTxn.id,true);
  assert(S.purchases[0].txnVoided===true,"voiding linked expense suspends warranty reminder");
  mf.setLinkedPurchaseTxnVoided(purchaseTxn.id,false);
  assert(S.purchases[0].txnVoided===false,"restoring linked expense resumes warranty reminder");
  S.purchases=[];
  S.txns=[];
  const parent={id:"parent",type:"expense",status:"posted",postings:[{acct:bank.id,amt:-10,cur:"INR"}]};
  const linkedRefund={id:"linked-refund",type:"refund",status:"posted",refundOf:"parent",postings:[{acct:bank.id,amt:2,cur:"INR"}]};
  S.txns=[parent,linkedRefund];
  assert(await mf.voidTxn("parent")===false,"an expense with posted refunds cannot be voided first");
  parent.status="voided";
  assert(await mf.unvoid("linked-refund")===false,"a refund cannot be restored before its original expense");
  S.txns=[];
  const usdFmt = mf.fmt(80, "USD");
  const eurFmt = mf.fmt(40, "EUR");
  const inrFmt = mf.fmt(500, "INR");
  assert((usdFmt.includes("$") || usdFmt.includes("USD")) && !usdFmt.includes("€") && !usdFmt.includes("₹"), "dollars are not shown as euros or rupees");
  assert(eurFmt.includes("€") || eurFmt.includes("EUR"), "euros keep the euro symbol");
  assert(inrFmt.includes("₹") || inrFmt.includes("INR"), "rupees keep the rupee symbol");
  S.fx.GBP = 0;
  mf.applyForexWallets(card, [{cur:"GBP", balance:10}]);
  const gap = mf.forexDisplayValue(card);
  assert(gap.missing === true && gap.value === 0, "a currency with no rate is not treated as INR or EUR");
  S.fx.GBP = 106;
  near(mf.forexDisplayValue(card).value, 1060, "pounds use the pound rate");
  const dad = {id:"fxd", type:"forex", name:"Father forex", owner:"Father", archived:false, opening:0, wallets:[], cardMeta:{}};
  mf.applyForexWallets(dad, [{cur:"USD", balance:1}]);
  S.accounts.push(dad);
  const fam = mf.wealthBreakdown(null);
  const me = mf.wealthBreakdown("Me");
  const father = mf.wealthBreakdown("Father");
  near(me.total + father.total, fam.total, "forex balances stay with their owner");
  near(father.forex, 84, "father's dollar wallet converts once");
  S.accounts = S.accounts.filter(a => a.id !== "fx1");
  near(mf.wealthBreakdown("Me").forex, 0, "deleting the card removes it from net worth");
  mf.setMoneySeg("accounts");
  mf.setTab("accounts");
  S.accounts = [card, credit, bank];
  const page = mf.viewAccounts();
  assert(page.includes("Forex card") && page.includes("Niyo"), "forex cards appear in the accounts list");
  assert(page.includes("Credit card") || page.includes("Axis"), "the credit card is still listed");
  assert(page.indexOf('section-label">Forex cards') > page.indexOf("Axis"), "forex cards are grouped after credit cards");
  // Forex visibility is a presentation preference; it must not alter stored accounts or net worth.
  S.ui = {showForex:false};
  const hiddenPage = mf.viewAccounts();
  assert(!hiddenPage.includes("Niyo") && !hiddenPage.includes('section-label">Forex cards'), "Forex cards are hidden from Money when visibility is off");
  assert(hiddenPage.includes("Axis"), "non-Forex cards remain visible when Forex is hidden");
  assert(!mf.paySelectHtml("from", "bank1", "expense").includes("Niyo"), "new expense account picker hides Forex when visibility is off");
  S.lastAcct=card.id;
  assert(mf.preferredPayId("expense")!==card.id, "a previously selected Forex card is not auto-selected for new expenses when visibility is off");
  assert(mf.forexVisible()===false, "Forex visibility preference reads as off");
  const hiddenSettings=mf.viewSettings();
  assert(hiddenSettings.includes("Show Forex features") && hiddenSettings.includes(">Off</button>"), "More settings exposes the Forex visibility toggle");
  const hiddenHome=mf.viewHome();
  assert(!hiddenHome.includes("Forex cards"), "Home hides Forex-specific breakdown labels when visibility is off");
  near(mf.wealthBreakdown(null).forex, 1060, "hiding Forex does not change stored Forex valuation");
  S.ui.showForex=true;
  assert(mf.preferredPayId("expense")===card.id, "turning Forex visibility on restores the previous Forex payment preference");
  assert(mf.viewAccounts().includes("Niyo") && mf.paySelectHtml("from", "bank1", "expense").includes("Niyo"), "turning Forex visibility back on restores Forex screens and picker options");
  assert(mf.vaultShapeOk({v:2, accounts:[{type:"forex", wallets:[{cur:"USD", balance:1}]}], txns:[]}), "a backup with a forex card is still a valid vault");
  assert(mf.vaultShapeOk({v:2, accounts:[{type:"card", opening:-5}], txns:[]}), "an older card backup is still valid");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await mf.deriveKey("correct horse battery", salt, 1000);
  const sealed = await mf.seal({v:2, rate:90, display:"INR", accounts:[card], txns:[], fx:S.fx}, key, salt, 1000, null);
  const env = JSON.parse(sealed);
  assert(env.enc === 2 && env.salt && env.iv && env.data && !("wallets" in env), "the backup envelope is unchanged");
  const opened = await mf.unseal(env, key);
  assert(opened.accounts[0].wallets.find(w => w.cur === "GBP").balance === 10, "restore keeps the forex wallets");
  assert(opened.accounts[0].accountNumber === "", "restore does not reveal a full card number");
  const kept = {id:"c", type:"card", name:"Axis", owner:"Me", cur:"INR", opening:-20, archived:false, cardMeta:{cardType:"Credit", last4:"1188"}};
  S.accounts = [kept];
  S.fx = {};
  mf.migrate();
  assert(S.accounts.length === 1 && S.accounts[0].type === "card" && S.accounts[0].opening === -20, "migrate does not rewrite credit cards");
  assert(Number(S.fx.USD) > 0 && Number(S.fx.GBP) > 0, "missing forex rates are filled without erasing the vault");
  const legacyPan={id:"legacy-pan",type:"forex",name:"Legacy card",accountNumber:"4111-1111-1111-4242",accountMasked:"**** 4242",wallets:[{id:"legacy-pan-usd",cur:"USD",balance:1}],cardMeta:{}};
  S.accounts=[legacyPan];S.txns=[];mf.migrate();
  assert(legacyPan.accountNumber===""&&legacyPan.cardMeta.last4==="4242","migration strips non-digits correctly and never retains a full PAN");
  assert(legacyPan.accountMasked==="•••• 4242","migration sanitises the legacy masked-number field too");
  const missingRefCard={id:"missing-ref",type:"forex",name:"Missing wallet reference",wallets:[{id:"only-usd",cur:"USD",balance:12}],cardMeta:{}};
  const missingRefTxn={id:"missing-wallet-txn",type:"expense",status:"posted",forexAcct:"missing-ref",walletId:"deleted-wallet",walletCur:"USD",amount:2,postings:[{acct:"missing-ref",amt:-2,cur:"USD"}]};
  S.accounts=[missingRefCard];S.txns=[missingRefTxn];
  let missingRefRejected=false;try{mf.migrate();}catch(e){missingRefRejected=true;}
  assert(missingRefRejected,"migration rejects Forex transactions whose wallet reference is missing");
  const broken={id:"badfx",type:"forex",name:"Bad legacy card",wallets:[{id:"dup1",cur:"USD",balance:12},{id:"dup2",cur:"USD",balance:18}],cardMeta:{}};
  S.accounts=[broken];S.txns=[];
  const walletSnapshot=JSON.stringify(broken.wallets);
  let migrationRejected=false;
  try{mf.migrate();}catch(e){migrationRejected=true;}
  assert(migrationRejected,"migration rejects duplicate Forex currencies");
  assert(JSON.stringify(broken.wallets)===walletSnapshot,"failed migration leaves original wallet rows intact");
  const legacyCard={id:"legacyfx",type:"forex",name:"Legacy travel card",wallets:[{id:"legacy-usd",cur:"USD",balance:90}],cardMeta:{}};
  const legacyExpense={id:"legacy-exp",type:"expense",status:"posted",forexAcct:"legacyfx",walletId:"legacy-usd",walletCur:"USD",amount:10,postings:[{acct:"legacyfx",amt:-10,cur:"USD"}]};
  const legacyRefund={id:"legacy-ref",type:"refund",status:"posted",refundOf:"legacy-exp",postings:[{acct:"legacyfx",amt:5,cur:"USD"}]};
  S.accounts=[legacyCard];S.txns=[legacyExpense,legacyRefund];
  mf.migrate();
  assert(legacyRefund.forexAcct==="legacyfx"&&legacyRefund.walletId==="legacy-usd","legacy Forex refunds gain original wallet references");
  near(legacyCard.wallets[0].balance,90,"migration preserves the current wallet balance for legacy refunds");
  near(legacyCard.wallets[0].openingBalance,100,"migration baseline includes only movements already reflected in the current balance");
  assert(legacyRefund.forexMovementApplied===false,"legacy refund history is linked without applying a possibly already-manual wallet credit");
  near(mf.forexWalletNetMovement("legacyfx","legacy-usd"),-10,"legacy refund is excluded from wallet movement reconciliation");
  assert(mf.forexTxnMovement(legacyRefund,false)===true,"restoring a legacy history-only refund does not move the wallet twice");
  near(legacyCard.wallets[0].balance,90,"legacy history-only refund preserves the existing balance");
  const stateBefore=JSON.stringify(mf.getS());
  storage.failSet=true;
  const failedCommit=await mf.commitForexAware(()=>{
    mf.getS().txns.push({id:"must-rollback",type:"expense",status:"posted",postings:[]});
    return true;
  });
  storage.failSet=false;
  assert(failedCommit.ok===false,"failed Forex-aware save reports failure");
  assert(JSON.stringify(mf.getS())===stateBefore,"failed Forex-aware save restores the entire in-memory state");
  console.log("PASS forex-cards");
}

// ---------- account picker is a collapsed dropdown ----------
{
  S.accounts = [
    {id:"b1", name:"ING", type:"bank", owner:"Me", cur:"EUR", opening:10, archived:false},
    {id:"b2", name:"SBI", type:"bank", owner:"Me", cur:"INR", opening:20, archived:false}
  ];
  const html = mf.paySelectHtml("sa", "b2", "in");
  assert(html.includes('class="pay-trigger"') && html.includes('data-paytoggle="sa"'), "picker has a trigger button");
  assert(/<div class="pay-panel"[^>]*\shidden>/.test(html), "account list is collapsed by default");
  assert(/<input type="hidden" id="sa" value="b2">/.test(html), "hidden value holds the selected account");
  assert(/pay-trigger-main">[\s\S]*SBI/.test(html), "trigger shows the selected account");
  assert((html.match(/data-paypick="sa"/g)||[]).length===2, "every account is still pickable");
  console.log("PASS account-picker");
}


// ---------- Give & Take separation ----------
{
  const S = mf.getS();
  S.txns = [];
  S.lending = [];
  S.contacts = [];
  S.accounts = [{id:"cash1", name:"Cash", type:"cash", cur:"INR", opening:10000, archived:false}];
  mf.setS(S);

  // Create a Give & Take transaction
  const c = mf.ensureContactByName("Rahul");
  assert(c && c.id, "contact created");
  const t = mf.addTxn({
    type:"givetake",
    giveTake:true,
    giveTakeVersion:2,
    contactId:c.id,
    person:"Rahul",
    date:"2026-11-21",
    pd:2000,
    postings:[{acct:"cash1", amt:-2000, cur:"INR"}]
  }, {skipSave:true});
  assert(t.giveTake === true, "giveTake flag set");
  assert(S.lending.length === 0, "no formal lending record created");
  assert(mf.giveTakeBalance(c.id) === 2000, "balance positive (they owe me)");

  // Formal lending should not affect Give & Take
  S.lending.push({id:"loan1", person:"Rahul", principal:50000, direction:"lent", start:"2026-11-21", rate:10});
  assert(mf.giveTakeBalance(c.id) === 2000, "formal loan does not change Give & Take balance");
  assert(S.lending.length === 1, "lending record exists independently");

  // Settlement
  const t2 = mf.addTxn({
    type:"givetake",
    giveTake:true,
    giveTakeVersion:2,
    settlement:true,
    settlesTxnId:t.id,
    contactId:c.id,
    person:"Rahul",
    date:"2026-11-22",
    pd:-500,
    note:"Partial settlement",
    postings:[{acct:"cash1", amt:500, cur:"INR"}]
  }, {skipSave:true});
  assert(mf.giveTakeBalance(c.id) === 1500, "partial settlement reduces balance");

  // A second linked settlement is tracked against the same specific source.
  mf.addTxn({
    type:"givetake", giveTake:true, giveTakeVersion:2, settlement:true, settlesTxnId:t.id,
    contactId:c.id, person:"Rahul", date:"2026-11-23", pd:-500,
    postings:[{acct:"cash1",amt:500,cur:"INR"}]
  }, {skipSave:true});
  const open = mf.giveTakeOpenItems(c.id);
  assert(open.some(x=>x.txn?.id===t.id && x.outstanding===1000), "linked partial settlements reduce only their source transaction");
  assert(mf.giveTakeSettlementPlan(c.id,t.id,1000,"INR").ok, "settlement plan accepts the exact outstanding amount");
  assert(!mf.giveTakeSettlementPlan(c.id,t.id,1001,"INR").ok, "settlement plan rejects over-settlement");
  assert(!mf.giveTakeSettlementPlan(c.id,t.id,100,"EUR").ok, "settlement plan rejects currency mismatch");
  assert(mf.giveTakeBalance(c.id) === 1000, "both linked settlements affect person balance");
  assert(mf.giveTakeSummary()[0].txns.length===3, "person summary retains full transaction history");
  assert(await mf.voidTxn(t.id)===false, "an original transaction cannot be voided while linked settlements remain posted");
  const testKey=await crypto.subtle.generateKey({name:"AES-GCM",length:256},true,["encrypt","decrypt"]);
  mf.setCrypto(testKey,new Uint8Array(16),1000);
  assert(await mf.voidTxn(t2.id)===true && t2.status==="voided", "linked settlement can be voided");
  assert(await mf.unvoid(t2.id)===true && t2.status==="posted", "voided settlement can be restored");
  const excessiveRestore={id:"too-large",status:"voided",type:"givetake",giveTake:true,settlesTxnId:t.id,pd:-2000,contactId:c.id,person:"Rahul",postings:[{acct:"cash1",amt:2000,cur:"INR"}]};
  S.txns.push(excessiveRestore);
  assert(await mf.unvoid(excessiveRestore.id)===false, "restore rejects a settlement that would over-settle its source");
  S.txns=S.txns.filter(x=>x.id!==excessiveRestore.id);

  // Pre-upgrade records are grouped into a transparent person/currency legacy balance.
  const legacy=mf.ensureContactByName("Legacy Friend");
  mf.addTxn({type:"givetake",giveTake:true,contactId:legacy.id,person:legacy.name,pd:1200,postings:[{acct:"cash1",amt:-1200,cur:"INR"}]}, {skipSave:true});
  mf.addTxn({type:"givetake",giveTake:true,contactId:legacy.id,person:legacy.name,pd:-200,postings:[{acct:"cash1",amt:200,cur:"INR"}]}, {skipSave:true});
  const legacyOpen=mf.giveTakeOpenItems(legacy.id);
  assert(legacyOpen.length===1 && legacyOpen[0].legacyKey && legacyOpen[0].outstanding===1000, "legacy records are netted per person and currency without guessing individual links");
  assert(mf.giveTakeSettlementPlan(legacy.id,"legacy:"+encodeURIComponent(legacyOpen[0].legacyKey),400,"INR").ok, "legacy balance can be settled through its explicit aggregate bucket");
  mf.addTxn({type:"givetake",giveTake:true,giveTakeVersion:2,settlement:true,settlesLegacyKey:legacyOpen[0].legacyKey,contactId:legacy.id,person:legacy.name,pd:-400,postings:[{acct:"cash1",amt:400,cur:"INR"}]}, {skipSave:true});
  assert(mf.giveTakeOpenItems(legacy.id)[0].outstanding===600, "new settlements can reduce the grouped legacy balance");

  // FX conversion is applied per transaction using its stored historical rate.
  S.display="INR"; S.rate=100;
  const eurContact=mf.ensureContactByName("Mira");
  mf.addTxn({type:"givetake",giveTake:true,contactId:eurContact.id,person:"Mira",pd:10,fxRate:90,postings:[{acct:"cash1",amt:-10,cur:"EUR"}]}, {skipSave:true});
  mf.addTxn({type:"givetake",giveTake:true,contactId:eurContact.id,person:"Mira",pd:1000,fxRate:100,postings:[{acct:"cash1",amt:-1000,cur:"INR"}]}, {skipSave:true});
  assert(mf.giveTakeBalance(eurContact.id)===1900, "mixed-currency balance converts each record to display currency");
  assert(mf.giveTakeSummary().find(x=>x.contactId===eurContact.id).given===1900, "mixed-currency summary totals use display currency");

  // Duplicate normalized names are never silently merged or guessed.
  S.contacts.push({id:"dup1",name:"  ALEX ",methods:[]},{id:"dup2",name:"Alex",methods:[]});
  assert(mf.findContactByName("alex").ambiguous, "duplicate normalized names are detected");
  assert(mf.ensureContactByName("Alex")===null, "ambiguous contact is not guessed");

  // Existing formal loans acquire stable contact IDs only when the name is unique.
  S.contacts=[{id:"loan-contact",name:"Loan Person",methods:[]}];
  S.bankContacts=[];
  S.lending=[{id:"loan-stable",person:"Loan Person"}];
  S.txns=[{id:"loan-origin",status:"posted",type:"lend",loanId:"loan-stable",person:"Loan Person",postings:[]}];
  mf.migrateContactsFromBank();
  assert(S.lending[0].contactId==="loan-contact", "formal loan migration assigns stable contact ID");
  assert(S.txns[0].contactId==="loan-contact", "formal loan transaction receives same contact ID");
  S.contacts=[{id:"surviving-contact",name:"Old GiveTake Person",methods:[]}];
  S.lending=[];
  S.txns=[{id:"legacy-give",status:"posted",type:"givetake",giveTake:true,contactId:"orphaned-id",person:"Old GiveTake Person",pd:50,postings:[]}];
  mf.migrateContactsFromBank();
  assert(S.txns[0].contactId==="surviving-contact", "unique legacy contact match repairs an orphaned contact ID");

  // Closing Give & Take resets the centre + quick-add mode.
  mf.setSheetType("givetake");
  testLayer.innerHTML="open";
  mf.closeSheet();
  assert(testLayer.innerHTML==="", "close clears the active sheet");
  assert(mf.getSheetType()==="expense", "close resets Give & Take quick-add mode");

  console.log("PASS givetake-separation-and-regressions");
}

{
  const S = mf.blank();
  S.display = "INR";
  S.rate = 90;
  S.accounts = [{id:"cash", type:"cash", name:"Cash", owner:"Me", cur:"INR", opening:1000, archived:false}];
  mf.setS(S);
  assert(mf.normalizeContactName("Riya  Sharma") === mf.normalizeContactName("Riya\tSharma"), "extra spaces and tabs collapse to the same contact key");
  assert(mf.normalizeContactName("Riya  Sharma") === "riya sharma", "collapsed key is a single space");
  const spaced = mf.ensureContactByName("Riya  Sharma");
  assert(spaced && spaced.name === "Riya Sharma", "a new contact is stored without repeated spaces");
  assert(mf.findContactByName("Riya Sharma").contact === spaced, "lookup finds the contact when only spacing differs");
  const given = mf.addTxn({type:"givetake", giveTake:true, giveTakeVersion:2, contactId:spaced.id, person:spaced.name, owner:"Me", pd:400, postings:[{acct:"cash", amt:-400, cur:"INR"}]}, {skipSave:true});
  near(mf.balance(S.accounts[0]), 600, "giving money reduces cash");
  near(mf.wealthBreakdown("Me").iouIn, 400, "the outstanding Give & Take is owed to you");
  near(mf.netWorth("Me").total, 1000, "giving money does not reduce net worth");
  near(mf.netWorth("Father").total, 0, "another member does not inherit that IOU");
  mf.addTxn({type:"givetake", giveTake:true, giveTakeVersion:2, settlement:true, settlesTxnId:given.id, contactId:spaced.id, person:spaced.name, owner:"Me", pd:-400, postings:[{acct:"cash", amt:400, cur:"INR"}]}, {skipSave:true});
  near(mf.netWorth("Me").total, 1000, "settling restores cash and removes the IOU");
  near(mf.wealthBreakdown("Me").iouIn, 0, "a settled Give & Take is not still an asset");
  near(mf.wealthBreakdown("Me").iouOut, 0, "a settlement is not booked as a second liability");
  mf.addTxn({type:"givetake", giveTake:true, giveTakeVersion:2, contactId:spaced.id, person:spaced.name, owner:"Me", pd:-150, postings:[{acct:"cash", amt:150, cur:"INR"}]}, {skipSave:true});
  near(mf.balance(S.accounts[0]), 1150, "received informal money increases cash");
  near(mf.wealthBreakdown("Me").iouOut, 150, "money you now owe is a liability");
  near(mf.netWorth("Me").total, 1000, "receiving money you owe does not increase net worth");
  S.txns.push({id:"broken", status:"posted", type:"expense"});
  near(mf.balance(S.accounts[0]), 1150, "a posted transaction with no postings does not break balances");
  console.log("PASS givetake-networth-and-names");
}

// ---------- security hardening ----------
{
  assert(mf.csvSafeText("=HYPERLINK(\"https://bad\")").startsWith("'="), "CSV formula-leading equals is neutralised");
  assert(mf.csvSafeText("  +cmd").startsWith("'"), "CSV formula after whitespace is neutralised");
  assert(mf.csvSafeText("@SUM(A1:A2)").startsWith("'@"), "CSV formula-leading at-sign is neutralised");
  assert(mf.csvSafeText("Normal note") === "Normal note", "ordinary CSV text remains unchanged");
  assert(mf.csvSafeText("-25") === "'-25", "text negative strings are neutralised");
  assert(Number(-25) === -25, "numeric negative amounts remain numeric in export rows");

  mf.setSheetType("givetake");
  mf.openSheet("<p>Give &amp; Take</p>");
  assert(mf.isSheetHistoryActive() && historyCalls.push===1, "opening a sheet adds one browser history entry");
  mf.handleSheetPopState();
  assert(!mf.isSheetHistoryActive() && testLayer.innerHTML==="", "browser Back closes the active sheet");
  assert(mf.getSheetType()==="expense", "browser Back also resets Give & Take quick-add mode");
  mf.openSheet("<p>Another sheet</p>");
  mf.closeSheet();
  assert(historyCalls.back===1 && !mf.isSheetHistoryActive() && mf.isSheetHistoryBackPending(), "explicit close schedules removal of its sheet history entry");
  // Reopening before the asynchronous popstate arrives must not let the old
  // close event close the new sheet.
  mf.openSheet("<p>Quick reopen</p>");
  mf.handleSheetPopState();
  assert(mf.isSheetHistoryActive() && testLayer.innerHTML.includes("Quick reopen") && historyCalls.push===3, "quick reopen survives the previous close event and receives a fresh history entry");
  mf.handleSheetPopState();
  assert(!mf.isSheetHistoryActive() && testLayer.innerHTML==="", "the next hardware Back closes the newly opened sheet");

  const sw=fs.readFileSync(new URL("./sw.js",import.meta.url),"utf8");
  assert((sw.match(/event\.waitUntil\(cacheWrite\)/g)||[]).length===2, "service worker cache writes extend fetch-event lifetime");
  assert(sw.includes("myfinance-shell-v92"), "service worker cache version is bumped for this release");
  const htmlCache = sw.slice(sw.indexOf("if (isHTML)"));
  assert(htmlCache.indexOf("const forRequest = response.clone()") >= 0 && htmlCache.indexOf("const forRequest = response.clone()") < htmlCache.indexOf("caches.open(CACHE)"), "HTML is cloned before the cache is opened");
  const page=fs.readFileSync(new URL("./index.html",import.meta.url),"utf8");
  const csp=page.match(/Content-Security-Policy" content="([^"]+)"/i)?.[1]||"";
  const scriptPolicy=csp.split(";").find(x=>x.trim().startsWith("script-src"))||"";
  assert(!scriptPolicy.includes("unsafe-inline"), "inline scripts are not broadly enabled by CSP");
  const inlineScripts=[...page.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
  for(const code of inlineScripts){
    const digest=createHash("sha256").update(code).digest("base64");
    assert(scriptPolicy.includes("'sha256-"+digest+"'"), "each inline script has a matching CSP hash");
  }
  console.log("PASS security-and-navigation-hardening");
}


// ---------- Lending export summaries and ledgers ----------
{
  const st=mf.blank();
  st.accounts=[{id:"cash-export",name:"Cash",cur:"INR",type:"cash"}];
  const day=mf.today();
  st.lending=[
    {id:"loan-export-1",person:"Asha",contactId:"contact-asha",direction:"lent",principal:1000,rate:0,cur:"INR",start:day,account:"cash-export",note:"=2+2",interestAdjustments:[
      {id:"adj-add",date:day,amount:25,note:"Extra agreed interest"},
      {id:"adj-waive",date:day,amount:-5,note:"Waiver"}
    ]},
    {id:"loan-export-2",person:"Asha",contactId:"contact-asha",direction:"borrowed",principal:50,rate:0,cur:"EUR",start:day,account:"cash-export"},
    {id:"loan-export-3",person:"Bina",contactId:"contact-bina",direction:"lent",principal:200,rate:0,cur:"INR",start:day,account:"cash-export"}
  ];
  st.txns=[
    {id:"origin-export-1",status:"posted",type:"lend",loanId:"loan-export-1",date:day,postings:[{acct:"cash-export",amt:-1000,cur:"INR"}]},
    {id:"principal-export-1",status:"posted",type:"lendback",loanId:"loan-export-1",date:day,principalReduction:200,postings:[{acct:"cash-export",amt:200,cur:"INR"}],note:"Part repayment"},
    {id:"interest-export-1",status:"posted",type:"income",loanId:"loan-export-1",date:day,interestSettlement:true,postings:[{acct:"cash-export",amt:10,cur:"INR"}],note:"Interest received"},
    {id:"voided-export-1",status:"voided",type:"lendback",loanId:"loan-export-1",date:day,principalReduction:100,postings:[{acct:"cash-export",amt:100,cur:"INR"}]}
  ];
  mf.setS(st);
  const all=mf.buildLendingExportRows("all");
  assert(all.loanCount===3 && all.summary.length===4, "lending summary exports every loan as a separate row");
  const asha=mf.buildLendingExportRows("person:"+encodeURIComponent("contact:contact-asha"));
  assert(asha.loanCount===2 && asha.summary[1][2]==="INR" && asha.summary[2][2]==="EUR", "person export includes multiple loans without combining currencies");
  const lent=mf.buildLendingExportRows("lent");
  assert(lent.loanCount===2 && lent.summary.slice(1).every(r=>r[1]==="Lent"), "money-lent filter includes only lent records");
  const borrowed=mf.buildLendingExportRows("borrowed");
  assert(borrowed.loanCount===1 && borrowed.summary[1][1]==="Borrowed", "money-borrowed filter includes only borrowed records");
  const one=mf.buildLendingExportRows({type:"loan",loanId:"loan-export-2"});
  assert(one.loanCount===1 && one.summary[1][0]==="Asha", "individual loan export stays scoped to selected loan");
  const row=all.summary.find(r=>r[0]==="Asha"&&r[1]==="Lent");
  assert(row[5]===200 && row[6]===800 && row[9]===10 && row[10]===20 && row[11]===10 && row[12]===810, "summary reuses lendingPosition principal, interest payment and adjustment calculations");
  const loanLedger=all.ledger.filter(r=>r[0]==="Asha"&&r[2]==="INR");
  assert(loanLedger.some(r=>r[6]==="Principal repayment received"&&r[7]===200), "ledger includes posted principal repayments");
  assert(loanLedger.some(r=>r[6]==="Interest received"&&r[8]===10), "ledger includes posted interest receipts");
  assert(loanLedger.some(r=>r[6]==="Interest added / agreed adjustment"&&r[8]===25), "ledger includes positive interest adjustments");
  assert(loanLedger.some(r=>r[6]==="Interest waiver / reduction"&&r[8]===-5), "ledger includes interest waivers as negative adjustments");
  assert(!loanLedger.some(r=>r[6]==="Principal repayment received"&&r[7]===100), "ledger excludes voided repayments");
  assert(loanLedger.every(r=>r[3]===day&&r[4]===1000&&r[11]===day), "detailed ledger identifies the loan, original principal and report date");
  assert(!all.summary[0].some(h=>/(^|[_ ])(id|reference)([_ ]|$)/i.test(h)), "shareable lending summary excludes technical identifier columns");
  assert(!all.ledger[0].some(h=>/(^|[_ ])(id|reference)([_ ]|$)/i.test(h)), "shareable lending ledger excludes technical identifier columns");
  mf.setPlanSeg("lending");
  assert(mf.viewPlan().includes("data-lendexport-open"), "Lending overview exposes the export action");
  const pageSource=fs.readFileSync(new URL("./index.html",import.meta.url),"utf8");
  assert(pageSource.includes('data-lendstatement="${esc(l.id)}"'), "individual lending detail exposes statement export");
  const csv=mf.lendingRowsToCsv(all.summary);
  assert(csv.includes("\"'=2+2\""), "lending CSV neutralises formula-leading text fields");
  assert(csv.includes("\"800\""), "numeric amounts remain numeric CSV values");
  assert(csv.startsWith("\"Person\",\"Type\""), "lending CSV starts with readable report headings");
  assert(mf.cleanShareText("  Asha\u200B\u202E  ")==="Asha", "shareable person names remove invisible formatting characters");
  assert(mf.cleanShareText("Jos\uFFFD") === "Jos", "shareable names remove replacement-character encoding artefacts");
  const zwnj="क\u200C्ष";
  const zwj="👨\u200D👩\u200D👧";
  assert(mf.cleanShareText(zwnj)===zwnj, "Hindi ZWNJ is preserved");
  assert(mf.cleanShareText(zwj)===zwj, "emoji ZWJ sequences are preserved");
  assert(mf.cleanShareText("नमस्ते")==="नमस्ते", "Devanagari text is preserved");
  assert(mf.cleanShareText("مرحبا")==="مرحبا", "Arabic text is preserved");
  assert(mf.cleanShareText("日本語")==="日本語", "Japanese text is preserved");
  assert(mf.cleanShareText("José café")==="José café", "Latin accents are preserved");
  assert(mf.cleanShareText("A\u200Dsha")==="A\u200Dsha" && mf.cleanShareText("A\u200Csha")==="A\u200Csha", "ZWJ and ZWNJ inside a name are preserved");
  assert(mf.cleanShareText("A\u200Bsha")==="Asha" && !mf.cleanShareText("Hi\u202Ethere").includes("\u202E"), "zero-width space and bidi override are still removed");
  const pdf=mf.buildLendingPdfHtml(all.summary,"summary",day,all.summary,all.positions);
  assert(pdf.includes("<h1>Lending Summary</h1>")&&pdf.includes("Report date")&&pdf.includes("Asha"), "PDF summary contains a readable title, report date and person data");
  assert(pdf.includes("Outstanding position")&&pdf.includes("Principal outstanding")&&pdf.includes("Interest outstanding")&&pdf.includes("Total outstanding"), "PDF summary includes principal, interest and total outstanding metrics");
  assert(pdf.includes("INR")&&pdf.includes("EUR")&&pdf.includes("Lent")&&pdf.includes("Borrowed"), "PDF totals preserve currency and lending direction separation");
  assert(pdf.includes("A4 portrait")&&pdf.includes("table-layout:fixed")&&pdf.includes("word-break:normal")&&pdf.includes("counter(page)"), "summary PDF uses A4 portrait, fixed columns, normal wrapping and page numbers");
  const ledgerPdf=mf.buildLendingPdfHtml(all.ledger,"ledger",day,all.summary,all.positions);
  assert(ledgerPdf.includes("A4 landscape")&&ledgerPdf.includes("Closing balance by loan")&&ledgerPdf.includes("Transaction history"), "detailed PDF uses landscape layout and loan closing balances");
  assert(ledgerPdf.includes("Principal outstanding")&&ledgerPdf.includes("Interest outstanding"), "detailed PDF repeats closing principal and interest balances");
  assert(pageSource.includes('data-lendpdf="summary"')&&pageSource.includes('data-lendpdf="ledger"'), "lending export sheet exposes both PDF formats");
  assert(pageSource.includes('class="section-title-actions"')&&!pageSource.includes('sort-caption">Arrange'), "sortable page headings use inline action rows without Arrange label");

  assert(mf.transactionTypeLabel("lendback")==="Principal repayment" && mf.transactionTypeLabel("buy")==="Investment purchase", "transaction export uses human-readable type labels");
  assert(mf.transactionStatusLabel("posted")==="Posted" && mf.transactionStatusLabel("voided")==="Voided", "transaction export uses human-readable status labels");
  const sortMenu=mf.sortMenuHtml("lending",[{key:"person",label:"Person"},{key:"total",label:"Total outstanding"}]);
  assert(sortMenu.includes("data-sortkey=\"lending::person::asc\"")&&sortMenu.includes("data-sortkey=\"lending::person::desc\"")&&sortMenu.includes("lending::manual::asc"), "compact sort menu retains ascending, descending and manual sort actions");
  console.log("PASS lending-export-summaries-and-ledgers");
}

{
  const day=mf.today();
  const future=mf.addDays(day, 15);
  const early=mf.addDays(day, -30);
  const start=mf.addDays(day, -10);
  const st=mf.blank();
  st.display="INR";
  st.accounts=[
    {id:"a",name:"Cash",type:"cash",cur:"INR",opening:0,archived:false},
    {id:"b",name:"Bank",type:"bank",cur:"INR",opening:0,archived:false}
  ];
  st.contacts=[{id:"c1",name:"New Name",methods:[]}];
  st.lending=[
    {id:"round-1",person:"A",direction:"lent",principal:0,rate:0,cur:"INR",start:day,account:"a",interestAdjustments:[{date:day,amount:0.004}]},
    {id:"round-2",person:"B",direction:"lent",principal:0,rate:0,cur:"INR",start:day,account:"a",interestAdjustments:[{date:day,amount:0.004}]},
    {id:"future-loan",person:"C",direction:"lent",principal:1000,rate:0,cur:"INR",start:start,account:"a",interestAdjustments:[]},
    {id:"eur-loan",person:"D",direction:"borrowed",principal:50,rate:0,cur:"EUR",start:day,account:"a",interestAdjustments:[]}
  ];
  st.txns=[
    {id:"future-pay",status:"posted",type:"lendback",loanId:"future-loan",date:future,principalReduction:100,postings:[{acct:"a",amt:100,cur:"INR"}]},
    {id:"early-pay",status:"posted",type:"lendback",loanId:"future-loan",date:early,principalReduction:50,postings:[{acct:"a",amt:50,cur:"INR"}],note:"Early"},
    {id:"today-pay",status:"posted",type:"lendback",loanId:"future-loan",date:day,principalReduction:200,postings:[{acct:"a",amt:200,cur:"INR"}]},
    {id:"gt-only",status:"posted",type:"givetake",giveTake:true,contactId:"c1",person:"Old Name",date:day,postings:[{acct:"a",amt:-10,cur:"INR"}]},
    {id:"dup",status:"posted",type:"expense",date:day,postings:[{acct:"a",amt:-1,cur:"INR"}]},
    {id:"dup",status:"posted",type:"expense",date:day,postings:[{acct:"a",amt:-1,cur:"INR"}]},
    {id:"orphan-loan",status:"posted",type:"lendback",loanId:"missing-loan",date:day,principalReduction:5,postings:[{acct:"a",amt:5,cur:"INR"}]},
    {id:"bad-cur",status:"posted",type:"income",loanId:"eur-loan",date:day,interestSettlement:true,postings:[{acct:"a",amt:3,cur:"INR"}]},
    {id:"unbalanced",status:"posted",type:"transfer",date:day,postings:[{acct:"a",amt:-10,cur:"INR"},{acct:"b",amt:4,cur:"INR"}]},
    {id:"mismatch-exp",status:"posted",type:"expense",date:day,postings:[{acct:"a",amt:-2,cur:"EUR"}]},
    {id:"bad-amt",status:"posted",type:"expense",date:day,postings:[{acct:"a",amt:"nope",cur:"INR"}]},
    {id:"inf-amt",status:"posted",type:"expense",date:day,postings:[{acct:"a",amt:Infinity,cur:"INR"}]}
  ];
  const before=JSON.stringify(st);
  mf.setS(st);
  const rows=mf.buildLendingExportRows("all");
  const futureLoan=rows.summary.find(r=>r[0]==="C");
  const pos=mf.lendingPosition(st.lending.find(l=>l.id==="future-loan"));
  assert(futureLoan[6]===pos.principalLeft && futureLoan[6]===750, "export principal outstanding matches lendingPosition and ignores the future repayment");
  assert(!rows.ledger.some(r=>r[7]===100 && r[0]==="C"), "future-dated repayment is omitted from the detailed ledger");
  const earlyRow=rows.ledger.find(r=>r[0]==="C" && r[7]===50);
  assert(earlyRow && earlyRow[5]===early, "ledger keeps the original repayment date");
  assert(String(earlyRow[6]).includes("recorded before loan start"), "the description says the repayment was recorded before the loan start");
  assert(String(earlyRow[12]).includes(early) && String(earlyRow[12]).includes(start) && String(earlyRow[12]).includes("Effective interest date") && String(earlyRow[12]).includes("interest uses the loan date"), "the note keeps the original date and states the effective interest date");
  assert(st.txns.find(t=>t.id==="early-pay").date===early && st.txns.find(t=>t.id==="early-pay").note==="Early", "the stored repayment date and note are not rewritten");
  assert(rows.ledger.some(r=>r[0]==="C" && r[5]===day && r[7]===200), "a repayment on the report date stays in the ledger");
  assert(Math.abs(rows.positions.reduce((s,p)=>p.cur==="INR"&&p.direction==="Lent"?s+p.interestLeft:s,0)-0.008)<1e-9, "currency totals keep the unrounded interest");
  assert(rows.summary.filter(r=>r[2]==="INR"&&r[1]==="Lent").every(r=>r[11]===0 || r[0]==="C"), "each CSV row is rounded on its own");
  const pdf=mf.buildLendingPdfHtml(rows.summary,"summary",day,rows.summary,rows.positions);
  assert(pdf.includes(mf.formatMoney(0.008,"INR")), "PDF currency total rounds only after adding the unrounded balances");
  assert(pdf.includes("A4 portrait") && pdf.includes("counter(page)") && pdf.includes(day), "summary PDF keeps portrait layout, page numbers and the report date");
  const detail=mf.buildLendingPdfHtml(rows.ledger,"ledger",day,rows.summary,rows.positions);
  assert(detail.includes("A4 landscape") && !detail.includes("A4 portrait") && detail.includes("tr{break-inside:avoid;page-break-inside:avoid}"), "detailed PDF stays landscape and keeps each row on one printed page where the browser supports it");
  assert(pdf.includes("A4 portrait") && !pdf.includes("A4 landscape"), "summary PDF stays portrait");
  assert(!detail.includes(future), "detailed PDF omits the future repayment date");
  assert(mf.formatMoney(12345678.9,"INR").includes("1,23,45,678"), "INR uses Indian grouping");
  assert(mf.formatMoney(12345678.9,"INR").includes("90"), "INR keeps two decimal places");
  assert(mf.formatMoney(1234567.89,"EUR").includes("1.234.567,89"), "EUR uses European grouping");
  assert(mf.formatMoney(1234567.89,"USD").includes("1,234,567.89"), "USD uses US grouping");
  assert(!mf.formatMoney(1500,"JPY").includes(".00"), "JPY does not force two decimal places");
  const inrTotal=rows.positions.filter(p=>p.cur==="INR").reduce((s,p)=>s+p.totalOutstanding,0);
  const eurTotal=rows.positions.filter(p=>p.cur==="EUR").reduce((s,p)=>s+p.totalOutstanding,0);
  assert(pdf.includes(mf.formatMoney(inrTotal,"INR")) && pdf.includes(mf.formatMoney(eurTotal,"EUR")), "PDF shows separate INR and EUR totals");
  assert(!pdf.includes(mf.formatMoney(inrTotal+eurTotal,"INR")), "PDF does not add INR and EUR into one total");
  mf.runCheck();
  const report=testLayer.innerHTML;
  assert(report.includes("Duplicate ID dup"), "duplicate transaction ids are reported");
  assert(report.includes("missing lending record"), "a repayment linked to an unknown loan is reported");
  assert(report.includes("does not balance"), "an unbalanced transfer is reported");
  assert(report.includes("currency does not match the loan"), "a repayment in the wrong currency is reported");
  assert(report.includes("does not match contact"), "a renamed contact leaves a visible mismatch");
  assert(report.includes("currency EUR does not match account Cash (INR)"), "an ordinary posting currency that differs from its account is reported");
  assert(report.includes("Transaction bad-amt has an invalid amount") && report.includes("Transaction inf-amt has an invalid amount"), "non-finite posting amounts are reported");
  assert(st.txns.find(t=>t.id==="mismatch-exp").postings[0].cur==="EUR" && st.txns.find(t=>t.id==="bad-amt").postings[0].amt==="nope", "warnings do not correct the posting");
  assert(!report.includes("Transaction gt-only references a missing lending record"), "Give & Take is not treated as a loan");
  assert(JSON.stringify(mf.getS())===before, "the integrity check does not change financial records");
  assert(st.txns.some(t=>t.giveTake&&t.person==="Old Name") && !st.lending.some(l=>l.person==="Old Name"), "Give & Take stays separate from formal lending");
  console.log("PASS lending-report-integrity");
}

{
  const st=mf.blank();
  st.accounts=[{id:"a",name:"Cash",type:"cash",cur:"INR",opening:100,archived:false}];
  st.txns=[{id:"t1",status:"posted",type:"expense",date:mf.today(),created:"1",cat:"Food",note:"Lunch",postings:[{acct:"a",amt:-10,cur:"INR"}]}];
  mf.setS(st);
  const home=mf.viewHome();
  assert(home.includes("hero-nw") && home.includes("wealth-grid") && home.includes("quick-grid") && home.includes("actual net worth"), "home keeps net worth, breakdown and quick actions");
  const activity=mf.viewActivity();
  assert(activity.includes('id="q"') && activity.includes('id="fa"') && activity.includes('id="ft"') && activity.includes("ledger"), "activity keeps search, filters and the ledger");
  const settings=mf.viewSettings();
  assert(settings.includes("data-export") && settings.includes("data-check") && settings.includes("data-wipe") && settings.includes('id="themePref"') && settings.includes("Show Forex features"), "settings keeps backup, integrity, theme and forex controls");
  mf.setPlanSeg("lending");
  const lending=mf.viewPlan();
  assert(lending.includes("data-lendexport-open") && lending.includes("lend-hero"), "lending keeps its summary and export");
  mf.setPlanSeg("givetake");
  assert(mf.viewPlan().includes("Give & Take") && !mf.viewPlan().includes("data-lendexport-open"), "Give & Take stays on its own screen");
  mf.setMoneySeg("accounts");
  assert(mf.viewAccounts().includes("data-moneyseg"), "money keeps account, investment and contact navigation");
  const page=fs.readFileSync(new URL("./index.html",import.meta.url),"utf8");
  assert(page.includes("prefers-reduced-motion") && page.includes("focus-visible") && page.includes("--hero:"), "the design system keeps motion, focus and colour tokens");
  assert(page.includes('max-width:840px') && page.includes("min-width:900px"), "wide screens use a bounded layout and centred sheets");
  console.log("PASS design-system-shell");
}

{
  const flat=mf.projectHolding({startValue:1000, annualPct:0, months:12, monthlyExtra:100, includeSips:false, sips:[]});
  near(flat.endValue, 2200, "zero return adds monthly contributions and no growth");
  near(flat.gain, 0, "zero return has no investment gain");
  const down=mf.projectHolding({startValue:1000, annualPct:-10, months:12, monthlyExtra:0, includeSips:false, sips:[]});
  near(down.endValue, 900, "a negative annual return compounds to that annual change");
  const up=mf.projectHolding({startValue:1000, annualPct:10, months:12, monthlyExtra:0, includeSips:false, sips:[]});
  near(up.endValue, 1100, "a positive annual return with no contributions matches the annual rate");
  const sip=[{amt:300, freq:3, cur:"INR"}];
  const withSip=mf.projectHolding({startValue:500, annualPct:0, months:12, monthlyExtra:0, includeSips:true, sips:sip});
  const noSip=mf.projectHolding({startValue:500, annualPct:0, months:12, monthlyExtra:0, includeSips:false, sips:sip});
  near(withSip.contributed, 1200, "a quarterly SIP is added four times a year");
  near(noSip.contributed, 0, "excluding SIPs does not count them");
  near(noSip.endValue, 500, "excluding SIPs leaves the starting value unchanged at zero return");
  const half=mf.projectHolding({startValue:100, annualPct:0, months:6, monthlyExtra:10, includeSips:false, sips:[]});
  near(half.endValue, 160, "a six-month forecast does not run a full year");
  const st=mf.blank();
  st.display="INR";
  st.accounts=[
    {id:"inr",name:"Cash",type:"cash",cur:"INR",opening:100,accountNumber:"SECRET-ACC",archived:false},
    {id:"eur",name:"Euro",type:"cash",cur:"EUR",opening:40,archived:false}
  ];
  st.contacts=[{id:"c",name:"Asha",notes:"Friend",methods:[{kind:"upi",upi:"asha@okbank"}]}];
  st.holdings=[{id:"h1",name:"Flexi Cap",type:"fund",cur:"INR",price:20,owner:"Me"}];
  st.sips=[{id:"sip1",hold:"h1",acct:"inr",amt:300,cur:"INR",freq:3,status:"active",next:mf.today()}];
  const day=mf.today();
  const future=mf.addDays(day, 20);
  st.txns=[
    {id:"open1",status:"posted",type:"open",date:day,hold:"h1",units:10,cost:150,postings:[]},
    {id:"ok",status:"posted",type:"expense",date:day,cat:"Food",note:"Lunch",postings:[{acct:"inr",amt:-10,cur:"INR"}]},
    {id:"later",status:"posted",type:"expense",date:future,cat:"Food",note:"FUTURE-LUNCH",postings:[{acct:"inr",amt:-25,cur:"INR"}]},
    {id:"gone",status:"voided",type:"expense",date:day,cat:"Food",note:"VOID-MEAL",postings:[{acct:"inr",amt:-15,cur:"INR"}]}
  ];
  const before=JSON.stringify(st);
  mf.setS(st);
  const held=mf.holdingSipPlan(st.holdings[0]);
  assert(held.length===1 && held[0].freq===3 && held[0].amt===300, "forecast reads the saved SIP without copying it into a monthly smear");
  const html=mf.buildReportPdf("all");
  assert(html.includes("Complete financial report") && html.includes("Contents") && html.includes("A4 landscape"), "complete PDF has a title, contents and landscape pages");
  assert(html.includes(mf.formatMoney(90,"INR")) && html.includes(mf.formatMoney(40,"EUR")), "account totals stay in their own currency and ignore future and voided rows");
  assert(!html.includes("SECRET-ACC") && !html.includes("asha@okbank"), "shareable PDF omits account numbers and UPI IDs");
  assert(!html.includes("FUTURE-LUNCH") && !html.includes("VOID-MEAL"), "future-dated and voided transactions are omitted");
  assert(html.includes("Flexi Cap"), "holdings are in the complete report");
  assert(!html.includes("Give & Take"), "an empty Give & Take section is omitted");
  assert(!html.includes("sip1") && !html.includes("open1"), "internal ids are not printed");
  const activity=mf.buildReportPdf("activity");
  assert(activity.includes("Lunch") && !activity.includes(future), "transaction PDF follows the same date rule");
  assert(JSON.stringify(mf.getS())===before, "building a forecast input and a PDF does not change stored records");
  const page=fs.readFileSync(new URL("./index.html",import.meta.url),"utf8");
  assert(page.includes("#2563EB") && !page.includes("#9ed4cb") && !page.includes("#1c4e5a"), "the accent is blue, not teal");
  assert(page.includes('data-pdf="all"') && page.includes('data-pdf="home"') && page.includes('data-csv'), "CSV export remains and PDF export is offered");
  console.log("PASS reports-and-forecast");
}

{
  const close=(a,b,msg)=>{ if(!(Math.abs(a-b)<0.02)) throw new Error((msg||"close")+" got "+a+" expected "+b); };
  const ex=mf.projectHolding({startValue:200000, annualPct:0, months:60, monthlyExtra:3000, includeSips:false, sips:[], startDate:"2026-01-01"});
  close(ex.contributed, 180000, "sixty extra instalments");
  close(ex.endValue, 380000, "zero return keeps the starting value plus contributions");
  close(ex.endValue, ex.start+ex.contributed+ex.gain, "identity at zero return");
  const r=Math.pow(1.12, 1/12)-1;
  const annuity=200000*Math.pow(1+r,60)+3000*((Math.pow(1+r,60)-1)/r);
  const grown=mf.projectHolding({startValue:200000, annualPct:12, months:60, monthlyExtra:3000, includeSips:false, sips:[], startDate:"2026-01-01"});
  close(grown.endValue, annuity, "each of the 60 instalments compounds for the months left");
  close(grown.gain, grown.endValue-200000-180000, "growth is the remainder after principal and contributions");
  close(grown.contributed, 180000, "the return does not change how much cash is contributed");
  for(const y of grown.years) close(y.opening+y.contributed+y.gain, y.value, "year "+y.year+" reconciles");
  const monthlyA={amt:3000, freq:1, status:"active", next:"2026-01-01", cur:"INR"};
  const monthlyB={amt:5000, freq:1, status:"active", next:"2026-01-20", cur:"INR"};
  const two=mf.projectHolding({startValue:0, annualPct:0, months:12, monthlyExtra:0, includeSips:true, sips:[monthlyA, monthlyB], startDate:"2026-01-01"});
  close(two.contributed, 96000, "two monthly SIPs on different days both count twelve times");
  const quarterly={amt:10000, freq:3, status:"active", next:"2026-01-01", cur:"INR"};
  const q=mf.projectHolding({startValue:0, annualPct:0, months:12, monthlyExtra:0, includeSips:true, sips:[quarterly], startDate:"2026-01-01"});
  close(q.contributed, 40000, "a quarterly SIP pays four times in a year");
  const plus=mf.projectHolding({startValue:0, annualPct:0, months:12, monthlyExtra:5000, includeSips:true, sips:[monthlyA], startDate:"2026-01-01"});
  close(plus.sipContributed, 36000, "the linked SIP is separate");
  close(plus.extraContributed, 60000, "the hypothetical top-up is separate");
  close(plus.contributed, 96000, "SIP plus top-up");
  const later={amt:1000, freq:1, status:"active", next:"2026-07-01", cur:"INR"};
  const future=mf.projectHolding({startValue:0, annualPct:0, months:12, monthlyExtra:0, includeSips:true, sips:[later], startDate:"2026-01-01"});
  close(future.contributed, 6000, "a SIP that starts in July is not backfilled");
  const ending={amt:1000, freq:1, status:"active", next:"2026-01-15", end:"2026-03-15", cur:"INR"};
  const ended=mf.projectHolding({startValue:0, annualPct:0, months:12, monthlyExtra:0, includeSips:true, sips:[ending], startDate:"2026-01-01"});
  close(ended.contributed, 3000, "instalments stop after the stored end date");
  for(const status of ["stopped","paused","cancelled","completed"]){
    const skipped=mf.projectHolding({startValue:100, annualPct:0, months:12, monthlyExtra:0, includeSips:true, sips:[{amt:1000, freq:1, status, next:"2026-01-01"}], startDate:"2026-01-01"});
    close(skipped.contributed, 0, status+" SIP contributes nothing");
    close(skipped.endValue, 100, status+" SIP does not change the portfolio at zero return");
  }
  const stepped={amt:2000, freq:1, status:"active", next:"2026-01-01", revisions:[{date:"2026-06-01", prev:{amt:1000, freq:1}}], cur:"INR"};
  const step=mf.projectHolding({startValue:0, annualPct:0, months:12, monthlyExtra:0, includeSips:true, sips:[stepped], startDate:"2026-01-01"});
  close(step.contributed, 19000, "a saved revision changes later instalments only");
  const januaryOnly=mf.projectHolding({startValue:0, annualPct:0, months:1, monthlyExtra:0, includeSips:true, sips:[
    {amt:1000, freq:1, status:"active", next:"2026-01-05"},
    {amt:1000, freq:1, status:"active", next:"2026-02-15"}
  ], startDate:"2026-01-01"});
  close(januaryOnly.contributed, 1000, "a February debit is outside a one-month horizon");
  const untouched=mf.projectHolding({startValue:5000, annualPct:10, months:24, monthlyExtra:0, includeSips:false, sips:[], startDate:"2026-01-01"});
  close(untouched.contributed, 0, "no future cash is invented");
  close(untouched.endValue, 5000*1.1*1.1, "two years of growth and nothing else");
  const empty=mf.projectHolding({startValue:0, annualPct:12, months:12, monthlyExtra:1000, includeSips:false, sips:[], startDate:"2026-01-01"});
  assert(empty.endValue>12000, "contributions on a zero balance still compound");
  const large=mf.projectHolding({startValue:10000000, annualPct:12, months:12, monthlyExtra:0, includeSips:false, sips:[], startDate:"2026-01-01"});
  close(large.endValue, 11200000, "a large value grows by the annual rate");
  const loss=mf.projectHolding({startValue:1000, annualPct:-10, months:12, monthlyExtra:0, includeSips:false, sips:[], startDate:"2026-01-01"});
  close(loss.endValue, 900, "negative return");
  assert(mf.forecastDonutParts(loss)===null, "negative growth does not draw a donut");
  const donut=mf.forecastDonutParts(grown);
  assert(donut && donut.parts.length===3, "positive forecast has portfolio, contributions and growth");
  close(donut.sum, grown.endValue, "donut parts equal the projected value");
  const low=mf.projectHolding({startValue:200000, annualPct:8, months:60, monthlyExtra:3000, includeSips:true, sips:[monthlyA], startDate:"2026-01-01"});
  const high=mf.projectHolding({startValue:200000, annualPct:16, months:60, monthlyExtra:3000, includeSips:true, sips:[monthlyA], startDate:"2026-01-01"});
  close(low.contributed, high.contributed, "scenarios use the same contributions");
  assert(high.endValue>low.endValue, "a higher return produces a higher future value");
  const before=JSON.stringify(stepped);
  mf.projectHolding({startValue:1, annualPct:12, months:12, monthlyExtra:1, includeSips:true, sips:[stepped], startDate:"2026-01-01"});
  assert(JSON.stringify(stepped)===before, "forecasting does not rewrite the SIP");
  const st=mf.blank();
  st.holdings=[{id:"h1", name:"Flexi", type:"fund", cur:"INR", price:10}];
  st.sips=[
    {id:"ok", hold:"h1", amt:1000, cur:"INR", freq:1, status:"active", next:"2026-01-01"},
    {id:"fx", hold:"h1", amt:50, cur:"EUR", freq:1, status:"active", next:"2026-01-01"},
    {id:"bad", hold:"h1", amt:0, cur:"INR", freq:1, status:"active", next:"2026-01-01"}
  ];
  mf.setS(st);
  const review=mf.holdingSipReview(st.holdings[0]);
  assert(review.find(x=>x.id==="ok").eligible, "matching SIP is eligible");
  assert(review.find(x=>x.id==="fx").reason==="Different currency", "a different currency is excluded");
  assert(review.find(x=>x.id==="bad").reason==="No valid amount", "a zero SIP amount is excluded");
  const page=fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert(page.includes("Mutual fund forecast") && page.includes("forecast-donut") && page.includes("#09090B"), "forecast screen and near-black dark tokens are present");
  assert(page.includes("#F5F7FB") && page.includes("#2563EB"), "light theme stays blue on a light background");
  console.log("PASS forecast-schedule");
}

console.log("ALL_REGRESSION_PASS");

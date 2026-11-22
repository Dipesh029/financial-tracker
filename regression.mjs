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
  const home = mf.viewHome();
  const familyAt = home.indexOf("Family view");
  const versionAt = home.indexOf("v" + "2.9.3");
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
  assert(sw.includes("myfinance-shell-v83"), "service worker cache version is bumped for the hardened shell");
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

console.log("ALL_REGRESSION_PASS");

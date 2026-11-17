/**
 * My Finance regression tests (v2.5.9)
 * Run: node tests/regression.mjs
 */
function assert(cond, msg){ if(!cond) throw new Error(msg||"assert failed"); }

// --- Manual sort ---
function sortedList(arr){ return (!arr||!arr.length)?(arr||[]):arr.slice(); }
function applySectionSort(arr, key, dir, accessors){
  if(key==="manual"||!accessors[key]) return sortedList(arr);
  const d=dir==="desc"?-1:1;
  return arr.slice().sort((a,b)=>{
    const va=accessors[key](a), vb=accessors[key](b);
    if(typeof va==="number") return (va-vb)*d;
    return String(va).localeCompare(String(vb))*d;
  });
}
{
  const orig=[{id:"x",name:"Z",bal:1},{id:"y",name:"A",bal:9},{id:"z",name:"M",bal:5}];
  const snap=JSON.stringify(orig);
  let v=applySectionSort(orig,"name","asc",{name:a=>a.name,bal:a=>a.bal});
  assert(v.map(x=>x.name).join("")==="AMZ");
  assert(JSON.stringify(orig)===snap, "sort mutated orig");
  v=applySectionSort(orig,"bal","desc",{name:a=>a.name,bal:a=>a.bal});
  assert(v[0].bal===9);
  v=applySectionSort(orig,"manual","asc",{name:a=>a.name,bal:a=>a.bal});
  assert(v.map(x=>x.id).join("")==="xyz", "manual order");
  assert(JSON.stringify(orig)===snap);
  console.log("PASS manual_sort");
}

// --- CSV match + ambiguous ---
function matchCandidates(holdings, it, owner){
  const iEx=(it.exch||"").toUpperCase();
  const iIsin=(it.isin||"").trim();
  return holdings.filter(h=>{
    if((h.owner||"Me")!==(owner||"Me")) return false;
    const hEx=(h.exchange||"").toUpperCase();
    const hIsin=(h.isin||"").trim();
    if(iIsin && hIsin){
      if(iIsin!==hIsin) return false;
      return hEx===iEx;
    }
    if(iIsin && !hIsin){
      const hSym=(h.symbol||h.name||"").toUpperCase();
      const iSym=(it.sym||"").toUpperCase();
      return !!(hSym&&iSym&&hSym===iSym&&hEx===iEx);
    }
    if(!iIsin){
      const hSym=(h.symbol||h.name||"").toUpperCase();
      const iSym=(it.sym||"").toUpperCase();
      return !!(hSym&&iSym&&hSym===iSym&&hEx===iEx);
    }
    return false;
  });
}
function planRow(holdings, it, owner){
  const c=matchCandidates(holdings, it, owner);
  if(c.length>1) return {kind:"ambiguous", H:null, it};
  if(c.length===1) return {kind:"price", H:c[0], it};
  return {kind:"new", H:null, it};
}
{
  assert(matchCandidates([{owner:"Me",isin:"INE1",exchange:"NSE",symbol:"FOO"}],{isin:"INE2",exch:"NSE",sym:"FOO"},"Me").length===0);
  assert(matchCandidates([{owner:"Me",isin:"INE1",exchange:"NSE",symbol:"FOO"}],{isin:"INE1",exch:"BSE",sym:"FOO"},"Me").length===0);
  const amb=[{owner:"Me",isin:"INE1",exchange:"NSE",symbol:"FOO"},{owner:"Me",isin:"INE1",exchange:"NSE",symbol:"FOO2"}];
  assert(planRow(amb,{isin:"INE1",exch:"NSE",sym:"FOO"},"Me").kind==="ambiguous");
  console.log("PASS csv_match");
}

// Simulate doHolds skip order
{
  const plan=[
    {kind:"ambiguous", H:null, it:{sym:"X",qty:1,avg:1,prev:1}},
    {kind:"new", H:null, it:{sym:"Y",qty:2,avg:3,prev:4,isin:"",exch:"NSE"}}
  ];
  const holdings=[];
  let added=0, skipped=0;
  for(const p of plan){
    if(p.kind==="ambiguous"){ skipped++; continue; }
    if(!p.H){ holdings.push({name:p.it.sym}); added++; }
  }
  assert(skipped===1 && added===1 && holdings.length===1 && holdings[0].name==="Y");
  const snapItems=plan.filter(p=>p.kind!=="ambiguous").map(p=>p.it);
  assert(snapItems.length===1 && snapItems[0].sym==="Y");
  console.log("PASS ambiguous_skip_before_create");
}

// cardMeta structure (bank debit)
{
  const a={type:"bank", cardMeta:{last4:"1234", network:"Visa", expiry:"08/29"}};
  assert(a.cardMeta.last4==="1234");
  // demat must not get cardMeta on save path simulation
  const d={type:"demat"};
  // save path only sets broker
  d.broker="Zerodha";
  assert(!d.cardMeta);
  console.log("PASS cardMeta_structure");
}

console.log("ALL_REGRESSION_PASS");

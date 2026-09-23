'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element {
  constructor(){this.value='';this.checked=false;this.children=[];this.listeners={};this.dataset={};this.classList={add(){},remove(){},toggle(){}};}
  addEventListener(n,f){this.listeners[n]=f;}
  replaceChildren(...c){this.children=c;}
  append(...c){this.children.push(...c);}
  scrollIntoView(){}
}
const nodes={};
for(const m of fs.readFileSync('smart-quote.html','utf8').matchAll(/id="([^"]+)"/g)) nodes[m[1]]=new Element();
nodes.marketGroup.value='overseas';nodes.feeDiscount.value='100';nodes.feeAdjustment.value='0';
const events={};
const w={LukfookRegionConfig:require('../assets/js/region-config.js'),LukfookOverseasQuote:require('../assets/js/overseas-quote.js'),addEventListener:(n,f)=>events[n]=f};
const context={window:w,document:{getElementById:id=>nodes[id],createElement:()=>new Element(),addEventListener(){},querySelectorAll:()=>[]},navigator:{},console};
// Expose internal UI handlers in an isolated test copy only.
const src=fs.readFileSync('assets/js/smart-quote.js','utf8').replace('const api = { parseQrPayload','const api = { applyScannedData, buildSummary, buildCustomerDisplay, clearItemData, render, parseQrPayload');
vm.runInNewContext(src,context);events.DOMContentLoaded();
const text=e=>[e.textContent||'',...e.children.map(text)].join(' ');
(async()=>{
  nodes.overseasRegion.value='US';nodes.overseasRegion.listeners.change();
  nodes.overseasStore.value='US6';nodes.overseasStore.listeners.change();nodes.goldstarPrice.value='200';
  await w.LukfookSmartQuote.applyScannedData('ITEM/MODEL/10/STYLE/SUP/DATE/300');
  assert.equal(nodes.goldstarPrice.value,'200');
  nodes.manualFeeOverride.checked=true;nodes.finalLaborFee.value='100';
  assert.match(w.LukfookSmartQuote.buildSummary(),/2,310.00/);
  assert.equal(nodes.results.children.length,1,'No automatic 95% quote');
  nodes.full95Enabled.checked=true;nodes.full95Enabled.listeners.change();
  assert.equal(nodes.finalLaborFee.value,'300','95% restores full QR fee');
  assert.equal(nodes.feeDiscount.disabled,true);
  assert.match(w.LukfookSmartQuote.buildSummary(),/2,403.50/);
  w.LukfookSmartQuote.buildCustomerDisplay();
  assert.match(text(nodes.customerPriceInfo),/200.00 \/ g/);
  assert.match(text(nodes.customerResults),/2,403.50/);
  assert.match(text(nodes.customerResults),/218.50/);
  nodes.full95Enabled.checked=false;nodes.full95Enabled.listeners.change();
  assert.equal(nodes.feeDiscount.disabled,false);
  nodes.manualFeeOverride.checked=true;nodes.finalLaborFee.value='50';
  assert.match(w.LukfookSmartQuote.buildSummary(),/2,255.00/);
  w.LukfookSmartQuote.clearItemData();assert.equal(nodes.goldstarPrice.value,'200');
  nodes.overseasStore.value='US5';nodes.overseasStore.listeners.change();assert.equal(nodes.goldstarPrice.value,'','Changing stores clears price');
  console.log('overseas integration tests passed');
})().catch(e=>{console.error(e);process.exitCode=1;});

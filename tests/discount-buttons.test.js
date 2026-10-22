'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
class Element {
  constructor(){this.value='';this.checked=false;this.children=[];this.listeners={};this.dataset={};this.classList={add(){},remove(){},toggle(){}};}
  addEventListener(n,f){this.listeners[n]=f;}
  replaceChildren(...c){this.children=c;}
  append(...c){this.children.push(...c);}
  scrollIntoView(){}
  setAttribute(n,v){this[n]=v;}
}
const nodes={};
for(const m of fs.readFileSync('smart-quote.html','utf8').matchAll(/id="([^"]+)"/g)) nodes[m[1]]=new Element();
nodes.marketGroup.value='overseas';nodes.feeDiscount.value='100';nodes.feeAdjustment.value='0';
const feeButtons=['100','80','50','30'].map(v=>{const b=new Element();b.dataset.feePercent=v;return b});
const offerButtons=['regular','fee80','halfFee','fee30','full95'].map(v=>{const b=new Element();b.dataset.domesticOffer=v;return b});
const events={};
const w={LukfookRegionConfig:require('../assets/js/region-config.js'),LukfookOverseasQuote:require('../assets/js/overseas-quote.js'),addEventListener:(n,f)=>events[n]=f};
const context={window:w,document:{getElementById:id=>nodes[id],createElement:()=>new Element(),addEventListener(){},querySelectorAll:s=>s==='[data-fee-percent]'?feeButtons:s==='[data-domestic-offer]'?offerButtons:[]},navigator:{},console};
// Expose internal UI handlers in an isolated test copy only.
const src=fs.readFileSync('assets/js/smart-quote.js','utf8').replace('const api = { parseQrPayload','const api = { applyScannedData, buildSummary, buildCustomerDisplay, clearItemData, render, parseQrPayload');
vm.runInNewContext(src.replace('async function fetchPrice() {', 'async function fetchPrice() { return;'),context);events.DOMContentLoaded();
const text=e=>[e.textContent||'',...e.children.map(text)].join(' ');
(async()=>{
 nodes.overseasRegion.value='AU';nodes.overseasRegion.listeners.change();nodes.overseasStore.value='AU9';nodes.overseasStore.listeners.change();nodes.goldstarPrice.value='200';
 await w.LukfookSmartQuote.applyScannedData('I/M/10/X/X/X/100');
 for(const [i,fee] of [[1,80],[2,50],[3,30]]){feeButtons[i].listeners.click();assert.equal(nodes.finalLaborFee.value,String(fee));assert.equal(feeButtons[i]['aria-pressed'],'true');assert.match(w.LukfookSmartQuote.buildSummary(),new RegExp('2,'+(200+fee)+'.00'));}
 nodes.full95Enabled.checked=true;nodes.full95Enabled.listeners.change();assert(feeButtons.every(b=>b.disabled));feeButtons[3].listeners.click();assert.equal(nodes.finalLaborFee.value,'100');
 nodes.marketGroup.value='hk';nodes.marketGroup.listeners.change();nodes.sellPrice.value='200';nodes.priceUnit.value='gram';
 for(const market of ['hk','mo']){nodes.marketGroup.value=market;
 for(const [i,total] of [[1,2121.6],[2,2091],[3,2070.6],[4,2034.9]]){offerButtons[i].listeners.click();const q=w.LukfookSmartQuote.render()[0];assert(Math.abs(q.amount-total)<0.001);assert.equal(offerButtons[i]['aria-pressed'],'true');}}
 console.log('discount button and HK/MO commission tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});

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
const src=fs.readFileSync('assets/js/smart-quote.js','utf8').replace('const api = { parseQrPayload','const api = { scanFile, applyScannedData, buildSummary, buildCustomerDisplay, clearItemData, render, parseQrPayload');
vm.runInNewContext(src,context);events.DOMContentLoaded();
const text=e=>[e.textContent||'',...e.children.map(text)].join(' ');
(async()=>{
  const api=w.LukfookSmartQuote;
  w.LukfookPhotoQr={decodePhoto:async()=> 'ITEM/MODEL/10/STYLE/SUP/DATE/300'};
  await api.scanFile({});
  assert.equal(nodes.itemNo.value,'ITEM');assert.equal(nodes.weight.value,'10');
  assert.equal(nodes.qrFile.disabled,false);assert.equal(nodes.startButton.disabled,false);
  w.LukfookPhotoQr.decodePhoto=async()=> 'invalid QR';
  await api.scanFile({});assert.match(nodes.scanStatus.textContent,/資料不完整/);
  assert.equal(nodes.itemNo.value,'ITEM','invalid payload preserves previous product');
  w.LukfookPhotoQr.decodePhoto=async()=>{throw Error('未能開啟此照片格式')};
  await api.scanFile({});assert.match(nodes.scanStatus.textContent,/照片格式/);
  assert.equal(nodes.qrFile.disabled,false);assert.equal(nodes.qrFile.value,'');
  let finish,calls=0;
  w.LukfookPhotoQr.decodePhoto=()=>{calls++;return new Promise(r=>finish=r)};
  const pending=api.scanFile({});await new Promise(setImmediate);
  assert.equal(nodes.startButton.disabled,true);assert.equal(nodes.qrFile.disabled,true);
  await api.scanFile({});assert.equal(calls,1);
  finish('NEXT/MODEL/12/STYLE/SUP/DATE/0');await pending;
  assert.equal(nodes.itemNo.value,'NEXT');assert.equal(nodes.laborFee.value,'0');
  assert.equal(nodes.clearButton.disabled,false);
  delete w.LukfookPhotoQr;await api.scanFile({});
  assert.match(nodes.scanStatus.textContent,/重新整理/);assert.equal(nodes.qrFile.disabled,false);
  console.log('photo upload lifecycle tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});

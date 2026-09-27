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
const context={window:w,document:{getElementById:id=>nodes[id],createElement:()=>new Element(),addEventListener(){},querySelectorAll:()=>[]},navigator:{mediaDevices:{getUserMedia(){}}},console};
// Expose internal UI handlers in an isolated test copy only.
const src=fs.readFileSync('assets/js/smart-quote.js','utf8').replace('const api = { parseQrPayload','const api = { startScanner, stopScanner, applyScannedData, buildSummary, buildCustomerDisplay, clearItemData, render, parseQrPayload');
vm.runInNewContext(src,context);events.DOMContentLoaded();
const text=e=>[e.textContent||'',...e.children.map(text)].join(' ');
(async()=>{
  w.isSecureContext=true;
  const api=w.LukfookSmartQuote;
  let calls=0,options=[];
  w.Html5Qrcode=class {async start(camera,config){calls++;options.push(config);if(calls===1)throw {name:'OverconstrainedError'};}async stop(){} clear(){}};
  await api.startScanner();assert.equal(calls,2);assert.equal(nodes.cameraFallback.hidden,true);
  assert.equal(options[0].videoConstraints.facingMode.ideal,'environment');
  assert.equal(options[1].videoConstraints.facingMode,undefined);
  assert.equal(nodes.startButton.disabled,true);await api.stopScanner();
  calls=0;
  w.Html5Qrcode=class {async start(){calls++;throw {name:'NotAllowedError'};}async stop(){} clear(){}};
  await api.startScanner();assert.equal(calls,1,'Do not repeat denied permissions');
  assert.equal(nodes.cameraFallback.hidden,false);assert.match(nodes.scanStatus.textContent,/拍照掃碼/);
  assert.equal(nodes.startButton.disabled,false);
  w.Html5Qrcode=class {constructor(){throw Error('initialization failure')}};
  await api.startScanner();assert.equal(nodes.startButton.disabled,false);assert.equal(nodes.cameraFallback.hidden,false);
  delete w.Html5Qrcode;await api.startScanner();assert.equal(nodes.cameraFallback.hidden,false);
  let complete;
  w.Html5Qrcode=class {start(){return new Promise(r=>complete=r)}async stop(){}clear(){}};
  const pending=api.startScanner();await api.stopScanner();complete();await pending;
  assert.equal(nodes.startButton.disabled,false,'Cancel during camera startup');
  w.LukfookPhotoQr={decodePhoto:async()=> 'PHOTO/MODEL/5/X/X/X/100'};
  await nodes.cameraFile.listeners.change({target:{files:[{}]}});
  assert.equal(nodes.itemNo.value,'PHOTO');assert.equal(nodes.cameraFile.value,'');
  assert.equal(nodes.cameraFile.disabled,false);
  console.log('camera fallback tests passed');
})().catch(e=>{console.error(e);process.exitCode=1});

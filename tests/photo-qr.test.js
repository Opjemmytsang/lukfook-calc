'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const jsQR=require('../assets/vendor/jsQR-1.4.0.js');
const matrix=require('./fixtures/product-qr.json');
function pixels({rotate=false,invert=false}={}) {
  const width=matrix.length*6,data=new Uint8ClampedArray(width*width*4);
  for(let y=0;y<width;y++)for(let x=0;x<width;x++) {
    const row=Math.floor(y/6),col=Math.floor(x/6);
    const dark=rotate?matrix[matrix.length-1-col][row]:matrix[row][col];
    const v=(invert?!dark:dark)?0:255,i=(y*width+x)*4;
    data.set([v,v,v,255],i);
  }
  return {data,width,height:width};
}
const source=fs.readFileSync('assets/js/photo-qr.js','utf8');
async function run({rotate=false,invert=false,invalid=false,blank=false,crop=false}={}) {
  let revoked=0,attempts=0;const sizes=[];
  const canvas={width:0,height:0,getContext:()=>({fillRect(){},drawImage(){sizes.push([canvas.width,canvas.height])},getImageData(){
    attempts++;
    if(blank || (crop && attempts<4)) return {data:new Uint8ClampedArray(400).fill(255),width:10,height:10};
    return pixels({rotate,invert});
  }})};
  class Image {constructor(){this.naturalWidth=8064;this.naturalHeight=6048;}set src(v){queueMicrotask(()=>invalid?this.onerror():this.onload());}}
  const window={jsQR};
  vm.runInNewContext(source,{window,Image,URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){revoked++}},document:{createElement:()=>canvas},setTimeout,clearTimeout});
  try {
    const result=await window.LukfookPhotoQr.decodePhoto({});
    assert.equal(result,'ITEM/MODEL/10/STYLE/SUP/DATE/300');
    if(crop)assert.equal(attempts,4);
  } finally {
    assert.equal(revoked,1);assert.equal(canvas.width,0);
    assert(sizes.every(([w,h])=>w<=1600&&h<=1600));
  }
}
(async()=>{
  await run();await run({rotate:true});await run({invert:true});await run({crop:true});
  await assert.rejects(run({invalid:true}),/JPG、PNG/);
  await assert.rejects(run({blank:true}),/未能辨識 QR Code/);
  console.log('photo decoder tests passed (real QR pixels, rotated/inverted, crops, cleanup, canvas bounds)');
})().catch(e=>{console.error(e);process.exitCode=1});

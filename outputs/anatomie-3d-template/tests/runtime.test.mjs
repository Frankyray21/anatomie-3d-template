import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as Three from '../vendor/three.module.js';
import {GLTFLoader} from '../vendor/examples/jsm/loaders/GLTFLoader.js';
import * as helpers from '../src/viewer-state.mjs';
const root = new URL('../',import.meta.url);
const source = readFileSync(new URL('src/app.js',root),'utf8').replace(/^import .*;\r?\n/gm,'');
const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

// Exercise the real module with actual GLB decoding and Three scene objects,
// substituting only DOM events, the frame scheduler and GPU output (no browser QA).
class Element {
  constructor() {this.hidden=false;this.value='';this.textContent='';this.attributes={};this.style={};this.children=[];this.events={};this.parts={};this.clientWidth=390;this.clientHeight=500;this.checked=false;this.dataset={};this.classList={add(){},remove(){}};}
  addEventListener(name,callback){(this.events[name]??=[]).push(callback);}
  dispatch(name,event={}){for(const callback of this.events[name]||[])callback({target:this,preventDefault(){},...event});}
  setAttribute(name,value){this.attributes[name]=value;}
  querySelector(selector){return this.parts[selector]??=new Element();}
  querySelectorAll(){return this.children;}
  append(node){this.children.push(node);}
  replaceChildren(...nodes){this.children=nodes;}
  getBoundingClientRect(){return {left:0,top:0,width:this.clientWidth,height:this.clientHeight};}
  closest(){return this;}
}
async function harness({failSkin=false}={}) {
  const nodes=new Map();
  const get=selector=>{if(!nodes.has(selector))nodes.set(selector,new Element());return nodes.get(selector);};
  const stages=Array.from({length:4},(_,index)=>{const node=new Element();node.dataset.stage=String(index);return node;});
  get('#stageNav').children=stages;
  get('#viewerTools').children=['#rotateToggle','#tourToggle','#resetView'].map(get);
  const doc=new Element();
  doc.hidden=false;
  doc.querySelector=get;
  doc.querySelectorAll=()=>stages;
  doc.createElement=()=>new Element();
  const win=new Element();
  const motion=new Element();motion.matches=false;
  const screen=new Element();screen.matches=true;
  const frames=new Map();let frameIndex=0;let renders=0;let renderer;let controls;let resizeObserver;
  class Renderer {constructor(){renderer=this;}setPixelRatio(){}setSize(){}render(){renders++;}}
  class Controls extends Three.EventDispatcher {constructor(camera){super();this.target=new Three.Vector3();this.camera=camera;controls=this;}update(){}}
  class Observer {constructor(callback){this.callback=callback;resizeObserver=this;}observe(){}}
  const requests=[];
  const fetch=async path=>{
    requests.push(path);
    if(failSkin&&path.endsWith('skin.glb')){failSkin=false;return {ok:false,status:503};}
    const bytes=readFileSync(new URL(path,root));
    return {ok:true,json:async()=>JSON.parse(bytes),arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
  };
  const context={THREE:{...Three,WebGLRenderer:Renderer},OrbitControls:Controls,GLTFLoader,...helpers,document:doc,window:win,matchMedia:query=>query.includes('reduced-motion')?motion:screen,devicePixelRatio:2,requestAnimationFrame:cb=>{frames.set(++frameIndex,cb);return frameIndex;},cancelAnimationFrame:id=>frames.delete(id),ResizeObserver:Observer,fetch,location:{href:'http://localhost:4173/'},console:{warn(){}}};
  await new AsyncFunction(...Object.keys(context),source)(...Object.values(context));
  const flush=async()=>{for(let index=0;index<8;index++)await new Promise(resolve=>setImmediate(resolve));};
  await flush();
  const frame=now=>{const work=[...frames.values()];frames.clear();work.forEach(callback=>callback(now));};
  return {get,doc,win,frames,requests,frame,flush,controls,resizeObserver,get renders(){return renders;}};
}
test('real module boots with two requested layers and idles without a render loop',async()=>{
  const app=await harness();
  assert.equal(app.requests.filter(path=>path.endsWith('.glb')).length,2);
  assert.equal(app.get('#loadingState').hidden,true);
  app.frame(0);
  assert.equal(app.renders,1);
  assert.equal(app.frames.size,0);
  app.get('#rotateToggle').dispatch('click');
  app.frame(16);app.frame(32);
  assert.equal(app.frames.size,1);
  assert.equal(app.get('#rotateToggle').attributes['aria-pressed'],'true');
  app.get('#rotateToggle').dispatch('click');app.frame(48);
  assert.equal(app.frames.size,0);
});
test('resizing preserves animation and camera direction; manual settings pause it',async()=>{
  const app=await harness();
  app.get('#rotateToggle').dispatch('click');
  app.controls.camera.position.set(2,1,7);
  const direction=app.controls.camera.position.clone().normalize();
  app.get('#sceneStage').clientHeight=350;
  app.resizeObserver.callback();
  assert.equal(app.get('#rotateToggle').attributes['aria-pressed'],'true');
  assert.ok(app.controls.camera.position.clone().normalize().distanceTo(direction)<1e-10);
  app.get('#opacitySlider').value='.55';app.get('#opacitySlider').dispatch('input');
  assert.equal(app.get('#rotateToggle').attributes['aria-pressed'],'false');
  app.frame(10);app.frame(1000);
  assert.equal(app.get('#opacitySlider').value,'.55');
});
test('reference mode suspends local frames and unmounts its iframe on return',async()=>{
  const app=await harness();
  app.get('#rotateToggle').dispatch('click');
  app.get('#realisticToggle').dispatch('click');
  assert.equal(app.frames.size,0);
  assert.equal(app.get('#referenceHost').children.length,1);
  assert.equal(app.get('#resetView').disabled,true);
  app.get('#bodyAtlasToggle').dispatch('click');
  assert.equal(app.get('#referenceHost').children.length,0);
  assert.equal(app.get('#resetView').disabled,false);
  assert.equal(app.frames.size,1);
});
test('failed initial skin can retry and still load the selected skeleton',async()=>{
  const app=await harness({failSkin:true});
  assert.equal(app.get('#loadingState').hidden,false);
  assert.equal(app.get('#retryLayers').hidden,false);
  app.get('#retryLayers').dispatch('click');
  await app.flush();
  assert.equal(app.requests.filter(path=>path.endsWith('skin.glb')).length,2);
  assert.equal(app.requests.filter(path=>path.endsWith('skeleton.glb')).length,1);
  assert.equal(app.get('#loadingState').hidden,true);
});
test('background tabs stop frames and guided waiting does not repaint unchanged geometry',async()=>{
  const app=await harness();app.frame(0);
  app.get('#tourToggle').dispatch('click');app.frame(16);
  const before=app.renders;app.frame(32);app.frame(48);
  assert.equal(app.renders,before);
  app.doc.hidden=true;app.doc.dispatch('visibilitychange');
  assert.equal(app.frames.size,0);
  app.doc.hidden=false;app.doc.dispatch('visibilitychange');
  assert.equal(app.frames.size,1);
  app.get('#tourToggle').dispatch('click');
});

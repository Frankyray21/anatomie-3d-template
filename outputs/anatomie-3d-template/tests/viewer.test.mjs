import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {STAGES,fitDistance,frameDelta,advanceTour,isEffectivelyVisible} from '../src/viewer-state.mjs';
import {GLTFLoader} from '../vendor/examples/jsm/loaders/GLTFLoader.js';
import * as THREE from '../vendor/three.module.js';
const root = new URL('../',import.meta.url);
const read = file=>readFileSync(new URL(file,root),'utf8');
const manifest = JSON.parse(read('assets/anatomy-manifest.json'));
const report = JSON.parse(read('assets/bodyparts3d/CONVERSION-REPORT.json'));

test('whole-body sphere fits portrait, landscape and resized control layouts',()=>{
  for(const aspect of [.25,.5,.75,1,1.5,3]) {
    const distance=fitDistance(2,42,aspect);
    const vertical=42*Math.PI/360;
    const horizontal=Math.atan(Math.tan(vertical)*aspect);
    assert.ok(distance*Math.sin(vertical)>2);
    assert.ok(distance*Math.sin(horizontal)>2);
  }
  assert.ok(fitDistance(2,42,.5)>fitDistance(2,42,1));
});
test('animation has a single frame delta, clamps stalls and resumes without a jump',()=>{
  assert.equal(frameDelta(null,10000),0);
  assert.equal(frameDelta(1000,1016),.016);
  assert.equal(frameDelta(1000,11000),.05);
  assert.equal(frameDelta(1000,900),0);
  const distance=fps=>Array.from({length:fps*2},(_,i)=>frameDelta(i*1000/fps,(i+1)*1000/fps)).reduce((a,b)=>a+b,0);
  assert.ok(Math.abs(distance(30)-distance(60))<1e-10);
});
test('guided tour waits for actual layers and advances without skipping stages',()=>{
  assert.deepEqual(advanceTour(8.99,.05,1,false),{elapsed:8.99,advance:false});
  assert.deepEqual(advanceTour(8.99,.05,1,true),{elapsed:0,advance:true});
  assert.equal(advanceTour(1,.05,2,true).elapsed,1.1);
  assert.deepEqual(STAGES[0].layers,['skin','skeleton']);
  for(const stage of STAGES) for(const layer of stage.layers) assert.ok(manifest.assets.some(asset=>asset.layer===layer));
});
test('picking ignores hidden meshes and hidden ancestors',()=>{
  assert.ok(isEffectivelyVisible({visible:true,parent:{visible:true,parent:null}}));
  assert.equal(isEffectivelyVisible({visible:true,parent:{visible:false,parent:null}}),false);
});
test('local GLBs preserve all triangles, coordinates, normals and source files',async()=>{
  let totalBytes=0;
  for(const asset of manifest.assets) {
    assert.equal(asset.type,'glb');
    const bytes=readFileSync(new URL(asset.path,root));
    const layer=report.layers.find(layer=>asset.path.endsWith(layer.output));
    assert.ok(layer);
    assert.equal(createHash('sha256').update(bytes).digest('hex'),layer.outputSHA256);
    assert.equal(createHash('sha256').update(readFileSync(new URL('assets/bodyparts3d/'+layer.source,root))).digest('hex'),layer.sourceSHA256);
    for(const [key,value] of Object.entries(layer.verification)) assert.equal(value,true,key);
    assert.equal(bytes.readUInt32LE(0),0x46546c67);
    assert.equal(bytes.readUInt32LE(8),bytes.length);
    const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const meshes=[];gltf.scene.traverse(mesh=>{if(mesh.isMesh)meshes.push(mesh);});
    assert.equal(meshes.length,1);
    assert.equal(meshes[0].geometry.index.count/3,layer.trianglesBefore);
    const box=new THREE.Box3().setFromObject(gltf.scene);
    assert.deepEqual(box.min.toArray(),layer.boundsBefore.min);
    assert.deepEqual(box.max.toArray(),layer.boundsBefore.max);
    totalBytes+=statSync(new URL(asset.path,root)).size;
  }
  assert.equal(totalBytes,50327836);
  assert.ok(totalBytes<report.totals.sourceBytes*.33);
});
test('app launches only the local viewer, no background iframe or procedural fallback',()=>{
  const html=read('index.html');
  assert.doesNotMatch(html,/<iframe|<script[^>]*sketchfab|fallbackScene|scroll-story/);
  assert.equal((html.match(/<canvas\b/g)||[]).length,1);
  assert.ok(html.includes('id="bodyAtlasToggle" type="button" aria-pressed="true"'));
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(new Set(ids).size,ids.length);
  for(const match of html.matchAll(/(?:aria-labelledby|for)="([^"]+)"/g)) assert.ok(ids.includes(match[1]),match[1]);
  for(const match of html.matchAll(/(?:src|href)="(\.\/[^"?]+)(?:\?[^" ]*)?"/g)) assert.ok(statSync(new URL(match[1],root)).size>0);
});
test('render lifecycle preserves manual settings and avoids idle GPU redraws',()=>{
  const app=read('src/app.js');
  assert.ok(app.includes("rotate:false,tour:false"));
  assert.ok(app.includes("if(document.hidden || state.mode!=='local' || contextLost)"));
  assert.ok(app.includes('if(needsRender || state.rotate)'));
  assert.doesNotMatch(app,/getElapsedTime|new THREE.Clock|setAnimationLoop|buildScanPlane/);
  const render=app.slice(app.indexOf('function render('),app.indexOf('function pick('));
  assert.doesNotMatch(render,/state\.(separation|opacity)\s*=|camera\.position/);
  const resize=app.slice(app.indexOf('function resize('),app.indexOf('function updateRecord('));
  assert.doesNotMatch(resize,/resetCamera\(|pauseMotion\(/);
  assert.ok(app.includes("if(layer==='skin' && record.status==='ready' && state.mode==='local') desired.forEach"));
});
test('compact layout keeps the viewport separate from controls with accessible targets',()=>{
  const css=read('styles.css');
  assert.ok(css.includes('min-height:44px'));
  assert.ok(css.includes('grid-template-rows:minmax(0,1fr) auto'));
  assert.ok(css.includes('height:100svh'));
  assert.ok(css.includes('prefers-reduced-motion:reduce'));
  assert.ok(css.includes('env(safe-area-inset-bottom)'));
  assert.doesNotMatch(css,/min-height:\s*5\d\d(?:s?vh)/);
});

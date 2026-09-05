import * as THREE from '../vendor/three.module.js';
import { OrbitControls } from '../vendor/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from '../vendor/examples/jsm/loaders/GLTFLoader.js';
import { STAGES,fitDistance,frameDelta,advanceTour,isEffectivelyVisible } from './viewer-state.mjs';

const $ = selector => document.querySelector(selector);
const canvas = $('#scene');
const viewport = $('#sceneStage');
const reducedMotion = matchMedia('(prefers-reduced-motion:reduce)');
const compact = matchMedia('(max-width:900px)');
const state = {mode:'local',rotate:false,tour:false,stage:0,tourElapsed:0,speed:.75,separation:0,opacity:.9};
const offsets = {skin:[.4,0,0],skeleton:[-.2,0,0],muscles:[.15,0,.1],tendons:[.25,0,.18],nerves:[-.12,0,.22],vessels:[-.28,0,-.18]};
const names = {skin:'Peau',skeleton:'Os',muscles:'Muscles',tendons:'Tendons',nerves:'Nerfs',vessels:'Vaisseaux'};
const desired = new Set(STAGES[0].layers);
const records = new Map();
let queue = Promise.resolve();
let normalizer = null;
let modelRadius = 1.9;
let frameId = null;
let needsRender = true;
let previousTime = null;
let contextLost = false;
let pointerStart = null;
let pendingReference = null;
let referenceTimer = null;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#111214');
const root = new THREE.Group();
scene.add(root);
scene.add(new THREE.HemisphereLight('#ffffff','#34313a',2.2));
const keyLight = new THREE.DirectionalLight('#fff5ed',2.4);
keyLight.position.set(3,4,5);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight('#b8cee8',1.5);
rimLight.position.set(-3,1,-3);
scene.add(rimLight);
const renderer = new THREE.WebGLRenderer({canvas,antialias:!compact.matches,powerPreference:'default'});
renderer.outputColorSpace = THREE.SRGBColorSpace;
const camera = new THREE.PerspectiveCamera(42,1,.01,100);
const controls = new OrbitControls(camera,canvas);
controls.enableDamping = true;
controls.dampingFactor = .1;
controls.enablePan = false;
controls.enableZoom = true;
controls.rotateSpeed = .6;
controls.zoomSpeed = .7;
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function setError(message, blocking=false) {
  $('#sourceStatus').textContent = message;
  if(!blocking) return;
  $('#loadingState').hidden = false;
  $('#loadingState').classList.add('is-error');
  $('#loadingMessage').textContent = message;
  $('#startupRetry').hidden = false;
}
function invalidate() {
  needsRender = true;
  scheduleFrame();
}
function scheduleFrame() {
  if(frameId !== null || document.hidden || state.mode !== 'local' || contextLost) return;
  frameId = requestAnimationFrame(render);
}
function stopFrame() {
  if(frameId !== null) cancelAnimationFrame(frameId);
  frameId = null;
  previousTime = null;
}
function syncMotionButtons() {
  $('#rotateToggle').setAttribute('aria-pressed',String(state.rotate));
  $('#rotateToggle').innerHTML = state.rotate ? '<span aria-hidden="true">Ⅱ</span> Pause' : '<span aria-hidden="true">↻</span> Rotation';
  $('#tourToggle').setAttribute('aria-pressed',String(state.tour));
  $('#tourToggle').innerHTML = state.tour ? '<span aria-hidden="true">Ⅱ</span> Arrêter' : '<span aria-hidden="true">▷</span> Parcours';
}
function pauseMotion() {
  state.rotate = false;
  state.tour = false;
  state.tourElapsed = 0;
  previousTime = null;
  syncMotionButtons();
  invalidate();
}
function resetCamera() {
  pauseMotion();
  root.rotation.set(0,0,0);
  const distance = fitDistance(modelRadius + state.separation*.5,camera.fov,camera.aspect);
  camera.position.set(0,.04,distance);
  controls.target.set(0,0,0);
  controls.minDistance = Math.max(.8,modelRadius*.65);
  controls.maxDistance = distance*3;
  controls.update();
  invalidate();
}
function resize() {
  const radius = modelRadius + state.separation*.5;
  const previousFit = fitDistance(radius,camera.fov,camera.aspect);
  const width = Math.max(1,viewport.clientWidth);
  const height = Math.max(1,viewport.clientHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,compact.matches ? 1.25 : 1.75));
  renderer.setSize(width,height,false);
  camera.aspect = width/height;
  camera.updateProjectionMatrix();
  const nextFit = fitDistance(radius,camera.fov,camera.aspect);
  if(camera.position.distanceToSquared(controls.target)<.01) camera.position.set(0,0,nextFit);
  else camera.position.sub(controls.target).multiplyScalar(nextFit/previousFit).add(controls.target);
  controls.minDistance = Math.max(.8,modelRadius*.65);
  controls.maxDistance = nextFit*3;
  controls.update();
  invalidate();
}
function updateRecord(record) {
  record.group.visible = desired.has(record.asset.layer);
  record.group.position.fromArray(offsets[record.asset.layer]).multiplyScalar(state.separation);
  if(record.material) {
    record.material.opacity = (record.asset.layer==='skin' ? .24 : record.asset.opacity ?? 1)*state.opacity;
    record.material.transparent = record.material.opacity < .995;
    record.material.depthWrite = record.asset.layer !== 'skin';
  }
  record.input.checked = desired.has(record.asset.layer);
  record.label.textContent = record.status === 'loading' ? 'Chargement…' : record.status === 'error' ? 'Échec · réessayer' : '';
}
function updateStatus() {
  const list = [...records.values()];
  $('#retryLayers').hidden = !list.some(record=>record.status==='error');
  if(state.mode !== 'local' || contextLost) return;
  const loading = list.filter(record=>record.status==='loading');
  const errors = list.filter(record=>record.status==='error'&&desired.has(record.asset.layer));
  const visibleReady = list.some(record=>record.status==='ready'&&desired.has(record.asset.layer));
  $('#sourceStatus').textContent = loading.length ? 'Chargement : '+loading.map(record=>names[record.asset.layer]).join(', ') : errors.length ? 'Certaines couches sont indisponibles. Vous pouvez réessayer.' : 'Atlas local · BodyParts3D';
  if(visibleReady || desired.size===0) $('#loadingState').hidden = true;
  else if(errors.length) setError('Les couches demandées n’ont pas pu être chargées. Réessayez dans Couches et réglages.',true);
  else {
    $('#loadingState').hidden = false;
    $('#loadingState').classList.remove('is-error');
    $('#startupRetry').hidden = true;
    $('#loadingMessage').textContent = 'Chargement des couches anatomiques…';
  }
}
function applyLayers() {
  records.forEach(updateRecord);
  updateStatus();
  invalidate();
}
function prepareObject(object,asset) {
  object.rotation.fromArray(asset.rotation || [0,0,0]);
  object.scale.setScalar(asset.scale || 1);
  object.updateMatrixWorld(true);
  if(!normalizer) {
    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    if(box.isEmpty() || size.y<=0) throw new Error('Modèle anatomique vide.');
    normalizer = {center:box.getCenter(new THREE.Vector3()),scale:3.35/size.y};
    modelRadius = size.length()*normalizer.scale/2;
  }
  const content = new THREE.Group();
  content.add(object);
  content.scale.setScalar(normalizer.scale);
  content.position.copy(normalizer.center).multiplyScalar(-normalizer.scale);
  return content;
}
async function ensureLayer(layer) {
  const record = records.get(layer);
  if(!record || record.status==='ready') return;
  if(record.promise) return record.promise;
  record.status = 'loading';
  updateRecord(record);
  updateStatus();
  const job = queue.then(async()=>{
    if(state.mode!=='local' || (!normalizer && layer!=='skin') || (!desired.has(layer) && layer!=='skin')) { record.status='idle'; return; }
    const response = await fetch(record.asset.path);
    if(!response.ok) throw new Error('HTTP '+response.status);
    const bytes = await response.arrayBuffer();
    const gltf = await new GLTFLoader().parseAsync(bytes,new URL('.',location.href).href);
    const material = new THREE.MeshStandardMaterial({color:record.asset.color,roughness:.76,metalness:0,transparent:true});
    gltf.scene.traverse(mesh=>{
      if(!mesh.isMesh) return;
      mesh.material.dispose();
      mesh.material = material;
      mesh.userData.layer = layer;
    });
    const first = !normalizer;
    record.group.add(prepareObject(gltf.scene,record.asset));
    record.material = material;
    record.status = 'ready';
    if(first) resetCamera();
  }).catch(error=>{
    console.warn('Couche indisponible : '+layer,error);
    record.status = 'error';
    if(state.tour) pauseMotion();
  }).finally(()=>{
    record.promise = null;
    updateRecord(record);
    updateStatus();
    if(layer==='skin' && record.status==='ready' && state.mode==='local') desired.forEach(key=>ensureLayer(key));
    invalidate();
  });
  record.promise = job;
  queue = job;
  return job;
}
function stageReady() {
  return [...desired].every(layer=>records.get(layer)?.status==='ready');
}
function selectStage(index,manual=true) {
  if(manual) pauseMotion();
  state.stage = index;
  state.tourElapsed = 0;
  desired.clear();
  STAGES[index].layers.forEach(layer=>desired.add(layer));
  document.querySelectorAll('[data-stage]').forEach(button=>button.setAttribute('aria-pressed',String(Number(button.dataset.stage)===index)));
  $('#selectionSummary').textContent = STAGES[index].label;
  applyLayers();
  desired.forEach(layer=>ensureLayer(layer));
}
function render(now) {
  frameId = null;
  if(document.hidden || state.mode!=='local' || contextLost) { previousTime=null; return; }
  const delta = frameDelta(previousTime,now);
  previousTime = now;
  if(state.rotate) root.rotation.y = (root.rotation.y + delta*.3*state.speed) % (Math.PI*2);
  if(state.tour) {
    const tick = advanceTour(state.tourElapsed,delta,state.speed,stageReady());
    state.tourElapsed = tick.elapsed;
    if(tick.advance) selectStage((state.stage+1)%STAGES.length,false);
  }
  controls.update();
  if(needsRender || state.rotate) {
    renderer.render(scene,camera);
    needsRender = false;
  }
  if(state.rotate || state.tour) scheduleFrame();
  else if(frameId===null) previousTime=null;
}
function pick(event) {
  if(!pointerStart || Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y)>8) return;
  if(event.target!==canvas || state.mode!=='local') return;
  const rect = canvas.getBoundingClientRect();
  pointer.set((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1);
  raycaster.setFromCamera(pointer,camera);
  const hits = raycaster.intersectObject(root,true).filter(hit=>isEffectivelyVisible(hit.object));
  const hit = hits.find(hit=>hit.object.userData.layer!=='skin') || hits[0];
  if(!hit) return;
  const record = records.get(hit.object.userData.layer);
  $('#selectedName').textContent = names[record.asset.layer];
  $('#selectedSystem').textContent = record.asset.name;
  $('#selectedNote').textContent = record.asset.note;
  $('#selectionSummary').textContent = names[record.asset.layer]+' · détails dans Couches et réglages';
}
function setMode(mode) {
  if(state.mode===mode) return;
  pauseMotion();
  stopFrame();
  state.mode = mode;
  $('#bodyAtlasToggle').setAttribute('aria-pressed',String(mode==='local'));
  $('#realisticToggle').setAttribute('aria-pressed',String(mode==='reference'));
  $('#localControls').hidden = mode!=='local';
  $('#referenceHost').hidden = mode!=='reference';
  $('#referenceNote').hidden = mode!=='reference';
  $('#scene').hidden = mode!=='local';
  $('#viewerTools').querySelectorAll('button').forEach(button=>{button.disabled=mode!=='local';});
  $('#stageNav').querySelectorAll('button').forEach(button=>{button.disabled=mode!=='local';});
  clearTimeout(referenceTimer);
  pendingReference = null;
  $('#referenceHost').replaceChildren();
  if(mode==='reference') {
    $('#loadingState').hidden = true;
    $('#sourceStatus').textContent = 'Chargement de la référence externe…';
    $('#selectionSummary').textContent = 'Écorché : commandes intégrées au modèle';
    const iframe = document.createElement('iframe');
    pendingReference = iframe;
    iframe.title = 'Écorché — Anatomy study, Beatriz Gomez Santamaria';
    iframe.allow = 'fullscreen; xr-spatial-tracking';
    iframe.allowFullscreen = true;
    iframe.src = 'https://sketchfab.com/models/e402d3d541eb4b199c57d5410f5d3c57/embed?autostart=1&ui_infos=1&ui_controls=1&ui_hint=1';
    iframe.addEventListener('load',()=>{
      if(pendingReference!==iframe) return;
      clearTimeout(referenceTimer);
      $('#sourceStatus').textContent = 'Référence externe · Sketchfab';
    });
    referenceTimer = setTimeout(()=>{
      if(pendingReference===iframe) $('#sourceStatus').textContent = 'La référence prend du temps. Vous pouvez revenir à l’atlas local.';
    },15000);
    $('#referenceHost').append(iframe);
  } else {
    $('#selectionSummary').textContent = 'Glissez pour tourner · pincez pour zoomer';
    updateStatus();
    if(!normalizer) ensureLayer('skin');
    else desired.forEach(layer=>ensureLayer(layer));
    resize();
  }
}

controls.addEventListener('change',invalidate);
controls.addEventListener('start',pauseMotion);
canvas.addEventListener('pointerdown',event=>{pointerStart={x:event.clientX,y:event.clientY};});
canvas.addEventListener('pointerup',pick);
canvas.addEventListener('pointercancel',()=>{pointerStart=null;});
canvas.addEventListener('keydown',event=>{
  if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','+','=','-'].includes(event.key)) return;
  event.preventDefault();
  pauseMotion();
  if(event.key==='Home') resetCamera();
  else if(event.key==='+' || event.key==='=' || event.key==='-') {
    const distance = camera.position.distanceTo(controls.target);
    const next = THREE.MathUtils.clamp(distance*(event.key==='-'?1.12:.89),controls.minDistance,controls.maxDistance);
    camera.position.sub(controls.target).multiplyScalar(next/distance).add(controls.target);
  } else {
    if(event.key==='ArrowLeft') root.rotation.y-=.12;
    if(event.key==='ArrowRight') root.rotation.y+=.12;
    if(event.key==='ArrowUp') root.rotation.x-=.08;
    if(event.key==='ArrowDown') root.rotation.x+=.08;
  }
  invalidate();
});
$('#rotateToggle').addEventListener('click',()=>{state.rotate=!state.rotate; if(!state.rotate)state.tour=false; previousTime=null; syncMotionButtons(); invalidate();});
$('#tourToggle').addEventListener('click',()=>{state.tour=!state.tour; state.tourElapsed=0; if(!state.tour)state.rotate=false; else selectStage(state.stage,false); previousTime=null; syncMotionButtons(); invalidate();});
$('#resetView').addEventListener('click',resetCamera);
$('#bodyAtlasToggle').addEventListener('click',()=>setMode('local'));
$('#realisticToggle').addEventListener('click',()=>setMode('reference'));
$('#separationSlider').addEventListener('input',event=>{pauseMotion(); state.separation=Number(event.target.value); applyLayers();});
$('#opacitySlider').addEventListener('input',event=>{pauseMotion(); state.opacity=Number(event.target.value); applyLayers();});
$('#speedSlider').addEventListener('input',event=>{state.speed=Number(event.target.value);});
$('#stageNav').addEventListener('click',event=>{const button=event.target.closest('[data-stage]'); if(button)selectStage(Number(button.dataset.stage));});
$('#retryLayers').addEventListener('click',()=>{records.forEach(record=>{if(record.status==='error'&&desired.has(record.asset.layer))ensureLayer(record.asset.layer);});});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden) {stopFrame(); if(state.mode==='reference') {$('#referenceHost').replaceChildren(); pendingReference=null; clearTimeout(referenceTimer);}}
  else if(state.mode==='reference') {state.mode='local'; setMode('reference');}
  else {previousTime=null; invalidate();}
});
reducedMotion.addEventListener('change',event=>{if(event.matches)pauseMotion();});
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault(); contextLost=true; pauseMotion(); stopFrame(); setError('La vue 3D a été interrompue. Rechargez pour la rétablir.',true);});
canvas.addEventListener('webglcontextrestored',()=>{setError('Le moteur 3D est de nouveau disponible. Rechargez pour rétablir les couches.',true);});
new ResizeObserver(resize).observe(viewport);
window.addEventListener('pagehide',()=>{stopFrame(); $('#referenceHost').replaceChildren(); pendingReference=null; clearTimeout(referenceTimer);});

resize();
const response = await fetch('./assets/anatomy-manifest.json');
if(!response.ok) throw new Error('Manifeste anatomique indisponible.');
const manifest = await response.json();
for(const asset of manifest.assets) {
  if(!names[asset.layer]) continue;
  const row = document.createElement('label');
  row.className = 'layer-row';
  row.innerHTML = '<input class="layer-toggle" type="checkbox"><span class="layer-copy"><span class="layer-name"></span><span class="layer-status"></span></span><span class="swatch" aria-hidden="true"></span>';
  row.querySelector('.layer-name').textContent = names[asset.layer];
  row.querySelector('.swatch').style.background = asset.color;
  const group = new THREE.Group();
  root.add(group);
  const record = {asset,group,status:'idle',promise:null,material:null,input:row.querySelector('input'),label:row.querySelector('.layer-status')};
  records.set(asset.layer,record);
  record.input.addEventListener('change',()=>{
    pauseMotion();
    if(record.input.checked) {desired.add(asset.layer); ensureLayer(asset.layer);} else desired.delete(asset.layer);
    $('#stageNav').querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed','false'));
    applyLayers();
  });
  $('#layerList').append(row);
}
applyLayers();
// Skin provides the shared frame; every layer preserves its original coordinates.
await ensureLayer('skin');
if(normalizer) desired.forEach(layer=>ensureLayer(layer));

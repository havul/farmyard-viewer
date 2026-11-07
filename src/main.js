import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PROJECT as P } from './config.js';
import { createDemoSite, createDemoBarn } from './demo.js';
import './style.css';

const $ = id => document.getElementById(id);
$('projectTitle').textContent=P.title;$('projectSubtitle').textContent=P.subtitle;
$('timelineSlider').max=P.frameCount;
const scene=new THREE.Scene();
const solidBackground=new THREE.Color(P.environment.backgroundColor);
let hdrTexture=null, showSky=P.environment.showBackground;
scene.background=solidBackground;
scene.fog=new THREE.Fog(P.environment.backgroundColor,90,190);
function updateSky(){
  // Never touch scene.environment here: hiding the image must NOT remove HDR illumination.
  scene.background=(showSky && hdrTexture)?hdrTexture:solidBackground;
  $('skyBtn').classList.toggle('active',showSky);
  $('skyBtn').setAttribute('aria-pressed',String(showSky));
  $('skyBtn').title=hdrTexture?'Toggle visible HDR sky (lighting stays enabled)':'Add an HDR file in config.js to display the sky';
}
updateSky();
const camera=new THREE.PerspectiveCamera(42,1,.1,300);
camera.position.fromArray(P.camera.position);
const renderer=new THREE.WebGLRenderer({canvas:$('sceneCanvas'),antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
renderer.shadowMap.enabled = window.innerWidth > 768;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.075;controls.maxPolarAngle=Math.PI*.495;
controls.minDistance=P.camera.minDistance;controls.maxDistance=P.camera.maxDistance;
controls.target.fromArray(P.camera.target);controls.update();
scene.add(new THREE.HemisphereLight('#eef5ff','#64735e',2.15));
const sun=new THREE.DirectionalLight('#fff0d4',3.0);
sun.position.set(-30,48,26);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
sun.shadow.camera.left=-65;sun.shadow.camera.right=65;sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;
sun.shadow.normalBias=.035;scene.add(sun);
const grid=new THREE.GridHelper(100,50,'#ccd5ca','#adbcb3');grid.position.y=-.035;grid.visible=false;scene.add(grid);
const baseScan=new THREE.Group(),buildRoot=new THREE.Group();scene.add(baseScan,buildRoot);
let scanRoot=null, buildModel=null, demoBuild=null, mixer=null, animationActions=[];
let frame=0,playing=false,playRate=1,view='realistic',showLabels=true,selectedPoi=null;
let stageJump=null;
const poiNodes=[];
let roofManualOverride=null; // null = timeline-controlled; true/false = user override
let roofMeshes=[];
let barnBounds=new THREE.Box3();
const barnBoundsSize=new THREE.Vector3();
let navMove=null;const viewport=$('viewport');
let prevTick=performance.now();
let materialBackups=new Map();
function showStatus(t){$('loadingStatus').textContent=t;}
function place(root,spec){root.position.fromArray(spec.position);root.rotation.set(...spec.rotation);root.scale.setScalar(spec.scale);}
function disposeMaterialsOnly(root){root.traverse(o=>{if(o.isMesh){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{if(m?.userData?.viewerTemp)m.dispose();});}});}
function viewMaterial(original){
  if(view==='realistic')return original;
  if(Array.isArray(original))return original.map(viewMaterial);
  if(!original)return original;
  const c=original.color?.clone() || new THREE.Color('#9aaeb4');
  const m=view==='unlit'?new THREE.MeshBasicMaterial({color:c,side:original.side, map:original.map||null}):
    new THREE.MeshBasicMaterial({color:'#6c8793',wireframe:true,transparent:true,opacity:.85});
  m.userData.viewerTemp=true;return m;
}
function applyView(){
  for(const root of [baseScan,buildRoot])root.traverse(o=>{
    if(!o.isMesh || o.userData.isRoofExteriorLayer)return;
    if(!materialBackups.has(o))materialBackups.set(o,o.material);
    const original=materialBackups.get(o);
    const old=o.material;
    o.material=viewMaterial(original);
    if(old!==original){const arr=Array.isArray(old)?old:[old];arr.forEach(m=>{if(m?.userData?.viewerTemp)m.dispose();});}
  });
  // Keep roof interior face orientation when changing display mode.
  for(const mesh of roofMeshes){
    const mats=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    mats.forEach(m=>{if(m && m.side!==THREE.FrontSide){m.side=THREE.FrontSide;m.needsUpdate=true;}});
    const ext=mesh.userData.viewerRoofExterior;
    if(ext){
      const layers=Array.isArray(ext.material)?ext.material:[ext.material];
      layers.forEach(m=>{if(m){m.wireframe=view==='wireframe';}});
    }
  }
  updateRoofCulling();
  document.querySelectorAll('[data-view]').forEach(b=>{const on=b.dataset.view===view;b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));});
}
function forgetMaterials(root){root.traverse(o=>{if(o.isMesh){const orig=materialBackups.get(o);if(orig){o.material=orig;materialBackups.delete(o);}}});}
function replaceScan(obj){
  if(scanRoot){forgetMaterials(scanRoot);baseScan.remove(scanRoot);}
  scanRoot=obj;place(scanRoot,P.placement.scan);baseScan.add(scanRoot);applyView();
}
// Roof face orientation on this particular GLB: FrontSide is the desired interior-only view.
// The child layer renders the complementary BackSide faces and fades at Barn Decorated.
function updateRoofCulling(){
  const fadeStart=P.roof.fadeStartFrame ?? 128;
  const fadeEnd=P.roof.fadeEndFrame ?? 140;
  const timelineCutaway=THREE.MathUtils.clamp((frame-fadeStart)/Math.max(1,fadeEnd-fadeStart),0,1);
  const cutaway=roofManualOverride===null?timelineCutaway:(roofManualOverride?1:0);
  for(const mesh of roofMeshes){
    const layer=mesh.userData.viewerRoofExterior;
    if(!layer)continue;
    layer.visible=cutaway<0.999;
    const mats=Array.isArray(layer.material)?layer.material:[layer.material];
    for(const mat of mats){
      if(!mat)continue;
      mat.opacity=1-cutaway;
      // The base (interior) stays opaque throughout the fade.
    }
  }
  const btn=$('roofCullBtn');
  if(btn){
    const enabled=cutaway>=0.999;
    btn.classList.toggle('active',enabled);
    btn.setAttribute('aria-pressed',String(enabled));
    btn.title=roofManualOverride===null
      ? 'Roof follows construction timeline. Click to override; Alt-click to restore automatic.'
      : 'Manual roof cutaway override. Click to toggle; Alt-click for automatic.';
  }
}
function findRoofMeshes(root){
  // Collect before creating any exterior clones so the clones cannot be matched again.
  roofMeshes=[];
  root.traverse(obj=>{
    if(!obj.isMesh || obj.userData.isRoofExteriorLayer)return;
    let parent=obj;
    while(parent){
      if((parent.name||'').toLowerCase().includes((P.roof?.objectName||'BarnRoof').toLowerCase())){
        roofMeshes.push(obj);
        break;
      }
      parent=parent.parent;
    }
  });
  for(const mesh of roofMeshes){
    if(mesh.userData.viewerRoofExterior)continue;
    // Clone the roof materials so shared wall/roof materials are never altered.
    const old=materialBackups.get(mesh)||mesh.material;
    const copies=Array.isArray(old)?old.map(m=>m.clone()):old.clone();
    materialBackups.set(mesh,copies);
    mesh.material=viewMaterial(copies);
    const inside=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    for(const mat of inside){mat.side=THREE.FrontSide;mat.needsUpdate=true;}
    // Child with identity transform follows animated roof object automatically.
    const exterior=mesh.clone(false);
    exterior.name='Viewer_Roof_Exterior';
    exterior.userData={isRoofExteriorLayer:true};
    exterior.position.set(0,0,0);
    exterior.rotation.set(0,0,0);
    exterior.scale.set(1,1,1);
    exterior.matrixAutoUpdate=true;
    exterior.renderOrder=mesh.renderOrder+1;
    const originals=Array.isArray(copies)?copies:[copies];
    const overlayMats=originals.map(material=>{
      const m=material.clone();
      m.side=THREE.BackSide;
      m.transparent=true;
      m.depthWrite=false;
      m.opacity=1;
      m.userData.viewerRoofOverlayMaterial=true;
      return m;
    });
    exterior.material=Array.isArray(copies)?overlayMats:overlayMats[0];
    mesh.add(exterior);
    mesh.userData.viewerRoofExterior=exterior;
  }
  console.info('[Barn viewer] Roof meshes found:',roofMeshes.length);
  updateRoofCulling();
}
function updateBarnBounds(){
  if(!buildModel)return;
  // Bounds are measured in build-root local coordinates; labels follow model placement.
  buildRoot.updateWorldMatrix(true,true);
  const worldBox=new THREE.Box3().setFromObject(buildModel);
  if(worldBox.isEmpty())return;
  const min=worldBox.min.clone(), max=worldBox.max.clone();
  buildRoot.worldToLocal(min); buildRoot.worldToLocal(max);
  barnBounds.set(min.min(max.clone()),max.max(min.clone()));
  barnBounds.getSize(barnBoundsSize);
  console.info('[Barn viewer] Label reference bounds:',barnBounds.min.toArray(),barnBounds.max.toArray());
}
function replaceBuild(obj){
  if(buildModel){forgetMaterials(buildModel);buildRoot.remove(buildModel);}
  buildModel=obj;place(obj,P.placement.construction);buildRoot.add(obj);applyView();
  if(obj===buildModel){findRoofMeshes(obj);updateBarnBounds();}
}
const draco=new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/v1/decoders/');
const ktx2=new KTX2Loader().setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.181.0/examples/jsm/libs/basis/').detectSupport(renderer);
const loader=new GLTFLoader().setDRACOLoader(draco).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
const stageProgress=(msg,n)=>{$('loadingDetails').textContent=msg;$('loadProgress').style.width=`${n}%`;};
function loadGLB(url,title,from,to){
  return new Promise((resolve,reject)=>loader.load(url,resolve,e=>{
    if(e.total)stageProgress(`${title} · ${Math.round(e.loaded/e.total*100)}%`,from+(to-from)*e.loaded/e.total);
    else stageProgress(`${title} · ${Math.round(e.loaded/1024/1024)} MB received`,from);
  },reject));
}
function initBuildAnimation(gltf){
  if(demoBuild){buildRoot.remove(demoBuild.root);demoBuild=null;}
  replaceBuild(gltf.scene);
  if(mixer){mixer.stopAllAction();mixer.uncacheRoot(mixer.getRoot());}
  mixer=null;
  animationActions=[];
  const clips=P.constructionAnimation.clipName
    ? gltf.animations.filter(clip=>clip.name===P.constructionAnimation.clipName)
    : gltf.animations;
  if(clips.length){
    mixer=new THREE.AnimationMixer(gltf.scene);
    // Each Blender action is a separate clip. Evaluate every action at the same
    // global scene time so all construction parts follow the shared timeline.
    for(const clip of clips){
      const action=mixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce,1);
      action.clampWhenFinished=true;
      action.enabled=true;
      action.play();
      animationActions.push({clip,action});
    }
    console.info(`[Barn viewer] Loaded ${animationActions.length} animation clips`,
      clips.map(c=>({name:c.name,duration:c.duration,tracks:c.tracks.length})));
    showStatus(`Ready · ${animationActions.length} animation clips`);
  }else{showStatus('Model has no exported animation');}
  updateBuild();
  updateBarnBounds();
}
async function initializeAssets(){
  stageProgress('Creating instant preview…',5);
  if(P.showDemoSiteWithoutScan || P.assets.scanPreview || P.assets.scanDetailed) replaceScan(createDemoSite());
  demoBuild=createDemoBarn();replaceBuild(demoBuild.root);updateBuild();
  setTimeout(()=>{if(!$('loadingCover').hidden)$('loadingCover').hidden=true;},200);
  // Optional assets stream sequentially; every stage keeps the preview interactive.
  if(P.assets.scanPreview){try{showStatus('Loading survey preview');const gltf=await loadGLB(P.assets.scanPreview,'Survey preview',10,30);replaceScan(gltf.scene);showStatus('Survey preview loaded');}catch(e){console.error(e);showStatus('Preview failed; demo visible');}}
  if(P.assets.construction){try{showStatus('Loading build animation');const gltf=await loadGLB(P.assets.construction,'Construction animation',30,65);initBuildAnimation(gltf);}catch(e){console.error(e);showStatus('Build failed; demo visible');}}
  if(P.assets.scanDetailed){try{showStatus('Loading full-detail survey');const gltf=await loadGLB(P.assets.scanDetailed,'Detailed survey',65,90);replaceScan(gltf.scene);showStatus('Detailed survey ready');}catch(e){console.error(e);showStatus('Detailed scan failed; preview visible');}}
  if(P.assets.environmentHDR){try{showStatus('Loading sky lighting');const HDRLoader=P.assets.environmentHDR.toLowerCase().endsWith('.exr')?EXRLoader:RGBELoader;const tex=await new HDRLoader().loadAsync(P.assets.environmentHDR);tex.mapping=THREE.EquirectangularReflectionMapping;hdrTexture=tex;scene.environment=tex;scene.environmentIntensity=P.environment.intensity;scene.backgroundBlurriness=P.environment.backgroundBlur;scene.environmentRotation.y=THREE.MathUtils.degToRad(P.environment.rotationDegrees);scene.backgroundRotation.y=THREE.MathUtils.degToRad(P.environment.rotationDegrees);updateSky();showStatus('HDR lighting loaded · background toggle ready');}catch(e){console.error(e);showStatus('HDR unavailable; using studio lighting');}}
  if(!Object.values(P.assets).some(Boolean))showStatus('Interactive demo · Ready');
  stageProgress('Ready',100);
  // Controls and scene already usable even while fetching replacements.
}
function updateBuild(){
  if(demoBuild)demoBuild.setFrame(frame/P.frameCount*800);
  if(mixer && animationActions.length){
    const {startFrame,endFrame}=P.constructionAnimation;
    // IMPORTANT: use absolute Blender timeline seconds, NOT a percentage of
    // each clip's length. Different clips must keep their original timing.
    const globalSeconds=THREE.MathUtils.clamp(
      (frame-startFrame)/P.fps,0,(endFrame-startFrame)/P.fps);
    for(const {clip,action} of animationActions){
      // Short actions should keep their last pose after they finish, not loop.
      // Set each action explicitly so reverse scrubbing works as well.
      action.enabled=true;
      action.paused=false;
      action.time=THREE.MathUtils.clamp(globalSeconds,0,clip.duration);
      action.setEffectiveWeight(1);
    }
    mixer.update(0); // Evaluate the manually positioned actions without advancing time.
  }
}
function currentChapter(){return P.chapters.find(c=>frame<=c.end)||P.chapters[P.chapters.length-1];}
function setFrame(n){
  const previousFrame = frame;
  frame=THREE.MathUtils.clamp(Math.round(n),0,P.frameCount);

    // Reset automatic roof control when rewinding.
  if (frame < 128 && previousFrame >= 128) {
    roofManualOverride = null;
  }

  // Trigger cutaway when reaching Barn Decorated.
  if (previousFrame < 128 && frame >= 128) {
    if (roofManualOverride === false) {
      roofManualOverride = null;
    }
  }


  updateBuild();
  updateRoofCulling();
  $('timelineSlider').value=frame;
  $('timelineSlider').style.setProperty('--pct',`${frame/P.frameCount*100}%`);
  $('frameReadout').textContent=`${String(frame).padStart(3,'0')} / ${P.frameCount}`;
  const chapter=currentChapter();$('phaseLabel').textContent=chapter.title;
  $('chapterName').textContent=chapter.title;$('chapterDescription').textContent=chapter.description;
  document.querySelectorAll('[data-chapter]').forEach(el=>el.classList.toggle('chosen',Number(el.dataset.chapter)===chapter.end));
  updateStagePOI();
  $('playBtn').textContent=playing?'Ⅱ':'▶';$('playBtn').setAttribute('aria-label',playing?'Pause animation':'Play animation');
}
function setPlaying(p){
  stageJump=null;
  if(p && frame>=P.frameCount){
    playing=false;
    playbackFrame=0;
    
    setFrame(0);
  }
  playing=p;
  playbackFrame=frame;
  setFrame(frame);
}
function jumpToStage(endFrame){
  playing=false;
  // Smooth short transition even when jumping backwards through construction.
  stageJump={from:frame,to:endFrame,elapsed:0,duration:Math.max(.1,P.stageJumpSeconds)};
  setFrame(frame);
}
function renderTimeline(){
  for(const [i,c] of P.chapters.entries()){
    const marker=document.createElement('button');marker.className='chapter-marker';marker.style.left=`${c.end/P.frameCount*100}%`;
    marker.title=`Frames ${c.start}–${c.end}: ${c.title}`;marker.setAttribute('aria-label',`Play to ${c.title}`);
    marker.addEventListener('click',()=>jumpToStage(c.end));$('chapterMarkers').appendChild(marker);
    const btn=document.createElement('button');btn.dataset.chapter=c.end;btn.className='chapter-pill';
    const count=document.createElement('span');count.textContent=String(i+1).padStart(2,'0');
    const name=document.createTextNode(' '+c.title);
    const range=document.createElement('small');range.textContent=`${c.start}–${c.end}`;
    btn.append(count,name,range);
    btn.title=`Play to frame ${c.end} (${(c.end/P.fps).toFixed(2)}s)`;
    btn.type='button';$('chapterNav').appendChild(btn);
  }
}
renderTimeline();setFrame(0);
// Delegate one click handler to the chapter bar. This works on desktop and touch,
// including clicks on the chapter name/frame-range child elements.
$('chapterNav').addEventListener('click',event=>{
  const button=event.target.closest('button[data-chapter]');
  if(!button || !$('chapterNav').contains(button))return;
  event.preventDefault();
  event.stopPropagation();
  jumpToStage(Number(button.dataset.chapter));
});
$('timelineSlider').addEventListener('input',e=>{setPlaying(false);setFrame(+e.target.value);});
// Capture dragging across the whole timeline track, even on top of chapter ticks.
const scrubWrap=$('scrubWrap');
let scrubPointer=null;
function scrubAt(clientX){
  const track=$('timelineSlider').getBoundingClientRect();
  const ratio=THREE.MathUtils.clamp((clientX-track.left)/Math.max(1,track.width),0,1);
  setPlaying(false);setFrame(Math.round(ratio*P.frameCount));
}
scrubWrap.addEventListener('pointerdown',e=>{
  if(e.button!==0||e.target.closest('button'))return;
  scrubPointer=e.pointerId;
  scrubWrap.setPointerCapture(e.pointerId);
  scrubAt(e.clientX);
  e.preventDefault();
});
scrubWrap.addEventListener('pointermove',e=>{if(scrubPointer===e.pointerId)scrubAt(e.clientX);});
for(const eventName of ['pointerup','pointercancel'])scrubWrap.addEventListener(eventName,e=>{
  if(scrubPointer===e.pointerId){scrubAt(e.clientX);scrubPointer=null;}
});
$('roofCullBtn').addEventListener('click',event=>{
  // Alt/Option-click returns to timeline-controlled automatic mode.
  if(event.altKey){roofManualOverride=null;}
  else{
    const start=P.roof.fadeStartFrame??128,end=P.roof.fadeEndFrame??140;
    const current=roofManualOverride===null
      ? THREE.MathUtils.clamp((frame-start)/Math.max(1,end-start),0,1)>=0.5
      : roofManualOverride;
    roofManualOverride=!current;
  }
  updateRoofCulling();
});
$('skyBtn').addEventListener('click',()=>{showSky=!showSky;updateSky();});
$('playBtn').addEventListener('click',()=>setPlaying(!playing));
$('restartBtn').addEventListener('click',()=>{setPlaying(false);setFrame(0);});
$('endBtn').addEventListener('click',()=>{setPlaying(false);setFrame(P.frameCount);});
$('speedSelect').addEventListener('change',e=>playRate=+e.target.value);
document.querySelectorAll('[data-view]').forEach(btn=>btn.addEventListener('click',()=>{view=btn.dataset.view;applyView();}));
$('gridBtn').addEventListener('click',()=>{grid.visible=!grid.visible;$('gridBtn').classList.toggle('active',grid.visible);$('gridBtn').setAttribute('aria-pressed',String(grid.visible));});
$('labelsBtn').addEventListener('click',()=>{showLabels=!showLabels;$('poiLayer').hidden=!showLabels;$('labelsBtn').classList.toggle('active',showLabels);$('labelsBtn').setAttribute('aria-pressed',String(showLabels));});
function moveCamera(pos,target){navMove={fromPos:camera.position.clone(),fromTarget:controls.target.clone(),toPos:new THREE.Vector3(...pos),toTarget:new THREE.Vector3(...target),t:0};}
function resetView(){moveCamera(P.camera.position,P.camera.target);}
$('resetBtn').addEventListener('click',resetView);
document.querySelectorAll('[data-orient]').forEach(b=>b.addEventListener('click',()=>{
  const d=camera.position.distanceTo(controls.target),target=controls.target.toArray();
  const dirs={top:[.001,d,.001],front:[0,d*.28,d],back:[0,d*.28,-d],left:[-d,d*.28,0],right:[d,d*.28,0]};
  const dir=new THREE.Vector3(...dirs[b.dataset.orient]).normalize().multiplyScalar(d);
  moveCamera(dir.add(controls.target).toArray(),target);
}));
controls.addEventListener('start',()=>navMove=null);
function dismissPanel(){selectedPoi=null;$('infoPanel').hidden=true;document.querySelectorAll('.poi').forEach(b=>b.classList.remove('selected'));}
$('closePanel').addEventListener('click',dismissPanel);
$('focusPoiBtn').addEventListener('click',()=>{const poi=P.pointsOfInterest.find(p=>p.id===selectedPoi);if(poi){const target=getMarkerWorldPosition(poi).toArray();moveCamera(poi.camera||P.camera.position,poi.target||target);}});
function getMarkerWorldPosition(p){
  if(p.relativePosition && buildModel && !barnBounds.isEmpty()){
    const r=p.relativePosition;
    const local=new THREE.Vector3(
      barnBounds.min.x+barnBoundsSize.x*r[0],
      barnBounds.min.y+barnBoundsSize.y*r[1],
      barnBounds.min.z+barnBoundsSize.z*r[2]);
    return buildRoot.localToWorld(local);
  }
  return new THREE.Vector3(...(p.position||[0,0,0]));
}
function updateStagePOI(){
  for(const {data,node} of poiNodes){
    node.classList.toggle('poi-unlocked',frame>=data.fromFrame);
  }
}
for(const [i,p] of P.pointsOfInterest.entries()){
  const btn=document.createElement('button');btn.className='poi';btn.setAttribute('aria-label',`Point of interest: ${p.title}`);
  const num=document.createElement('span');num.className='poi-dot';num.textContent=String(i+1).padStart(2,'0');
  const label=document.createElement('span');label.className='poi-title';label.textContent=p.title;
  btn.append(num,label);
  btn.addEventListener('click',()=>{
    selectedPoi=p.id;document.querySelectorAll('.poi').forEach(b=>b.classList.remove('selected'));btn.classList.add('selected');
    $('infoCategory').textContent=p.category;$('infoTitle').textContent=p.title;$('infoDescription').textContent=p.description;$('infoPanel').hidden=false;
  });$('poiLayer').appendChild(btn);poiNodes.push({data:p,node:btn});
}
function renderPOI(){
  const w=viewport.clientWidth,h=viewport.clientHeight;
  const occupied=[];
  for(const {data,node} of poiNodes){
    if(!showLabels||frame<data.fromFrame){node.style.display='none';continue;}
    const pos=getMarkerWorldPosition(data);
    pos.project(camera);
    const visible=pos.z>-1&&pos.z<1&&Math.abs(pos.x)<.96&&Math.abs(pos.y)<.92;
    node.style.display=visible?'flex':'none';
    if(!visible)continue;
    const x=(pos.x*.5+.5)*w,y=(-pos.y*.5+.5)*h;
    // Spread labels that overlap on the screen; the 3D anchor stays fixed.
    let offsetX=0,offsetY=0;
    const shifts=[[0,0],[0,-54],[0,54],[-155,-28],[155,28],[-155,34],[155,-34],[-80,-100],[80,100]];
    for(const [dx,dy] of shifts){
      const candidate={x:x+dx,y:y+dy};
      if(occupied.every(v=>Math.abs(v.x-candidate.x)>148||Math.abs(v.y-candidate.y)>44)){
        offsetX=dx;offsetY=dy;break;
      }
    }
    occupied.push({x:x+offsetX,y:y+offsetY});
    node.style.transform=`translate(-50%,-50%) translate(${x+offsetX}px,${y+offsetY}px)`;
  }
}
function onResize(){const w=viewport.clientWidth,h=viewport.clientHeight;camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();renderer.setSize(w,h,false);}
new ResizeObserver(onResize).observe(viewport);onResize();
function animate(now){requestAnimationFrame(animate);const dt=Math.min((now-prevTick)/1000,.05);prevTick=now;
  if(stageJump){
    stageJump.elapsed=Math.min(stageJump.duration,stageJump.elapsed+dt);
    const v=stageJump.elapsed/stageJump.duration;
    const eased=v*v*(3-2*v);
    const target=stageJump.to;
    setFrame(stageJump.from+(target-stageJump.from)*eased);
    if(v>=1){setFrame(target);stageJump=null;}
  }
  if(playing){
    playbackFrame+=dt*P.fps*playRate;
    if(playbackFrame>=P.frameCount){
      playing=false;playbackFrame=P.frameCount;setFrame(P.frameCount);
    }else setFrame(playbackFrame);
  }else playbackFrame=frame;
  if(navMove){navMove.t=Math.min(1,navMove.t+dt*2.5);const t=navMove.t*navMove.t*(3-2*navMove.t);
    camera.position.lerpVectors(navMove.fromPos,navMove.toPos,t);controls.target.lerpVectors(navMove.fromTarget,navMove.toTarget,t);
    if(navMove.t>=1)navMove=null;
  }
  controls.update();renderPOI();renderer.render(scene,camera);
}
let playbackFrame=0;requestAnimationFrame(animate);
$('fullscreenBtn').addEventListener('click',async()=>{if(!document.fullscreenElement)await $('app').requestFullscreen?.();else await document.exitFullscreen?.();});
$('screenshotBtn').addEventListener('click',()=>{renderer.render(scene,camera);const a=document.createElement('a');a.download='farmyard-view.png';a.href=renderer.domElement.toDataURL('image/png');a.click();});
function showHelp(open){$('helpModal').hidden=!open;if(open)$('closeHelp').focus();else $('helpBtn').focus();}
$('helpBtn').addEventListener('click',()=>showHelp(true));$('closeHelp').addEventListener('click',()=>showHelp(false));$('gotItBtn').addEventListener('click',()=>showHelp(false));
$('helpModal').addEventListener('click',e=>{if(e.target===$('helpModal'))showHelp(false);});
window.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea,button')&&e.key!=='Escape')return;
  if(e.key==='Escape'){if(!$('helpModal').hidden)showHelp(false);else dismissPanel();return;}
  if(e.key==='?'){showHelp(true);return;}
  if(e.code==='Space'){e.preventDefault();setPlaying(!playing);}
  if(e.key==='ArrowLeft'){e.preventDefault();setPlaying(false);setFrame(frame-10);}
  if(e.key==='ArrowRight'){e.preventDefault();setPlaying(false);setFrame(frame+10);}
  if(e.key==='Home'){setPlaying(false);setFrame(0);}
  if(e.key==='End'){setPlaying(false);setFrame(P.frameCount);}
  if(e.key.toLowerCase()==='r')resetView();
});
initializeAssets();

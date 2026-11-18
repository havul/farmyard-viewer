import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { GroundedSkybox } from 'three/addons/objects/GroundedSkybox.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { PROJECT as P } from './config.js';
import { createDemoSite, createDemoBarn } from './demo.js';
import './style.css';

const $ = id => document.getElementById(id);
$('projectTitle').textContent='Barn Construction - Interactive Timeline';
$('timelineSlider').max=P.frameCount;
const scene=new THREE.Scene();
const solidBackground=new THREE.Color(P.environment.backgroundColor);
let hdrTexture=null, groundedSkybox=null, showSky=P.environment.showBackground;
scene.background=solidBackground;
scene.fog=new THREE.Fog(P.environment.backgroundColor,90,190);
function updateSky(){
  // Never touch scene.environment here: hiding the image must NOT remove HDR illumination.
  // Keep IBL lighting independent of background visibility.
  if(groundedSkybox){
    groundedSkybox.visible=showSky;
    scene.background=solidBackground;
  }else{
    scene.background=(showSky && hdrTexture)?hdrTexture:solidBackground;
  }
  $('skyBtn').classList.toggle('active',showSky);
  $('skyBtn').setAttribute('aria-pressed',String(showSky));
  $('skyBtn').title=hdrTexture?'Toggle grounded HDR background (lighting stays enabled)':'Add an HDR file in config.js to display the sky';
}
updateSky();
const camera=new THREE.PerspectiveCamera(42,1,.1,700);
camera.position.fromArray(P.camera.position);
const renderer=new THREE.WebGLRenderer({canvas:$('sceneCanvas'),antialias:true,alpha:false,preserveDrawingBuffer:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,window.innerWidth<=768?1.25:2));renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.2;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
const controls=new OrbitControls(camera,renderer.domElement);
controls.enableDamping=true;controls.dampingFactor=.075;controls.maxPolarAngle=Math.PI*.495;
controls.minDistance=P.camera.minDistance;controls.maxDistance=P.camera.maxDistance;
controls.target.fromArray(P.camera.target);controls.update();
scene.add(new THREE.HemisphereLight('#eef5ff','#64735e',2.15));
const sun=new THREE.DirectionalLight('#fff0d4',3.0);
sun.position.set(-30,48,26);sun.castShadow=true;sun.shadow.mapSize.set(window.innerWidth<=768?1024:2048,window.innerWidth<=768?1024:2048);
sun.shadow.camera.left=-65;sun.shadow.camera.right=65;sun.shadow.camera.top=65;sun.shadow.camera.bottom=-65;
sun.shadow.normalBias=.035;scene.add(sun);
const grid=new THREE.GridHelper(100,50,'#ccd5ca','#adbcb3');grid.position.y=-.035;grid.visible=false;scene.add(grid);
const baseScan=new THREE.Group(),buildRoot=new THREE.Group(),landscapeRoot=new THREE.Group();
scene.add(baseScan,buildRoot,landscapeRoot);
let scanRoot=null, buildModel=null, demoBuild=null, mixer=null, animationActions=[];
let landscapeModel=null, landscapeMixer=null, landscapeActions=[];
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
const shadowBase={hemisphere:2.15,sun:3.0};
let hdrLevel=P.environment.intensity ?? .55,shadowLevel=.65;
function applyLighting(){
  scene.environmentIntensity=hdrLevel;
  sun.shadow.intensity=shadowLevel;
  sun.castShadow=shadowLevel>0.005;
  renderer.shadowMap.enabled=shadowLevel>0.005;
  $('hdrBrightnessValue').textContent=Math.round(hdrLevel*100)+'%';
  $('shadowStrengthValue').textContent=Math.round(shadowLevel*100)+'%';
}
$('hdrBrightness').addEventListener('input',e=>{hdrLevel=Number(e.target.value)/100;applyLighting();});
$('shadowStrength').addEventListener('input',e=>{shadowLevel=Number(e.target.value)/100;applyLighting();});
$('hdrBrightness').value=String(Math.round(hdrLevel*100));
applyLighting();
function showStatus(t){$('loadingStatus').textContent=t;}
function place(root,spec){root.position.fromArray(spec.position);root.rotation.set(...spec.rotation);root.scale.setScalar(spec.scale);root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});}
function makeGroundedBackground(texture){
  if(groundedSkybox){scene.remove(groundedSkybox);groundedSkybox.geometry.dispose();groundedSkybox.material.dispose();groundedSkybox=null;}
  if(!P.environment.groundedSkybox?.enabled)return;
  const {height=15,radius=230,groundY=0,centerX=0,centerZ=0}=P.environment.groundedSkybox;
  groundedSkybox=new GroundedSkybox(texture,height,radius);
  groundedSkybox.position.set(centerX,groundY+height,centerZ);
  groundedSkybox.renderOrder=-1000;
  // Brighten only the *visible* grounded panorama; preserve HDR lighting strength.
  // Values above 1 are supported for the material tint in linear colour space.
  groundedSkybox.material.color.setScalar(Math.max(0, P.environment.groundedSkybox.brightness ?? 1.45));
  groundedSkybox.material.depthWrite=false;
  groundedSkybox.material.fog=false;
  groundedSkybox.frustumCulled=false;
  scene.add(groundedSkybox);
}
function disposeMaterialsOnly(root){root.traverse(o=>{if(o.isMesh){const ms=Array.isArray(o.material)?o.material:[o.material];ms.forEach(m=>{if(m?.userData?.viewerTemp)m.dispose();});}});}
function viewMaterial(original){
  if(view==='realistic')return original;
  if(Array.isArray(original))return original.map(viewMaterial);
  if(!original)return original;
  const c=original.color?.clone() || new THREE.Color('#9aaeb4');
  const m=view==='unlit'?new THREE.MeshBasicMaterial({color:c,side:original.side, map:original.map||null}):
    new THREE.MeshBasicMaterial({color:'#ffffff',wireframe:true,side:original.side});
  m.userData.viewerTemp=true;return m;
}
function applyView(){
  for(const root of [baseScan,buildRoot,landscapeRoot])root.traverse(o=>{
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
  if(P.assets.landscape){try{showStatus('Loading Barnscape and trailer removal');const gltf=await loadGLB(P.assets.landscape,'Barnscape environment',8,30);initLandscapeAnimation(gltf);showStatus('Barnscape loaded');}catch(e){console.error('[Barn viewer] Could not load Barnscape:',e);showStatus('Barnscape unavailable; check filename/path');}}
  if(P.assets.scanPreview){try{showStatus('Loading survey preview');const gltf=await loadGLB(P.assets.scanPreview,'Survey preview',10,30);replaceScan(gltf.scene);showStatus('Survey preview loaded');}catch(e){console.error(e);showStatus('Preview failed; demo visible');}}
  if(P.assets.construction){try{showStatus('Loading build animation');const gltf=await loadGLB(P.assets.construction,'Construction animation',30,65);initBuildAnimation(gltf);}catch(e){console.error(e);showStatus('Build failed; demo visible');}}
  if(P.assets.scanDetailed){try{showStatus('Loading full-detail survey');const gltf=await loadGLB(P.assets.scanDetailed,'Detailed survey',65,90);replaceScan(gltf.scene);showStatus('Detailed survey ready');}catch(e){console.error(e);showStatus('Detailed scan failed; preview visible');}}
  if(P.assets.environmentHDR){try{showStatus('Loading sky lighting');const HDRLoader=P.assets.environmentHDR.toLowerCase().endsWith('.exr')?EXRLoader:RGBELoader;const tex=await new HDRLoader().loadAsync(P.assets.environmentHDR);tex.mapping=THREE.EquirectangularReflectionMapping;hdrTexture=tex;scene.environment=tex;scene.environmentIntensity=hdrLevel;scene.backgroundBlurriness=P.environment.backgroundBlur;scene.environmentRotation.y=THREE.MathUtils.degToRad(P.environment.rotationDegrees);scene.backgroundRotation.y=THREE.MathUtils.degToRad(P.environment.rotationDegrees);makeGroundedBackground(tex);updateSky();showStatus('HDR lighting loaded · background toggle ready');}catch(e){console.error(e);showStatus('HDR unavailable; using studio lighting');}}
  if(!Object.values(P.assets).some(Boolean))showStatus('Interactive demo · Ready');
  stageProgress('Ready',100);
  // Controls and scene already usable even while fetching replacements.
}
// Barnscape is an independent, persistent model. All its glTF actions are sampled
// against global frames 0–50 and held at the final pose for the rest of the show.
function initLandscapeAnimation(gltf){
  if(landscapeModel){forgetMaterials(landscapeModel);landscapeRoot.remove(landscapeModel);}
  landscapeModel=gltf.scene;
  place(landscapeModel,P.placement.landscape);
  landscapeRoot.add(landscapeModel);
  if(landscapeMixer){landscapeMixer.stopAllAction();landscapeMixer.uncacheRoot(landscapeMixer.getRoot());}
  landscapeMixer=null;
  landscapeActions=[];
  const clips=P.landscapeAnimation?.clipName
    ? gltf.animations.filter(c=>c.name===P.landscapeAnimation.clipName)
    : gltf.animations;
  if(clips.length){
    landscapeMixer=new THREE.AnimationMixer(landscapeModel);
    for(const clip of clips){
      const action=landscapeMixer.clipAction(clip);
      action.setLoop(THREE.LoopOnce,1);
      action.clampWhenFinished=true;
      action.enabled=true;
      action.play();
      landscapeActions.push({clip,action});
    }
  }
  applyView();
  updateLandscape();
  console.info(`[Barn viewer] Barnscape loaded: ${landscapeActions.length} animation clips; held at frame 50 after trailer removal.`);
}
function updateLandscape(){
  if(!landscapeMixer || !landscapeActions.length)return;
  const {startFrame=0,endFrame=50}=P.landscapeAnimation||{};
  const seconds=THREE.MathUtils.clamp((frame-startFrame)/P.fps,0,(endFrame-startFrame)/P.fps);
  for(const {clip,action} of landscapeActions){
    action.enabled=true;
    action.paused=false;
    action.time=Math.min(seconds,clip.duration);
    action.setEffectiveWeight(1);
  }
  landscapeMixer.update(0);
}
function updateBuild(){
  if(demoBuild)demoBuild.setFrame(Math.max(0,frame-(P.constructionAnimation.startFrame||0))/671*800);
  // Keep the proposed barn hidden while the trailer is being removed.
  if(buildModel)buildModel.visible=frame >= (P.constructionAnimation.startFrame||0);
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
function currentChapter(){return [...P.chapters].reverse().find(c=>frame>=c.start)||P.chapters[0];}
function setFrame(n){
  const previousFrame=frame;
  frame=THREE.MathUtils.clamp(Math.round(n),0,P.frameCount);
  // Every replay should be able to perform the automatic roof reveal again.
  const roofStart=P.roof.fadeStartFrame;
  if(previousFrame>=roofStart && frame<roofStart)roofManualOverride=null;
  // If the exterior was manually restored earlier, let the cutaway transition
  // take over again as we pass the construction checkpoint.
  if(previousFrame<roofStart && frame>=roofStart && roofManualOverride===false)
    roofManualOverride=null;
  updateLandscape();
  updateBuild();
  if(boundaries.length)updateBoundaries();
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
// Initialize the timeline only after all surface-boundary and POI state exists.
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
// Surface-anchored polygon boundaries. Points store mesh-local coordinates so
// they continue to follow animated objects as their world transforms change.
const boundaryRoot=new THREE.Group();scene.add(boundaryRoot);
const boundaryRaycaster=new THREE.Raycaster();
const pointerNDC=new THREE.Vector2();
const boundaries=[];
let activeBoundary=null, boundaryTool=false, draggingPoint=null, pointerStart=null;
const BOUNDARY_COLOR=0x9f2436;
const BOUNDARY_DEFAULT='#9f2436';
let boundarySerial=0;
const boundaryColors=['#9f2436','#df703c','#e6bf57','#28ada1','#6b8de3','#a568db','#f5f5f5'];
function boundaryKind(b){return b.points.length===1?'marker':b.points.length===2?'distance':'area';}
function boundaryColour(b){return b.color||BOUNDARY_DEFAULT;}
function updateFinishButton(){
 const n=activeBoundary?.points.length||0;
 const btn=$('finishBoundaryBtn');
 btn.disabled=n===0;
 btn.textContent=n<=1?'Place marker':n===2?'Measure distance':'Finish shape';
 $('boundaryModeText').textContent=n?`Drawing · ${n} point${n===1?'':'s'}`:'Draw marker, distance or area';
}
function finishBoundary(){
 if(!activeBoundary||!activeBoundary.points.length)return;
 const b=activeBoundary;
 b.closed=true;
 activeBoundary=null;
 rebuildBoundary(b);
 showBoundaryCoords(b.points[b.points.length-1]);
 setBoundaryTool(false);
}

function anchorWorld(a){return a.mesh.localToWorld(a.local.clone());}
function surfaceHit(clientX,clientY){
  const r=renderer.domElement.getBoundingClientRect();
  pointerNDC.set((clientX-r.left)/r.width*2-1,-(clientY-r.top)/r.height*2+1);
  boundaryRaycaster.setFromCamera(pointerNDC,camera);
  const meshes=[];
  for(const root of [landscapeRoot,baseScan,buildRoot])root.traverse(o=>{
    if(o.isMesh && o.visible && !o.userData.isRoofExteriorLayer && o.parent?.visible!==false)meshes.push(o);
  });
  const hits=boundaryRaycaster.intersectObjects(meshes,false);
  const hit=hits.find(h=>h.object.visible && h.object.parent?.visible!==false);
  if(!hit)return null;
  return {mesh:hit.object,local:hit.object.worldToLocal(hit.point.clone()),world:hit.point.clone()};
}
function formatPoint(v){return `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)} m`;}
function showBoundaryCoords(anchor){$('boundaryCoords').textContent=anchor?'Last point (world XYZ): '+formatPoint(anchorWorld(anchor)):'Click a surface to add a point';}
// Coordinates are approximate: +X east, -Z north, in metres from the scene origin.
// A true survey needs a georeferenced, north-aligned scene and a known local origin.
const GEO_ORIGIN={lat:50.629045,lon:-1.226456};
const EARTH_RADIUS=6378137;
function boundaryCentroid(points){
  const c=new THREE.Vector3();for(const v of points)c.add(v);
  return points.length?c.multiplyScalar(1/points.length):c;
}
function boundaryGPS(p){
  const latitude=GEO_ORIGIN.lat+(-p.z/EARTH_RADIUS)*180/Math.PI;
  const longitude=GEO_ORIGIN.lon+(p.x/(EARTH_RADIUS*Math.cos(GEO_ORIGIN.lat*Math.PI/180)))*180/Math.PI;
  return {latitude,longitude};
}
function boundaryArea(points){
  if(points.length<3)return 0;
  // Newell normal chooses a stable local 2D projection for triangulating a polygon.
  const normal=new THREE.Vector3();
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    normal.x+=(a.y-b.y)*(a.z+b.z);
    normal.y+=(a.z-b.z)*(a.x+b.x);
    normal.z+=(a.x-b.x)*(a.y+b.y);
  }
  if(normal.lengthSq()<1e-12)return 0;
  normal.normalize();
  const axis=new THREE.Vector3(1,0,0);
  if(Math.abs(normal.dot(axis))>.9)axis.set(0,0,1);
  const u=new THREE.Vector3().crossVectors(normal,axis).normalize();
  const v=new THREE.Vector3().crossVectors(normal,u).normalize();
  const origin=points[0];
  const projected=points.map(p=>new THREE.Vector2(p.clone().sub(origin).dot(u),p.clone().sub(origin).dot(v)));
  const triangles=THREE.ShapeUtils.triangulateShape(projected,[]);
  let area=0;
  for(const [a,b,c] of triangles){
    const ab=points[b].clone().sub(points[a]);
    const ac=points[c].clone().sub(points[a]);
    area+=new THREE.Vector3().crossVectors(ab,ac).length()*.5;
  }
  return area;
}
// Context menu for any finished marker, distance or area.
const boundaryMenu=document.createElement('div');
boundaryMenu.className='boundary-context-menu';
boundaryMenu.hidden=true;
boundaryMenu.innerHTML=`<button type="button" class="boundary-rename">Rename…</button>
<div class="boundary-color-title">Colour</div><div class="boundary-color-swatches"></div>
<label class="boundary-color-picker-label">Custom colour <input class="boundary-color-picker" type="color" value="#9f2436"></label>
<button type="button" class="boundary-delete">Delete?</button><button type="button" class="boundary-dismiss">Cancel</button>`;
viewport.appendChild(boundaryMenu);
const swatches=boundaryMenu.querySelector('.boundary-color-swatches');
for(const color of boundaryColors){
 const btn=document.createElement('button');btn.type='button';btn.className='boundary-swatch';btn.title=color;
 btn.style.background=color;btn.setAttribute('aria-label',`Set colour ${color}`);
 btn.addEventListener('click',()=>{if(boundaryMenuTarget){boundaryMenuTarget.color=color;rebuildBoundary(boundaryMenuTarget);}hideBoundaryMenu();});
 swatches.appendChild(btn);
}
let boundaryMenuTarget=null;
function hideBoundaryMenu(){boundaryMenu.hidden=true;boundaryMenuTarget=null;}
function showBoundaryMenu(e,b){
 if(!b.closed)return;
 e.preventDefault();e.stopPropagation();boundaryMenuTarget=b;
 const rect=viewport.getBoundingClientRect();
 boundaryMenu.hidden=false;
 boundaryMenu.querySelector('.boundary-color-picker').value=boundaryColour(b);
 const w=boundaryMenu.offsetWidth||210,h=boundaryMenu.offsetHeight||250;
 boundaryMenu.style.left=Math.max(6,Math.min(e.clientX-rect.left,rect.width-w-6))+'px';
 boundaryMenu.style.top=Math.max(6,Math.min(e.clientY-rect.top,rect.height-h-6))+'px';
}
boundaryMenu.querySelector('.boundary-rename').addEventListener('click',()=>{
 const b=boundaryMenuTarget;if(!b)return;
 const name=window.prompt('Name this measurement:',b.name||`Boundary ${b.id}`);
 if(name!==null){b.name=name.trim().slice(0,80)||`Boundary ${b.id}`;rebuildBoundary(b);}hideBoundaryMenu();
});
boundaryMenu.querySelector('.boundary-color-picker').addEventListener('input',e=>{
 if(boundaryMenuTarget){boundaryMenuTarget.color=e.target.value;rebuildBoundary(boundaryMenuTarget);}
});
boundaryMenu.querySelector('.boundary-delete').addEventListener('click',()=>{
 if(boundaryMenuTarget)removeBoundary(boundaryMenuTarget);
 hideBoundaryMenu();
});
boundaryMenu.querySelector('.boundary-dismiss').addEventListener('click',hideBoundaryMenu);
document.addEventListener('pointerdown',e=>{
 if(!boundaryMenu.hidden && !boundaryMenu.contains(e.target))hideBoundaryMenu();
},true);
function updateBoundaryLabel(b,coords){
 if(!b.closed||!coords.length)return;
 if(!b.label){
   b.label=document.createElement('div');
   b.label.className='boundary-stat-label';
   b.label.setAttribute('role','button');
   b.label.tabIndex=0;
   b.label.title='Right-click or long-press for options';
   b.label.addEventListener('contextmenu',e=>showBoundaryMenu(e,b));
   b.label.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){showBoundaryMenu({preventDefault(){},stopPropagation(){},clientX:viewport.getBoundingClientRect().left+viewport.clientWidth/2,clientY:viewport.getBoundingClientRect().top+viewport.clientHeight/2},b);}});
   let longPress=null;
   b.label.addEventListener('pointerdown',e=>{if(e.pointerType==='touch')longPress=setTimeout(()=>{showBoundaryMenu(e,b);longPress=null;},550);});
   for(const ev of ['pointerup','pointercancel','pointermove'])b.label.addEventListener(ev,()=>{clearTimeout(longPress);longPress=null;});
   $('boundaryLabels').appendChild(b.label);
 }
 const center=boundaryCentroid(coords),gps=boundaryGPS(center);
 b.center=center;
 b.label.replaceChildren();
 const heading=document.createElement('strong');heading.textContent=b.name||`Boundary ${String(b.id||1).padStart(2,'0')}`;
 heading.style.color=boundaryColour(b);
 const metric=document.createElement('span');
 if(coords.length===1){metric.textContent='Point marker · '+formatPoint(coords[0]);}
 else if(coords.length===2){metric.textContent=`Distance: ${coords[0].distanceTo(coords[1]).toFixed(2)} m`;}
 else{metric.textContent=`${boundaryArea(coords).toFixed(2)} m² · area (approx.)`;}
 const gpsLine=document.createElement('span');gpsLine.textContent=`${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)} (estimated)`;
 b.label.append(heading,metric,gpsLine);
 b.label.style.borderColor=boundaryColour(b);
 b.label.title='Estimated GPS (scene origin and north alignment require calibration). Right-click or long-press for options.';
}
function rebuildBoundary(b){
  // Regenerate only when geometry or animated positions change.
  for(const line of b.lines){boundaryRoot.remove(line);line.geometry.dispose();line.material.dispose();}
  b.lines=[];
  const coords=b.points.map(anchorWorld);
  b.handles.forEach((handle,i)=>{handle.position.copy(coords[i]);handle.visible=boundaryTool;handle.material.color.set(boundaryColour(b));handle.scale.setScalar(i===0?1.6:1);});
  updateBoundaryLabel(b,coords);
  if(coords.length<2)return;
  const path=coords.map(v=>v.clone().add(new THREE.Vector3(0,.025,0)));
  if(b.closed && coords.length>=3)path.push(path[0].clone());
  for(let i=0;i<path.length-1;i++){
    const a=path[i],z=path[i+1];if(a.distanceToSquared(z)<1e-10)continue;
    const segment=new THREE.LineCurve3(a,z);
    for(const [radius,color,opacity] of [[.112,boundaryColour(b),.21],[.031,boundaryColour(b),.97]]){
      const geometry=new THREE.TubeGeometry(segment,1,radius,5,false);
      const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity,depthTest:false,depthWrite:false});
      const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=700;
      mesh.userData.boundaryLine=true;
      b.lines.push(mesh);boundaryRoot.add(mesh);
    }
  }
}
function animateBoundaryLines(now){
  for(const b of boundaries){
    for(let i=0;i<b.lines.length;i++){
      const line=b.lines[i],mat=line.material;
      const glow=(i%2===0);
      mat.opacity=glow?.14+.14*(.5+.5*Math.sin(now*.0023+i*.55)):.79+.21*(.5+.5*Math.sin(now*.0035+i*.34));
    }
    if(!b.label || !b.center)continue;
    const loc=b.center.clone();loc.y+=.75;
    loc.project(camera);
    const inFront=loc.z>-1&&loc.z<1;
    b.label.hidden=!inFront;
    if(inFront){
      b.label.style.left=((loc.x+1)*.5*viewport.clientWidth)+'px';
      b.label.style.top=((1-loc.y)*.5*viewport.clientHeight)+'px';
    }
  }
}
function addBoundaryPoint(b,hit){
  const anchor={mesh:hit.mesh,local:hit.local.clone()};b.points.push(anchor);
  const handle=new THREE.Mesh(new THREE.SphereGeometry(.25,14,10),new THREE.MeshBasicMaterial({color:boundaryColour(b),depthTest:false}));
  handle.userData.boundary=b;handle.userData.anchorIndex=b.points.length-1;handle.renderOrder=710;
  handle.position.copy(hit.world);boundaryRoot.add(handle);b.handles.push(handle);rebuildBoundary(b);showBoundaryCoords(anchor);updateFinishButton();
}
function removeBoundary(b){if(boundaryMenuTarget===b)hideBoundaryMenu();for(const handle of b.handles){boundaryRoot.remove(handle);handle.geometry.dispose();handle.material.dispose();}for(const line of b.lines){boundaryRoot.remove(line);line.geometry.dispose();line.material.dispose();}for(const a of b.points){if(a.mesh?.userData?.boundaryFallback && a.mesh.parent===scene)scene.remove(a.mesh);}const i=boundaries.indexOf(b);if(i>=0)boundaries.splice(i,1);if(b.label)b.label.remove();if(activeBoundary===b)activeBoundary=null;}
function cancelBoundary(){if(activeBoundary){removeBoundary(activeBoundary);activeBoundary=null;}showBoundaryCoords(null);setBoundaryTool(false);updateFinishButton();}
function setBoundaryTool(on){boundaryTool=on;controls.enabled=!on;$('boundaryBtn').classList.toggle('active',on);$('boundaryBtn').setAttribute('aria-pressed',String(on));$('boundaryHud').hidden=!on;renderer.domElement.style.cursor=on?'crosshair':'';if(!on && activeBoundary){removeBoundary(activeBoundary);activeBoundary=null;}for(const b of boundaries)b.handles.forEach(h=>h.visible=on);}
$('boundaryBtn').addEventListener('click',()=>setBoundaryTool(!boundaryTool));
$('finishBoundaryBtn').addEventListener('click',finishBoundary);
updateFinishButton();
$('clearBoundariesBtn').addEventListener('click',()=>{for(const b of [...boundaries])removeBoundary(b);showBoundaryCoords(null);});
function pickHandle(clientX,clientY){
 const rect=renderer.domElement.getBoundingClientRect();
 const tolerance=(window.matchMedia('(pointer:coarse)').matches?32:19);
 let closest=null,best=tolerance*tolerance;
 for(const b of boundaries)for(const h of b.handles){
   if(!h.visible)continue;
   const p=h.position.clone().project(camera);
   if(p.z < -1 || p.z > 1)continue;
   const x=rect.left+(p.x+1)*rect.width/2;
   const y=rect.top+(1-p.y)*rect.height/2;
   const d=(x-clientX)**2+(y-clientY)**2;
   const threshold=b===activeBoundary&&h.userData.anchorIndex===0?tolerance*1.5:tolerance;
   if(d<threshold*threshold && (closest===null||d<best||h.userData.anchorIndex===0&&b===activeBoundary)){
      closest=h;best=d;
   }
 }
 return closest;
}
const canvas=renderer.domElement;
canvas.addEventListener('contextmenu',e=>{if(!boundaryTool)return;e.preventDefault();if(activeBoundary){cancelBoundary();return;}const handle=pickHandle(e.clientX,e.clientY);if(handle)removeBoundary(handle.userData.boundary);});
canvas.addEventListener('pointerdown',e=>{
  if(!boundaryTool || e.button!==0)return;
  e.preventDefault();e.stopPropagation();
  pointerStart={x:e.clientX,y:e.clientY};
  const handle=pickHandle(e.clientX,e.clientY);
  if(handle && activeBoundary && handle.userData.boundary===activeBoundary && handle.userData.anchorIndex===0){
    finishBoundary();return;
  }
  if(handle && !activeBoundary){draggingPoint=handle;canvas.setPointerCapture(e.pointerId);return;}
  const hit=surfaceHit(e.clientX,e.clientY);if(!hit)return;
  if(!activeBoundary){activeBoundary={id:++boundarySerial,name:'',color:BOUNDARY_DEFAULT,points:[],handles:[],lines:[],closed:false};boundaries.push(activeBoundary);updateFinishButton();}
  addBoundaryPoint(activeBoundary,hit);
});
canvas.addEventListener('pointermove',e=>{
  if(!draggingPoint)return;
  const hit=surfaceHit(e.clientX,e.clientY);if(!hit)return;
  const b=draggingPoint.userData.boundary;
  b.points[draggingPoint.userData.anchorIndex]={mesh:hit.mesh,local:hit.local.clone()};
  rebuildBoundary(b);showBoundaryCoords(b.points[draggingPoint.userData.anchorIndex]);
});
for(const n of ['pointerup','pointercancel'])canvas.addEventListener(n,()=>{draggingPoint=null;pointerStart=null;});
function updateBoundaries(){for(const b of boundaries)rebuildBoundary(b);}
// Portable one-line export. Mesh references use stable scene-root + child-index paths.
// World coordinates are stored as fallback for older or differently exported GLBs.
function encodeBoundaryAnchor(a){
 const roots={landscape:landscapeRoot,scan:baseScan,barn:buildRoot};
 let rootName=null,indices=[];
 for(const [name,root] of Object.entries(roots)){
   let obj=a.mesh,path=[];
   while(obj&&obj!==root){const parent=obj.parent;if(!parent)break;path.unshift(parent.children.indexOf(obj));obj=parent;}
   if(obj===root){rootName=name;indices=path;break;}
 }
 return {root:rootName,path:indices,meshName:a.mesh.name,local:a.local.toArray(),world:anchorWorld(a).toArray()};
}
function decodeBoundaryAnchor(a){
 const roots={landscape:landscapeRoot,scan:baseScan,barn:buildRoot};
 let mesh=roots[a.root];
 if(mesh && Array.isArray(a.path))for(const index of a.path){mesh=mesh?.children[index];}
 if(!mesh?.isMesh && roots[a.root]){
   roots[a.root].traverse(obj=>{if(!mesh?.isMesh && obj.isMesh&&obj.name===a.meshName)mesh=obj;});
 }
 if(mesh?.isMesh && a.local?.length===3)return {mesh,local:new THREE.Vector3(...a.local)};
 // Detached fallback allows geometry to remain visible if a mesh has been renamed.
 const point=new THREE.Vector3(...a.world);
 const holder=new THREE.Object3D();holder.position.copy(point);holder.userData.boundaryFallback=true;scene.add(holder);
 return {mesh:holder,local:new THREE.Vector3()};
}
function exportBoundaryData(){
 const data={version:1,origin:GEO_ORIGIN,shapes:boundaries.filter(b=>b.closed).map(b=>({
   id:b.id,name:b.name||'',color:boundaryColour(b),points:b.points.map(encodeBoundaryAnchor)
 }))};
 const bytes=new TextEncoder().encode(JSON.stringify(data));
 let bin='';for(const byte of bytes)bin+=String.fromCharCode(byte);
 return 'FVB1:'+btoa(bin);
}
function importBoundaryData(code){
 const trimmed=code.trim();if(!trimmed.startsWith('FVB1:'))throw Error('Invalid code: expected FVB1 prefix.');
 let data;
 try{
  const bin=atob(trimmed.slice(5));
  const bytes=Uint8Array.from(bin,c=>c.charCodeAt(0));
  data=JSON.parse(new TextDecoder().decode(bytes));
 }catch{throw Error('Invalid or damaged boundary code.');}
 if(data.version!==1||!Array.isArray(data.shapes)||data.shapes.length>300)throw Error('Unsupported or oversized boundary data.');
 const staged=[];
 try{
  for(const item of data.shapes){
   if(!Array.isArray(item.points)||item.points.length<1||item.points.length>500)throw Error('Invalid number of points.');
   const b={id:Number.isFinite(item.id)?item.id:++boundarySerial,name:String(item.name||'').slice(0,80),
     color:/^#[0-9a-fA-F]{6}$/.test(item.color)?item.color:BOUNDARY_DEFAULT,
     points:[],handles:[],lines:[],closed:true};
   for(const p of item.points){
     if(!Array.isArray(p.world)||p.world.length!==3||!p.world.every(Number.isFinite))throw Error('Invalid point coordinates.');
     b.points.push(decodeBoundaryAnchor(p));
   }
   staged.push(b);
  }
 }catch(err){for(const b of staged)for(const a of b.points)if(a.mesh?.userData?.boundaryFallback&&a.mesh.parent===scene)scene.remove(a.mesh);throw err;}
 if(activeBoundary)cancelBoundary();
 for(const b of [...boundaries])removeBoundary(b);
 for(const b of staged){boundarySerial=Math.max(boundarySerial,b.id);boundaries.push(b);
   b.points.forEach((a,i)=>{
     const h=new THREE.Mesh(new THREE.SphereGeometry(.25,14,10),new THREE.MeshBasicMaterial({color:boundaryColour(b),depthTest:false}));
     h.userData.boundary=b;h.userData.anchorIndex=i;h.renderOrder=710;boundaryRoot.add(h);b.handles.push(h);
   });rebuildBoundary(b);
 }
 setBoundaryTool(false);
 return staged.length;
}
function openBoundaryIO(mode){
 hideBoundaryMenu();
 $('boundaryIOModal').hidden=false;
 $('boundaryIOTitle').textContent=mode==='export'?'Export boundaries':'Import boundaries';
 $('boundaryIOText').value=mode==='export'?exportBoundaryData():'';
 $('boundaryIOText').readOnly=mode==='export';
 $('boundaryIOCopy').hidden=mode!=='export';
 $('boundaryIOApply').hidden=mode!=='import';
 $('boundaryIOStatus').textContent=mode==='import'?'Import replaces all current measurements. Import only codes you trust.':'Copy this code to restore all current measurements later.';
 $('boundaryIOText').focus();
}
$('boundaryIOBtn').addEventListener('click',()=>{$('boundaryIODropdown').hidden=!$('boundaryIODropdown').hidden;});
$('boundaryIOExportBtn').addEventListener('click',()=>{$('boundaryIODropdown').hidden=true;openBoundaryIO('export');});
$('boundaryIOImportBtn').addEventListener('click',()=>{$('boundaryIODropdown').hidden=true;openBoundaryIO('import');});
$('boundaryIOClose').addEventListener('click',()=>{$('boundaryIOModal').hidden=true;});
$('boundaryIOModal').addEventListener('click',e=>{if(e.target===$('boundaryIOModal'))$('boundaryIOModal').hidden=true;});
$('boundaryIOCopy').addEventListener('click',async()=>{
 try{await navigator.clipboard.writeText($('boundaryIOText').value);$('boundaryIOStatus').textContent='Copied to clipboard.';}
 catch{$('boundaryIOText').select();$('boundaryIOStatus').textContent='Select and copy the highlighted code.';}
});
$('boundaryIOApply').addEventListener('click',()=>{
 try{const n=importBoundaryData($('boundaryIOText').value);$('boundaryIOStatus').textContent=`Imported ${n} measurements.`;$('boundaryIOModal').hidden=true;}
 catch(err){$('boundaryIOStatus').textContent=err.message;}
});
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
function relevantPOIIds(){
  // Latest three unlocked construction annotations, updated on forward/backward scrubbing.
  // The current stage is most relevant; older stages fade as a new stage unlocks.
  const eligible=P.pointsOfInterest.filter(p=>frame>=p.fromFrame);
  eligible.sort((a,b)=>b.fromFrame-a.fromFrame);
  return new Set(eligible.slice(0,3).map(p=>p.id));
}
function updateStagePOI(){
  const relevant=relevantPOIIds();
  for(const {data,node} of poiNodes){
    node.classList.toggle('poi-unlocked',frame>=data.fromFrame);
    node.classList.toggle('poi-relevant',relevant.has(data.id));
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
  const relevant=relevantPOIIds();
  // Prioritize new stages so their labels take the clearest non-overlapping positions.
  const sorted=[...poiNodes].sort((a,b)=>b.data.fromFrame-a.data.fromFrame);
  for(const {data,node} of sorted){
    const pos=getMarkerWorldPosition(data);
    pos.project(camera);
    const inView=pos.z>-1&&pos.z<1&&Math.abs(pos.x)<.96&&Math.abs(pos.y)<.92;
    const visible=showLabels && relevant.has(data.id) && inView;
    node.classList.toggle('poi-visible',visible);
    node.setAttribute('aria-hidden',String(!visible));
    node.tabIndex=visible?0:-1;
    if(!visible)continue;
    const x=(pos.x*.5+.5)*w,y=(-pos.y*.5+.5)*h;
    let offsetX=0,offsetY=0;
    const shifts=[[0,0],[-155,-66],[155,-66],[-155,66],[155,66],[0,-110],[0,110],[-240,0],[240,0]];
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
let showAdminReadout=false;
const adminPosition=$('adminPosition'),adminRotation=$('adminRotation'),adminAngles=$('adminAngles');
const adminTarget=$('adminTarget'),adminDistance=$('adminDistance');
const fmtVec=(v,places=2)=>[v.x,v.y,v.z].map(n=>n.toFixed(places)).join(' / ');
function updateAdminReadout(){
  if(!showAdminReadout)return;
  adminPosition.textContent=fmtVec(camera.position);
  const r=camera.rotation;
  adminRotation.textContent=[r.x,r.y,r.z].map(a=>(THREE.MathUtils.radToDeg(a)).toFixed(1)+'°').join(' / ');
  adminAngles.textContent=THREE.MathUtils.radToDeg(controls.getAzimuthalAngle()).toFixed(1)+'° / '+
    (90-THREE.MathUtils.radToDeg(controls.getPolarAngle())).toFixed(1)+'°';
  adminTarget.textContent=fmtVec(controls.target);
  adminDistance.textContent=camera.position.distanceTo(controls.target).toFixed(2)+' m';
}
$('adminBtn').addEventListener('click',()=>{
  showAdminReadout=!showAdminReadout;
  $('adminReadout').hidden=!showAdminReadout;
  viewport.classList.toggle('admin-visible',showAdminReadout);
  $('adminBtn').classList.toggle('active',showAdminReadout);
  $('adminBtn').setAttribute('aria-pressed',String(showAdminReadout));
  $('adminBtn').setAttribute('aria-label',showAdminReadout?'Hide admin camera readout':'Show admin camera readout');
  updateAdminReadout();
});
$('copyCameraBtn').addEventListener('click',()=>{
  const pos=fmtVec(camera.position,4),target=fmtVec(controls.target,4);
  const angles=adminAngles.textContent;
  const message=`Camera position (X/Y/Z): ${pos}\nOrbit target (X/Y/Z): ${target}\nAzimuth / elevation: ${angles}`;
  if(navigator.clipboard?.writeText)navigator.clipboard.writeText(message).then(()=>{
    $('copyCameraBtn').textContent='Copied!';setTimeout(()=>$('copyCameraBtn').textContent='Copy camera coordinates',1200);
  }).catch(()=>window.prompt('Copy camera coordinates:',message));
  else window.prompt('Copy camera coordinates:',message);
});
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
  controls.update();updateAdminReadout();renderPOI();animateBoundaryLines(now);renderer.render(scene,camera);
}
let playbackFrame=0;requestAnimationFrame(animate);
$('fullscreenBtn').addEventListener('click',async()=>{if(!document.fullscreenElement)await $('app').requestFullscreen?.();else await document.exitFullscreen?.();});
$('screenshotBtn').addEventListener('click',()=>{renderer.render(scene,camera);const a=document.createElement('a');a.download='farmyard-view.png';a.href=renderer.domElement.toDataURL('image/png');a.click();});
function showHelp(open){$('helpModal').hidden=!open;if(open)$('closeHelp').focus();else $('helpBtn').focus();}
$('helpBtn').addEventListener('click',()=>showHelp(true));$('closeHelp').addEventListener('click',()=>showHelp(false));$('gotItBtn').addEventListener('click',()=>showHelp(false));
$('helpModal').addEventListener('click',e=>{if(e.target===$('helpModal'))showHelp(false);});
window.addEventListener('keydown',e=>{
  if(e.target.matches('input,select,textarea,button')&&e.key!=='Escape')return;
  if(e.key==='Escape' && !boundaryMenu.hidden){hideBoundaryMenu();return;}
  if(e.key==='Escape' && boundaryTool){cancelBoundary();return;}
  if(e.key==='Escape'){if(!$('helpModal').hidden)showHelp(false);else dismissPanel();return;}
  if(e.key==='?'){showHelp(true);return;}
  if(e.code==='Space'){e.preventDefault();setPlaying(!playing);}
  if(e.key==='ArrowLeft'){e.preventDefault();setPlaying(false);setFrame(frame-10);}
  if(e.key==='ArrowRight'){e.preventDefault();setPlaying(false);setFrame(frame+10);}
  if(e.key==='Home'){setPlaying(false);setFrame(0);}
  if(e.key==='End'){setPlaying(false);setFrame(P.frameCount);}
  if(e.key.toLowerCase()==='r')resetView();
});
renderTimeline();
setFrame(0);
initializeAssets();

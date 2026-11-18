import * as THREE from 'three';

const mat = (color, roughness=0.85, metalness=0) => new THREE.MeshStandardMaterial({color,roughness,metalness});
const grass = mat('#637f5d'), grassAlt = mat('#799669'), earth=mat('#b9a38a'), gravel=mat('#9d9f94'),
  wood=mat('#926e4e'), roof=mat('#53616a',.6,.25), wall=mat('#b8b6a8'),
  steel=mat('#4d6c77',.5,.6), concrete=mat('#bfc6c4'), dark=mat('#344047');
function box(group, dims, pos, material, name='') {
  const obj = new THREE.Mesh(new THREE.BoxGeometry(...dims), material); obj.position.set(...pos);obj.castShadow=true;obj.receiveShadow=true;obj.name=name;group.add(obj);return obj;
}
function prismRoof(group, w, length, y, x,z, material) {
  // Standard roof panels follow the pitch over a 2.8m rise.
  const rise=2.8, half=w/2, hyp=Math.hypot(half,rise), angle=Math.atan2(rise,half);
  for(const side of [-1,1]){
    const panel=box(group,[hyp+.35,.22,length+.5],[x+side*half/2,y+rise/2,z],material);
    panel.rotation.z=side===-1?angle:-angle;
  }
}
function tree(group,x,z,scale=1) {
  const trunk= new THREE.Mesh(new THREE.CylinderGeometry(.22*scale,.32*scale,3.2*scale,7),wood);
  trunk.position.set(x,1.6*scale,z);trunk.castShadow=true;group.add(trunk);
  const crown= new THREE.Mesh(new THREE.IcosahedronGeometry(2.0*scale,1),mat('#607a55'));
  crown.position.set(x,4.2*scale,z);crown.castShadow=true;group.add(crown);
}
export function createDemoSite(){
  const root=new THREE.Group();root.name='Demo Farmyard (replace with scan GLB)';
  box(root,[100,.4,82],[0,-.27,0],grass);
  box(root,[30,.025,25],[18,-.045,1],gravel);
  box(root,[16,.04,18],[19,-.012,-13],earth);
  box(root,[9,6.5,12],[19,3.25,-13],wall);
  prismRoof(root,9.7,12,6.55,19,-13,roof);
  box(root,[2.8,4,.15],[19,2,-6.9],dark);
  box(root,[7,.055,34],[14,-.005,24],gravel);
  box(root,[25,.045,8],[19,-.015,17],gravel);
  box(root,[1.2,1.4,.8],[29,.7,13],wood);
  box(root,[1.4,.75,2.2],[30,.37,15],dark);
  for(const [x,z,s] of [[-32,-22,1.2],[-37,18,.9],[-17,29,1.15],[38,-27,1.15],[36,27,1],[3,-31,.9],[-31,7,.9]]) tree(root,x,z,s);
  for(let i=0;i<14;i++){
    const x=-45+i*6.5;
    const post=box(root,[.1,1.1,.1],[x,.5,-32],wood);
    if(i<13)box(root,[6.4,.07,.07],[x+3.2,.83,-32],wood);
  }
  const field=new THREE.Mesh(new THREE.PlaneGeometry(55,38),grassAlt);
  field.rotation.x=-Math.PI/2;field.position.set(-22,-.047,-12);field.receiveShadow=true;root.add(field);
  return root;
}

// Procedural build staging, driven by the same 0–800 global timeline as imported animation.
export function createDemoBarn(){
  const root=new THREE.Group();root.name='Demo construction (replace with animated GLB)';
  const stages=[];
  function staged(mesh,start,end){stages.push({mesh,start,end});return mesh;}
  staged(box(root,[16,.35,23],[0,.13,0],concrete,'Slab'),120,255);
  for(const x of [-7.5,7.5])for(const z of [-10,0,10]){
    staged(box(root,[.33,9,.33],[x,4.5,z],steel,'Steel column'),275,420);
  }
  for(const x of [-7.5,7.5]){
    staged(box(root,[.3,.32,22],[x,9,0],steel,'Eave beam'),350,445);
  }
  for(const z of [-10,0,10]){
    const left=box(root,[10.45,.28,.3],[-3.75,10.35,z],steel,'Roof truss');left.rotation.z=Math.atan2(2.7,7.5);
    staged(left,395,500);
    const right=box(root,[10.45,.28,.3],[3.75,10.35,z],steel,'Roof truss');right.rotation.z=-Math.atan2(2.7,7.5);
    staged(right,395,500);
  }
  const roofGroup=new THREE.Group();root.add(roofGroup);prismRoof(roofGroup,15.5,21.5,9.15,0,0,roof);staged(roofGroup,485,610);
  for(const x of [-7.65,7.65])staged(box(root,[.2,7,20],[x,3.65,0],wall,'Wall cladding'),530,665);
  staged(box(root,[15,.2,.2],[0,6.9,-10.1],wall,'Rear wall cap'),570,690);
  staged(box(root,[15,7,.18],[0,3.65,-10.1],wall,'Rear wall'),565,700);
  for(const x of [-5.4,5.4])staged(box(root,[4.2,7,.18],[x,3.65,10.1],wall,'Front cladding'),590,710);
  const door=box(root,[5.5,6,.15],[0,3,10.3],dark,'Sliding barn doors');staged(door,700,780);
  const trim=box(root,[16,.24,.35],[0,7.2,10.1],steel,'Gable trim');staged(trim,710,800);
  function setFrame(frame){
    for(const {mesh,start,end} of stages){
      // Appear in place and grow vertically or from center. End state is exact original geometry.
      const t=THREE.MathUtils.clamp((frame-start)/(end-start),0,1);
      mesh.visible=t>0;
      mesh.scale.set(1,Math.max(.001,t*t*(3-2*t)),1);
    }
  }
  setFrame(0);
  return {root,setFrame};
}

// ══════════════════════════════════════════════════════════════════════
// terrain.js —— Extreme Terrain 地基模組(C4 核心,可整檔搬走)
// 只依賴 three,零遊戲耦合。照 water-kit(src/water.js)同一套收割範式:
//   1. terrainHeightAt(x,z)      地形高度場(滑板/BMX/衝浪的板、人、道具全用它=判定=畫面)
//   2. terrainSlopeAt(x,z)       地形斜率(數值微分;板身順著坡面傾斜)
//   3. createTerrainMesh(...)    地形渲染(位移 PlaneGeometry;靜態,建一次)
//   4. alignToSurface(obj,...)   把任何 Object3D 貼在地形表面(高度+順坡傾斜)
//   5. PROFILES                  斷面庫:halfpipe(U 型池)/kicker(起跳台)/flat
// 換皮:BMX=同 halfpipe 換車;衝浪=把 heightAt 換成 water-kit 的 waterHeightAt(浪=會動的地形)。
// ══════════════════════════════════════════════════════════════════════
import * as THREE from "three";

// ── 量值可調(鐵則):地形尺寸全集中這裡 ──
export const TERRAIN = {
  // U 型池(半管):z=橫向(玩的軸),x=縱向(池長)
  halfpipe: {
    flat: 2.6,     // 池底平坦區半寬(m)
    radius: 3.4,   // 過渡弧(quarter pipe)半徑(m)→ lip 高度=radius
    length: 26,    // 池長(x 軸)
  },
  colorConcrete: 0xb8bdc4, // 混凝土
  colorCoping: 0xe8b13a,   // 池緣鋼管(coping)
};

// U 型池斷面:|z|<=flat → 0;flat<|z|<=flat+radius → 圓弧上升;超出=夾在 lip(垂直牆不可騎)
export function halfpipeProfile(z) {
  const { flat, radius } = TERRAIN.halfpipe;
  const a = Math.abs(z) - flat;
  if (a <= 0) return 0;
  const t = Math.min(a, radius);
  return radius - Math.sqrt(Math.max(0, radius * radius - t * t));
}

// 地形高度場(目前=U 型池,沿 x 等斷面;要加 kicker/落差就在這疊加)
export function terrainHeightAt(x, z) {
  return halfpipeProfile(z);
}

// 斜率(數值微分)——板身傾斜與下滑加速度都用它
export function terrainSlopeAt(x, z) {
  const e = 0.12;
  return {
    dx: (terrainHeightAt(x + e, z) - terrainHeightAt(x - e, z)) / (2 * e),
    dz: (terrainHeightAt(x, z + e) - terrainHeightAt(x, z - e)) / (2 * e),
  };
}

// lip(池緣)資訊:騎乘域邊界
export function lipInfo() {
  const { flat, radius } = TERRAIN.halfpipe;
  return { z: flat + radius, height: radius };
}

// ── 地形渲染:位移 PlaneGeometry(靜態,建一次;段數夠密弧才圓) ──
export function createTerrainMesh({ width, length, segX = 32, segZ = 128, color = TERRAIN.colorConcrete } = {}) {
  const hp = TERRAIN.halfpipe;
  const w = width ?? hp.length;
  const l = length ?? (hp.flat + hp.radius) * 2;
  const geo = new THREE.PlaneGeometry(w, l, segX, segZ);
  geo.rotateX(-Math.PI / 2); // y-up:plane 的本地 x→世界 x、本地 y→世界 z
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    pos.setY(i, terrainHeightAt(pos.getX(i), pos.getZ(i)));
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0.02 });
  return new THREE.Mesh(geo, mat);
}

// 池緣 coping 鋼管 ×2(視覺定位 lip,孩子知道從哪起跳)
export function createCoping(scene) {
  const { z } = lipInfo();
  const { radius, length } = TERRAIN.halfpipe;
  const mat = new THREE.MeshStandardMaterial({ color: TERRAIN.colorCoping, roughness: 0.35, metalness: 0.6 });
  const pipes = [];
  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, length, 10), mat);
    pipe.rotation.z = Math.PI / 2;
    pipe.rotation.y = Math.PI / 2;
    pipe.position.set(0, radius + 0.03, side * z);
    scene.add(pipe);
    pipes.push(pipe);
  }
  return pipes;
}

// ── 貼地:把任何 Object3D 放上地形表面(高度+順坡傾斜) ──
// offset=離地高(輪高/板厚);tiltMul=傾斜跟坡的程度 0..1(板 0.85、人 0.4)
// ★用 atan(slope)=幾何正確的坡角(自帶 ±90° 上限)——直接用 slope 當弧度在陡壁會把人轉埋進地形(07-18 首跑抓到)
export function alignToSurface(obj, x, z, { offset = 0, tiltMul = 1 } = {}) {
  const h = terrainHeightAt(x, z);
  obj.position.y = h + offset;
  const s = terrainSlopeAt(x, z);
  obj.rotation.x = Math.atan(s.dz) * tiltMul;  // 橫向坡 → 前後傾(面向 +z 時)
  obj.rotation.z = -Math.atan(s.dx) * tiltMul;
  return h;
}

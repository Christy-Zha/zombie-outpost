// 据点 3D 场景（写实版）：水泥路障围墙、瞭望塔、8 块建筑地块、黄昏光影、闲逛的幸存者、墙外游荡的丧尸
// 贴图和道具来自 Poly Haven（CC0），见 js/env.js；人物用 Mixamo 模型（有的话）
import * as THREE from '../vendor/three.module.min.js';
import { BUILDINGS, COMPANIONS } from './data.js';
import { zombieGeometry, personGroup, rand, seeded } from './util.js';
import { pbr, prop, propInstances } from './env.js';
import { hasModel, Rig } from './models.js';
import { mergeGeometries } from '../vendor/utils/BufferGeometryUtils.js';

// 把一组零件里“同一种材质”的方块/道具合并成一个网格：几百次绘制 → 几十次（手机关键优化）
function bake(g) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert();
  const byMat = new Map(), keep = [];
  g.traverse(o => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.blink || o.material.transparent) { if (o.isMesh) keep.push(o); return; }
    const k = o.material.uuid;
    if (!byMat.has(k)) byMat.set(k, { mat: o.material, list: [], shadow: o.castShadow });
    const geo = o.geometry.clone();
    for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
    if (!geo.attributes.uv) return;
    geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    byMat.get(k).list.push(geo.index ? geo.toNonIndexed() : geo);
  });
  const out = new THREE.Group();
  for (const { mat, list, shadow } of byMat.values()) {
    const merged = list.length === 1 ? list[0] : mergeGeometries(list, false);
    if (!merged) continue;
    const m = new THREE.Mesh(merged, mat);
    m.castShadow = shadow; m.receiveShadow = true;
    out.add(m);
  }
  for (const o of keep) { o.updateMatrixWorld(true); const c = o.clone(); c.matrix.multiplyMatrices(inv, o.matrixWorld); c.matrix.decompose(c.position, c.quaternion, c.scale); out.add(c); }
  return out;
}

export const BASE_TEXTURES = [
  'brown_mud_leaves_01', 'asphalt_02', 'concrete_floor_01', 'concrete_block_wall', 'concrete_brick_wall_001',
  'corrugated_iron', 'rusted_shutter', 'green_metal_rust', 'rust_coarse_01', 'brown_planks_05', 'brick_wall_001', 'brown_mud',
];

// 每个建筑在据点里的位置
const PLOTS = {
  dorm: [-6, -3.4], hq: [-2, -3.4], armory: [2, -3.4], radio: [6, -3.4],
  clinic: [-6, 3.4], gym: [-2, 3.4], farm: [2, 3.4], scrapyard: [6, 3.4],
};
export const TOWERS = [[-9.4, -6.8], [9.4, -6.8], [-9.4, 6.8], [9.4, 6.8]]; // 四角瞭望塔
const TINTS = [0xc06050, 0x5080b0, 0x60a060, 0x9070b0, 0xc08040, 0x50a0a0, 0x909090, 0xc0b050];

// ---------- 小工具：带贴图的方块 ----------
const matCache = new Map();
function mat(name, rep = [1, 1], color = 0xffffff, rough = 0.9) {
  const k = `${name}|${rep}|${color}|${rough}`;
  if (!matCache.has(k)) matCache.set(k, pbr(name, { repeat: rep, color, rough }));
  return matCache.get(k);
}
const plain = (color, rough = 0.6, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
// 方块：y 是底部高度
function block(g, w, h, d, material, x = 0, y = 0, z = 0, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  m.rotation.y = ry;
  m.castShadow = m.receiveShadow = true;
  g.add(m);
  return m;
}
function pole(g, r, h, material, x, y, z, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true;
  g.add(m);
  return m;
}
const add = (g, name, o) => { const p = prop(name, { shadow: true, ...o }); g.add(p); return p; };

// ---------- 各建筑（lv = 等级；0 = 工地） ----------
function buildSite(g) {
  block(g, 3, 0.06, 3, mat('brown_mud', [1.5, 1.5]));
  block(g, 0.1, 1.1, 0.1, mat('brown_planks_05', [0.2, 1]), -1, 0, 1.1);
  block(g, 0.9, 0.5, 0.05, plain(0xe0b030), -1, 0.75, 1.16);
  for (let i = 0; i < 4; i++) block(g, 1.6, 0.08, 0.25, mat('brown_planks_05', [1, 0.2]), 0.4, 0.06 + i * 0.08, -0.5 + (i % 2) * 0.1, i * 0.15);
  add(g, 'barrel_03', { x: 1, z: 0.9, ry: 0.4 });
}

function buildHQ(g, lv) {
  const fl = Math.min(4, 1 + Math.floor(lv / 3)), h = 1.2 * fl;
  const wall = mat('concrete_brick_wall_001', [1.6, 0.7 * fl]);
  block(g, 2.8, h, 2.4, wall);
  const glass = plain(0x1d2a36, 0.15, 0.6);
  for (let i = 0; i < fl; i++) {
    for (const x of [-0.85, 0, 0.85]) block(g, 0.55, 0.5, 0.04, glass, x, 0.45 + i * 1.2, 1.21);
    for (const z of [-0.6, 0.6]) block(g, 0.04, 0.5, 0.55, glass, 1.41, 0.45 + i * 1.2, z);
  }
  block(g, 3.0, 0.14, 2.6, mat('concrete_floor_01', [1.5, 1.3]), 0, h);
  block(g, 0.8, 0.95, 0.06, mat('rusted_shutter', [1, 1]), 0, 0, 1.23);
  pole(g, 0.035, 1.6, plain(0xcccccc, 0.4, 0.8), 1.1, h + 0.14, -0.9);
  block(g, 0.75, 0.42, 0.03, plain(0xb83228, 0.8), 1.48, h + 1.3, -0.9);
  if (lv >= 2) add(g, 'portable_generator', { x: -1.75, z: 0.6, ry: 1.6, scale: 1.1 });
  add(g, 'utility_box_01', { x: 1.6, z: 1.0, ry: -1.57, scale: 0.9 });
  if (lv >= 4) add(g, 'street_lamp_01', { x: -1.4, z: 1.5, scale: 0.75 });
}

function buildArmory(g, lv) {
  const iron = mat('corrugated_iron', [2, 1], 0xa8b090, 0.7);
  block(g, 2.8, 1.4, 2.4, iron);
  for (const s of [-1, 1]) { // 人字形铁皮屋顶
    const r = block(g, 1.6, 0.06, 2.6, iron, s * 0.68, 1.6, 0);
    r.rotation.z = -s * 0.32;
  }
  block(g, 1.2, 1.1, 0.06, mat('rusted_shutter', [1, 1]), 0, 0, 1.23);
  const n = Math.min(6, 1 + Math.floor(lv / 2));
  for (let i = 0; i < n; i++) add(g, 'old_military_crate', { x: -0.9 + (i % 2) * 1.8 * 0, z: 1.75, y: Math.floor(i / 2) * 0.3, ry: i % 2 ? 0.08 : -0.05, scale: [0.6, 1, 0.6] }).position.x = i % 2 ? 0.75 : -0.75;
  for (let i = 0; i < Math.min(4, lv); i++) add(g, 'ammo_box', { x: -1.25 + i * 0.25, z: 1.75, y: Math.ceil(n / 2) * 0.3, ry: 1.57, scale: 1.8 });
  if (lv >= 5) for (const x of [1.6, 1.6]) add(g, 'barrel_03', { x, z: -0.6 + Math.random(), scale: 0.9 });
}

function buildGym(g, lv) {
  block(g, 3, 0.05, 3, mat('brown_mud', [1.5, 1.5]));
  const metal = mat('rust_coarse_01', [0.3, 1], 0xffffff, 0.6);
  pole(g, 0.05, 1.7, metal, -1, 0, -0.9); pole(g, 0.05, 1.7, metal, 1, 0, -0.9);
  const bar = pole(g, 0.035, 2, metal, 0, 1.62, -0.9); bar.rotation.z = Math.PI / 2; bar.position.y = 1.65;
  pole(g, 0.015, 0.4, plain(0x333333), 0.5, 1.25, -0.9);
  pole(g, 0.2, 0.75, plain(0x5a2a20, 0.9), 0.5, 0.5, -0.9, 12);
  const tires = Math.min(7, lv + 1);
  for (let i = 0; i < tires; i++) {
    const t = add(g, 'old_tyre', { x: -1 + (i % 3) * 0.7, y: 0.08 + Math.floor(i / 3) * 0.16, z: 0.8, scale: 1 });
    t.rotation.x = Math.PI / 2;
  }
  block(g, 1.2, 0.35, 0.35, mat('brown_planks_05', [1, 0.3]), 0.8, 0, 0.1, 0.3);
}

function buildClinic(g, lv) {
  const h = 1.35 + 0.08 * lv;
  block(g, 2.6, h, 2.2, mat('concrete_block_wall', [1.4, 0.8], 0xf2efe6));
  block(g, 2.8, 0.12, 2.4, mat('concrete_floor_01', [1.4, 1.2], 0xd8d4c8), 0, h);
  const red = plain(0xc8261e, 0.7);
  block(g, 0.6, 0.18, 0.04, red, 0, h * 0.62 - 0.09, 1.12);
  block(g, 0.18, 0.6, 0.04, red, 0, h * 0.62 - 0.3, 1.12);
  block(g, 0.7, 0.9, 0.05, mat('rusted_shutter', [1, 1], 0xd0d0d0), -0.8, 0, 1.12);
  for (let i = 0; i < Math.min(4, 1 + Math.floor(lv / 2)); i++) add(g, 'medical_box', { x: 0.5 + (i % 2) * 0.55, y: Math.floor(i / 2) * 0.1, z: 1.45, scale: 1.2 });
  if (lv >= 4) { // 帐篷式的扩建病房
    block(g, 1.3, 0.8, 1.2, plain(0x7f8c6a, 0.95), 1.95, 0, 0.2);
    const tarp = block(g, 1.5, 0.05, 1.4, plain(0x6c7858, 0.95), 1.95, 0.85, 0.2); tarp.rotation.z = 0.12;
  }
}

function buildFarm(g, lv) {
  block(g, 3, 0.12, 3, mat('brown_mud', [1.5, 1.5], 0x8a7a6a));
  const r = seeded(lv * 31 + 7);
  const rows = Math.min(5, 1 + Math.ceil(lv / 2));
  const leaf = [plain(0x4f7d32, 0.9), plain(0x6b8f2a, 0.9), plain(0x8a9a30, 0.9)];
  for (let k = 0; k < rows; k++) {
    const z = rows === 1 ? 0 : -1.1 + k * 2.2 / (rows - 1);
    for (let i = 0; i < 6; i++) {
      const hh = 0.25 + r() * 0.35;
      const c = new THREE.Mesh(new THREE.ConeGeometry(0.16, hh, 6), leaf[(k + i) % 3]);
      c.position.set(-1.15 + i * 0.46, 0.12 + hh / 2, z); c.castShadow = true; g.add(c);
    }
  }
  const wood = mat('brown_planks_05', [1.5, 0.15]);
  for (const s of [-1, 1]) { block(g, 3.2, 0.12, 0.06, wood, 0, 0.35, s * 1.6); block(g, 0.06, 0.12, 3.2, wood, s * 1.6, 0.35, 0); }
  add(g, 'barrel_03', { x: 1.45, z: -1.45, scale: 0.8 });
}

function buildScrapyard(g, lv) {
  const r = seeded(lv * 97 + 13);
  const rust = mat('rust_coarse_01', [0.8, 0.8]);
  for (let i = 0; i < 3 + lv; i++) {
    const m = block(g, 0.4 + r() * 0.8, 0.25 + r() * 0.45, 0.4 + r() * 0.8, rust, (r() - 0.5) * 1.8, r() * 0.3 * Math.min(1, i / 4), (r() - 0.5) * 1.8, r() * 3);
    m.rotation.z = (r() - 0.5) * 0.5;
  }
  if (lv >= 2) add(g, 'covered_car', { x: -0.5, z: 0.4, ry: 1.3, scale: 0.65 });
  for (let i = 0; i < Math.min(3, lv); i++) add(g, 'propane_tank', { x: 1.3, z: -0.8 + i * 0.4 });
  const yel = plain(0xd0a020, 0.6, 0.3);
  block(g, 0.2, 2.4, 0.2, yel, 1.3, 0, -1.3); block(g, 1.8, 0.14, 0.14, yel, 0.5, 2.3, -1.3);
  pole(g, 0.02, 0.8, plain(0x222222), -0.3, 1.5, -1.3);
}

function buildDorm(g, lv) {
  const floors = Math.min(3, 1 + Math.floor(lv / 4));
  const tints = [0x8fb0a0, 0xc08060, 0x90a0c0, 0xc0b080];
  for (let f = 0; f < floors; f++)
    for (let k = 0; k < 2; k++) {
      const c = block(g, 2.8, 0.95, 1.15, mat('green_metal_rust', [2, 0.7], tints[(f * 2 + k) % 4], 0.6), 0, f * 0.97, -0.6 + k * 1.2);
      c.rotation.y = (k - 0.5) * 0.04;
      block(g, 0.45, 0.3, 0.03, plain(0xffd88a, 0.5), 0.6, f * 0.97 + 0.4, 0.02 + k * 1.2);
      g.children[g.children.length - 1].material.emissive = new THREE.Color(0x553300);
    }
  if (floors > 1) for (let y = 0; y < floors * 0.97; y += 0.25) block(g, 0.4, 0.03, 0.05, plain(0x777777, 0.5, 0.8), 1.5, y, 0.6);
}

function buildRadio(g, lv) {
  const h = 2.8 + 0.38 * lv;
  block(g, 1.3, 1.0, 1.3, mat('concrete_block_wall', [0.8, 0.6]), -0.75, 0, 0.6);
  block(g, 1.4, 0.08, 1.4, mat('corrugated_iron', [1, 1]), -0.75, 1.0, 0.6);
  const metal = mat('rust_coarse_01', [0.2, 2], 0xd0d0d0, 0.5);
  const top = 0.12, bot = 0.45;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, h, 6), metal);
    const tx = sx * (bot + top) / 2, tz = sz * (bot + top) / 2;
    leg.position.set(0.7 + tx, h / 2, -0.5 + tz);
    leg.rotation.z = -sx * Math.atan((bot - top) / h); leg.rotation.x = sz * Math.atan((bot - top) / h);
    leg.castShadow = true; g.add(leg);
  }
  for (let y = 0.5; y < h - 0.3; y += 0.55) { const w = (bot - (bot - top) * y / h) * 2; block(g, w, 0.03, 0.03, metal, 0.7, y, -0.5 + w / 2); block(g, w, 0.03, 0.03, metal, 0.7, y, -0.5 - w / 2); }
  const dish = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 8, 0, Math.PI * 2, 0, 0.9), plain(0xe8e8e8, 0.4, 0.3));
  dish.material.side = THREE.DoubleSide;
  dish.position.set(0.7, h - 0.8, -0.1); dish.rotation.x = -1.2; dish.castShadow = true; g.add(dish);
  const light = block(g, 0.12, 0.12, 0.12, new THREE.MeshBasicMaterial({ color: 0xff3020 }), 0.7, h, -0.5);
  light.userData.blink = true;
  add(g, 'utility_box_01', { x: -1.5, z: -0.6, ry: 0.5, scale: 0.8 });
}

const BUILDERS = { hq: buildHQ, armory: buildArmory, gym: buildGym, clinic: buildClinic, farm: buildFarm, scrapyard: buildScrapyard, dorm: buildDorm, radio: buildRadio };

export class BaseView {
  constructor(onSelect) {
    this.onSelect = onSelect;
    this.t = 0; this.levels = {}; this.groups = {}; this.sel = null;
    this.shadowDirty = true; // 静态阴影：只在建筑变化时重算
    this.pickables = []; this.survivors = []; this.zombies = []; this.blinks = [];
    const s = this.scene = new THREE.Scene();
    const sky = new THREE.Color(0x4a4640);
    s.background = sky;
    s.fog = new THREE.Fog(sky, 45, 110);
    this.camera = new THREE.PerspectiveCamera(32, 1, 1, 400);
    this.d = 40;

    // 黄昏光：低角度暖色太阳 + 冷色天光，带阴影
    s.add(new THREE.HemisphereLight(0xb8c4d8, 0x4a3e30, 1.4));
    const sun = this.sun = new THREE.DirectionalLight(0xffd2a0, 2.8);
    sun.position.set(-16, 14, 9);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 12, bottom: -12, near: 1, far: 60 });
    sun.shadow.bias = -0.0008;
    sun.shadow.camera.updateProjectionMatrix();
    s.add(sun);

    const flat = (w, h, material, y, x = 0, z = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
      m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.receiveShadow = true; s.add(m); return m;
    };
    flat(200, 200, mat('brown_mud_leaves_01', [50, 50]), 0);
    flat(18.6, 13.6, mat('concrete_floor_01', [6, 4.5]), 0.02);
    flat(18.6, 1.9, mat('asphalt_02', [7, 0.7]), 0.03);
    flat(1.9, 24, mat('asphalt_02', [0.7, 9]), 0.025, 0, 19);

    this.buildWalls();
    this.buildCampfire();
    this.buildClutter();

    const padMat = mat('concrete_floor_01', [1.2, 1.2], 0xb8b4aa);
    for (const b of BUILDINGS) {
      if (!PLOTS[b.key]) continue;
      const [x, z] = PLOTS[b.key];
      const pad = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.08, 3.5), padMat);
      pad.position.set(x, 0.04, z);
      pad.receiveShadow = true;
      pad.userData.key = b.key;
      pad.userData.isPad = true;
      s.add(pad);
      this.pickables.push(pad);
    }

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(2.1, 2.35, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, depthWrite: false })
    );
    this.ring.visible = false;
    s.add(this.ring);

    // 墙外游荡的丧尸
    const zg = hasModel('zombie') ? null : zombieGeometry();
    const zm = new THREE.MeshLambertMaterial({ vertexColors: true });
    for (let i = 0; i < 7; i++) {
      let obj, rig = null;
      if (zg) obj = new THREE.Mesh(zg, zm);
      else { rig = new Rig('zombie', 1.8); rig.play('walk', { fade: 0, speed: 0.6 }); rig.mixer.update(Math.random() * 3); obj = rig.group; }
      s.add(obj);
      this.zombies.push({ obj, rig, ang: rand(0, Math.PI * 2), rx: rand(12.5, 16), rz: rand(10, 13), spd: rand(0.15, 0.3) * (Math.random() < 0.5 ? 1 : -1), ph: rand(0, 6) });
    }

    this.ray = new THREE.Raycaster();
    this.v2 = new THREE.Vector2();
  }

  buildWalls() {
    const s = this.scene, list = [];
    const L = 1.55 * 1.3; // 路障长度（放大 1.3 倍）
    for (let x = -9.2 + L / 2; x <= 9.2 - L / 2 + 0.01; x += L) {
      list.push({ x, z: -6.8, ry: 0, s: 1.3 });
      if (Math.abs(x) > 1.4) list.push({ x, z: 6.8, ry: 0, s: 1.3 });
    }
    for (let z = -6.8 + L / 2; z <= 6.8 - L / 2 + 0.01; z += L) list.push({ x: -9.4, z, ry: Math.PI / 2, s: 1.3 }, { x: 9.4, z, ry: Math.PI / 2, s: 1.3 });
    s.add(propInstances('concrete_road_barrier', list, { lambert: false, shadow: true }));
    // 四角瞭望塔：木头支架 + 铁皮顶
    const wood = mat('brown_planks_05', [0.3, 2]), plank = mat('brown_planks_05', [1, 1]), iron = mat('corrugated_iron', [1, 1]);
    for (const [x, z] of TOWERS) {
      const g = new THREE.Group();
      for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) block(g, 0.12, 2.6, 0.12, wood, dx, 0, dz);
      block(g, 1.2, 0.1, 1.2, plank, 0, 1.9);
      for (const [w, d, dx, dz] of [[1.2, 0.06, 0, 0.6], [1.2, 0.06, 0, -0.6], [0.06, 1.2, 0.6, 0], [0.06, 1.2, -0.6, 0]]) block(g, w, 0.45, d, plank, dx, 2.0, dz);
      block(g, 1.4, 0.06, 1.4, iron, 0, 2.6);
      const baked = bake(g);
      baked.position.set(x, 0, z);
      s.add(baked);
    }
    // 大门：沙袋 + 两盏路灯
    const bag = mat('brown_mud', [1, 0.3], 0xb8a070);
    for (const x of [-2.4, 2.4]) block(s, 1.1, 0.4, 0.5, bag, x, 0, 7.6);
    for (const x of [-1.6, 1.6]) {
      s.add(prop('street_lamp_01', { x, z: 7.3, ry: x < 0 ? Math.PI / 2 : -Math.PI / 2, shadow: true, scale: 0.8 }));
      const pl = new THREE.PointLight(0xffc070, 10, 9, 1.6);
      pl.position.set(x, 2.9, 7.1);
      s.add(pl);
    }
  }

  buildCampfire() {
    const s = this.scene;
    const g = new THREE.Group();
    const wood = mat('brown_planks_05', [0.5, 0.2], 0x8a6a50);
    block(g, 1.0, 0.12, 0.16, wood, 0, 0, 0, 0.6);
    block(g, 1.0, 0.12, 0.16, wood, 0, 0.06, 0, -0.6);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.1, 6, 12).rotateX(Math.PI / 2), mat('concrete_floor_01', [0.5, 0.5], 0x777777));
    ring.position.y = 0.05; ring.receiveShadow = true; g.add(ring);
    for (const a of [0.6, 2.4, 4.1]) g.add(prop('barrel_03', { x: Math.sin(a) * 1.6, z: Math.cos(a) * 0.9, scale: 0.6, shadow: true }));
    s.add(g);
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.75, 8), new THREE.MeshBasicMaterial({ color: 0xff8a1a }));
    this.flame.position.y = 0.45;
    s.add(this.flame);
    this.light = new THREE.PointLight(0xff8a3a, 14, 10, 1.8);
    this.light.position.set(0, 1.2, 0);
    s.add(this.light);
  }

  // 围墙边的杂物：油桶、木箱、汽油桶
  buildClutter() {
    const s = this.scene, r = seeded(42);
    const along = [];
    for (let i = 0; i < 16; i++) {
      const side = i % 4;
      const t = r() * 2 - 1;
      along.push(side === 0 ? [t * 8.4, -6.1] : side === 1 ? [t * 8.4, 6.1] : side === 2 ? [-8.7, t * 5.6] : [8.7, t * 5.6]);
    }
    const barrels = [], crates = [], cans = [];
    along.forEach(([x, z], i) => {
      if (Math.abs(x) < 2.2 && z > 5) return; // 别挡大门
      if (Math.abs(z) < 1.2) return;          // 别挡路
      (i % 3 === 0 ? barrels : i % 3 === 1 ? crates : cans).push({ x, z, ry: r() * 6 });
    });
    s.add(propInstances('barrel_03', barrels, { lambert: false, shadow: true }));
    s.add(propInstances('wooden_crate_02', crates, { lambert: false, shadow: true }));
    s.add(propInstances('metal_jerrycan', cans, { lambert: false, shadow: true }));
  }

  refresh(save) {
    this.shadowDirty = true;
    for (const b of BUILDINGS) {
      const lv = save.buildings[b.key] || 0;
      if (this.levels[b.key] === lv) continue;
      if (b.key === 'turret') { this.levels.turret = lv; this.setTurrets(lv); continue; }
      const upgraded = this.levels[b.key] !== undefined;
      this.levels[b.key] = lv;
      const old = this.groups[b.key];
      if (old) {
        this.scene.remove(old);
        old.traverse(o => { if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose(); });
        this.pickables = this.pickables.filter(o => o.userData.key !== b.key || o.userData.isPad);
        this.blinks = this.blinks.filter(o => o.userData.key !== b.key);
      }
      const raw = new THREE.Group();
      if (lv <= 0) buildSite(raw); else BUILDERS[b.key](raw, lv);
      const g = bake(raw);
      const [x, z] = PLOTS[b.key];
      g.position.set(x, 0.08, z);
      g.userData = { key: b.key, base: 0.9 + 0.015 * lv, pop: upgraded ? 0 : 1 };
      g.scale.setScalar(g.userData.base);
      g.traverse(o => { if (o.isMesh) { o.userData.key = b.key; this.pickables.push(o); if (o.userData.blink) this.blinks.push(o); } });
      this.scene.add(g);
      this.groups[b.key] = g;
    }
    // 幸存者数量同步（最多显示 12 个）
    const want = Math.min(8, save.survivors.length);
    while (this.survivors.length < want) {
      const i = this.survivors.length;
      let obj, rig = null;
      // 队友用自己的模型；普通幸存者轮流用几个真实人物模型
      const nm = save.survivors[i], own = COMPANIONS[nm] && hasModel(COMPANIONS[nm].model) ? COMPANIONS[nm].model : null;
      const people = ['c_chen', 'c_jie', 'c_min', 'c_zhou', 'c_xiao'].filter(hasModel);
      const model = own || (people.length ? people[i % people.length] : hasModel('player') ? 'player' : null);
      if (model) { rig = new Rig(model, 1.65); if (!own && model === 'player') rig.tint(TINTS[i % TINTS.length]); rig.play('idle', { fade: 0 }); rig.mixer.update(Math.random() * 5); obj = rig.group; }
      else { obj = personGroup({ shirt: TINTS[i % TINTS.length], gun: false }); obj.scale.setScalar(0.6); }
      obj.position.set(rand(-2, 2), 0.03, rand(-0.6, 0.6));
      obj.traverse(o => { if (o.isMesh) o.castShadow = false; }); // 会动的人物不投影（静态阴影只算一次）
      this.scene.add(obj);
      this.survivors.push({ obj, rig, tx: obj.position.x, tz: obj.position.z, wait: rand(0, 2), walk: 0 });
    }
    while (this.survivors.length > want) { const sv = this.survivors.pop(); this.scene.remove(sv.obj); if (sv.rig) sv.rig.dispose(); }
  }

  // 瞭望塔上的炮塔（等级 ≥1 才出现，等级越高枪管越长）
  setTurrets(lv) {
    if (this.turrets) { this.scene.remove(this.turrets); this.turrets = null; }
    if (lv <= 0) return;
    const g = new THREE.Group();
    const metal = plain(0x3a3e42, 0.5, 0.7);
    for (const [x, z] of TOWERS) {
      const t = new THREE.Group();
      block(t, 0.5, 0.3, 0.5, metal, 0, 0, 0);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.6 + lv * 0.05, 8).rotateX(Math.PI / 2), metal);
      barrel.position.set(0, 0.2, 0.4); t.add(barrel);
      t.position.set(x, 2.08, z);
      t.lookAt(0, 2.08, 0);
      g.add(t);
    }
    this.turrets = g;
    this.scene.add(g);
  }

  // 模型加载完后重建幸存者（换成真实人物）
  resetSurvivors() {
    for (const sv of this.survivors) { this.scene.remove(sv.obj); if (sv.rig) sv.rig.dispose(); }
    this.survivors = [];
  }

  select(key) {
    if (!PLOTS[key]) return;
    this.sel = key;
    const [x, z] = PLOTS[key];
    this.ring.position.set(x, 0.1, z);
    this.ring.visible = true;
  }

  pick(cx, cy, w, h) {
    this.v2.set(cx / w * 2 - 1, -(cy / h) * 2 + 1);
    this.ray.setFromCamera(this.v2, this.camera);
    const hit = this.ray.intersectObjects(this.pickables, false)[0];
    return hit ? hit.object.userData.key : null;
  }

  resize(w, h) {
    const aspect = w / h, cam = this.camera;
    cam.aspect = aspect;
    const tv = Math.tan(cam.fov * Math.PI / 360);
    // 让整个据点刚好放进屏幕：竖屏看宽度，横屏看高度
    this.d = Math.max(11.8 / (tv * Math.min(aspect, 1.6)), 10.5 / tv);
    if (aspect < 1) cam.setViewOffset(w, h, 0, h * 0.25, w, h);
    else cam.setViewOffset(w, h, w * 0.17, h * 0.04, w, h);
    cam.updateProjectionMatrix();
    this.scene.fog.near = this.d * 1.05;
    this.scene.fog.far = this.d * 2.2;
  }

  update(dt) {
    this.t += dt;
    const t = this.t, cam = this.camera;
    const a = Math.sin(t * 0.07) * 0.4;
    cam.position.set(Math.sin(a) * this.d * 0.66, this.d * 0.74, Math.cos(a) * this.d * 0.66);
    cam.lookAt(0, 0, 0.6);

    this.flame.scale.set(1 + Math.sin(t * 13) * 0.1, 1 + Math.sin(t * 17) * 0.2, 1 + Math.cos(t * 11) * 0.1);
    this.light.intensity = 14 + Math.sin(t * 15) * 2.5 + Math.sin(t * 7) * 2;
    if (this.ring.visible) this.ring.material.opacity = 0.55 + Math.sin(t * 5) * 0.35;
    for (const b of this.blinks) b.visible = Math.sin(t * 4) > -0.2;

    // 建筑升级时“弹一下”
    for (const g of Object.values(this.groups)) {
      const u = g.userData;
      if (u.pop < 1) {
        u.pop = Math.min(1, u.pop + dt * 2.5);
        const k = u.pop, bounce = 1 + Math.sin(k * Math.PI) * 0.2;
        g.scale.set(u.base * bounce, u.base * (0.3 + 0.7 * k) * bounce, u.base * bounce);
      }
    }

    // 幸存者在路上和篝火旁闲逛
    for (const sv of this.survivors) {
      const o = sv.obj;
      if (sv.wait > 0) {
        sv.wait -= dt;
        if (sv.rig) { sv.rig.play('idle'); sv.rig.update(dt); }
        else o.userData.legL.rotation.x = o.userData.legR.rotation.x = 0;
        if (sv.wait <= 0) {
          if (Math.random() < 0.5) { const aa = rand(0, Math.PI * 2), rr = rand(1.3, 2.2); sv.tx = Math.sin(aa) * rr; sv.tz = Math.cos(aa) * rr * 0.5; }
          else { sv.tx = rand(-8, 8); sv.tz = rand(-0.6, 0.6); }
        }
        continue;
      }
      const dx = sv.tx - o.position.x, dz = sv.tz - o.position.z, d = Math.hypot(dx, dz);
      if (d < 0.1) { sv.wait = rand(2, 6); continue; }
      const mv = Math.min(d, dt * 1.4);
      o.position.x += dx / d * mv; o.position.z += dz / d * mv;
      o.rotation.y = Math.atan2(dx, dz);
      if (sv.rig) { sv.rig.play('run', { speed: 0.45 }); sv.rig.update(dt); }
      else {
        sv.walk += dt * 8;
        o.userData.legL.rotation.x = Math.sin(sv.walk) * 0.6;
        o.userData.legR.rotation.x = -Math.sin(sv.walk) * 0.6;
      }
    }

    for (const z of this.zombies) {
      z.ang += z.spd * dt / ((z.rx + z.rz) / 2);
      z.ph += dt * 4;
      const x = Math.cos(z.ang) * z.rx, zz = Math.sin(z.ang) * z.rz;
      z.obj.position.set(x, z.rig ? 0 : Math.abs(Math.sin(z.ph)) * 0.05, zz);
      z.obj.rotation.y = Math.atan2(-Math.sin(z.ang) * z.rx * Math.sign(z.spd), Math.cos(z.ang) * z.rz * Math.sign(z.spd));
      if (z.rig) z.rig.update(dt); else z.obj.rotation.z = Math.sin(z.ph) * 0.1;
    }
  }
}

// 夜袭守城战用：把据点（围墙、瞭望塔、建筑、篝火、炮塔）搭成一个 Group 给战斗场景用
export { PLOTS };
export function buildCompound(save) {
  const g = new THREE.Group();
  const fake = { scene: g };
  BaseView.prototype.buildWalls.call(fake);
  BaseView.prototype.buildCampfire.call(fake);
  BaseView.prototype.buildClutter.call(fake);
  for (const b of BUILDINGS) {
    if (!PLOTS[b.key]) continue;
    const lv = save.buildings[b.key] || 0;
    const raw = new THREE.Group();
    if (lv <= 0) buildSite(raw); else BUILDERS[b.key](raw, lv);
    const baked = bake(raw);
    const [x, z] = PLOTS[b.key];
    baked.position.set(x, 0.08, z);
    baked.scale.setScalar(0.9 + 0.015 * lv);
    g.add(baked);
  }
  BaseView.prototype.setTurrets.call(fake, save.buildings.turret || 0);
  return { group: g, flame: fake.flame, light: fake.light };
}

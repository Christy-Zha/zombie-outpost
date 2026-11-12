// 通用工具：随机数、合并模型、生成人物/丧尸模型、地面贴图
import * as THREE from '../vendor/three.module.min.js';

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// 可复现的随机数（同样的种子每次结果一样，用于建筑外观）
export function seeded(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

// 积木零件：y 表示底部高度
export const box = (w, h, d, x, y, z, color, o = {}) => ({ geo: new THREE.BoxGeometry(w, h, d), color, x, y: y + h / 2, z, ...o });
export const cyl = (r, h, x, y, z, color, seg = 10, o = {}) => ({ geo: new THREE.CylinderGeometry(r, r, h, seg), color, x, y: y + h / 2, z, ...o });

// 把多个带颜色的零件合并成一个模型（手机上一次绘制，省性能）
export function mergeColored(parts) {
  const pos = [], nor = [], col = [];
  const c = new THREE.Color();
  for (const p of parts) {
    const g = p.geo.index ? p.geo.toNonIndexed() : p.geo.clone();
    if (p.rx) g.rotateX(p.rx);
    if (p.rz) g.rotateZ(p.rz);
    if (p.ry) g.rotateY(p.ry);
    g.translate(p.x || 0, p.y || 0, p.z || 0);
    c.set(p.color);
    const pa = g.attributes.position.array, na = g.attributes.normal.array;
    for (let i = 0; i < pa.length; i++) { pos.push(pa[i]); nor.push(na[i]); }
    for (let i = 0; i < pa.length / 3; i++) col.push(c.r, c.g, c.b);
    g.dispose();
    p.geo.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

// 丧尸模型：脚在 y=0，面朝 +z，双手前伸
export function zombieGeometry() {
  const skin = 0x8fae6b, shirt = 0x6b5a45, pants = 0x3b3a4a;
  return mergeColored([
    box(0.22, 0.6, 0.26, -0.15, 0, 0, pants),
    box(0.22, 0.6, 0.26, 0.15, 0, 0, pants),
    box(0.62, 0.66, 0.36, 0, 0.6, 0, shirt),
    box(0.4, 0.4, 0.4, 0, 1.26, 0.02, skin),
    box(0.08, 0.08, 0.04, -0.1, 1.44, 0.23, 0xff3b2f),
    box(0.08, 0.08, 0.04, 0.1, 1.44, 0.23, 0xff3b2f),
    box(0.15, 0.15, 0.62, -0.38, 1.04, 0.3, skin),
    box(0.15, 0.15, 0.62, 0.38, 1.04, 0.3, skin),
  ]);
}

// 人物模型（玩家 / 幸存者），返回带关节引用的 Group，方便做走路动画
export function personGroup({ shirt = 0x2f6fdb, pants = 0x2f3640, skin = 0xf1c27d, hair = 0x2b1d14, gun = true } = {}) {
  const g = new THREE.Group();
  const mat = c => new THREE.MeshLambertMaterial({ color: c });
  const limb = (w, h, d, color) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    geo.translate(0, -h / 2, 0); // 关节在顶部
    return new THREE.Mesh(geo, mat(color));
  };
  const legL = limb(0.22, 0.6, 0.26, pants); legL.position.set(-0.15, 0.6, 0);
  const legR = limb(0.22, 0.6, 0.26, pants); legR.position.set(0.15, 0.6, 0);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.66, 0.36), mat(shirt)); torso.position.y = 0.93;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.4, 0.4), mat(skin)); head.position.y = 1.47;
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.13, 0.43), mat(hair)); hairM.position.y = 1.7;
  const armL = limb(0.15, 0.55, 0.15, shirt); armL.position.set(-0.39, 1.22, 0);
  const armR = limb(0.15, 0.55, 0.15, shirt); armR.position.set(0.39, 1.22, 0);
  g.add(legL, legR, torso, head, hairM, armL, armR);
  let gunM = null;
  if (gun) {
    armL.rotation.set(-1.45, 0.35, 0);
    armR.rotation.set(-1.45, -0.35, 0);
    gunM = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.7), mat(0x222222));
    gunM.position.set(0, 1.12, 0.62);
    g.add(gunM);
  }
  g.userData = { legL, legR, armL, armR, gun: gunM };
  return g;
}

// 程序生成的地面贴图（带噪点和裂缝），不需要额外图片文件
export function groundTexture(hex, repeat = 30) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = hex;
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 1500; i++) {
    x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.05)';
    const s = 2 + Math.random() * 6;
    x.fillRect(Math.random() * 256, Math.random() * 256, s, s);
  }
  x.strokeStyle = 'rgba(0,0,0,0.25)';
  x.lineWidth = 1.2;
  for (let i = 0; i < 6; i++) {
    let px = Math.random() * 256, py = Math.random() * 256;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 6; k++) { px += (Math.random() - 0.5) * 40; py += (Math.random() - 0.5) * 40; x.lineTo(px, py); }
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// 释放场景占用的显存
export function disposeScene(scene) {
  scene.traverse(o => {
    if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
    if (o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
        if (m.userData.keep) continue; // 共享素材（写实道具）保留
        if (m.map && !m.map.userData.keep) m.map.dispose();
        if (m.normalMap && !m.normalMap.userData.keep) m.normalMap.dispose();
        m.dispose();
      }
    }
  });
}

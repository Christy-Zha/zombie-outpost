// 基地 3D 场景：围墙、篝火、8 块建筑地块、闲逛的幸存者、墙外游荡的丧尸
import * as THREE from '../vendor/three.module.min.js';
import { BUILDINGS } from './data.js';
import { mergeColored, zombieGeometry, personGroup, groundTexture, rand, seeded, box, cyl } from './util.js';

// 每个建筑在基地里的位置
const PLOTS = {
  dorm: [-6, -3.4], hq: [-2, -3.4], armory: [2, -3.4], radio: [6, -3.4],
  clinic: [-6, 3.4], gym: [-2, 3.4], farm: [2, 3.4], scrapyard: [6, 3.4],
};
const SHIRTS = [0xc0392b, 0x2980b9, 0x27ae60, 0x8e44ad, 0xd35400, 0x16a085, 0x7f8c8d, 0xf1c40f];

// 根据建筑类型和等级拼出模型
function buildingParts(key, lv) {
  const P = [];
  if (lv <= 0) { // 未建造：工地
    P.push(box(3, 0.1, 3, 0, 0, 0, 0x6b5537));
    P.push(box(0.1, 1.1, 0.1, -1, 0, 1, 0x7a5a3a));
    P.push(box(0.9, 0.5, 0.06, -1, 0.75, 1.06, 0xf2c94c));
    P.push(box(1.6, 0.12, 0.3, 0.5, 0.1, -0.4, 0x9c7a4a, { ry: 0.3 }));
    P.push(box(1.6, 0.12, 0.3, 0.5, 0.22, -0.3, 0x9c7a4a, { ry: 0.1 }));
    P.push(box(0.5, 0.5, 0.5, 0.8, 0.1, 0.8, 0x8a8a80));
    return P;
  }
  const r = seeded(lv * 97 + key.length * 13);
  switch (key) {
    case 'hq': {
      const fl = 1 + Math.floor(lv / 3), h = 1.1 * fl;
      P.push(box(2.8, h, 2.4, 0, 0, 0, 0x8d918a));
      for (let i = 0; i < fl; i++) P.push(box(2.3, 0.28, 0.05, 0, 0.45 + i * 1.1, 1.22, 0x2c3e50));
      P.push(box(3.0, 0.15, 2.6, 0, h, 0, 0x5f635c));
      P.push(cyl(0.04, 1.6, 1.1, h + 0.15, -0.9, 0xdddddd, 6));
      P.push(box(0.7, 0.4, 0.04, 1.45, h + 1.3, -0.9, 0xd94b3d));
      P.push(box(2.6, 0.35, 0.4, 0, 0, 1.65, 0x9c8a5a));
      break;
    }
    case 'armory': {
      P.push(box(2.8, 1.1, 2.4, 0, 0, 0, 0x55613a));
      P.push(box(3.0, 0.2, 2.6, 0, 1.1, 0, 0x46502f));
      P.push(box(0.9, 0.8, 0.05, 0, 0, 1.21, 0x2a2a22));
      const n = Math.min(6, 1 + Math.floor(lv / 2));
      for (let i = 0; i < n; i++) P.push(box(0.42, 0.32, 0.32, -1.2 + (i % 3) * 0.48, Math.floor(i / 3) * 0.32, 1.55, 0x6b5232));
      if (lv >= 5) P.push(box(0.12, 0.12, 1.4, 1.1, 1.3, 0.3, 0x222222), box(0.5, 0.3, 0.5, 1.1, 1.3, -0.3, 0x46502f));
      break;
    }
    case 'gym': {
      P.push(box(3, 0.08, 3, 0, 0, 0, 0x7a6a55));
      P.push(cyl(0.06, 1.6, -1, 0, -0.8, 0x999999, 6), cyl(0.06, 1.6, 1, 0, -0.8, 0x999999, 6));
      P.push(box(2.1, 0.06, 0.06, 0, 1.55, -0.8, 0xbbbbbb));
      P.push(cyl(0.02, 0.4, 0.5, 1.15, -0.8, 0x333333, 4), cyl(0.22, 0.7, 0.5, 0.45, -0.8, 0xb33a2e, 10));
      for (let i = 0; i < Math.min(4, lv); i++) P.push(cyl(0.3, 0.15, -0.9 + i * 0.6, 0.08, 0.9, 0x222222, 10));
      break;
    }
    case 'clinic': {
      const h = 1.3 + 0.08 * lv;
      P.push(box(2.6, h, 2.2, 0, 0, 0, 0xe8e6df));
      P.push(box(2.8, 0.12, 2.4, 0, h, 0, 0xb9b6ad));
      P.push(box(0.6, 0.18, 0.05, 0, h * 0.6 - 0.09, 1.11, 0xd9342b));
      P.push(box(0.18, 0.6, 0.05, 0, h * 0.6 - 0.3, 1.11, 0xd9342b));
      if (lv >= 4) P.push(box(1.2, 0.7, 1.0, 1.2, 0, 1.4, 0xdedbd0), box(1.3, 0.08, 1.1, 1.2, 0.7, 1.4, 0x7aa36b));
      break;
    }
    case 'farm': {
      P.push(box(3, 0.15, 3, 0, 0, 0, 0x5a3d25));
      const rows = Math.min(5, 1 + Math.ceil(lv / 2));
      for (let k = 0; k < rows; k++) {
        const z = rows === 1 ? 0 : -1.1 + k * 2.2 / (rows - 1);
        for (let i = 0; i < 6; i++) P.push(box(0.25, 0.3 + r() * 0.3, 0.25, -1.15 + i * 0.46, 0.15, z, k % 2 ? 0xc9b037 : 0x6aa84f));
      }
      P.push(cyl(0.25, 0.6, 1.45, 0, -1.45, 0x3d6fa3, 10));
      break;
    }
    case 'scrapyard': {
      const cols = [0x8a4b2a, 0x6b6b6b, 0x9c7a3c, 0x4a5a6a];
      for (let i = 0; i < 3 + lv; i++) {
        P.push(box(0.4 + r() * 0.8, 0.3 + r() * 0.5, 0.4 + r() * 0.8, (r() - 0.5) * 2.2, r() * 0.4 * Math.min(1, i / 4), (r() - 0.5) * 2.2,
          cols[i % 4], { ry: r() * 3, rz: (r() - 0.5) * 0.5 }));
      }
      P.push(box(0.2, 2.4, 0.2, 1.2, 0, -1.2, 0xe0b030), box(1.8, 0.15, 0.15, 0.4, 2.3, -1.2, 0xe0b030), box(0.05, 0.8, 0.05, -0.4, 1.5, -1.2, 0x333333));
      break;
    }
    case 'dorm': {
      const floors = Math.min(3, 1 + Math.floor(lv / 4));
      const cols = [0x3f6e8c, 0x8c4a3f, 0x5f7f4a, 0x8c7a3f];
      for (let f = 0; f < floors; f++)
        for (let k = 0; k < 2; k++) {
          P.push(box(2.8, 0.85, 1.15, 0, f * 0.88, -0.6 + k * 1.2, cols[(f * 2 + k) % 4]));
          P.push(box(0.45, 0.3, 0.03, 0.6, f * 0.88 + 0.35, 0.03 + k * 1.2, 0xffe08a));
        }
      break;
    }
    case 'radio': {
      const h = 2.6 + 0.35 * lv;
      P.push(box(1.3, 0.9, 1.3, -0.7, 0, 0.6, 0x7d7a70));
      P.push(box(0.22, h, 0.22, 0.6, 0, -0.5, 0x9aa0a6));
      for (let y = 0.6; y < h - 0.3; y += 0.6) P.push(box(0.6, 0.05, 0.05, 0.6, y, -0.5, 0x9aa0a6));
      P.push(cyl(0.45, 0.08, 0.6, h - 0.7, -0.2, 0xdfe3e6, 14, { rx: 1.2 }));
      P.push(box(0.14, 0.14, 0.14, 0.6, h, -0.5, 0xff3b30));
      break;
    }
  }
  return P;
}

export class BaseView {
  constructor(onSelect) {
    this.onSelect = onSelect;
    this.t = 0; this.levels = {}; this.meshes = {}; this.sel = null;
    this.pickables = []; this.survivors = []; this.zombies = [];
    const s = this.scene = new THREE.Scene();
    s.background = new THREE.Color(0x1d2218);
    s.fog = new THREE.Fog(0x1d2218, 70, 160);
    this.camera = new THREE.PerspectiveCamera(35, 1, 1, 400);
    this.d = 40;
    s.add(new THREE.HemisphereLight(0xe8eedd, 0x3a3328, 1.5));
    const sun = new THREE.DirectionalLight(0xfff0d8, 1.8);
    sun.position.set(-10, 25, 12);
    s.add(sun);
    this.vc = new THREE.MeshLambertMaterial({ vertexColors: true });

    const flat = (w, h, tex, y, x = 0, z = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial(tex));
      m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); s.add(m); return m;
    };
    flat(200, 200, { map: groundTexture('#4b5638', 50) }, 0);
    flat(18, 13, { map: groundTexture('#77756b', 4) }, 0.02);
    flat(18, 1.8, { color: 0x55534c }, 0.03);
    flat(1.8, 20, { color: 0x55534c }, 0.025, 0, 16);

    this.buildWalls();
    this.buildCampfire();

    const padMat = new THREE.MeshLambertMaterial({ color: 0x9a988e });
    for (const b of BUILDINGS) {
      const [x, z] = PLOTS[b.key];
      const pad = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.08, 3.5), padMat);
      pad.position.set(x, 0.04, z);
      pad.userData.key = b.key;
      s.add(pad);
      this.pickables.push(pad);
    }

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(2.1, 2.35, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.8, depthWrite: false })
    );
    this.ring.visible = false;
    s.add(this.ring);

    // 墙外游荡的丧尸，营造氛围
    const zg = zombieGeometry();
    for (let i = 0; i < 9; i++) {
      const m = new THREE.Mesh(zg, this.vc);
      s.add(m);
      this.zombies.push({ m, ang: rand(0, Math.PI * 2), rx: rand(12.5, 16), rz: rand(10, 13), spd: rand(0.15, 0.3) * (Math.random() < 0.5 ? 1 : -1), ph: rand(0, 6) });
    }

    this.ray = new THREE.Raycaster();
    this.v2 = new THREE.Vector2();
  }

  buildWalls() {
    const pos = [];
    for (let x = -8.1; x <= 8.2; x += 1.8) {
      pos.push([x, -6.7, 0]);
      if (Math.abs(x) > 1.2) pos.push([x, 6.7, 0]);
    }
    for (let z = -5.85; z <= 5.9; z += 1.8) pos.push([-9.2, z, Math.PI / 2], [9.2, z, Math.PI / 2]);
    const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(1.75, 1.2, 0.45), new THREE.MeshLambertMaterial({ color: 0x8b8a80 }), pos.length);
    const d = new THREE.Object3D();
    pos.forEach(([x, z, r], i) => { d.position.set(x, 0.6, z); d.rotation.y = r; d.updateMatrix(); wall.setMatrixAt(i, d.matrix); });
    this.scene.add(wall);
    // 四角瞭望塔 + 大门
    const parts = [];
    for (const [x, z] of [[-9.2, -6.7], [9.2, -6.7], [-9.2, 6.7], [9.2, 6.7]]) {
      parts.push(box(0.9, 2.2, 0.9, x, 0, z, 0x6b5a45), box(1.2, 0.12, 1.2, x, 2.2, z, 0x4f4234));
    }
    parts.push(box(0.4, 1.8, 0.5, -1.2, 0, 6.7, 0x5a4a3a), box(0.4, 1.8, 0.5, 1.2, 0, 6.7, 0x5a4a3a), box(2.8, 0.25, 0.5, 0, 1.8, 6.7, 0x5a4a3a));
    parts.push(box(1.0, 0.35, 0.5, -2.2, 0, 7.5, 0x9c8a5a), box(1.0, 0.35, 0.5, 2.2, 0, 7.5, 0x9c8a5a));
    this.scene.add(new THREE.Mesh(mergeColored(parts), this.vc));
  }

  buildCampfire() {
    const logs = new THREE.Mesh(mergeColored([
      box(1.0, 0.15, 0.18, 0, 0, 0, 0x5a3a22, { ry: 0.6 }), box(1.0, 0.15, 0.18, 0, 0, 0, 0x5a3a22, { ry: -0.6 }),
      cyl(0.6, 0.1, 0, 0, 0, 0x555555, 10),
    ]), this.vc);
    this.scene.add(logs);
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.8, 8), new THREE.MeshBasicMaterial({ color: 0xff8a1a }));
    this.flame.position.y = 0.5;
    this.scene.add(this.flame);
    this.light = new THREE.PointLight(0xff8a3a, 12, 10, 2);
    this.light.position.set(0, 1.2, 0);
    this.scene.add(this.light);
  }

  refresh(save) {
    for (const b of BUILDINGS) {
      const lv = save.buildings[b.key];
      if (this.levels[b.key] === lv) continue;
      const upgraded = this.levels[b.key] !== undefined;
      this.levels[b.key] = lv;
      const old = this.meshes[b.key];
      if (old) {
        this.scene.remove(old);
        old.geometry.dispose();
        this.pickables = this.pickables.filter(o => o !== old);
      }
      const m = new THREE.Mesh(mergeColored(buildingParts(b.key, lv)), this.vc);
      const [x, z] = PLOTS[b.key];
      m.position.set(x, 0.08, z);
      m.userData = { key: b.key, base: 0.88 + 0.02 * lv, pop: upgraded ? 0 : 1 };
      m.scale.setScalar(m.userData.base);
      this.scene.add(m);
      this.meshes[b.key] = m;
      this.pickables.push(m);
    }
    // 幸存者数量同步（最多显示 12 个）
    const want = Math.min(12, save.survivors.length);
    while (this.survivors.length < want) {
      const g = personGroup({ shirt: SHIRTS[this.survivors.length % SHIRTS.length], gun: false });
      g.scale.setScalar(0.6);
      g.position.set(rand(-2, 2), 0.03, rand(-0.6, 0.6));
      this.scene.add(g);
      this.survivors.push({ g, tx: g.position.x, tz: g.position.z, wait: rand(0, 2), walk: 0 });
    }
    while (this.survivors.length > want) this.scene.remove(this.survivors.pop().g);
  }

  select(key) {
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
    // 让整个基地刚好放进屏幕：竖屏看宽度，横屏看高度
    this.d = Math.max(11.5 / (tv * Math.min(aspect, 1.6)), 10 / tv);
    if (aspect < 1) cam.setViewOffset(w, h, 0, h * 0.25, w, h);
    else cam.setViewOffset(w, h, w * 0.17, h * 0.04, w, h);
    cam.updateProjectionMatrix();
  }

  update(dt) {
    this.t += dt;
    const t = this.t, cam = this.camera;
    const a = Math.sin(t * 0.08) * 0.45;
    cam.position.set(Math.sin(a) * this.d * 0.62, this.d * 0.78, Math.cos(a) * this.d * 0.62);
    cam.lookAt(0, 0, 0.6);

    this.flame.scale.set(1 + Math.sin(t * 13) * 0.1, 1 + Math.sin(t * 17) * 0.2, 1 + Math.cos(t * 11) * 0.1);
    this.light.intensity = 12 + Math.sin(t * 15) * 2 + Math.sin(t * 7) * 2;
    if (this.ring.visible) this.ring.material.opacity = 0.55 + Math.sin(t * 5) * 0.35;

    // 建筑升级时“弹一下”
    for (const m of Object.values(this.meshes)) {
      const u = m.userData;
      if (u.pop < 1) {
        u.pop = Math.min(1, u.pop + dt * 2.5);
        const k = u.pop, bounce = 1 + Math.sin(k * Math.PI) * 0.25;
        m.scale.set(u.base * bounce, u.base * (0.3 + 0.7 * k) * bounce, u.base * bounce);
      }
    }

    // 幸存者在路上和篝火旁闲逛
    for (const sv of this.survivors) {
      const g = sv.g, u = g.userData;
      if (sv.wait > 0) {
        sv.wait -= dt;
        u.legL.rotation.x = u.legR.rotation.x = 0;
        if (sv.wait <= 0) {
          if (Math.random() < 0.5) { const aa = rand(0, Math.PI * 2), rr = rand(1.1, 2); sv.tx = Math.sin(aa) * rr; sv.tz = Math.cos(aa) * rr * 0.5; }
          else { sv.tx = rand(-8, 8); sv.tz = rand(-0.6, 0.6); }
        }
        continue;
      }
      const dx = sv.tx - g.position.x, dz = sv.tz - g.position.z, d = Math.hypot(dx, dz);
      if (d < 0.1) { sv.wait = rand(1, 4); continue; }
      const mv = Math.min(d, dt * 1.3);
      g.position.x += dx / d * mv; g.position.z += dz / d * mv;
      g.rotation.y = Math.atan2(dx, dz);
      sv.walk += dt * 8;
      u.legL.rotation.x = Math.sin(sv.walk) * 0.6;
      u.legR.rotation.x = -Math.sin(sv.walk) * 0.6;
    }

    for (const z of this.zombies) {
      z.ang += z.spd * dt / ((z.rx + z.rz) / 2);
      z.ph += dt * 4;
      const x = Math.cos(z.ang) * z.rx, zz = Math.sin(z.ang) * z.rz;
      z.m.position.set(x, Math.abs(Math.sin(z.ph)) * 0.05, zz);
      // 朝前进方向（椭圆切线）
      z.m.rotation.y = Math.atan2(-Math.sin(z.ang) * z.rx * Math.sign(z.spd), Math.cos(z.ang) * z.rz * Math.sign(z.spd));
      z.m.rotation.z = Math.sin(z.ph) * 0.1;
    }
  }
}

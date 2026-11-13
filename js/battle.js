// 战斗：3D 俯视角割草射击
// 性能要点：丧尸/子弹/经验球/粒子都用 InstancedMesh（同类物体一次画完），手机上也能撑几百只丧尸
import * as THREE from '../vendor/three.module.min.js';
import { WEAPONS, ZOMBIES, ZONES, SKILLS, BATTLE_TIME, BOSS_TIME, COMPANIONS, ZOMBIE_MODEL } from './data.js';
import { rand, clamp, mergeColored, zombieGeometry, personGroup, groundTexture, disposeScene, box, cyl } from './util.js';
import { sfx } from './sfx.js';
import { hasModel, Rig, RigPool } from './models.js';
import { envReady, hasProp, prop, propInstances, pbr } from './env.js';
import { buildCompound, PLOTS, TOWERS } from './base.js';

// 每个区域的写实地面贴图（Poly Haven）
const ZONE_GROUND = ['brown_mud_leaves_01', 'asphalt_02', 'concrete_floor_01', 'brown_mud', 'concrete_tiles'];

const BOUND = 75;                       // 地图半径
const MAXZ = 360, MAXB = 500, MAXG = 500, MAXL = 160, MAXP = 400; // 各类物体上限
const CELL = 2, SCELL = 4;              // 空间网格大小（用来快速找附近的丧尸/障碍）
const gkey = (cx, cz) => ((cx + 512) << 10) | (cz + 512);
const TAU = Math.PI * 2;

function inst(scene, geo, mat, n, colored) {
  const m = new THREE.InstancedMesh(geo, mat, n);
  m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  m.frustumCulled = false;
  if (colored) {
    const c = new THREE.Color(1, 1, 1);
    for (let i = 0; i < n; i++) m.setColorAt(i, c);
    m.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }
  m.count = 0;
  scene.add(m);
  return m;
}

function compact(arr) {
  let j = 0;
  for (let i = 0; i < arr.length; i++) if (!arr[i].dead) arr[j++] = arr[i];
  arr.length = j;
}

export class Battle {
  constructor({ zoneIndex, weaponKey, stats, cb, story = null, raid = null }) {
    this.raid = raid; // 夜袭守城：{ save, power }
    this.story = story; // 剧情模式配置（null = 普通割草出征）
    this.zoneIndex = zoneIndex;
    this.zone = ZONES[zoneIndex];
    this.w = WEAPONS[weaponKey] || WEAPONS.pistol;
    this.base = stats;
    this.cb = cb;
    this.t = 0; this.paused = false; this.over = false;
    this.kills = 0; this.scrap = 0; this.rescued = 0;
    this.level = 1; this.xp = 0; this.pendingLevels = 0;
    this.skills = {};
    this.p = { x: 0, z: 0, hp: stats.maxHp, maxHp: stats.maxHp, invuln: 0, face: 0, aim: 0, aimT: 0, fireCd: 0.5, moving: false, walk: 0, recoil: 0, mvAng: 0 };
    this.input = { x: 0, z: 0 };
    this.aimIn = { x: 0, z: 0, on: false }; // 手动瞄准（右摇杆）
    this.bossKilled = false;
    // 用真实模型时同屏丧尸要少一些（每只都有骨骼动画，手机吃不消几百只）
    this.useRigs = hasModel('zombie');
    this.maxZ = story ? story.maxAlive : this.useRigs ? 45 : MAXZ;
    this.ammo = story ? Math.round(story.ammo * (stats.ammoMul || 1)) : Infinity;
    if (raid) this.maxZ = this.useRigs ? 50 : 160;
    this.allies = []; this.winT = 0; this.radioI = 0; this.hold = null; this.npcSpot = null; this.npc = null; this.outMsgT = 0;
    this.noAmmoMsg = 0;
    this.objs = []; this.objGot = 0; this.exit = null; this.corpses = [];
    this.zs = []; this.bullets = []; this.gems = []; this.loot = []; this.parts = []; this.fires = []; this.saws = [];
    this.nid = 1; this.spawnAcc = 0; this.nextHorde = 60; this.nextBeacon = 35;
    this.bossSpawned = false; this.boss = null; this.beacon = null;
    this.molCd = 2; this.sawAng = 0; this.hudAcc = 0; this.shake = 0;
    this.grid = new Map(); this.near = [];
    this.sgrid = new Map(); this.colliders = [];
    this.dummy = new THREE.Object3D(); this.dummy.rotation.order = 'YXZ';
    this.tmpC = new THREE.Color();
    this.camFocus = new THREE.Vector3();
    this.camOff = new THREE.Vector3(0, 18, 13);
    this.buildScene();
  }

  // ---------- 数值（基地加成 × 局内技能） ----------
  sk(k) { return this.skills[k] || 0; }
  get dmg() { return this.w.dmg * this.base.dmgMul * (1 + 0.25 * this.sk('dmg')); }
  get rate() { return this.w.rate * (this.base.rateMul || 1) * (1 + 0.18 * this.sk('rate')); }
  get count() { return this.w.count + this.sk('multi'); }
  get pierce() { return this.w.pierce + this.sk('pierce'); }
  get speed() { return 6 * (this.story ? 0.78 : 1) * (this.base.speedMul || 1) * (1 + 0.1 * this.sk('speed')); } // 剧情关摸黑前进，走得慢
  get pickR() { return 3 * this.base.pickupMul * (1 + 0.4 * this.sk('magnet')); }
  get regen() { return this.base.regen + this.sk('regen'); }
  need(L) { return 3 + (L - 1) * 3; }

  // ---------- 场景搭建 ----------
  buildScene() {
    const Z = this.zone;
    const s = this.scene = new THREE.Scene();
    const fog = new THREE.Color(Z.fog);
    if (this.story || this.raid) fog.setHex(0x06080b); // 剧情 / 夜袭：深夜
    s.background = fog;
    s.fog = new THREE.Fog(fog, 30, 60);
    this.camera = new THREE.PerspectiveCamera(55, 1, 0.5, 120);
    const night = !!this.story || !!this.raid;
    s.add(new THREE.HemisphereLight(night ? 0x6a7aa8 : 0xdfe6d0, 0x40382c, night ? 0.55 : 1.6));
    const sun = new THREE.DirectionalLight(night ? 0x8fa4d8 : 0xffeedd, night ? 0.3 : 1.8);
    if (night) {
      // 手电筒（跟着角色朝向）+ 身边一圈微光
      this.torch = new THREE.SpotLight(0xfff0d0, 90, 30, 0.6, 0.55, 1.2);
      s.add(this.torch, this.torch.target);
      this.glow = new THREE.PointLight(0xffd9a0, 8, 8, 1.5);
      s.add(this.glow);
    }
    sun.position.set(6, 20, 8);
    s.add(sun);

    const gsize = BOUND * 2 + 60;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(gsize, gsize),
      envReady() ? pbr(ZONE_GROUND[this.zoneIndex], { repeat: [gsize / 4, gsize / 4], lambert: true }) : new THREE.MeshLambertMaterial({ map: groundTexture(Z.ground, 34) })
    );
    ground.rotation.x = -Math.PI / 2;
    s.add(ground);

    if (this.raid) this.buildRaid(); else this.buildProps();

    // 玩家
    this.player = personGroup({ shirt: 0x2f6fdb });
    s.add(this.player);
    if (hasModel('player')) { this.pRig = new Rig('player', 1.8); s.add(this.pRig.group); this.player.visible = false; this.pRig.play('idle'); }
    if (this.useRigs) this.pools = {};
    this.spits = [];
    this.sMesh = inst(s, new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0x9dff4a }), 120, false);
    const blobGeo = new THREE.CircleGeometry(0.5, 14).rotateX(-Math.PI / 2);
    const blobMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.3, depthWrite: false });
    this.pShadow = new THREE.Mesh(blobGeo, blobMat);
    this.pShadow.scale.setScalar(1.3);
    s.add(this.pShadow);

    // 丧尸（一个 InstancedMesh 画全部）
    this.zMesh = inst(s, zombieGeometry(), new THREE.MeshLambertMaterial({ vertexColors: true }), MAXZ, true);
    this.shMesh = inst(s, blobGeo, blobMat, MAXZ, false);
    // 子弹
    this.bMesh = inst(s, new THREE.BoxGeometry(0.14, 0.14, 0.75), new THREE.MeshBasicMaterial({ color: this.w.color }), MAXB, false);
    // 经验球 / 物资箱 / 粒子
    this.gMesh = inst(s, new THREE.OctahedronGeometry(0.24), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXG, true);
    this.lMesh = inst(s, new THREE.BoxGeometry(0.42, 0.42, 0.42), new THREE.MeshLambertMaterial({ color: 0xffffff }), MAXL, true);
    this.pMesh = inst(s, new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), MAXP, true);

    // 电锯、火焰、救援光柱、指示箭头
    this.sawGeo = mergeColored([cyl(0.5, 0.06, 0, -0.03, 0, 0xbfc5cc, 12), cyl(0.16, 0.1, 0, -0.05, 0, 0xd94b3d, 8)]);
    this.sawMat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.fireGeo = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
    // 火焰贴图：中心亮黄、边缘渐隐的圆斑
    const fc = document.createElement('canvas');
    fc.width = fc.height = 128;
    const fx = fc.getContext('2d');
    const grad = fx.createRadialGradient(64, 64, 4, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,230,120,1)');
    grad.addColorStop(0.35, 'rgba(255,140,30,0.85)');
    grad.addColorStop(0.75, 'rgba(200,50,10,0.45)');
    grad.addColorStop(1, 'rgba(120,20,0,0)');
    fx.fillStyle = grad;
    fx.fillRect(0, 0, 128, 128);
    const fireTex = new THREE.CanvasTexture(fc);
    fireTex.colorSpace = THREE.SRGBColorSpace;
    this.fireMat = new THREE.MeshBasicMaterial({ map: fireTex, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.8, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f }));
    this.arrow.visible = false;
    s.add(this.arrow);
    // 手动瞄准时的红色激光线
    const lg = new THREE.PlaneGeometry(0.08, 1).rotateX(-Math.PI / 2).translate(0, 0, 0.5);
    this.aimLine = new THREE.Mesh(lg, new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.aimLine.visible = false;
    s.add(this.aimLine);
    if (this.story) this.buildStory();
    // 带上队友（营救关里被救的那个人不能同时当队友）
    const squad = (this.base.squad || []).filter(m => COMPANIONS[m.name] && !(this.story && this.story.npc && this.story.npc.name === m.name));
    squad.forEach((m, i) => this.addAlly(m.name, COMPANIONS[m.name], m.mul, i, false, m.perks || []));
  }

  getPool(model) {
    if (!this.pools[model]) this.pools[model] = new RigPool(this.scene, model, 1.8);
    return this.pools[model];
  }

  // 爆炸：伤害范围内的丧尸（无视护甲）；hurtsUs = 也会炸到你和队友（自爆者）
  explode(x, z, r, dmg, hurtsUs = false) {
    for (const zb of this.zs) if (!zb.dead && (zb.x - x) ** 2 + (zb.z - z) ** 2 < (r + zb.r) ** 2) this.hurtZombie(zb, dmg, zb.x - x, zb.z - z, 7, true);
    if (hurtsUs) {
      const p = this.p;
      if ((p.x - x) ** 2 + (p.z - z) ** 2 < r * r && p.invuln <= 0) this.hurtPlayer(dmg);
      for (const a of this.allies) if (!a.down && (a.x - x) ** 2 + (a.z - z) ** 2 < r * r) this.hurtAlly(a, dmg);
    }
    this.burst(x, 0.6, z, 30, 0xffa040, 8, 0.22);
    this.burst(x, 0.4, z, 14, 0x333333, 5, 0.25);
    this.shake = Math.max(this.shake, 0.35);
    sfx.play('boom');
  }

  // ---------- 夜袭守城：在自己的据点里守住指挥部 ----------
  buildRaid() {
    const save = this.raid.save, s = this.scene;
    const flat = (w, h, m, y, x = 0, z = 0) => { const g = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); g.rotation.x = -Math.PI / 2; g.position.set(x, y, z); s.add(g); };
    if (envReady()) {
      flat(18.6, 13.6, pbr('concrete_floor_01', { repeat: [6, 4.5], lambert: true }), 0.02);
      flat(18.6, 1.9, pbr('asphalt_02', { repeat: [7, 0.7], lambert: true }), 0.03);
    }
    const c = buildCompound(save);
    s.add(c.group);
    this.campFlame = c.flame;
    for (const k of Object.keys(PLOTS)) { const [x, z] = PLOTS[k]; this.addCollider(x, z, 1.6); }
    for (const [x, z] of TOWERS) this.addCollider(x, z, 0.7);
    this.addCollider(0, 0, 0.9); // 篝火
    const [hx, hz] = PLOTS.hq;
    this.core = { x: hx, z: hz + 1.9, hp: 0, max: 0 };
    this.core.max = this.core.hp = 800 + 250 * (save.buildings.hq || 1);
    this.turretLv = save.buildings.turret || 0;
    this.turrets = this.turretLv > 0 ? TOWERS.map(([x, z]) => ({ x, z, cd: rand(0, 1) })) : [];
    this.wave = 0; this.waves = 5; this.waveT = 4; this.p.z = 2;
  }

  updateRaid(dt) {
    const pow = this.raid.power;
    // 下一波：场上快清完了，或者等太久
    this.waveT -= dt;
    if (this.wave < this.waves && (this.waveT <= 0 || (this.wave > 0 && this.zs.length <= 3))) {
      this.wave++;
      this.waveT = 45;
      const n = Math.round((10 + this.wave * 5) * Math.min(2, pow));
      const types = ['walker', 'walker', 'walker', 'runner', 'runner'];
      if (this.wave >= 2) types.push('exploder', 'spitter');
      if (this.wave >= 3) types.push('armored', 'screamer', 'brute');
      for (let i = 0; i < n && this.zs.length < this.maxZ; i++) {
        const a = Math.random() * TAU, r = rand(20, 27);
        const zb = this.spawnZombie(types[Math.floor(Math.random() * types.length)], Math.sin(a) * r, Math.cos(a) * r);
        zb.hp *= pow; zb.maxHp = zb.hp;
      }
      if (this.wave === this.waves) {
        const a = Math.random() * TAU;
        this.boss = this.spawnZombie('boss', Math.sin(a) * 24, Math.cos(a) * 24);
        this.boss.hp *= 0.6 * pow; this.boss.maxHp = this.boss.hp;
        this.cb.onMsg('☠️ 最后一波！首领来了！');
        sfx.play('boss');
      } else this.cb.onMsg(`⚠️ 第 ${this.wave}/${this.waves} 波尸潮！`);
    }
    // 炮塔自动开火
    const tdmg = 12 * (1 + 0.35 * this.turretLv) * pow ** 0.5, trate = 2 + 0.15 * this.turretLv;
    for (const t of this.turrets) {
      t.cd -= dt;
      if (t.cd > 0) continue;
      const z = this.nearest(t.x, t.z, 14);
      if (!z) { t.cd = 0.2; continue; }
      t.cd = 1 / trate;
      const a = Math.atan2(z.x - t.x, z.z - t.z), sp = 30;
      if (this.bullets.length < MAXB) this.bullets.push({ x: t.x, z: t.z, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, ang: a, life: 0.6, pierce: 0, dmg: tdmg, hits: [], dead: false });
    }
    if (this.campFlame) this.campFlame.scale.y = 1 + Math.sin(this.t * 17) * 0.2;
    if (this.core.hp <= 0) { this.core.hp = 0; this.cb.onMsg('💥 指挥部被攻破了……'); this.end(false); return; }
    if (this.wave >= this.waves && this.zs.length === 0) this.winSoon('🎉 守住了！尸潮退去了');
  }

  // ---------- 剧情关卡：搜集 / 坚守 / 营救护送 / Boss ----------
  buildStory() {
    const st = this.story, s = this.scene;
    this.beamMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.25, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beamGeo = new THREE.CylinderGeometry(0.35, 0.35, 8, 10, 1, true);
    const spot = (minR, maxR, avoid = []) => {
      for (let tries = 0; tries < 300; tries++) {
        const a = Math.random() * TAU, r = rand(minR, maxR);
        const x = Math.sin(a) * r, z = Math.cos(a) * r;
        if (this.inCollider(x, z) || avoid.some(o => (o.x - x) ** 2 + (o.z - z) ** 2 < 15 * 15)) continue;
        return { x, z };
      }
      return { x: minR, z: 0 };
    };
    const lurk = (x, z, n) => { this.pendingLurkers = (this.pendingLurkers || []).concat(Array.from({ length: n }, () => [x + rand(-5, 5), z + rand(-5, 5)])); };
    if (st.type === 'collect') {
      const itemGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6), itemMat = new THREE.MeshBasicMaterial({ color: 0xffd23f });
      for (let k = 0; k < st.obj.count; k++) {
        const { x, z } = spot(26, 58, this.objs);
        const g = new THREE.Group();
        const m = new THREE.Mesh(itemGeo, itemMat); m.position.y = 0.6;
        const beam = new THREE.Mesh(beamGeo, this.beamMat); beam.position.y = 4;
        g.add(m, beam); g.position.set(x, 0, z); s.add(g);
        this.objs.push({ x, z, g, m, got: false });
        lurk(x, z, 3 + this.zoneIndex);
      }
    } else if (st.type === 'defend') {
      const { x, z } = spot(10, 16);
      const g = new THREE.Group();
      g.add(hasProp('portable_generator') ? prop('portable_generator', { scale: 1.8, lambert: true }) : new THREE.Mesh(new THREE.BoxGeometry(1, 0.8, 0.8), new THREE.MeshLambertMaterial({ color: 0x777777 })));
      const ring = new THREE.Mesh(new THREE.RingGeometry(4.6, 5, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.7, depthWrite: false }));
      ring.position.y = 0.05; g.add(ring);
      const beam = new THREE.Mesh(beamGeo, this.beamMat); beam.position.y = 4; g.add(beam);
      g.position.set(x, 0, z); s.add(g);
      this.addCollider(x, z, 0.8);
      this.hold = { x, z, r: 5, t: 0, time: st.hold.time, g, ring, wave: 15 };
    } else if (st.type === 'rescue') {
      const { x, z } = spot(46, 62);
      const g = hasModel('player') ? new Rig('player', 1.7) : null;
      const body = g ? g.group : personGroup({ shirt: 0xf2c94c, gun: false });
      if (g) { g.tint(0xf2c94c, 0.5); g.play('idle'); }
      const holder = new THREE.Group();
      holder.add(body);
      const beam = new THREE.Mesh(beamGeo, this.beamMat); beam.position.y = 4; holder.add(beam);
      holder.position.set(x, 0, z); s.add(holder);
      this.npcSpot = { x, z, g: holder, rig: g, body };
      lurk(x, z, 7 + this.zoneIndex);
    } else if (st.type === 'boss') {
      this.pendingBoss = true;
    }
  }

  spawnExit() {
    const p = this.p;
    for (let tries = 0; tries < 60; tries++) {
      const a = Math.random() * TAU, r = rand(38, 52);
      const x = clamp(p.x + Math.sin(a) * r, -BOUND + 5, BOUND - 5), z = clamp(p.z + Math.cos(a) * r, -BOUND + 5, BOUND - 5);
      if (this.inCollider(x, z)) continue;
      const g = new THREE.Group();
      const mat = new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 14, 16, 1, true), mat); beam.position.y = 7;
      const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x5dff8a })); ring.position.y = 0.05;
      g.add(beam, ring); g.position.set(x, 0, z); this.scene.add(g);
      this.exit = { x, z, g };
      return;
    }
  }

  // 关卡进度 0~1（用来触发无线电字幕）
  progress() {
    const st = this.story;
    if (st.type === 'collect') return this.objGot / st.obj.count;
    if (st.type === 'defend') return this.hold ? this.hold.t / this.hold.time : 1;
    if (st.type === 'rescue') return this.npc ? 0.5 + (this.exit ? 0.5 * (1 - Math.min(1, Math.hypot(this.exit.x - this.p.x, this.exit.z - this.p.z) / 30)) : 0) : 0.4 * (this.t > 2 ? 1 - Math.min(1, Math.hypot(this.npcSpot.x - this.p.x, this.npcSpot.z - this.p.z) / 40) : 0);
    if (st.type === 'boss') return this.boss ? 1 - this.boss.hp / this.boss.maxHp : (this.bossKilled ? 1 : 0);
    return 0;
  }

  objText() {
    const st = this.story;
    const busy = this.searching > 0 ? ` · ${st.type === 'rescue' ? '解救中' : '搜索中'} ${Math.min(99, Math.floor(this.searching * 100))}%` : '';
    if (st.type === 'collect') return this.objGot < st.obj.count ? `${st.obj.icon} ${st.obj.name} ${this.objGot}/${st.obj.count}${busy}` : '🚁 前往撤离点';
    if (st.type === 'defend') return `${st.hold.icon} 守住${st.hold.name} ${Math.floor(this.hold.t)}/${this.hold.time} 秒${this.hold.out ? '（回到圈内！）' : ''}`;
    if (st.type === 'rescue') return this.npc ? `🚁 护送${st.npc.name}到撤离点` : `${st.npc.icon} 找到并解救${st.npc.name}${busy}`;
    if (st.type === 'boss') return `☠️ 击败${st.bossName}`;
    return '';
  }

  winSoon(msg) { if (this.winT > 0) return; this.winT = 1.5; this.cb.onMsg(msg); sfx.play('win'); }

  updateStory(dt) {
    const st = this.story, p = this.p;
    if (this.pendingLurkers) { for (const [x, z] of this.pendingLurkers) this.spawnZombie('walker', x, z); this.pendingLurkers = null; }
    if (this.pendingBoss && this.t > 3) {
      this.pendingBoss = false;
      const a = Math.random() * TAU;
      this.boss = this.spawnZombie('boss', p.x + Math.sin(a) * 21, p.z + Math.cos(a) * 21);
      sfx.play('boss'); this.shake = 0.5;
      this.cb.onMsg(`☠️ ${st.bossName} 出现了！`);
    }
    // 无线电字幕
    const pr = this.progress(), radio = st.radio || [];
    while (this.radioI < radio.length && pr >= radio[this.radioI][0]) { const [, who, text] = radio[this.radioI++]; this.cb.onRadio && this.cb.onRadio(who, text); }
    let target = null;
    this.searching = 0;
    if (st.type === 'collect') {
      let best = Infinity;
      for (const o of this.objs) {
        if (o.got) continue;
        o.m.rotation.y += dt * 2;
        o.m.position.y = 0.6 + Math.sin(this.t * 3) * 0.12;
        const d = Math.hypot(o.x - p.x, o.z - p.z);
        o.search = d < 1.8 ? (o.search || 0) + dt : Math.max(0, (o.search || 0) - dt * 2);
        if (d < 1.8) this.searching = o.search / 2.5;
        if (o.search >= 2.5) {
          o.got = true; this.objGot++;
          this.scene.remove(o.g);
          this.burst(o.x, 1, o.z, 20, 0xffd23f, 5, 0.15);
          sfx.play('rescue');
          this.cb.onMsg(`${st.obj.icon} 找到${st.obj.name}（${this.objGot}/${st.obj.count}）`);
          if (this.objGot >= st.obj.count) { this.spawnExit(); this.cb.onMsg('🚁 全部找到！前往绿色撤离点！'); }
        } else if (d < best) { best = d; target = o; }
      }
      if (!target && this.exit) target = this.exit;
      if (this.exit && Math.hypot(this.exit.x - p.x, this.exit.z - p.z) < 2.2) this.end(true);
    } else if (st.type === 'defend') {
      const h = this.hold, d = Math.hypot(h.x - p.x, h.z - p.z);
      h.out = d > h.r;
      if (!h.out && this.winT <= 0) h.t = Math.min(h.time, h.t + dt);
      h.ring.material.color.setHex(h.out ? 0xff5040 : 0x5dff8a);
      if (h.out && this.t - this.outMsgT > 4) { this.outMsgT = this.t; this.cb.onMsg('⚠️ 回到圈里！离开就停止计时'); }
      if (h.out) target = h;
      // 每 20 秒一波，从四面八方扑向据守点
      h.wave -= dt;
      if (h.wave <= 0 && h.t < h.time) {
        h.wave = 20;
        const n = 6 + this.zoneIndex * 2;
        for (let i = 0; i < n && this.zs.length < this.maxZ + 8; i++) { const a = i / n * TAU; this.spawnZombie(Math.random() < 0.2 ? 'runner' : 'walker', h.x + Math.sin(a) * 17, h.z + Math.cos(a) * 17); }
        this.cb.onMsg('⚠️ 一波尸潮扑过来了！');
      }
      if (h.t >= h.time) this.winSoon(`✅ 守住了${st.hold.name}！`);
    } else if (st.type === 'rescue') {
      const sp = this.npcSpot;
      if (!this.npc) {
        target = sp;
        if (sp.rig) { sp.rig.update(dt); sp.g.rotation.y = Math.atan2(p.x - sp.x, p.z - sp.z); }
        const near = Math.hypot(sp.x - p.x, sp.z - p.z) < 2.4;
        sp.free = near ? (sp.free || 0) + dt : Math.max(0, (sp.free || 0) - dt);
        if (near) this.searching = sp.free / 10;
        if (near && !sp.waved && sp.free > 2) {
          sp.waved = true;
          const n = 8 + this.zoneIndex * 2;
          for (let i = 0; i < n; i++) { const a = i / n * TAU; this.spawnZombie(Math.random() < 0.3 ? 'runner' : 'walker', sp.x + Math.sin(a) * 16, sp.z + Math.cos(a) * 16); }
          this.cb.onMsg('⚠️ 动静太大，丧尸围过来了！坚持住！');
        }
        if (sp.free >= 10) {
          this.scene.remove(sp.g);
          if (sp.rig) sp.rig.dispose();
          const def = COMPANIONS[st.npc.name] || { role: '幸存者', color: 0xf2c94c, hp: 150, weapon: { dmg: 6, rate: 1.5, range: 11, count: 1 }, skill: '' };
          this.npc = this.addAlly(st.npc.name, def, 1, 2, true);
          this.npc.x = sp.x; this.npc.z = sp.z;
          this.spawnExit();
          sfx.play('rescue');
          this.cb.onMsg(`🙌 找到${st.npc.name}了！护送到绿色撤离点`);
        }
      } else {
        target = this.exit;
        if (this.exit && Math.hypot(this.exit.x - p.x, this.exit.z - p.z) < 2.2) {
          if (Math.hypot(this.exit.x - this.npc.x, this.exit.z - this.npc.z) < 6) this.end(true);
          else if (this.t - this.outMsgT > 3) { this.outMsgT = this.t; this.cb.onMsg(`等等${st.npc.name}！`); }
        }
      }
    } else if (st.type === 'boss') {
      if (this.boss) target = this.boss;
      else if (this.bossKilled) this.winSoon(`👑 ${st.bossName} 被击败了！`);
    }
    // 箭头指向当前目标
    this.arrow.visible = !!target && Math.hypot(target.x - p.x, target.z - p.z) > 4;
    if (this.arrow.visible) {
      const dx = target.x - p.x, dz = target.z - p.z, d = Math.hypot(dx, dz);
      this.arrow.position.set(p.x + dx / d * 1.9, 0.35, p.z + dz / d * 1.9);
      this.arrow.rotation.y = Math.atan2(dx, dz);
      this.arrow.material.color.setHex(target === this.exit ? 0x5dff8a : target === this.boss ? 0xff5040 : 0xffd23f);
    }
  }

  // ---------- 队友（电脑操控） ----------
  addAlly(name, def, mul = 1, slot = 0, npc = false, perks = []) {
    const hp = def.hp * mul * (this.story ? 1.6 : 1);
    const a = {
      name, def, npc, slot, mul, x: this.p.x + (slot === 1 ? 1.5 : -1.5), z: this.p.z - 1.2,
      hp, maxHp: hp, fireCd: rand(0.3, 0.9), face: 0, aim: 0, aimT: 0, mvAng: 0, moving: false,
      down: false, revive: 0, skillCd: 5 + slot * 2, invuln: 0, walk: 0,
    };
    a.perks = new Set(perks);
    const own = def.model && hasModel(def.model);
    if (own || hasModel('player')) { a.rig = new Rig(own ? def.model : 'player', 1.72); if (!own) a.rig.tint(def.color, 0.55); this.scene.add(a.rig.group); a.rig.play('idle'); }
    else { a.body = personGroup({ shirt: def.color }); this.scene.add(a.body); }
    this.allies.push(a);
    return a;
  }

  hurtAlly(a, dmg) {
    if (a.down || a.invuln > 0) return;
    if (a.perks && a.perks.has('jie_armor')) dmg *= 0.7;
    a.hp -= dmg; a.invuln = 0.6;
    if (a.hp <= 0) {
      a.hp = 0; a.down = true; a.revive = 0;
      if (a.npc) { this.cb.onMsg(`💀 ${a.name} 被咬倒了……任务失败`); this.end(false); return; }
      this.cb.onMsg(`🆘 ${a.name} 倒下了！靠近 2 秒把他扶起来`);
      sfx.play('hurt');
    }
  }

  biggest(x, z, range) {
    let best = null, bh = 0;
    for (const zb of this.zs) {
      if (zb.dead || (zb.x - x) ** 2 + (zb.z - z) ** 2 > range * range) continue;
      if (zb.hp > bh) { bh = zb.hp; best = zb; }
    }
    return best;
  }

  updateAllies(dt) {
    const p = this.p;
    if (this.allies.some(a => !a.down && a.perks.has('xiao_vaccine'))) {
      p.hp = Math.min(p.maxHp, p.hp + 2 * dt);
      for (const a of this.allies) if (!a.down) a.hp = Math.min(a.maxHp, a.hp + 2 * dt);
    }
    for (const a of this.allies) {
      if (a.down) {
        // 陈医生的“不放弃任何人”：倒地 6 秒后自动扶起
        if (this.allies.some(b => b !== a && !b.down && b.perks.has('doc_revive'))) { a.autoRev = (a.autoRev || 0) + dt; if (a.autoRev >= 6) { a.autoRev = 0; a.revive = 2; } }
        if (Math.hypot(p.x - a.x, p.z - a.z) < 1.8 || a.revive >= 2) {
          a.revive += dt;
          if (a.revive >= 2) { a.down = false; a.hp = a.maxHp * 0.5; a.revive = 0; a.invuln = 1.5; this.cb.onMsg(`💪 ${a.name} 重新站起来了`); sfx.play('rescue'); }
        } else a.revive = Math.max(0, a.revive - dt * 0.5);
        continue;
      }
      a.invuln -= dt; a.aimT -= dt;
      // 跟随：站在你身后两侧
      const fx = Math.sin(p.face), fz = Math.cos(p.face);
      const side = a.npc ? 0 : a.slot === 0 ? -1 : 1, back = a.npc ? 1.8 : 1.3;
      const tx = p.x - fx * back + fz * side * 1.6, tz = p.z - fz * back - fx * side * 1.6;
      const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
      a.moving = d > 0.6;
      if (d > 16 && !a.npc) { a.x = tx; a.z = tz; } // 掉队太远就瞬移回来（被护送的人不会）
      else if (a.moving) { const sp = Math.min(d * 3, this.speed * (a.npc ? 0.72 : 1.15)); a.x += dx / d * sp * dt; a.z += dz / d * sp * dt; a.mvAng = Math.atan2(dx, dz); a.walk += dt * sp * 1.7; } // 受伤的幸存者走得慢
      this.pushOut(a, 0.4);
      a.x = clamp(a.x, -BOUND, BOUND); a.z = clamp(a.z, -BOUND, BOUND);
      // 开火（队友伤害随军械库成长）
      const w = a.def.weapon;
      a.fireCd -= dt;
      if (a.fireCd <= 0) {
        const t = a.def.skill === 'snipe' ? this.biggest(a.x, a.z, w.range) : this.nearest(a.x, a.z, w.range);
        if (t) {
          a.fireCd = 1 / (w.rate * (a.perks.has('zhou_rate') ? 1.3 : 1));
          const base = Math.atan2(t.x - a.x, t.z - a.z), n = (w.count || 1) + (a.perks.has('jie_pellets') ? 2 : 0), arc = w.spread || 0;
          a.aim = base; a.aimT = 0.5;
          const crit = a.perks.has('min_crit') && Math.random() < 0.25 ? 2.5 : 1;
          const dmg = w.dmg * a.mul * this.base.dmgMul * crit;
          for (let i = 0; i < n && this.bullets.length < MAXB; i++) {
            let ang = n > 1 ? base - arc / 2 + arc * i / (n - 1) : base;
            ang += (Math.random() - 0.5) * (w.jitter || 0.05);
            const sp = 26;
            const pc = (w.pierce || 0) + (a.perks.has('min_pierce') ? 2 : 0);
            this.bullets.push({ x: a.x + Math.sin(ang) * 0.6, z: a.z + Math.cos(ang) * 0.6, vx: Math.sin(ang) * sp, vz: Math.cos(ang) * sp, ang, life: w.range / sp + 0.1, pierce: pc, pen: pc > 0, dmg, hits: [], dead: false });
          }
          sfx.play('ally');
        } else a.fireCd = 0.2;
      }
      // 技能
      a.skillCd -= dt;
      if (a.skillCd <= 0) {
        const sk = a.def.skill;
        if (sk === 'heal') {
          a.skillCd = 10;
          const amt = a.perks.has('doc_heal') ? 0.2 : 0.12;
          p.hp = Math.min(p.maxHp, p.hp + p.maxHp * amt);
          for (const b of this.allies) if (!b.down) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * amt);
          this.burst(p.x, 1.2, p.z, 12, 0x5dff8a, 3, 0.12);
          sfx.play('gem');
        } else if (sk === 'grenade') {
          const cand = this.zs.filter(z => !z.dead && (z.x - a.x) ** 2 + (z.z - a.z) ** 2 < 13 * 13);
          if (cand.length) {
            const big = a.perks.has('zhou_grenade');
            a.skillCd = big ? 8 : 12;
            const c = cand[Math.floor(Math.random() * cand.length)];
            const dmg = 45 * a.mul * this.base.dmgMul;
            for (const z of this.zs) if (!z.dead && (z.x - c.x) ** 2 + (z.z - c.z) ** 2 < (big ? 20 : 9)) this.hurtZombie(z, dmg, z.x - c.x, z.z - c.z, 6, true);
            this.burst(c.x, 0.5, c.z, 26, 0xffa040, 7, 0.2);
            this.shake = Math.max(this.shake, 0.2);
            sfx.play('boom');
          } else a.skillCd = 1;
        } else a.skillCd = 999;
      }
    }
  }

  addCollider(x, z, r) {
    const c = { x, z, r };
    this.colliders.push(c);
    const m = r + 1.8; // 留出最大单位半径的余量
    for (let gx = Math.floor((x - m) / SCELL); gx <= Math.floor((x + m) / SCELL); gx++)
      for (let gz = Math.floor((z - m) / SCELL); gz <= Math.floor((z + m) / SCELL); gz++) {
        const k = gkey(gx, gz);
        let a = this.sgrid.get(k);
        if (!a) this.sgrid.set(k, a = []);
        a.push(c);
      }
  }

  // 把单位推出障碍物
  pushOut(o, r) {
    const list = this.sgrid.get(gkey(Math.floor(o.x / SCELL), Math.floor(o.z / SCELL)));
    if (!list) return;
    for (const c of list) {
      const dx = o.x - c.x, dz = o.z - c.z, m = r + c.r, d2 = dx * dx + dz * dz;
      if (d2 < m * m) {
        const d = Math.sqrt(d2) || 0.001;
        o.x = c.x + dx / d * m;
        o.z = c.z + dz / d * m;
      }
    }
  }

  inCollider(x, z) {
    const list = this.sgrid.get(gkey(Math.floor(x / SCELL), Math.floor(z / SCELL)));
    if (!list) return false;
    for (const c of list) { const dx = x - c.x, dz = z - c.z; if (dx * dx + dz * dz < c.r * c.r) return true; }
    return false;
  }

  // 场景道具：废弃汽车、油桶、木箱、碎石
  buildProps() {
    const s = this.scene;
    const vc = new THREE.MeshLambertMaterial({ vertexColors: true });
    const carCols = [0x8b3a2b, 0x4a5a6a, 0x6b6b5a, 0x2f4a3a, 0x8a7a4a, 0x5a4a6b];
    const placed = [];
    const real = envReady() && hasProp('covered_car');
    const lists = { covered_car: [], barrel_03: [], wooden_crate_02: [], old_military_crate: [], concrete_road_barrier: [], propane_tank: [] };
    let tries = 0;
    while (placed.length < 80 && tries++ < 2000) {
      const x = rand(-BOUND + 3, BOUND - 3), z = rand(-BOUND + 3, BOUND - 3);
      if (x * x + z * z < 81) continue;
      const r0 = Math.random();
      const kind = r0 < 0.32 ? 'car' : r0 < 0.58 ? 'barrel' : r0 < 0.78 ? 'crate' : 'rubble';
      const br = kind === 'car' ? 2.1 : kind === 'barrel' ? 1.2 : 1.1;
      if (placed.some(p => (p.x - x) ** 2 + (p.z - z) ** 2 < (p.r + br + 1.6) ** 2)) continue;
      placed.push({ x, z, r: br });
      const ry = Math.random() * TAU;
      let parts;
      if (real) { // 写实道具
        if (kind === 'car') {
          lists.covered_car.push({ x, z, ry });
          for (const d of [-1.1, 1.1]) this.addCollider(x + Math.sin(ry) * d, z + Math.cos(ry) * d, 1.05);
        } else if (kind === 'barrel') {
          const n = 1 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) {
            const ox = (i - (n - 1) / 2) * 0.85, bx = x + Math.cos(ry) * ox, bz = z - Math.sin(ry) * ox;
            (Math.random() < 0.8 ? lists.barrel_03 : lists.propane_tank).push({ x: bx, z: bz, ry: Math.random() * TAU, s: 1.3 });
            this.addCollider(bx, bz, 0.45);
          }
        } else if (kind === 'crate') {
          if (Math.random() < 0.5) { lists.wooden_crate_02.push({ x, z, ry, s: 1.5 }); this.addCollider(x, z, 0.85); }
          else { lists.old_military_crate.push({ x, z, ry, s: 1.1 }); lists.old_military_crate.push({ x, z, ry: ry + 0.1, s: 1.1, y: 0.33 }); this.addCollider(x, z, 1.0); }
        } else {
          // 路障组成的小掩体
          for (const o of [-1, 1]) {
            const bx = x + Math.cos(ry) * o, bz = z - Math.sin(ry) * o;
            lists.concrete_road_barrier.push({ x: bx, z: bz, ry, s: 1.3 });
            this.addCollider(bx, bz, 0.7);
          }
        }
        continue;
      }
      if (kind === 'car') {
        const col = carCols[Math.floor(Math.random() * carCols.length)];
        parts = [
          box(1.8, 0.75, 3.6, 0, 0.2, 0, col),
          box(1.6, 0.65, 1.9, 0, 0.95, -0.2, col),
          box(1.5, 0.5, 0.05, 0, 1.0, 0.76, 0x2a3540),
          box(0.3, 0.4, 0.4, -0.85, 0, 1.2, 0x1a1a1a), box(0.3, 0.4, 0.4, 0.85, 0, 1.2, 0x1a1a1a),
          box(0.3, 0.4, 0.4, -0.85, 0, -1.2, 0x1a1a1a), box(0.3, 0.4, 0.4, 0.85, 0, -1.2, 0x1a1a1a),
        ];
        for (const d of [-0.9, 0.9]) this.addCollider(x + Math.sin(ry) * d, z + Math.cos(ry) * d, 1.05);
      } else if (kind === 'barrel') {
        parts = [];
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) {
          const ox = (i - (n - 1) / 2) * 0.95, col = Math.random() < 0.5 ? 0x9c3b2a : 0x4f5d3a;
          parts.push(cyl(0.45, 1.1, ox, 0, 0, col, 10), cyl(0.47, 0.08, ox, 0.75, 0, 0x333333, 10));
          this.addCollider(x + Math.cos(ry) * ox, z - Math.sin(ry) * ox, 0.5);
        }
      } else if (kind === 'crate') {
        parts = [box(1.1, 1.1, 1.1, 0, 0, 0, 0x7a5a36), box(1.12, 0.12, 1.12, 0, 0.5, 0, 0x5c4228)];
        if (Math.random() < 0.4) parts.push(box(0.8, 0.8, 0.8, 0.1, 1.1, 0.05, 0x8a6a40, { ry: 0.4 }));
        this.addCollider(x, z, 0.78);
      } else {
        const sc = rand(0.8, 1.4);
        parts = [{ geo: new THREE.DodecahedronGeometry(sc), color: 0x77736a, x: 0, y: 0.2 * sc, z: 0 },
                 { geo: new THREE.DodecahedronGeometry(sc * 0.5), color: 0x5f5c55, x: sc * 0.8, y: 0, z: 0.3 }];
        this.addCollider(x, z, 0.95 * sc);
      }
      const m = new THREE.Mesh(mergeColored(parts), vc);
      m.position.set(x, 0, z);
      m.rotation.y = ry;
      if (kind === 'rubble') m.scale.y = 0.55;
      s.add(m);
    }
    if (real) for (const [name, list] of Object.entries(lists)) s.add(propInstances(name, list));
    // 地图边界的水泥路障
    const pos = [];
    for (let v = -BOUND; v <= BOUND; v += 2.2) {
      pos.push([v, -BOUND - 1, 0], [v, BOUND + 1, 0], [-BOUND - 1, v, Math.PI / 2], [BOUND + 1, v, Math.PI / 2]);
    }
    if (real) { s.add(propInstances('concrete_road_barrier', pos.map(([x, z, r]) => ({ x, z, ry: r, s: 1.42 })))); return; }
    const wall = new THREE.InstancedMesh(new THREE.BoxGeometry(2, 1, 0.6), new THREE.MeshLambertMaterial({ color: 0x8b8a80 }), pos.length);
    const d = new THREE.Object3D();
    pos.forEach(([x, z, r], i) => { d.position.set(x, 0.5, z); d.rotation.y = r; d.updateMatrix(); wall.setMatrixAt(i, d.matrix); });
    s.add(wall);
  }

  resize(w, h) {
    const portrait = w / h < 1;
    this.camera.aspect = w / h;
    this.camera.fov = portrait ? 52 : 45;
    this.camOff.set(0, portrait ? 18 : 15, portrait ? 13 : 11);
    if (this.story) this.camOff.set(0, portrait ? 12.5 : 11, portrait ? 10 : 9); // 剧情：镜头更近，更有压迫感
    const L = this.camOff.length();
    this.scene.fog.near = this.story ? L - 4 : L + 3;
    this.scene.fog.far = this.story ? L + 14 : L + 32;
    this.camera.updateProjectionMatrix();
  }

  setInput(x, z) { this.input.x = x; this.input.z = z; }

  // 右摇杆：on=true 时朝 (x,z) 方向开火；松开后恢复自动瞄准
  setAim(x, z, on) {
    const a = this.aimIn, L = Math.hypot(x, z);
    a.on = on && L > 0.25;
    if (a.on) { a.x = x / L; a.z = z / L; }
  }

  // 角色在屏幕上的像素位置（给鼠标瞄准用）
  playerScreen(w, h) {
    const v = this._sv || (this._sv = new THREE.Vector3());
    v.set(this.p.x, 1, this.p.z).project(this.camera);
    return { x: (v.x + 1) / 2 * w, y: (1 - v.y) / 2 * h };
  }

  // ---------- 主循环 ----------
  // 离玩家越远声音越小
  earVol(o) { return clamp(1 - Math.hypot(o.x - this.p.x, o.z - this.p.z) / 24, 0.15, 1); }

  update(dt) {
    if (this.over || this.paused) return;
    this.t += dt;
    const p = this.p;

    // 丧尸吼叫：场上越多，叫得越频繁
    this.groanT = (this.groanT ?? 1.5) - dt;
    if (this.groanT <= 0 && this.zs.length) {
      const z = this.zs[Math.floor(Math.random() * this.zs.length)];
      if (!z.dead) sfx.play('groan', this.earVol(z) * 0.9);
      this.groanT = 3.2 / Math.sqrt(1 + this.zs.length / 5) + Math.random();
    }

    // 移动
    let ix = this.input.x, iz = this.input.z;
    const il = Math.hypot(ix, iz);
    if (il > 1) { ix /= il; iz /= il; }
    p.moving = il > 0.12;
    if (p.moving) {
      p.x += ix * this.speed * dt;
      p.z += iz * this.speed * dt;
      p.mvAng = Math.atan2(ix, iz);
      p.walk += dt * this.speed * 1.7;
    }
    this.pushOut(p, 0.45);
    p.x = clamp(p.x, -BOUND, BOUND);
    p.z = clamp(p.z, -BOUND, BOUND);
    p.hp = Math.min(p.maxHp, p.hp + this.regen * dt);
    p.invuln -= dt;

    this.buildGrid();
    this.updateFire(dt);
    this.updateAllies(dt);
    if (this.over) return;
    this.updateZombies(dt);
    if (this.over) return;
    this.updateBullets(dt);
    this.updateSpits(dt);
    this.updateSaws(dt);
    this.updateMolotov(dt);
    this.updatePickups(dt);
    this.updateParticles(dt);
    if (this.raid) this.updateRaid(dt); else if (this.story) this.updateStory(dt); else this.updateBeacon(dt);
    if (this.over) return;
    this.updateSpawns(dt);
    compact(this.zs);
    compact(this.bullets);
    compact(this.parts);
    compact(this.fires);

    this.hudAcc -= dt;
    if (this.hudAcc <= 0) { this.hudAcc = 0.1; this.cb.onHud(this.hudData()); }

    if (p.hp <= 0) { p.hp = 0; this.cb.onHud(this.hudData()); this.end(false); return; }
    if (!this.story && !this.raid && this.t >= BATTLE_TIME) { this.end(true); return; }
    if (this.winT > 0) { this.winT -= dt; if (this.winT <= 0) { this.end(true); return; } }
    if (this.over) return;
    if (this.pendingLevels > 0) {
      this.paused = true;
      sfx.play('level');
      this.cb.onLevelUp(this.rollSkills());
    }
  }

  hudData() {
    const p = this.p;
    return {
      hp: p.hp, maxHp: p.maxHp, xp: this.xp, need: this.need(this.level + this.pendingLevels), level: this.level,
      left: Math.max(0, BATTLE_TIME - this.t), kills: this.kills, scrap: Math.floor(this.scrap), rescued: this.rescued,
      boss: this.boss ? this.boss.hp / this.boss.maxHp : -1,
      story: !!this.story || !!this.raid, t: this.t, ammo: this.ammo, bossName: (this.story && this.story.bossName) || '尸王',
      obj: this.raid ? `🛡️ 守住指挥部 · 第 ${this.wave}/${this.waves} 波` : this.story ? this.objText() : '',
      core: this.core ? this.core.hp / this.core.max : -1,
      allies: this.allies.map(a => ({ name: a.name, icon: a.def.icon || '🧑', hp: a.hp, max: a.maxHp, down: a.down, revive: a.revive, npc: a.npc })),
    };
  }

  buildGrid() {
    for (const a of this.grid.values()) a.length = 0;
    const zs = this.zs;
    for (let i = 0; i < zs.length; i++) {
      const k = gkey(Math.floor(zs[i].x / CELL), Math.floor(zs[i].z / CELL));
      let a = this.grid.get(k);
      if (!a) this.grid.set(k, a = []);
      a.push(i);
    }
  }

  queryNear(x, z) {
    const out = this.near;
    out.length = 0;
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let i = -1; i <= 1; i++)
      for (let j = -1; j <= 1; j++) {
        const a = this.grid.get(gkey(cx + i, cz + j));
        if (a) for (let k = 0; k < a.length; k++) out.push(a[k]);
      }
    return out;
  }

  nearest(x, z, range) {
    let best = null, bd = range * range;
    for (const zb of this.zs) {
      if (zb.dead) continue;
      const d = (zb.x - x) ** 2 + (zb.z - z) ** 2;
      if (d < bd) { bd = d; best = zb; }
    }
    return best;
  }

  // 自动瞄准最近的丧尸开火
  updateFire(dt) {
    const p = this.p, w = this.w;
    p.fireCd -= dt;
    if (p.aimT > 0) p.aimT -= dt;
    if (p.fireCd > 0) return;
    let base;
    if (this.aimIn.on) {
      base = Math.atan2(this.aimIn.x, this.aimIn.z); // 手动：朝摇杆方向开火
    } else {
      const tgt = this.nearest(p.x, p.z, w.range);   // 自动：瞄准最近的丧尸
      if (!tgt) { p.fireCd = 0; return; }
      base = Math.atan2(tgt.x - p.x, tgt.z - p.z);
    }
    if (this.ammo <= 0) {
      p.fireCd = 0.3;
      if (this.t - this.noAmmoMsg > 4) { this.noAmmoMsg = this.t; this.cb.onMsg('🔫 没子弹了！去找绿色弹药箱'); }
      return;
    }
    this.ammo = Math.max(0, this.ammo - (w.ammoCost || 1));
    p.fireCd = 1 / this.rate;
    p.aim = base; p.aimT = 0.5;
    const n = this.count;
    const arc = w.count > 1 ? w.spread + (n - w.count) * 0.1 : 0.14 * (n - 1);
    const dmg = this.dmg, pierce = this.pierce;
    for (let i = 0; i < n; i++) {
      if (this.bullets.length >= MAXB) break;
      let a = n > 1 ? base - arc / 2 + arc * i / (n - 1) : base;
      a += (Math.random() - 0.5) * w.jitter;
      const sp = w.speed * (w.count > 1 ? rand(0.85, 1.1) : 1);
      this.bullets.push({
        x: p.x + Math.sin(a) * 0.7, z: p.z + Math.cos(a) * 0.7,
        vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, ang: a,
        life: w.life, pierce, dmg, hits: [], dead: false, kind: w.kind, blast: w.blast, pen: pierce > 0 || !!w.kind,
      });
    }
    p.recoil = 1;
    sfx.play(w.sound);
  }

  updateZombies(dt) {
    const p = this.p, zs = this.zs;
    const decay = Math.min(1, dt * 8);
    const slowers = this.allies.filter(a => !a.down && a.def.skill === 'slow');
    for (const z of zs) {
      if (z.dead) continue;
      // 目标：离得最近的活人（阿杰更招丧尸）
      let tgt = p, tx = p.x, tz = p.z, best = Math.hypot(p.x - z.x, p.z - z.z);
      for (const a of this.allies) {
        if (a.down) continue;
        const da = Math.hypot(a.x - z.x, a.z - z.z) * (a.def.skill === 'tank' ? 0.6 : 1);
        if (da < best) { best = da; tgt = a; tx = a.x; tz = a.z; }
      }
      const core = this.core;
      if (core && best > 7) { tgt = core; tx = core.x; tz = core.z; }
      let dx = tx - z.x, dz = tz - z.z;
      const d = Math.hypot(dx, dz) || 0.001;
      dx /= d; dz /= d;
      let spd = z.spd;
      if (core) {
        const inBand = Math.abs(z.x) < 10 && Math.abs(z.z) < 7.4 && (Math.abs(z.x) > 8.6 || Math.abs(z.z) > 6.1);
        if (inBand && !(Math.abs(z.x) < 1.6 && z.z > 0)) spd *= 0.3; // 翻越围墙（大门除外）
        if (tgt === core && d < 1.6 + z.r) { core.hp -= z.dmg * 1.4 * dt * (z.type === 'boss' ? 4 : 1); if (z.rig && z.rig.has('attack')) z.rig.play('attack'); continue; }
      }
      for (const a of slowers) if ((a.x - z.x) ** 2 + (a.z - z.z) ** 2 < 25) { spd *= a.perks.has('xiao_slow') ? 0.4 : 0.6; break; }
      if (z.rage > 0) { z.rage -= dt; spd *= 1.5; }
      // 远程型（喷吐者 / 尖叫者）：保持距离、绕圈
      let mdx = dx, mdz = dz;
      const keep = z.def.keep;
      if (keep) {
        if (d < keep - 1) { mdx = -dx; mdz = -dz; }
        else if (d < keep + 2) { const side = z.id % 2 ? 1 : -1; mdx = -dz * side * 0.6; mdz = dx * side * 0.6; }
        z.cd = (z.cd || rand(1, 3)) - dt;
        if (z.cd <= 0 && d < keep + 5) {
          if (z.type === 'spitter') {
            z.cd = 2.6;
            const sp = 9;
            if (this.spits.length < 120) this.spits.push({ x: z.x, z: z.z, vx: dx * sp, vz: dz * sp, life: 2.2, dmg: z.def.spit * z.dmgMul });
            if (z.rig && z.rig.has('attack')) z.rig.play('attack', { speed: 1.6 });
            sfx.play('spit', this.earVol(z));
          } else if (z.type === 'screamer') {
            z.cd = 7;
            let n = 0;
            for (const o of this.zs) if (!o.dead && o !== z && (o.x - z.x) ** 2 + (o.z - z.z) ** 2 < 81) { o.rage = 5; n++; }
            this.burst(z.x, 1.6, z.z, 24, 0xff3050, 6, 0.14);
            sfx.play('scream', this.earVol(z));
            if (!this.screamMsg) { this.screamMsg = true; this.cb.onMsg('😱 尖叫者让尸群狂暴了！先打它！'); }
          }
        }
      }
      z.x += (mdx * spd + z.kx) * dt;
      z.z += (mdz * spd + z.kz) * dt;
      z.kx -= z.kx * decay; z.kz -= z.kz * decay;
      z.ang = Math.atan2(dx, dz);
      z.phase += dt * z.spd * 2.2;
      if (z.flash > 0) z.flash -= dt;
      z.sawCd -= dt;
      const hr = 0.45 + z.r;
      if (z.rig) {
        if (d < hr + 0.9 && z.rig.has('attack')) z.rig.play('attack', { speed: 1.2 });
        else z.rig.play(z.type === 'runner' && z.rig.has('run') ? 'run' : 'walk', { speed: z.animSpd });
      }
      if (z.type === 'exploder' && d < hr + 0.9) { this.kill(z); continue; } // 冲到身边就爆
      const cdmg = z.dmg * (z.rage > 0 ? 1.3 : 1);
      if (d < hr + 0.15 && cdmg > 0 && tgt !== this.core) { if (tgt === p) { if (p.invuln <= 0) this.hurtPlayer(cdmg); } else this.hurtAlly(tgt, cdmg); }
      if (d < hr && tgt !== this.core) { z.x = tx - dx * hr; z.z = tz - dz * hr; }
    }
    // 丧尸之间互相挤开，避免叠成一团
    for (let i = 0; i < zs.length; i++) {
      const a = zs[i];
      if (a.dead) continue;
      const near = this.queryNear(a.x, a.z);
      for (let k = 0; k < near.length; k++) {
        const j = near[k];
        if (j <= i) continue;
        const b = zs[j];
        if (b.dead) continue;
        const dx = b.x - a.x, dz = b.z - a.z, m = a.r + b.r, d2 = dx * dx + dz * dz;
        if (d2 < m * m && d2 > 1e-6) {
          const d = Math.sqrt(d2), ov = (m - d) * 0.6, nx = dx / d, nz = dz / d;
          const wa = b.m / (a.m + b.m), wb = 1 - wa;
          a.x -= nx * ov * wa; a.z -= nz * ov * wa;
          b.x += nx * ov * wb; b.z += nz * ov * wb;
        }
      }
      this.pushOut(a, a.r);
    }
  }

  hurtPlayer(dmg) {
    const p = this.p;
    p.hp -= dmg;
    p.invuln = 0.6;
    this.shake = 0.3;
    sfx.play('hurt');
    this.cb.onHurt && this.cb.onHurt();
  }

  hurtZombie(z, dmg, kx, kz, kb = 3, pen = false) {
    if (z.dead) return;
    if (z.def.armor && !pen) dmg *= z.def.armor; // 护甲：普通子弹只打出 40%
    z.hp -= dmg;
    z.flash = 0.1;
    if (z.rig) z.rig.flash(0.08);
    if (kx || kz) {
      const l = Math.hypot(kx, kz) || 1;
      z.kx += kx / l * kb / z.m;
      z.kz += kz / l * kb / z.m;
    }
    if (z.hp <= 0) this.kill(z);
  }

  kill(z) {
    if (z.dead) return;
    z.dead = true;
    this.kills++;
    if (z.def.blast) this.explode(z.x, z.z, z.def.blast, z.def.blastDmg * z.dmgMul, true);
    if (z.rig) { // 播放倒地动作，过一会儿淡出再回收
      if (z.rig.has('death')) z.rig.play('death', { once: true, fade: 0.1 });
      this.corpses.push({ rig: z.rig, pool: z.pool, t: 2.4 });
      z.rig = null;
    }
    if (this.story) {
      if (Math.random() < 0.22) this.dropLoot('ammo', z.x + rand(-0.4, 0.4), z.z + rand(-0.4, 0.4), this.story.ammoPack);
      if (Math.random() < 0.03) this.dropLoot('med', z.x, z.z, 0.3);
    }
    const d = z.def, big = z.type === 'boss';
    this.burst(z.x, 0.9 * z.s, z.z, big ? 40 : 6, 0x6a8f3a, 5, 0.16 * z.s);
    this.burst(z.x, 0.9 * z.s, z.z, big ? 20 : 3, 0x7a1f1f, 4, 0.14 * z.s);
    this.dropGem(z.x, z.z, d.xp * this.base.xpMul);
    if (Math.random() < d.scrapP) {
      const total = d.scrapN * this.zone.reward;
      if (d.scrapN > 6) {
        for (let k = 0; k < 12; k++) this.dropLoot('scrap', z.x + rand(-2.5, 2.5), z.z + rand(-2.5, 2.5), total / 12);
      } else this.dropLoot('scrap', z.x + rand(-0.3, 0.3), z.z + rand(-0.3, 0.3), total);
    }
    if (Math.random() < 0.006) this.dropLoot('med', z.x, z.z, 0.3);
    if (z === this.boss) { this.boss = null; this.bossKilled = true; this.cb.onMsg('👑 尸王被击败！撤离时获得装备'); sfx.play('boom'); this.shake = 0.6; }
    sfx.play('kill');
  }

  dropGem(x, z, v) {
    if (this.gems.length >= MAXG) { this.gems[Math.floor(Math.random() * this.gems.length)].v += v; return; }
    this.gems.push({ x, z, v, mag: false, sp: 0, ph: Math.random() * 6 });
  }

  dropLoot(kind, x, z, v) {
    if (this.loot.length >= MAXL) {
      if (kind === 'scrap') this.scrap += v;
      return;
    }
    this.loot.push({ kind, x, z, v, mag: false, sp: 0, ph: Math.random() * 6 });
  }

  burst(x, y, z, n, hex, spd, size) {
    this.tmpC.set(hex);
    const { r, g, b } = this.tmpC;
    for (let i = 0; i < n && this.parts.length < MAXP; i++) {
      const a = Math.random() * TAU, s = rand(0.3, 1) * spd;
      this.parts.push({ x, y, z, vx: Math.sin(a) * s, vy: rand(2, 6), vz: Math.cos(a) * s, life: rand(0.35, 0.7), max: 0.7, r, g, b, s: size * rand(0.7, 1.3), dead: false });
    }
  }

  updateBullets(dt) {
    const zs = this.zs;
    for (const b of this.bullets) {
      b.life -= dt;
      if (b.kind === 'flame' && Math.random() < 0.5) this.burst(b.x, 0.9, b.z, 1, Math.random() < 0.5 ? 0xff8a1a : 0xffd040, 1.2, 0.22);
      if (b.life <= 0) { b.dead = true; if (b.kind === 'grenade') this.explode(b.x, b.z, b.blast, b.dmg); continue; }
      const steps = Math.max(1, Math.ceil(Math.hypot(b.vx, b.vz) * dt / 0.5));
      const sdt = dt / steps;
      for (let s = 0; s < steps && !b.dead; s++) {
        b.x += b.vx * sdt; b.z += b.vz * sdt;
        if (this.inCollider(b.x, b.z)) { b.dead = true; if (b.kind === 'grenade') this.explode(b.x, b.z, b.blast, b.dmg); else this.burst(b.x, 1, b.z, 2, 0xffd27a, 3, 0.08); break; }
        const near = this.queryNear(b.x, b.z);
        for (let k = 0; k < near.length; k++) {
          const z = zs[near[k]];
          if (z.dead || b.hits.includes(z.id)) continue;
          const dx = z.x - b.x, dz = z.z - b.z, rr = z.r + 0.18;
          if (dx * dx + dz * dz < rr * rr) {
            b.hits.push(z.id);
            if (b.kind === 'grenade') { b.dead = true; this.explode(b.x, b.z, b.blast, b.dmg); break; }
            this.hurtZombie(z, b.dmg, b.vx, b.vz, b.kind === 'flame' ? 0.5 : 3, b.pen);
            if (b.kind !== 'flame') { this.burst(b.x, 1, b.z, 2, 0x8a2a1a, 3, 0.1); sfx.play('hit'); }
            if (--b.pierce < 0) { b.dead = true; break; }
          }
        }
      }
    }
  }

  // 喷吐者的酸液
  updateSpits(dt) {
    const p = this.p;
    for (const sp of this.spits) {
      sp.life -= dt;
      sp.x += sp.vx * dt; sp.z += sp.vz * dt;
      if (sp.life <= 0 || this.inCollider(sp.x, sp.z)) { sp.dead = true; continue; }
      if ((sp.x - p.x) ** 2 + (sp.z - p.z) ** 2 < 0.5) { sp.dead = true; if (p.invuln <= 0) this.hurtPlayer(sp.dmg); this.burst(sp.x, 1, sp.z, 6, 0x9dff4a, 3, 0.1); continue; }
      for (const a of this.allies) if (!a.down && (sp.x - a.x) ** 2 + (sp.z - a.z) ** 2 < 0.5) { sp.dead = true; this.hurtAlly(a, sp.dmg); break; }
    }
    compact(this.spits);
  }

  // 环绕电锯
  updateSaws(dt) {
    const n = this.sk('saw');
    while (this.saws.length < n) {
      const m = new THREE.Mesh(this.sawGeo, this.sawMat);
      this.scene.add(m);
      this.saws.push(m);
    }
    if (!n) return;
    const p = this.p, R = 2.5;
    this.sawAng += dt * (2.6 + 0.3 * n);
    const dmg = (10 + 5 * n) * this.base.dmgMul;
    for (let k = 0; k < n; k++) {
      const a = this.sawAng + k * TAU / n;
      const sx = p.x + Math.sin(a) * R, sz = p.z + Math.cos(a) * R;
      const m = this.saws[k];
      m.position.set(sx, 0.75, sz);
      m.rotation.y += dt * 18;
      const near = this.queryNear(sx, sz);
      for (let i = 0; i < near.length; i++) {
        const z = this.zs[near[i]];
        if (z.dead || z.sawCd > 0) continue;
        const rr = z.r + 0.55;
        if ((z.x - sx) ** 2 + (z.z - sz) ** 2 < rr * rr) {
          z.sawCd = 0.4;
          this.hurtZombie(z, dmg, z.x - p.x, z.z - p.z, 4);
          this.burst(sx, 0.75, sz, 2, 0xfff1a0, 4, 0.07);
        }
      }
    }
  }

  // 燃烧瓶
  updateMolotov(dt) {
    const lv = this.sk('molotov');
    if (lv) {
      this.molCd -= dt;
      if (this.molCd <= 0) {
        const cand = this.zs.filter(z => !z.dead && (z.x - this.p.x) ** 2 + (z.z - this.p.z) ** 2 < 144);
        if (cand.length) {
          const t = cand[Math.floor(Math.random() * cand.length)];
          this.molCd = Math.max(2.2, 6 - 0.7 * lv);
          const r = 1.8 + 0.3 * lv;
          const mesh = new THREE.Mesh(this.fireGeo, this.fireMat);
          mesh.position.set(t.x, 0.05, t.z);
          mesh.scale.setScalar(r);
          this.scene.add(mesh);
          this.fires.push({ x: t.x, z: t.z, r, life: 3.5, tick: 0, dps: (8 + 6 * lv) * this.base.dmgMul, mesh, dead: false });
          this.burst(t.x, 0.5, t.z, 10, 0xffa040, 5, 0.15);
          sfx.play('fire');
        } else this.molCd = 0.5;
      }
    }
    for (const f of this.fires) {
      f.life -= dt; f.tick -= dt;
      f.mesh.scale.setScalar(f.r * (0.92 + Math.random() * 0.1));
      if (f.tick <= 0) {
        f.tick = 0.25;
        for (const z of this.zs) {
          if (!z.dead && (z.x - f.x) ** 2 + (z.z - f.z) ** 2 < (f.r + z.r) ** 2) this.hurtZombie(z, f.dps * 0.25, 0, 0);
        }
        const a = Math.random() * TAU, rr = Math.random() * f.r;
        this.burst(f.x + Math.sin(a) * rr, 0.2, f.z + Math.cos(a) * rr, 1, 0xffc040, 1, 0.12);
      }
      if (f.life <= 0) { f.dead = true; this.scene.remove(f.mesh); }
    }
  }

  updatePickups(dt) {
    const p = this.p;
    const step = (list, onGet, pr2) => {
      for (let i = list.length - 1; i >= 0; i--) {
        const g = list[i];
        const dx = p.x - g.x, dz = p.z - g.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.45) { onGet(g); list[i] = list[list.length - 1]; list.pop(); continue; }
        if (g.mag || d2 < pr2) {
          g.mag = true;
          const d = Math.sqrt(d2);
          g.sp = Math.min(30, g.sp + dt * 40 + 4 * dt);
          const mv = Math.min(d, (g.sp + 6) * dt);
          g.x += dx / d * mv; g.z += dz / d * mv;
        }
      }
    };
    step(this.gems, g => this.gainXp(g.v), this.pickR ** 2);
    step(this.loot, g => {
      if (g.kind === 'ammo') { this.ammo += g.v; this.cb.onMsg(`+${g.v} 发子弹`); sfx.play('coin'); }
      else if (g.kind === 'med') { p.hp = Math.min(p.maxHp, p.hp + p.maxHp * g.v); this.cb.onMsg('+ 医疗包'); sfx.play('rescue'); }
      else { this.scrap += g.v; sfx.play('coin'); }
    }, (this.pickR * 1.6) ** 2); // 物资的吸取范围更大
  }

  gainXp(v) {
    this.xp += v;
    sfx.play('gem');
    while (this.xp >= this.need(this.level + this.pendingLevels)) {
      this.xp -= this.need(this.level + this.pendingLevels);
      this.pendingLevels++;
    }
  }

  updateParticles(dt) {
    for (const q of this.parts) {
      q.life -= dt;
      if (q.life <= 0) { q.dead = true; continue; }
      q.vy -= 18 * dt;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      if (q.y < 0.05) { q.y = 0.05; q.vy = 0; q.vx *= 0.6; q.vz *= 0.6; }
    }
  }

  // 求救的幸存者（黄色光柱）
  updateBeacon(dt) {
    const p = this.p;
    if (!this.beacon) {
      this.arrow.visible = false;
      if (this.t < this.nextBeacon || this.t > BATTLE_TIME - 20) return;
      for (let tries = 0; tries < 30; tries++) {
        const a = Math.random() * TAU, r = rand(14, 22);
        const x = clamp(p.x + Math.sin(a) * r, -BOUND + 4, BOUND - 4), z = clamp(p.z + Math.cos(a) * r, -BOUND + 4, BOUND - 4);
        if (this.inCollider(x, z)) continue;
        const g = personGroup({ shirt: 0xf2c94c, pants: 0x4a3f35, gun: false });
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.7, 0.7, 14, 12, 1, true),
          new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.22, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide })
        );
        beam.position.y = 7;
        g.add(beam);
        g.position.set(x, 0, z);
        this.scene.add(g);
        this.beacon = { x, z, g };
        this.cb.onMsg('📡 发现求救信号！跟着黄色箭头去救人');
        break;
      }
      return;
    }
    const b = this.beacon, u = b.g.userData;
    u.armL.rotation.z = -2.7 + Math.sin(this.t * 9) * 0.35;
    u.armR.rotation.z = 2.7 - Math.sin(this.t * 9) * 0.35;
    b.g.rotation.y = Math.atan2(p.x - b.x, p.z - b.z);
    const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz);
    this.arrow.visible = d > 5;
    if (this.arrow.visible) {
      this.arrow.position.set(p.x + dx / d * 1.9, 0.35, p.z + dz / d * 1.9);
      this.arrow.rotation.y = Math.atan2(dx, dz);
    }
    if (d < 1.6) {
      this.rescued++;
      this.burst(b.x, 1, b.z, 20, 0xffd23f, 5, 0.15);
      this.scene.remove(b.g);
      b.g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
      this.beacon = null;
      this.nextBeacon = this.t + 70;
      this.cb.onMsg('🙌 救出 1 名幸存者！');
      sfx.play('rescue');
    }
  }

  pickType() {
    const t = this.t + this.zoneIndex * 15, r = Math.random();
    // 新敌人：剧情关按关卡配置出现；割草按时间逐步出现
    const extra = this.story ? (this.story.enemies || []) : ['exploder', 'spitter', 'screamer', 'armored'].filter(k => t > ZOMBIES[k].from);
    const W = { exploder: 0.07, spitter: 0.06, screamer: 0.03, armored: 0.06 };
    let acc = 0;
    for (const k of extra) { acc += W[k]; if (r < acc) return k; }
    if (t > ZOMBIES.brute.from && r < acc + 0.07) return 'brute';
    if (t > ZOMBIES.runner.from && r < acc + 0.07 + 0.25) return 'runner';
    return 'walker';
  }

  spawnZombie(type, x, z) {
    const d = ZOMBIES[type], p = this.p;
    if (x === undefined) {
      const a = Math.random() * TAU, r = rand(23, 28);
      x = p.x + Math.sin(a) * r; z = p.z + Math.cos(a) * r;
    }
    x = clamp(x, -BOUND, BOUND); z = clamp(z, -BOUND, BOUND);
    const hpMul = this.story ? (type === 'boss' ? this.story.bossHp || 1 : 1 + this.t / 300) : this.zone.hp * (type === 'boss' ? 1 : 1 + this.t / 150);
    const s = d.scale * rand(0.92, 1.08);
    const tint = new THREE.Color(d.tint);
    const zb = {
      id: this.nid++, type, def: d, x, z, hp: d.hp * hpMul, maxHp: d.hp * hpMul,
      spd: d.spd * rand(0.9, 1.1), dmg: d.dmg * (1 + this.zoneIndex * 0.25),
      r: 0.42 * s, s, m: type === 'boss' ? 40 : s * s, tr: tint.r, tg: tint.g, tb: tint.b,
      flash: 0, phase: rand(0, 6), kx: 0, kz: 0, sawCd: 0, ang: 0, dead: false,
    };
    zb.dmgMul = (1 + this.zoneIndex * 0.25) * (this.story ? 1.3 : 1);
    if (this.story) { zb.hp *= this.story.hp; zb.maxHp = zb.hp; zb.dmg *= 1.3; }
    zb.animSpd = zb.spd / d.spd; // 走得快的丧尸动画也播快一点
    if (this.pools) {
      // 每种丧尸用自己的模型（没下载到就用普通丧尸代替）
      const opts = (ZOMBIE_MODEL[type] || ['zombie']).filter(hasModel);
      const model = opts.length ? opts[Math.floor(Math.random() * opts.length)] : 'zombie';
      zb.pool = this.getPool(model);
      zb.rig = zb.pool.get();
      zb.rig.group.scale.setScalar(model === 'mutant' ? s / 1.5 : s);
      zb.rig.group.position.set(x, 0, z);
      zb.rig.play('walk', { fade: 0, speed: zb.animSpd });
      if (zb.rig.cur) zb.rig.cur.time = Math.random() * zb.rig.cur.getClip().duration; // 步伐错开
    }
    this.zs.push(zb);
    return zb;
  }

  updateSpawns(dt) {
    if (this.raid) return; // 夜袭按波次刷怪
    const t = this.t, zi = this.zoneIndex, p = this.p;
    if (this.story) { // 剧情：丧尸少但持续出现，从黑暗里冒出来
      this.spawnAcc += dt * this.story.spawn * (1 + t / 240);
      while (this.spawnAcc >= 1) {
        this.spawnAcc -= 1;
        if (this.zs.length < this.maxZ) {
          // 六成从前进方向的黑暗里冒出来，堵你的路
          const a = p.moving && Math.random() < 0.6 ? p.mvAng + rand(-0.9, 0.9) : Math.random() * TAU, r = rand(14, 21);
          this.spawnZombie(this.pickType(), p.x + Math.sin(a) * r, p.z + Math.cos(a) * r);
        }
      }
      return;
    }
    const rate = (0.7 + t / 60 * 0.9) * (1 + zi * 0.12);
    this.spawnAcc += dt * rate;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      if (this.zs.length < this.maxZ - (this.useRigs ? 0 : 20)) this.spawnZombie(this.pickType());
    }
    // 每分钟一波尸潮，从四面八方包围
    if (t >= this.nextHorde && t < BATTLE_TIME - 5) {
      this.nextHorde += 60;
      const n = 14 + zi * 4;
      for (let i = 0; i < n && this.zs.length < this.maxZ - 5; i++) {
        const a = i / n * TAU;
        this.spawnZombie('walker', p.x + Math.sin(a) * 20, p.z + Math.cos(a) * 20);
      }
      this.cb.onMsg('⚠️ 尸潮来袭！');
    }
    if (!this.bossSpawned && t >= BOSS_TIME) {
      this.bossSpawned = true;
      this.boss = this.spawnZombie('boss');
      this.cb.onMsg('☠️ 尸王出现了！击败它掉落装备');
      sfx.play('boss');
      this.shake = 0.5;
    }
  }

  rollSkills() {
    const avail = SKILLS.filter(s => this.sk(s.key) < s.max);
    for (let i = avail.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [avail[i], avail[j]] = [avail[j], avail[i]]; }
    const pick = avail.slice(0, 3).map(s => ({ key: s.key, icon: s.icon, name: s.name, desc: s.desc, lv: this.sk(s.key) + 1, max: s.max }));
    const extras = [
      { key: 'heal', icon: '❤️', name: '包扎', desc: '回复 40% 生命', lv: 0 },
      { key: 'cash', icon: '🔩', name: '搜刮', desc: `立即获得 ${Math.round(20 * this.zone.reward)} 物资`, lv: 0 },
    ];
    for (const e of extras) if (pick.length < 3) pick.push(e);
    return pick;
  }

  applySkill(key) {
    const p = this.p;
    if (key === 'heal') p.hp = Math.min(p.maxHp, p.hp + p.maxHp * 0.4);
    else if (key === 'cash') this.scrap += Math.round(20 * this.zone.reward);
    else {
      this.skills[key] = this.sk(key) + 1;
      if (key === 'hp') { p.maxHp += 25; p.hp += 25; }
    }
    this.level++;
    this.pendingLevels--;
    this.paused = false;
    this.cb.onHud(this.hudData());
  }

  retreat() { this.end(false, true); }

  end(win, retreat = false) {
    if (this.over) return;
    this.over = true;
    // 地上没捡的物资：胜利全部带走，失败/撤退带走一半
    const frac = win ? 1 : 0.5;
    for (const g of this.loot) if (g.kind === 'scrap') this.scrap += g.v * frac;
    this.loot.length = 0;
    if (win) sfx.play('win');
    else if (!retreat) sfx.play('lose');
    this.cb.onHud(this.hudData()); // 刷新一次，Boss 血条等及时消失
    this.cb.onEnd({
      win, retreat, zoneIndex: this.zoneIndex, time: this.t, kills: this.kills,
      scrap: Math.floor(this.scrap), rescued: this.rescued, level: this.level, bossKilled: this.bossKilled,
      story: this.story ? this.story.index : null,
      side: this.story && this.story.side ? this.story.side : null,
      raid: !!this.raid,
      squad: this.allies.filter(a => !a.npc).map(a => a.name),
      bossName: (this.story && this.story.bossName) || '尸王',
    });
  }

  // ---------- 画面 ----------
  render(renderer, dt) {
    this.draw(dt);
    renderer.render(this.scene, this.camera);
  }

  draw(dt) {
    const p = this.p, pl = this.player, u = pl.userData, D = this.dummy;
    const live = !this.paused && !this.over;
    pl.position.set(p.x, 0, p.z);
    const want = p.aimT > 0 ? p.aim : p.mvAng;
    let diff = want - p.face;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (live) p.face += diff * Math.min(1, dt * 14);
    pl.rotation.y = p.face;
    const sw = p.moving ? Math.sin(p.walk) * 0.7 : 0;
    u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
    if (live) p.recoil = Math.max(0, p.recoil - dt * 10);
    u.gun.position.z = 0.62 - p.recoil * 0.12;
    pl.visible = !(p.invuln > 0 && !this.over && Math.floor(p.invuln * 20) % 2 === 0);
    this.pShadow.position.set(p.x, 0.02, p.z);
    if (this.pRig) {
      const r = this.pRig;
      r.group.position.set(p.x, 0, p.z);
      r.group.rotation.y = p.face;
      r.group.visible = pl.visible || this.over; // 受伤闪烁沿用同一套逻辑
      pl.visible = false; // 有真实模型就隐藏方块人
      if (p.hp <= 0 && r.has('death')) r.play('death', { once: true, fade: 0.15 });
      else if (p.moving) r.play('run', { speed: (this.speed / 6) });
      else if (p.aimT > 0 && r.has('shoot')) r.play('shoot');
      else r.play('idle');
      if (live || p.hp <= 0) r.update(dt);
    }
    for (const a of this.allies) {
      const want = a.aimT > 0 ? a.aim : a.mvAng;
      let df = want - a.face; df = Math.atan2(Math.sin(df), Math.cos(df));
      if (live) a.face += df * Math.min(1, dt * 12);
      const blink = a.invuln > 0 && !a.down && Math.floor(a.invuln * 20) % 2 === 0;
      if (a.rig) {
        const r = a.rig;
        r.group.position.set(a.x, 0, a.z);
        r.group.rotation.y = a.face;
        r.group.visible = !blink;
        if (a.down) r.play('death', { once: true, fade: 0.15 });
        else if (a.moving) r.play('run', { speed: 1 });
        else if (a.aimT > 0) r.play('shoot');
        else r.play('idle');
        if (live) r.update(dt);
      } else {
        const b = a.body, u = b.userData;
        b.position.set(a.x, a.down ? 0.3 : 0, a.z);
        b.rotation.set(a.down ? -Math.PI / 2 : 0, a.face, 0);
        const sw = a.moving ? Math.sin(a.walk) * 0.7 : 0;
        u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
        b.visible = !blink;
      }
    }
    if (this.torch) {
      const fx = Math.sin(p.face), fz = Math.cos(p.face);
      this.torch.position.set(p.x + fx * 0.3, 2.2, p.z + fz * 0.3);
      this.torch.target.position.set(p.x + fx * 9, 0, p.z + fz * 9);
      this.glow.position.set(p.x, 2.5, p.z);
    }
    const al = this.aimLine;
    al.visible = this.aimIn.on && !this.over;
    if (al.visible) {
      al.position.set(p.x, 1.0, p.z);
      al.rotation.y = Math.atan2(this.aimIn.x, this.aimIn.z);
      al.scale.z = this.w.range;
    }

    // 丧尸
    const zm = this.zMesh, sh = this.shMesh, c = this.tmpC;
    let i = 0, zi = 0;
    for (const z of this.zs) {
      if (z.rig) {
        z.rig.group.position.set(z.x, 0, z.z);
        z.rig.group.rotation.y = z.ang;
        if (live) z.rig.update(dt);
      } else {
        const bob = Math.abs(Math.sin(z.phase)) * 0.06 * z.s;
        D.position.set(z.x, bob, z.z);
        D.rotation.set(z.type === 'runner' ? 0.35 : 0.12, z.ang, Math.sin(z.phase) * 0.12);
        D.scale.setScalar(z.s);
        D.updateMatrix();
        zm.setMatrixAt(zi, D.matrix);
        if (z.flash > 0) c.setRGB(2.6, 2.6, 2.6); else if (z.rage > 0) c.setRGB(1.8, 0.5, 0.5); else c.setRGB(z.tr, z.tg, z.tb);
        zm.setColorAt(zi, c);
        zi++;
      }
      D.position.set(z.x, 0.02, z.z);
      D.rotation.set(0, 0, 0);
      D.scale.setScalar(z.s * 1.1);
      D.updateMatrix();
      sh.setMatrixAt(i, D.matrix);
      i++;
    }
    // 倒下的丧尸：播完死亡动作后淡出、回收
    for (let k = this.corpses.length - 1; k >= 0; k--) {
      const cp = this.corpses[k];
      if (live) { cp.t -= dt; cp.rig.update(dt); }
      if (cp.t < 0.8) cp.rig.setOpacity(Math.max(0, cp.t / 0.8));
      if (cp.t <= 0) { cp.pool.put(cp.rig); this.corpses.splice(k, 1); }
    }
    zm.count = zi; sh.count = i;
    zm.instanceMatrix.needsUpdate = true;
    zm.instanceColor.needsUpdate = true;
    sh.instanceMatrix.needsUpdate = true;

    // 子弹
    i = 0;
    for (const b of this.bullets) {
      if (b.kind === 'flame') continue;
      D.position.set(b.x, 1.05, b.z);
      D.rotation.set(0, b.ang, 0);
      D.scale.setScalar(1);
      D.updateMatrix();
      this.bMesh.setMatrixAt(i++, D.matrix);
    }
    this.bMesh.count = i;
    i = 0;
    for (const sp of this.spits) { D.position.set(sp.x, 1.0, sp.z); D.rotation.set(0, 0, 0); D.scale.setScalar(1); D.updateMatrix(); this.sMesh.setMatrixAt(i++, D.matrix); }
    this.sMesh.count = i;
    this.sMesh.instanceMatrix.needsUpdate = true;
    this.bMesh.instanceMatrix.needsUpdate = true;

    // 经验球
    const T = this.t;
    i = 0;
    for (const g of this.gems) {
      D.position.set(g.x, 0.4 + Math.sin(T * 4 + g.ph) * 0.1, g.z);
      D.rotation.set(0, T * 3 + g.ph, 0);
      D.scale.setScalar(g.v >= 5 ? 1.6 : g.v >= 2 ? 1.2 : 1);
      D.updateMatrix();
      this.gMesh.setMatrixAt(i, D.matrix);
      c.set(g.v >= 5 ? 0xc77dff : 0x4dd9ec);
      this.gMesh.setColorAt(i, c);
      i++;
    }
    this.gMesh.count = i;
    this.gMesh.instanceMatrix.needsUpdate = true;
    if (this.gMesh.instanceColor) this.gMesh.instanceColor.needsUpdate = true;

    // 物资箱 / 医疗包
    i = 0;
    for (const g of this.loot) {
      D.position.set(g.x, 0.3 + Math.sin(T * 3 + g.ph) * 0.08, g.z);
      D.rotation.set(0.3, T * 2 + g.ph, 0);
      D.scale.setScalar(g.kind === 'scrap' ? 0.8 + Math.min(0.6, g.v * 0.05) : 1.2);
      D.updateMatrix();
      this.lMesh.setMatrixAt(i, D.matrix);
      c.set(g.kind === 'med' ? 0xff4d4d : g.kind === 'ammo' ? 0x6fbf4a : 0xd9a441);
      this.lMesh.setColorAt(i, c);
      i++;
    }
    this.lMesh.count = i;
    this.lMesh.instanceMatrix.needsUpdate = true;
    if (this.lMesh.instanceColor) this.lMesh.instanceColor.needsUpdate = true;

    // 粒子
    i = 0;
    for (const q of this.parts) {
      D.position.set(q.x, q.y, q.z);
      D.rotation.set(q.life * 5, q.life * 3, 0);
      D.scale.setScalar(q.s * Math.min(1, q.life / q.max * 1.5));
      D.updateMatrix();
      this.pMesh.setMatrixAt(i, D.matrix);
      c.setRGB(q.r, q.g, q.b);
      this.pMesh.setColorAt(i, c);
      i++;
    }
    this.pMesh.count = i;
    this.pMesh.instanceMatrix.needsUpdate = true;
    if (this.pMesh.instanceColor) this.pMesh.instanceColor.needsUpdate = true;

    // 镜头跟随 + 受伤震动
    const f = this.camFocus, k = 1 - Math.exp(-dt * 8), o = this.camOff;
    f.x += (p.x - f.x) * k; f.z += (p.z - f.z) * k;
    let sx = 0, sz = 0;
    if (this.shake > 0) { this.shake -= dt; sx = (Math.random() - 0.5) * this.shake * 1.5; sz = (Math.random() - 0.5) * this.shake * 1.5; }
    this.camera.position.set(f.x + o.x + sx, o.y, f.z + o.z + sz);
    this.camera.lookAt(f.x + sx, 0, f.z + sz);
  }

  dispose() {
    if (this.pools) for (const pl of Object.values(this.pools)) if (pl) pl.dispose();
    if (this.pRig) this.pRig.dispose();
    for (const a of this.allies) if (a.rig) a.rig.dispose();
    disposeScene(this.scene);
  }
}

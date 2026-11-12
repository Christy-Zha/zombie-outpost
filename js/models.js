// 真实 3D 模型（Mixamo 转换来的 GLB，带骨骼动画）
// models/ 里有对应文件就用真实模型，没有就自动退回方块人，游戏照常能玩
import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { clone as cloneSkinned } from '../vendor/SkeletonUtils.js';

export const MODELS = {}; // name → { scene, clips, height, footY }
const CORE = ['player', 'zombie', 'mutant'];   // 启动时加载
export const EXTRA = ['c_chen', 'c_jie', 'c_min', 'c_zhou', 'c_xiao', 'z_walker2', 'z_runner', 'z_exploder', 'z_spitter', 'z_screamer', 'z_armored']; // 用到才加载
const tried = new Set();
const loader = new GLTFLoader();

// 新角色只带 1 个动作，其余动作借用：c_* 借主角的，z_* 借丧尸的
const SHARE_FROM = n => (n.startsWith('c_') ? 'player' : n.startsWith('z_') ? 'zombie' : null);
// 借来的动作只保留关节旋转（去掉位置轨道），避免身高不同导致脚浮空或陷地
// 同时只保留目标角色身上真的有的骨骼（有的丧尸模型没有手指骨）
const rotCache = new Map();
function rotOnly(clip, model, bones) {
  const k = clip.uuid + '|' + model;
  if (!rotCache.has(k)) rotCache.set(k, new THREE.AnimationClip(clip.name, clip.duration, clip.tracks.filter(t => !t.name.endsWith('.position') && bones.has(t.name.slice(0, t.name.lastIndexOf('.'))))));
  return rotCache.get(k);
}

export function loadModels(dir = 'models/') { return ensureModels(CORE, dir); }

// 确保这些模型已加载（已加载/加载失败过的会跳过）
export async function ensureModels(names, dir = 'models/') {
  const todo = names.filter(n => !MODELS[n] && !tried.has(n));
  todo.forEach(n => tried.add(n));
  await Promise.all(todo.map(name => new Promise(done => {
    loader.load(dir + name + '.glb', gltf => {
      const root = gltf.scene.children[0] || gltf.scene;
      // 转换工具把身高写在 userData 里；万一没有就用包围盒估算
      let { height, footY } = root.userData || {};
      if (!height) {
        const b = new THREE.Box3().setFromObject(gltf.scene, true);
        height = b.max.y - b.min.y; footY = b.min.y;
      }
      const clips = {};
      for (const c of gltf.animations) clips[c.name.toLowerCase()] = c;
      MODELS[name] = { scene: gltf.scene, clips, height, footY: footY || 0 };
      done();
    }, undefined, () => done()); // 文件不存在 → 跳过
  })));
  return Object.keys(MODELS);
}

export const hasModel = name => !!MODELS[name];

// 一个可动的角色实例
export class Rig {
  constructor(name, targetHeight = 1.8) {
    const M = MODELS[name];
    this.name = name;
    this.group = new THREE.Group();
    this.obj = cloneSkinned(M.scene);
    const k = targetHeight / M.height;
    this.obj.scale.setScalar(k);
    this.obj.position.y = -M.footY * k;
    this.group.add(this.obj);
    this.mats = [];
    this.obj.traverse(o => {
      if (!o.isMesh) return;
      o.frustumCulled = false; // 蒙皮模型的包围盒不准，关掉剔除避免闪烁
      // 每个实例单独一份材质，才能单独做“受击闪白”和“死亡淡出”
      const src = Array.isArray(o.material) ? o.material : [o.material];
      const mats = src.map(m => {
        const n = new THREE.MeshLambertMaterial({ map: m.map || null, color: m.color ? m.color.clone() : 0xffffff, transparent: false });
        n.userData.baseEmissive = new THREE.Color(0, 0, 0);
        return n;
      });
      o.material = Array.isArray(o.material) ? mats : mats[0];
      this.mats.push(...mats);
    });
    this.mixer = new THREE.AnimationMixer(this.obj);
    this.actions = {};
    const src = SHARE_FROM(name) && MODELS[SHARE_FROM(name)];
    if (src) {
      const bones = new Set();
      this.obj.traverse(o => bones.add(o.name));
      for (const [n, clip] of Object.entries(src.clips)) if (!M.clips[n]) this.actions[n] = this.mixer.clipAction(rotOnly(clip, name, bones));
    }
    for (const [n, clip] of Object.entries(M.clips)) this.actions[n] = this.mixer.clipAction(clip);
    this.cur = null;
    this.flashT = 0;
  }

  has(anim) { return !!this.actions[anim]; }

  // 切换动作（带淡入淡出）；once = 只播一次并停在最后一帧（死亡）
  play(anim, { fade = 0.2, once = false, speed = 1 } = {}) {
    // 缺这个动作（下载漏了 / 文件名不对）就用第一个可用的动作顶上，避免 T 字僵硬姿势
    const a = this.actions[anim] || this.actions[this.fallback || (this.fallback = Object.keys(this.actions)[0])];
    if (!a) return;
    a.timeScale = speed;
    if (this.cur === a) return;
    a.reset();
    a.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    a.clampWhenFinished = once;
    a.enabled = true;
    a.play();
    if (this.cur) this.cur.crossFadeTo(a, fade, false);
    this.cur = a;
  }

  // 染色：保留贴图细节，整体偏向某种颜色（用来区分不同的幸存者/队友）
  tint(hex, amount = 0.45) {
    const c = new THREE.Color(1, 1, 1).lerp(new THREE.Color(hex), amount);
    for (const m of this.mats) m.color.copy(c);
  }

  flash(t = 0.1) { this.flashT = t; }

  setOpacity(v) {
    for (const m of this.mats) { m.transparent = v < 1; m.opacity = v; m.depthWrite = v >= 1; }
  }

  update(dt) {
    this.mixer.update(dt);
    if (this.flashT > 0) {
      this.flashT -= dt;
      const on = this.flashT > 0;
      for (const m of this.mats) m.emissive.setRGB(on ? 0.8 : 0, on ? 0.8 : 0, on ? 0.8 : 0);
    }
  }

  reset() {
    this.cur = null;
    this.mixer.stopAllAction();
    this.setOpacity(1);
    this.flashT = 0;
    for (const m of this.mats) m.emissive.setRGB(0, 0, 0);
  }

  dispose() { for (const m of this.mats) m.dispose(); }
}

// 角色对象池：丧尸死了回收再用，避免手机上反复创建造成卡顿
export class RigPool {
  constructor(scene, name, height) { this.scene = scene; this.name = name; this.height = height; this.free = []; this.all = []; }
  get() {
    let r = this.free.pop();
    if (!r) { r = new Rig(this.name, this.height); this.all.push(r); this.scene.add(r.group); }
    r.reset();
    r.group.visible = true;
    return r;
  }
  put(r) { r.group.visible = false; this.free.push(r); }
  dispose() { for (const r of this.all) r.dispose(); }
}

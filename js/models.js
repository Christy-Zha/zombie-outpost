// 真实 3D 模型（Mixamo 转换来的 GLB，带骨骼动画）
// models/ 里有对应文件就用真实模型，没有就自动退回方块人，游戏照常能玩
import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';
import { clone as cloneSkinned } from '../vendor/SkeletonUtils.js';

export const MODELS = {}; // name → { scene, clips, height, footY }
const NAMES = ['player', 'zombie', 'mutant'];

export async function loadModels(dir = 'models/') {
  const loader = new GLTFLoader();
  await Promise.all(NAMES.map(name => new Promise(done => {
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

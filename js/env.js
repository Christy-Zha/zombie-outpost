// 写实场景素材（Poly Haven，CC0）：道具模型 + 贴图材质
// 素材在 assets/ 里，随仓库发布；加载失败也不影响游戏（退回原来的方块场景）
import * as THREE from '../vendor/three.module.min.js';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

export const ENV_MODELS = [
  'concrete_road_barrier', 'barrel_03', 'wooden_crate_02', 'old_military_crate', 'ammo_box', 'portable_generator',
  'metal_jerrycan', 'medical_box', 'old_tyre', 'street_lamp_01', 'covered_car', 'propane_tank', 'utility_box_01',
];
const PROTO = {};   // 模型名 → { parts: [{geometry, material, matrix}], size }
const TEX = {};     // 贴图名 → { diff, nor }
let ready = false;

export const envReady = () => ready;

export async function loadEnv(texNames) {
  const loader = new GLTFLoader();
  const tl = new THREE.TextureLoader();
  const loadTex = url => new Promise(ok => tl.load(url, ok, undefined, () => ok(null)));
  await Promise.all([
    ...ENV_MODELS.map(name => loader.loadAsync(`assets/env/${name}.glb`).then(g => {
      g.scene.updateMatrixWorld(true);
      const parts = [];
      g.scene.traverse(o => {
        if (!o.isMesh) return;
        // 打上 keep 标记：多场战斗共用，场景销毁时不要释放
        o.geometry.userData.keep = true;
        o.material.userData.keep = true;
        if (o.material.map) o.material.map.userData.keep = true;
        if (o.material.normalMap) o.material.normalMap.userData.keep = true;
        parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() });
      });
      const size = new THREE.Box3().setFromObject(g.scene).getSize(new THREE.Vector3());
      PROTO[name] = { parts, size };
    }).catch(() => { })),
    ...texNames.map(async name => {
      const [diff, nor] = await Promise.all([loadTex(`assets/tex/${name}_diff.jpg`), loadTex(`assets/tex/${name}_nor.jpg`)]);
      if (diff) { diff.colorSpace = THREE.SRGBColorSpace; diff.wrapS = diff.wrapT = THREE.RepeatWrapping; diff.anisotropy = 4; }
      if (nor) { nor.wrapS = nor.wrapT = THREE.RepeatWrapping; }
      TEX[name] = { diff, nor };
    }),
  ]);
  ready = Object.keys(PROTO).length > 0;
  return ready;
}

export const hasProp = name => !!PROTO[name];
export const propSize = name => PROTO[name] && PROTO[name].size;

// 写实材质：同一张贴图在不同物体上要不同的平铺次数，所以每次克隆一份贴图（共用图片数据，不占额外显存）
export function pbr(name, { repeat = [1, 1], color = 0xffffff, rough = 0.9, lambert = false } = {}) {
  const t = TEX[name];
  if (!t || !t.diff) return lambert ? new THREE.MeshLambertMaterial({ color }) : new THREE.MeshStandardMaterial({ color, roughness: rough });
  const map = t.diff.clone(); map.repeat.set(repeat[0], repeat[1]); map.needsUpdate = true;
  if (lambert) return new THREE.MeshLambertMaterial({ map, color });
  let normalMap = null;
  if (t.nor) { normalMap = t.nor.clone(); normalMap.repeat.set(repeat[0], repeat[1]); normalMap.needsUpdate = true; }
  return new THREE.MeshStandardMaterial({ map, normalMap, color, roughness: rough, metalness: 0 });
}

// 放一个道具：返回 Group；scale 可以是数字或 [x,y,z]
export function prop(name, { x = 0, y = 0, z = 0, ry = 0, scale = 1, shadow = false, lambert = false, tint = null } = {}) {
  const P = PROTO[name];
  const g = new THREE.Group();
  if (!P) return g;
  for (const part of P.parts) {
    let mat = part.material;
    if (lambert || tint) {
      mat = new THREE.MeshLambertMaterial({ map: part.material.map || null, color: tint !== null ? tint : 0xffffff });
    }
    const m = new THREE.Mesh(part.geometry, mat);
    m.applyMatrix4(part.matrix);
    m.castShadow = m.receiveShadow = shadow;
    g.add(m);
  }
  g.position.set(x, y, z);
  g.rotation.y = ry;
  if (Array.isArray(scale)) g.scale.set(...scale); else g.scale.setScalar(scale);
  return g;
}

// 同一种道具放很多个：用 InstancedMesh，一种道具只画一次（手机省性能）
// list: [{x, z, ry, s}]
export function propInstances(name, list, { lambert = true, shadow = false, y = 0 } = {}) {
  const P = PROTO[name];
  const group = new THREE.Group();
  if (!P || !list.length) return group;
  const d = new THREE.Object3D(), m4 = new THREE.Matrix4();
  for (const part of P.parts) {
    const mat = lambert ? new THREE.MeshLambertMaterial({ map: part.material.map || null, color: part.material.color || 0xffffff }) : part.material;
    const im = new THREE.InstancedMesh(part.geometry, mat, list.length);
    list.forEach((it, i) => {
      d.position.set(it.x, (it.y || 0) + y, it.z);
      d.rotation.set(0, it.ry || 0, 0);
      d.scale.setScalar(it.s || 1);
      d.updateMatrix();
      m4.multiplyMatrices(d.matrix, part.matrix);
      im.setMatrixAt(i, m4);
    });
    im.castShadow = im.receiveShadow = shadow;
    im.computeBoundingSphere();
    group.add(im);
  }
  return group;
}

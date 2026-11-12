// 存档与经济系统（纯逻辑，不依赖画面，可以单独用 node 测试）
import { BUILDINGS, WEAPONS, ZONES, SAVE_V, SURVIVOR_NAMES, STORE_HOURS } from './data.js';

export const SAVE_KEY = 'zombie-outpost-save';
const B = Object.fromEntries(BUILDINGS.map(b => [b.key, b]));

export function defaultSave(now = Date.now()) {
  const buildings = {};
  for (const b of BUILDINGS) buildings[b.key] = 0;
  buildings.hq = 1;
  return {
    v: SAVE_V,
    scrap: 120,            // 物资
    food: 30,              // 食物
    survivors: [],         // 幸存者名字列表
    buildings,
    cleared: 0,            // 已通关的区域数量
    zone: 0,               // 当前选择的区域
    weapon: 'pistol',
    store: { scrap: 0, food: 0 }, // 仓库里还没收取的离线产出
    lastTick: now,
    sound: true,
    stats: { runs: 0, kills: 0, best: {} },
  };
}

// 旧存档兼容：缺的字段用默认值补上，未来改版也在这里处理
export function migrate(d, now = Date.now()) {
  const def = defaultSave(now);
  if (!d || typeof d !== 'object') return def;
  const s = { ...def, ...d };
  s.buildings = { ...def.buildings, ...(d.buildings || {}) };
  s.store = { ...def.store, ...(d.store || {}) };
  s.stats = { ...def.stats, ...(d.stats || {}) };
  s.stats.best = { ...(s.stats.best || {}) };
  if (!Array.isArray(s.survivors)) s.survivors = [];
  if (!WEAPONS[s.weapon]) s.weapon = 'pistol';
  if (typeof s.lastTick !== 'number') s.lastTick = now;
  s.cleared = Math.max(0, Math.min(ZONES.length, s.cleared | 0));
  s.zone = Math.max(0, Math.min(s.zone | 0, s.cleared, ZONES.length - 1));
  s.v = SAVE_V;
  return s;
}

export function load(storage = globalThis.localStorage) {
  let raw = null;
  try {
    raw = storage.getItem(SAVE_KEY);
    if (!raw) return defaultSave();
    return migrate(JSON.parse(raw));
  } catch (e) {
    // 存档损坏：先备份一份，再开新档，避免直接丢失
    try { if (raw) storage.setItem(SAVE_KEY + '-backup', raw); } catch { /* 忽略 */ }
    return defaultSave();
  }
}

export function persist(s, storage = globalThis.localStorage) {
  try { storage.setItem(SAVE_KEY, JSON.stringify(s)); return true; } catch { return false; }
}

// ---------- 幸存者 ----------
export const survivorCap = s => 2 + 2 * s.buildings.dorm;
export const survivorMult = s => 1 + 0.08 * s.survivors.length;
export const recruitCost = s => 15 + 10 * s.survivors.length;

function newName(s) {
  const free = SURVIVOR_NAMES.filter(n => !s.survivors.includes(n));
  if (free.length) return free[Math.floor(Math.random() * free.length)];
  return `幸存者${s.survivors.length + 1}`;
}

export function checkRecruit(s) {
  if (s.survivors.length >= survivorCap(s)) return { ok: false, reason: '宿舍住满了，先升级宿舍' };
  const c = recruitCost(s);
  if (s.food < c) return { ok: false, reason: `食物不够（还差 ${Math.ceil(c - s.food)}）` };
  return { ok: true, cost: c };
}

export function recruit(s) {
  const r = checkRecruit(s);
  if (!r.ok) return r;
  s.food -= r.cost;
  const name = newName(s);
  s.survivors.push(name);
  return { ...r, name };
}

// ---------- 离线产出 ----------
export function rates(s) {
  const m = survivorMult(s);
  return { scrap: 30 * s.buildings.scrapyard * m, food: 20 * s.buildings.farm * m };
}

export function storeCap(s) {
  const r = rates(s);
  return { scrap: r.scrap * STORE_HOURS, food: r.food * STORE_HOURS };
}

// 按经过的真实时间累积产出到仓库
export function tick(s, now = Date.now()) {
  const hours = (now - s.lastTick) / 3600000;
  s.lastTick = now;
  if (!(hours > 0)) return; // 时间倒退（改过手机时间）就不给产出
  const r = rates(s), cap = storeCap(s);
  s.store.scrap = Math.min(cap.scrap, s.store.scrap + r.scrap * hours);
  s.store.food = Math.min(cap.food, s.store.food + r.food * hours);
}

export function collect(s) {
  const scrap = Math.floor(s.store.scrap), food = Math.floor(s.store.food);
  s.scrap += scrap; s.store.scrap -= scrap;
  s.food += food; s.store.food -= food;
  return { scrap, food };
}

// ---------- 建筑 ----------
export function cost(key, lv) {
  const b = B[key];
  return Math.round(b.base * Math.pow(b.growth, lv) / 5) * 5;
}

export function checkUpgrade(s, key) {
  const b = B[key], lv = s.buildings[key];
  if (lv >= b.max) return { ok: false, reason: '已经满级了' };
  if (key !== 'hq' && lv >= s.buildings.hq) return { ok: false, reason: `先把指挥部升到 Lv${lv + 1}` };
  const c = cost(key, lv);
  if (s.scrap < c) return { ok: false, reason: `物资不够（还差 ${c - Math.floor(s.scrap)}）`, cost: c };
  return { ok: true, cost: c };
}

export function upgrade(s, key, now = Date.now()) {
  tick(s, now); // 先按旧产量结算到现在，再升级
  const r = checkUpgrade(s, key);
  if (!r.ok) return r;
  s.scrap -= r.cost;
  s.buildings[key]++;
  return { ...r, lv: s.buildings[key] };
}

// ---------- 战斗相关 ----------
export function battleStats(s) {
  const b = s.buildings, n = s.survivors.length;
  return {
    dmgMul: (1 + 0.1 * b.armory) * (1 + 0.02 * n),
    maxHp: 100 + 20 * b.gym,
    regen: 0.4 * b.clinic,
    xpMul: 1 + 0.08 * b.radio,
    pickupMul: 1,
  };
}

export const weaponUnlocked = (s, key) => s.buildings.armory >= WEAPONS[key].armory;

// 结算一局：r = { win, retreat, zoneIndex, time, kills, scrap, rescued, level }
export function applyResult(s, r) {
  const zone = ZONES[r.zoneIndex];
  let bonus = 0, firstClear = false;
  if (r.win) {
    bonus = Math.round(100 * zone.reward);
    if (r.zoneIndex === s.cleared && s.cleared < ZONES.length) {
      s.cleared++;
      firstClear = true;
      bonus *= 2; // 首通双倍奖励
      if (s.cleared < ZONES.length) s.zone = s.cleared; // 自动选中新区域
    }
  }
  s.scrap += r.scrap + bonus;
  const joined = [];
  let extraFood = 0;
  for (let i = 0; i < r.rescued; i++) {
    if (s.survivors.length < survivorCap(s)) {
      const name = newName(s);
      s.survivors.push(name);
      joined.push(name);
    } else {
      extraFood += 30; // 住不下的幸存者留下食物离开
    }
  }
  s.food += extraFood;
  s.stats.runs++;
  s.stats.kills += r.kills;
  s.stats.best[r.zoneIndex] = Math.max(s.stats.best[r.zoneIndex] || 0, Math.floor(r.time));
  return { bonus, firstClear, joined, extraFood };
}

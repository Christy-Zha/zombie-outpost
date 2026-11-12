// 存档与经济系统（纯逻辑，不依赖画面，可以单独用 node 测试）
import { BUILDINGS, WEAPONS, ZONES, SAVE_V, SURVIVOR_NAMES, STORE_HOURS, GEAR_SLOTS, RARITIES, GEAR_STATS, BAG_SIZE } from './data.js';
import { CHAPTERS } from './story.js';

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
    stats: { runs: 0, kills: 0, best: {}, bossKills: 0 },
    bag: [],                                  // 背包里的装备
    gear: { head: null, body: null, acc: null }, // 已穿戴装备的 id
    nextItemId: 1,
    story: { done: 0 },   // 已完成的剧情章节数
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
  // v1 → v2：补上装备字段
  if (!Array.isArray(s.bag)) s.bag = [];
  s.gear = { ...def.gear, ...(d.gear || {}) };
  for (const k of Object.keys(s.gear)) if (s.gear[k] !== null && !s.bag.some(it => it.id === s.gear[k])) s.gear[k] = null;
  if (typeof s.nextItemId !== 'number') s.nextItemId = s.bag.reduce((m, it) => Math.max(m, it.id + 1), 1);
  if (typeof s.stats.bossKills !== 'number') s.stats.bossKills = 0;
  // v2 → v3：补上剧情进度
  s.story = { ...def.story, ...(d.story || {}) };
  s.story.done = Math.max(0, Math.min(CHAPTERS.length, s.story.done | 0));
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
  const b = s.buildings, n = s.survivors.length, g = gearTotals(s);
  return {
    dmgMul: (1 + 0.1 * b.armory) * (1 + 0.02 * n) * (1 + g.dmg),
    maxHp: Math.round(100 + 20 * b.gym + g.hp),
    regen: 0.4 * b.clinic + g.regen,
    xpMul: 1 + 0.08 * b.radio,
    pickupMul: 1 + g.pickup,
    rateMul: 1 + g.rate,
    speedMul: 1 + g.speed,
  };
}

// ---------- 装备 ----------
const SLOT = Object.fromEntries(GEAR_SLOTS.map(x => [x.key, x]));

// 掉落品质：区域越靠后，好装备越多
export function rollRarity(zoneIndex, rnd = Math.random) {
  const w = RARITIES.map((r, i) => Math.max(1, r.weight + zoneIndex * [-9, 2, 4, 3][i]));
  let x = rnd() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { x -= w[i]; if (x < 0) return i; }
  return 0;
}

function statValue(key, zoneIndex, rarity, rnd) {
  const st = GEAR_STATS[key];
  const v = st.base * RARITIES[rarity].mult * (st.zone ? 1 + 0.6 * zoneIndex : 1) * (0.85 + rnd() * 0.3);
  if (key === 'hp') return Math.round(v); // 生命取整，好看一些
  return st.pct ? Math.round(v * 1000) / 1000 : Math.round(v * 10) / 10;
}

export function makeItem(s, zoneIndex, rarity = rollRarity(zoneIndex), rnd = Math.random) {
  const slot = GEAR_SLOTS[Math.floor(rnd() * GEAR_SLOTS.length)];
  const stats = { [slot.main]: statValue(slot.main, zoneIndex, rarity, rnd) };
  const pool = Object.keys(GEAR_STATS).filter(k => k !== slot.main);
  for (let i = 0; i < RARITIES[rarity].extra; i++) {
    const k = pool.splice(Math.floor(rnd() * pool.length), 1)[0];
    stats[k] = statValue(k, zoneIndex, rarity, rnd);
  }
  const name = slot.names[Math.min(slot.names.length - 1, Math.floor(zoneIndex * 0.8 + rnd() * 1.5))];
  return { id: s.nextItemId++, slot: slot.key, name, rarity, zone: zoneIndex, stats };
}

export const dismantleValue = it => Math.round(30 * (it.rarity + 1) * (1 + 0.6 * it.zone));

// 放进背包；背包满了自动分解成物资
export function addItem(s, it) {
  if (s.bag.length >= BAG_SIZE) { const v = dismantleValue(it); s.scrap += v; return { stored: false, scrap: v }; }
  s.bag.push(it);
  return { stored: true };
}

export function equip(s, id) {
  const it = s.bag.find(x => x.id === id);
  if (!it) return false;
  s.gear[it.slot] = s.gear[it.slot] === id ? null : id; // 再点一次 = 卸下
  return true;
}

export function dismantle(s, id) {
  const i = s.bag.findIndex(x => x.id === id);
  if (i < 0) return 0;
  const it = s.bag[i];
  if (s.gear[it.slot] === id) s.gear[it.slot] = null;
  s.bag.splice(i, 1);
  const v = dismantleValue(it);
  s.scrap += v;
  return v;
}

export function gearTotals(s) {
  const t = Object.fromEntries(Object.keys(GEAR_STATS).map(k => [k, 0]));
  for (const slot of Object.keys(s.gear || {})) {
    const it = s.bag.find(x => x.id === s.gear[slot]);
    if (it) for (const [k, v] of Object.entries(it.stats)) t[k] += v;
  }
  return t;
}

export function statText(key, v) {
  const st = GEAR_STATS[key];
  return `${st.name} +${st.pct ? Math.round(v * 100) + '%' : v}`;
}

export const weaponUnlocked = (s, key) => s.buildings.armory >= WEAPONS[key].armory;

// 结算一局：r = { win, retreat, zoneIndex, time, kills, scrap, rescued, level }
export function applyResult(s, r) {
  const zone = ZONES[r.zoneIndex];
  let bonus = 0, firstClear = false;
  const isStory = r.story !== null && r.story !== undefined;
  let storyFirst = false, storyJoin = null;
  if (isStory && r.win) {
    // 剧情章节：首次通关给全额奖励和同伴，重玩给 30%
    const ch = CHAPTERS[r.story];
    storyFirst = r.story === s.story.done;
    bonus = storyFirst ? ch.reward.scrap : Math.round(ch.reward.scrap * 0.3);
    if (storyFirst) {
      s.story.done++;
      const nm = ch.reward.survivor;
      if (nm && !s.survivors.includes(nm)) { s.survivors.push(nm); storyJoin = nm; } // 剧情同伴不占宿舍名额限制
    }
  } else if (r.win) {
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
  // 击败尸王：掉落一件装备
  let item = null, itemScrap = 0;
  if (r.bossKilled) {
    item = makeItem(s, r.zoneIndex);
    const put = addItem(s, item);
    if (!put.stored) itemScrap = put.scrap;
    s.stats.bossKills++;
  }
  s.stats.runs++;
  s.stats.kills += r.kills;
  s.stats.best[r.zoneIndex] = Math.max(s.stats.best[r.zoneIndex] || 0, Math.floor(r.time));
  return { bonus, firstClear, joined, extraFood, item, itemScrap, storyFirst, storyJoin };
}

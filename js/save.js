// 存档与经济系统（纯逻辑，不依赖画面，可以单独用 node 测试）
import { BUILDINGS, WEAPONS, ZONES, SAVE_V, SURVIVOR_NAMES, STORE_HOURS, GEAR_SLOTS, RARITIES, GEAR_STATS, BAG_SIZE,
  COMPANIONS, SQUAD_MAX, COMP_MAX_LV, compNeed, compMul, CMD_MAX_LV, cmdNeed, TALENTS, WEAPON_MAX_LV, weaponUpCost, weaponMul,
  PERKS, BOND_PER_CHAT, BOND_PER_RUN, RAID_EVERY } from './data.js';
import { SIDE } from './side.js';
import { CHAPTERS, ENDINGS } from './story.js';

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
    story: { stage: 0, flags: {}, ending: null, endings: [] }, // 已通关关卡数 / 剧情选择标记 / 达成的结局
    cmd: { lv: 1, xp: 0, pts: 0, talents: {} }, // 指挥官等级 / 天赋
    weaponLv: { pistol: 0, shotgun: 0, smg: 0, rifle: 0 }, // 武器强化等级
    comps: {},            // 队友成长：名字 → { lv, xp }
    squad: [],            // 出征带的队友（最多 2 人）
    bond: {},             // 好感度：名字 → 0~100
    chat: {},             // 闲聊进度：名字 → { i: 已聊到第几组, run: 上次聊天时的出征次数 }
    sideDone: [],         // 已完成的支线：'陈医生:0'
    perks: {},            // 已解锁的队友专属技能
    raid: { next: RAID_EVERY, wins: 0 }, // 出征次数达到 next 时，据点遭遇夜袭
  };
}

// v5 → v6：原来 5 章分别变成新的第 1、4、7、10、15 章
// 从最后打完的旧章节之后接着玩（这样不会跳过新写的章节）；旧章节中途打过的 1~2 关以后重打
// 旧版全通关的玩家直接算全通关（已经看过结局，新章节可以在列表里重玩）
const OLD_CH = [0, 3, 6, 9, 14];
export function oldStageToNew(i) {
  if (i >= 15) return 45;
  const c = Math.floor(i / 3);
  return c === 0 ? i : (OLD_CH[c - 1] + 1) * 3;
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
  // v2 → v3 → v4：剧情进度从“章”改成“关”（每章 3 关）
  const st = d.story || {};
  const total = CHAPTERS.reduce((n, c) => n + c.stages.length, 0);
  s.story = { stage: typeof st.stage === 'number' ? st.stage : (st.done | 0) * 3, flags: { ...(st.flags || {}) }, ending: st.ending || null, endings: Array.isArray(st.endings) ? st.endings : [] };
  if ((d.v | 0) < 6) s.story.stage = oldStageToNew(s.story.stage | 0);
  s.story.stage = Math.max(0, Math.min(total, s.story.stage | 0));
  // v4：指挥官 / 武器强化 / 队友
  s.cmd = { ...def.cmd, ...(d.cmd || {}) };
  s.cmd.talents = { ...(s.cmd.talents || {}) };
  s.weaponLv = { ...def.weaponLv, ...(d.weaponLv || {}) };
  s.comps = { ...(d.comps || {}) };
  for (const n of Object.keys(COMPANIONS)) if (s.survivors.includes(n) && !s.comps[n]) s.comps[n] = { lv: 1, xp: 0 };
  s.squad = (Array.isArray(d.squad) ? d.squad : []).filter(n => s.comps[n]).slice(0, SQUAD_MAX);
  // v5：好感 / 支线 / 专属技能 / 夜袭
  s.bond = { ...(d.bond || {}) };
  s.chat = { ...(d.chat || {}) };
  s.sideDone = Array.isArray(d.sideDone) ? d.sideDone : [];
  s.perks = { ...(d.perks || {}) };
  s.raid = { ...def.raid, ...(d.raid || {}) };
  if (!d.raid) s.raid.next = (s.stats.runs | 0) + RAID_EVERY;
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
export function battleStats(s, weaponKey = s.weapon) {
  const b = s.buildings, n = s.survivors.length, g = gearTotals(s), t = talent(s), w = weaponMul(s.weaponLv[weaponKey] || 0);
  return {
    dmgMul: (1 + 0.1 * b.armory) * (1 + 0.02 * n) * (1 + g.dmg) * (1 + 0.05 * t.gun) * w.dmg,
    maxHp: Math.round((100 + 20 * b.gym + g.hp) * (1 + 0.06 * t.hp)),
    regen: 0.4 * b.clinic + g.regen + 0.25 * t.aid,
    xpMul: 1 + 0.08 * b.radio,
    pickupMul: 1 + g.pickup,
    rateMul: (1 + g.rate) * w.rate,
    speedMul: (1 + g.speed) * (1 + 0.02 * t.move),
    ammoMul: 1 + 0.08 * t.ammo,
    lootMul: 1 + 0.06 * t.loot,
    squad: s.squad.filter(nm => s.comps[nm]).map(nm => ({ name: nm, lv: s.comps[nm].lv, mul: compMul(s.comps[nm].lv) * (1 + 0.08 * t.lead), perks: Object.keys(s.perks).filter(k => s.perks[k] && PERKS[k] && PERKS[k].who === nm) })),
    turret: s.buildings.turret | 0,
  };
}

// ---------- 指挥官 / 天赋 ----------
export function talent(s) {
  const t = {};
  for (const x of TALENTS) t[x.key] = (s.cmd.talents[x.key] | 0);
  return t;
}
export function addCmdXp(s, xp) {
  const c = s.cmd;
  let ups = 0;
  c.xp += Math.round(xp);
  while (c.lv < CMD_MAX_LV && c.xp >= cmdNeed(c.lv)) { c.xp -= cmdNeed(c.lv); c.lv++; c.pts++; ups++; }
  if (c.lv >= CMD_MAX_LV) c.xp = 0;
  return ups;
}
export function learnTalent(s, key) {
  const def = TALENTS.find(x => x.key === key), c = s.cmd;
  if (!def) return { ok: false, reason: '没有这个天赋' };
  if ((c.talents[key] | 0) >= def.max) return { ok: false, reason: '已经满级了' };
  if (c.pts <= 0) return { ok: false, reason: '天赋点不够（指挥官升级获得）' };
  c.pts--; c.talents[key] = (c.talents[key] | 0) + 1;
  return { ok: true, lv: c.talents[key] };
}
// 重置天赋：返还全部点数，花费物资
export const resetTalentCost = s => 200 + 50 * s.cmd.lv;
export function resetTalents(s) {
  const spent = Object.values(s.cmd.talents).reduce((a, b) => a + (b | 0), 0);
  if (!spent) return { ok: false, reason: '还没有加过天赋' };
  const c = resetTalentCost(s);
  if (s.scrap < c) return { ok: false, reason: `物资不够（还差 ${c - Math.floor(s.scrap)}）` };
  s.scrap -= c; s.cmd.pts += spent; s.cmd.talents = {};
  return { ok: true, pts: spent };
}

// ---------- 武器强化 ----------
export function checkWeaponUp(s, key) {
  const lv = s.weaponLv[key] | 0;
  if (!weaponUnlocked(s, key)) return { ok: false, reason: `需要军械库 Lv${WEAPONS[key].armory}` };
  if (lv >= WEAPON_MAX_LV) return { ok: false, reason: '已经满级了' };
  if (lv >= s.buildings.armory + 2) return { ok: false, reason: `先把军械库升到 Lv${lv - 1}` }; // 强化等级不能超过军械库 +2
  const c = weaponUpCost(key, lv);
  if (s.scrap < c) return { ok: false, reason: `物资不够（还差 ${c - Math.floor(s.scrap)}）`, cost: c };
  return { ok: true, cost: c };
}
export function weaponUp(s, key) {
  const r = checkWeaponUp(s, key);
  if (!r.ok) return r;
  s.scrap -= r.cost; s.weaponLv[key] = (s.weaponLv[key] | 0) + 1;
  return { ...r, lv: s.weaponLv[key] };
}

// ---------- 队友 ----------
export const unlockedComps = s => Object.keys(COMPANIONS).filter(n => s.comps[n]);
export function toggleSquad(s, name) {
  if (!s.comps[name]) return { ok: false, reason: '还没有这个队友' };
  const i = s.squad.indexOf(name);
  if (i >= 0) { s.squad.splice(i, 1); return { ok: true, on: false }; }
  if (s.squad.length >= SQUAD_MAX) return { ok: false, reason: `最多带 ${SQUAD_MAX} 名队友` };
  s.squad.push(name);
  return { ok: true, on: true };
}
export function addCompXp(s, name, xp) {
  const c = s.comps[name];
  if (!c) return 0;
  let ups = 0;
  c.xp += Math.round(xp);
  while (c.lv < COMP_MAX_LV && c.xp >= compNeed(c.lv)) { c.xp -= compNeed(c.lv); c.lv++; ups++; }
  if (c.lv >= COMP_MAX_LV) c.xp = 0;
  return ups;
}
// 用食物训练队友（食物的去处之一）
export const trainCost = s => 25 + 5 * Object.values(s.comps).reduce((a, c) => a + c.lv, 0);
export function trainComp(s, name) {
  const c = s.comps[name];
  if (!c) return { ok: false, reason: '还没有这个队友' };
  if (c.lv >= COMP_MAX_LV) return { ok: false, reason: '已经满级了' };
  const cost = trainCost(s);
  if (s.food < cost) return { ok: false, reason: `食物不够（还差 ${Math.ceil(cost - s.food)}）` };
  s.food -= cost;
  const ups = addCompXp(s, name, 40 + c.lv * 8);
  return { ok: true, ups, lv: c.lv };
}

// ---------- 好感度 / 闲聊 / 支线 ----------
export const bondOf = (s, nm) => s.bond[nm] | 0;
// 每出征一次可以和每位队友聊一次
export function chatAvailable(s, nm) {
  const c = s.chat[nm] || { i: 0, run: -1 };
  return !!SIDE[nm] && !!s.comps[nm] && c.run < s.stats.runs;
}
export function doChat(s, nm) {
  if (!chatAvailable(s, nm)) return null;
  const c = s.chat[nm] || { i: 0, run: -1 };
  const chats = SIDE[nm].chats;
  const lines = chats[Math.min(c.i, chats.length - 1)];
  s.chat[nm] = { i: Math.min(c.i + 1, chats.length), run: s.stats.runs };
  s.bond[nm] = Math.min(100, bondOf(s, nm) + (c.i < chats.length ? BOND_PER_CHAT : 3));
  return lines;
}
export const sideKey = (nm, k) => `${nm}:${k}`;
export function sideState(s, nm, k) {
  const st = SIDE[nm] && SIDE[nm].stages[k];
  if (!st || !s.comps[nm]) return { locked: true, reason: '还没有这个队友' };
  if (s.sideDone.includes(sideKey(nm, k))) return { done: true, st };
  if (k > 0 && !s.sideDone.includes(sideKey(nm, k - 1))) return { locked: true, reason: '先完成支线一', st };
  if (bondOf(s, nm) < st.bond) return { locked: true, reason: `好感度需要 ${st.bond}`, st };
  return { open: true, st };
}

// ---------- 夜袭 ----------
export const raidDue = s => s.stats.runs >= s.raid.next;
export function raidPower(s) { return 1 + 0.35 * s.raid.wins; } // 每守住一次，下次更凶

// ---------- 结局 ----------
export function pickEnding(s) {
  const f = s.story.flags;
  return ENDINGS.find(e => (e.need || []).every(k => f[k])) || ENDINGS[ENDINGS.length - 1];
}
export function setFlags(s, set = {}, gain = {}) {
  Object.assign(s.story.flags, set);
  if (gain.scrap) s.scrap += gain.scrap;
  if (gain.food) s.food += gain.food;
}

// ---------- 剧情关卡 ----------
export function stageAt(i) {
  let k = i;
  for (let c = 0; c < CHAPTERS.length; c++) {
    if (k < CHAPTERS[c].stages.length) return { c, si: k, ch: CHAPTERS[c], st: CHAPTERS[c].stages[k] };
    k -= CHAPTERS[c].stages.length;
  }
  return null;
}
export const STAGE_SHARE = [0.35, 0.35, 0.7]; // 每关奖励 = 章节奖励 × 比例

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
  const isStory = r.story !== null && r.story !== undefined && !r.side && !r.raid;
  let storyFirst = false, storyJoin = null;
  let chapterDone = false, perk = null, raidLoss = null;
  const isSide = !!r.side, isRaid = !!r.raid;
  if (isSide && r.win) {
    const st = SIDE[r.side.name].stages[r.side.k], key = sideKey(r.side.name, r.side.k);
    storyFirst = !s.sideDone.includes(key);
    bonus = storyFirst ? st.reward.scrap : Math.round(st.reward.scrap * 0.25);
    if (storyFirst) { s.sideDone.push(key); if (st.perk) { s.perks[st.perk] = true; perk = st.perk; } s.bond[r.side.name] = Math.min(100, bondOf(s, r.side.name) + 10); }
  } else if (isRaid) {
    // 夜袭：守住给大量资源；失败损失仓库和一部分物资
    if (r.win) { bonus = Math.round(180 * raidPower(s) * (1 + s.buildings.hq * 0.3)); s.food += Math.round(bonus * 0.4); s.raid.wins++; }
    else { raidLoss = { scrap: Math.floor(s.scrap * 0.15 + s.store.scrap), food: Math.floor(s.store.food) }; s.scrap -= Math.floor(s.scrap * 0.15); s.store.scrap = 0; s.store.food = 0; }
    s.raid.next = s.stats.runs + 1 + RAID_EVERY;
  } else if (isStory && r.win) {
    // 剧情关卡：首次通关给全额奖励，重玩给 25%；每章最后一关通关后同伴加入
    const { ch, si } = stageAt(r.story);
    const full = Math.round(ch.reward.scrap * (STAGE_SHARE[si] || 0.35));
    storyFirst = r.story === s.story.stage;
    bonus = storyFirst ? full : Math.round(full * 0.25);
    if (storyFirst) {
      s.story.stage++;
      chapterDone = si === ch.stages.length - 1;
      const nm = chapterDone ? ch.reward.survivor : null;
      if (nm && !s.survivors.includes(nm)) { s.survivors.push(nm); storyJoin = nm; } // 剧情同伴不占宿舍名额限制
      if (nm && COMPANIONS[nm] && !s.comps[nm]) s.comps[nm] = { lv: 1, xp: 0 };
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
  // 天赋“拾荒”：带回的物资更多
  const lootMul = 1 + 0.06 * talent(s).loot;
  const lootBonus = Math.round(r.scrap * (lootMul - 1));
  s.scrap += lootBonus;
  // 经验：指挥官 + 随队队友
  const cmdXp = r.kills * 1 + (r.win ? 60 + 40 * (isStory ? 2 : r.zoneIndex) : 20) + (storyFirst ? 120 : 0);
  const cmdUps = addCmdXp(s, cmdXp);
  const compUps = {};
  for (const nm of r.squad || []) { compUps[nm] = addCompXp(s, nm, 20 + r.kills * 0.6 + (r.win ? 40 : 0)); s.bond[nm] = Math.min(100, bondOf(s, nm) + BOND_PER_RUN); }
  s.stats.runs++;
  s.stats.kills += r.kills;
  if (!isStory && !isSide && !isRaid) s.stats.best[r.zoneIndex] = Math.max(s.stats.best[r.zoneIndex] || 0, Math.floor(r.time));
  // 主线最后一关通关：记录结局
  let ending = null;
  if (isStory && r.win && storyFirst && s.story.stage >= CHAPTERS.reduce((n, c) => n + c.stages.length, 0)) {
    ending = pickEnding(s);
    s.story.ending = ending.key;
    if (!s.story.endings.includes(ending.key)) s.story.endings.push(ending.key);
  }
  return { bonus, firstClear, joined, extraFood, item, itemScrap, storyFirst, storyJoin, chapterDone, lootBonus, cmdXp, cmdUps, compUps, perk, raidLoss, ending };
}

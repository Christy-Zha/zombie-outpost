// 存档/经济逻辑自测：node tools/test_save.mjs
import * as S from '../js/save.js';
import assert from 'node:assert/strict';

const mem = { d: {}, getItem(k) { return this.d[k] ?? null; }, setItem(k, v) { this.d[k] = String(v); } };
const t0 = 1_700_000_000_000;

// 新档
let s = S.defaultSave(t0);
assert.equal(s.scrap, 120);
assert.equal(s.buildings.hq, 1);

// 建造：未建造的建筑可以造到 Lv1（指挥部 Lv1）
let r = S.upgrade(s, 'farm', t0);
assert.ok(r.ok, '应能建农场');
assert.equal(s.buildings.farm, 1);
assert.equal(s.scrap, 120 - 40);
// 农场不能超过指挥部等级
r = S.upgrade(s, 'farm', t0);
assert.equal(r.ok, false);
assert.match(r.reason, /指挥部/);

// 离线产出：2 小时 = 40 食物；超过 8 小时封顶
S.tick(s, t0 + 2 * 3600e3);
assert.ok(Math.abs(s.store.food - 40) < 1e-6);
S.tick(s, t0 + 100 * 3600e3);
assert.ok(Math.abs(s.store.food - 160) < 1e-6, '应封顶 8 小时');
const got = S.collect(s);
assert.equal(got.food, 160);
assert.equal(s.food, 30 + 160);
// 时间倒退不给产出
S.tick(s, t0);
assert.equal(s.store.food, 0);

// 招募：宿舍上限 2
s.lastTick = t0;
assert.ok(S.recruit(s).ok);
assert.ok(S.recruit(s).ok);
assert.equal(S.recruit(s).ok, false);
assert.equal(s.survivors.length, 2);

// 结算：首通区域 0
s.scrap = 0;
let sum = S.applyResult(s, { win: true, zoneIndex: 0, time: 300, kills: 500, scrap: 200, rescued: 2, level: 20 });
assert.equal(sum.firstClear, true);
assert.equal(s.cleared, 1);
assert.equal(s.zone, 1);
assert.equal(s.scrap, 200 + 200); // 100 × 首通双倍
assert.equal(sum.extraFood, 60);   // 宿舍满了，2 人换成食物
// 再打一次区域 0 不算首通
sum = S.applyResult(s, { win: true, zoneIndex: 0, time: 300, kills: 1, scrap: 0, rescued: 0, level: 1 });
assert.equal(sum.firstClear, false);
assert.equal(s.cleared, 1);

// 存取 + 旧存档兼容
S.persist(s, mem);
const back = S.load(mem);
assert.deepEqual(back.buildings, s.buildings);
mem.setItem(S.SAVE_KEY, JSON.stringify({ scrap: 5, buildings: { hq: 3 } })); // 缺字段的“旧档”
const old = S.load(mem);
assert.equal(old.scrap, 5);
assert.equal(old.buildings.hq, 3);
assert.equal(old.buildings.radio, 0);
assert.ok(Array.isArray(old.survivors));
// 损坏的存档：备份后开新档
mem.setItem(S.SAVE_KEY, '{坏掉的');
const fresh = S.load(mem);
assert.equal(fresh.scrap, 120);
assert.equal(mem.getItem(S.SAVE_KEY + '-backup'), '{坏掉的');

// ---------- 装备 ----------
// v1 老存档（没有装备字段）要能正常加载
mem.setItem(S.SAVE_KEY, JSON.stringify({ v: 1, scrap: 50, buildings: { hq: 2, armory: 1 }, survivors: ['老王'] }));
const v1 = S.load(mem);
assert.equal(v1.v, 2);
assert.deepEqual(v1.bag, []);
assert.deepEqual(v1.gear, { head: null, body: null, acc: null });
assert.equal(v1.survivors[0], '老王');

// 没打掉尸王：没有装备
let g = S.defaultSave(t0);
let res = S.applyResult(g, { win: true, zoneIndex: 0, time: 300, kills: 1, scrap: 0, rescued: 0, level: 1, bossKilled: false });
assert.equal(res.item, null);
assert.equal(g.bag.length, 0);
// 打掉尸王：掉一件
res = S.applyResult(g, { win: true, zoneIndex: 0, time: 300, kills: 1, scrap: 0, rescued: 0, level: 1, bossKilled: true });
assert.ok(res.item);
assert.equal(g.bag.length, 1);
assert.equal(g.stats.bossKills, 1);

// 穿上后战斗属性变强；再点一次卸下
const it = g.bag[0];
const before2 = S.battleStats(g);
S.equip(g, it.id);
assert.equal(g.gear[it.slot], it.id);
const after2 = S.battleStats(g);
assert.ok(after2.maxHp > before2.maxHp || after2.dmgMul > before2.dmgMul, '装备应提升属性');
S.equip(g, it.id);
assert.equal(g.gear[it.slot], null);

// 分解：返还物资，穿着的也会自动卸下
S.equip(g, it.id);
const sc = g.scrap;
const val = S.dismantle(g, it.id);
assert.equal(g.scrap, sc + val);
assert.equal(g.bag.length, 0);
assert.equal(g.gear[it.slot], null);

// 背包满了自动分解
for (let i = 0; i < 25; i++) S.addItem(g, S.makeItem(g, 2));
assert.equal(g.bag.length, 20);

// 品质分布：区域越后传说越多
const dist = zi => { const c = [0, 0, 0, 0]; for (let i = 0; i < 20000; i++) c[S.rollRarity(zi)]++; return c.map(x => (x / 200).toFixed(1) + '%').join(' / '); };
console.log('区域1 品质（普通/精良/史诗/传说）:', dist(0));
console.log('区域5 品质（普通/精良/史诗/传说）:', dist(4));
const sample = S.makeItem(g, 4, 3);
console.log('区域5 传说样例:', sample.name, JSON.stringify(sample.stats));

// 费用曲线打印，方便调平衡
const line = k => [0, 1, 2, 4, 6, 9].map(lv => S.cost(k, lv)).join(' / ');
console.log('指挥部费用 Lv0/1/2/4/6/9:', line('hq'));
console.log('军械库费用 Lv0/1/2/4/6/9:', line('armory'));
console.log('全部测试通过 ✅');

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

// 费用曲线打印，方便调平衡
const line = k => [0, 1, 2, 4, 6, 9].map(lv => S.cost(k, lv)).join(' / ');
console.log('指挥部费用 Lv0/1/2/4/6/9:', line('hq'));
console.log('军械库费用 Lv0/1/2/4/6/9:', line('armory'));
console.log('全部测试通过 ✅');

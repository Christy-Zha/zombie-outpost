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
assert.equal(v1.v, 5);
assert.equal(v1.story.stage, 0);
assert.deepEqual(v1.story.flags, {});
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

// ---------- v4：剧情按关 / 指挥官 / 武器强化 / 队友 ----------
// v3 老存档：通关 2 章 → 第 6 关；陈医生、阿杰已加入 → 自动成为可用队友
mem.setItem(S.SAVE_KEY, JSON.stringify({ v: 3, scrap: 999, story: { done: 2 }, survivors: ['陈医生', '阿杰', '老王'], buildings: { hq: 4, armory: 3 } }));
const v3 = S.load(mem);
assert.equal(v3.story.stage, 6);
assert.deepEqual(Object.keys(v3.comps).sort(), ['阿杰', '陈医生'].sort());
assert.equal(v3.cmd.lv, 1);

// 队友上阵：最多 2 人
assert.ok(S.toggleSquad(v3, '陈医生').ok);
assert.ok(S.toggleSquad(v3, '阿杰').ok);
assert.equal(S.toggleSquad(v3, '老王').ok, false);
assert.equal(S.battleStats(v3).squad.length, 2);

// 天赋：没点数不能加；升级后能加，属性变强；重置返还
assert.equal(S.learnTalent(v3, 'gun').ok, false);
const ups = S.addCmdXp(v3, 5000);
assert.ok(ups >= 3, '大量经验应升好几级');
const dmg0 = S.battleStats(v3).dmgMul;
assert.ok(S.learnTalent(v3, 'gun').ok);
assert.ok(S.battleStats(v3).dmgMul > dmg0);
const pts = v3.cmd.pts;
v3.scrap = 99999;
assert.ok(S.resetTalents(v3).ok);
assert.equal(v3.cmd.pts, pts + 1);

// 武器强化：受军械库等级限制（强化等级 ≤ 军械库 +2）
v3.scrap = 99999;
const d0 = S.battleStats(v3, 'pistol').dmgMul;
for (let i = 0; i < 5; i++) S.weaponUp(v3, 'pistol');
assert.equal(v3.weaponLv.pistol, 5); // 军械库 3 → 最多到 5
assert.equal(S.weaponUp(v3, 'pistol').ok, false);
assert.ok(S.battleStats(v3, 'pistol').dmgMul > d0 * 1.4);

// 剧情按关结算：第 6 关（3-1）首通；队友得经验
v3.scrap = 0;
const sr = S.applyResult(v3, { win: true, zoneIndex: 2, time: 200, kills: 80, scrap: 50, rescued: 0, level: 5, story: 6, squad: ['陈医生', '阿杰'] });
assert.equal(sr.storyFirst, true);
assert.equal(v3.story.stage, 7);
assert.equal(sr.chapterDone, false);
assert.ok(v3.comps['陈医生'].lv > 1 || v3.comps['陈医生'].xp > 0);
// 第 8 关（3-3）是本章最后一关：通关后小敏加入并成为队友
v3.story.stage = 8;
const sr2 = S.applyResult(v3, { win: true, zoneIndex: 2, time: 200, kills: 10, scrap: 0, rescued: 0, level: 1, story: 8, squad: [] });
assert.equal(sr2.chapterDone, true);
assert.equal(sr2.storyJoin, '小敏');
assert.ok(v3.comps['小敏']);
// 食物训练队友
v3.food = 9999;
const lv0 = v3.comps['小敏'].lv;
for (let i = 0; i < 5; i++) S.trainComp(v3, '小敏');
assert.ok(v3.comps['小敏'].lv > lv0);

// ---------- v5：好感 / 闲聊 / 支线 / 专属技能 / 夜袭 / 结局 ----------
{
  const g = S.defaultSave(t0);
  g.comps['陈医生'] = { lv: 1, xp: 0 }; g.survivors.push('陈医生');
  // 闲聊：每出征一次只能聊一次，好感 +15
  assert.ok(S.chatAvailable(g, '陈医生'));
  const lines = S.doChat(g, '陈医生');
  assert.ok(Array.isArray(lines) && lines.length > 0);
  assert.equal(S.bondOf(g, '陈医生'), 15);
  assert.equal(S.chatAvailable(g, '陈医生'), false);
  g.stats.runs++;
  assert.ok(S.chatAvailable(g, '陈医生'));
  // 支线一：好感不够锁住；够了开放；通关得专属技能
  assert.equal(S.sideState(g, '陈医生', 0).locked, true);
  g.bond['陈医生'] = 30;
  assert.equal(S.sideState(g, '陈医生', 0).open, true);
  assert.equal(S.sideState(g, '陈医生', 1).locked, true);
  const perk = S.sideState(g, '陈医生', 0).st.perk;
  const sr = S.applyResult(g, { win: true, zoneIndex: 0, time: 100, kills: 30, scrap: 0, rescued: 0, level: 1, story: 'x', side: { name: '陈医生', k: 0 }, squad: [] });
  assert.equal(sr.perk, perk);
  assert.ok(g.perks[perk]);
  g.squad = ['陈医生'];
  assert.deepEqual(S.battleStats(g).squad[0].perks, [perk]);
  assert.equal(g.story.stage, 0, '支线不推进主线');
  // 夜袭：出征次数到了就来；守住加物资和食物；失败扣仓库
  g.stats.runs = g.raid.next;
  assert.ok(S.raidDue(g));
  const sc0 = g.scrap;
  S.applyResult(g, { win: true, zoneIndex: 0, time: 100, kills: 50, scrap: 0, rescued: 0, level: 1, raid: true, squad: [] });
  assert.ok(g.scrap > sc0);
  assert.equal(S.raidDue(g), false);
  g.store.scrap = 100; g.scrap = 1000;
  const lr = S.applyResult(g, { win: false, zoneIndex: 0, time: 100, kills: 50, scrap: 0, rescued: 0, level: 1, raid: true, squad: [] });
  assert.ok(lr.raidLoss.scrap >= 100);
  assert.equal(g.store.scrap, 0);
  // 结局：标记不同 → 结局不同；默认结局总能命中
  const { ENDINGS } = await import('../js/story.js');
  g.story.flags = {};
  assert.equal(S.pickEnding(g).key, ENDINGS[ENDINGS.length - 1].key);
  for (const f of ENDINGS[0].need) g.story.flags[f] = true;
  assert.equal(S.pickEnding(g).key, ENDINGS[0].key);
  console.log('结局：', ENDINGS.map(e => `${e.title}（需要 ${e.need.join('+') || '无'}）`).join(' / '));
}

// 费用曲线打印，方便调平衡
const line = k => [0, 1, 2, 4, 6, 9].map(lv => S.cost(k, lv)).join(' / ');
console.log('指挥部费用 Lv0/1/2/4/6/9:', line('hq'));
console.log('军械库费用 Lv0/1/2/4/6/9:', line('armory'));
console.log('全部测试通过 ✅');

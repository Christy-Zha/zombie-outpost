// 主程序：界面切换、按钮事件、摇杆输入、游戏循环
import * as THREE from '../vendor/three.module.min.js';
import { BUILDINGS, WEAPONS, ZONES, BATTLE_TIME, GEAR_SLOTS, RARITIES, BAG_SIZE } from './data.js';
import * as S from './save.js';
import { Battle } from './battle.js';
import { BaseView } from './base.js';
import { sfx } from './sfx.js';

const $ = id => document.getElementById(id);
const fmt = n => { n = Math.floor(n); return n >= 100000 ? (n / 1000).toFixed(0) + 'k' : n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n); };
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------- 初始化 ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

let game = S.load();
const before = { ...game.store };
S.tick(game, Date.now());
sfx.setEnabled(game.sound);

const baseView = new BaseView();
baseView.refresh(game);
let battle = null, mode = 'base', tab = 'build';

// ---------- 小工具 ----------
let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

let modalReadyAt = 0;
function showModal(html, guardMs = 0) {
  $('modalBox').innerHTML = html;
  $('modal').classList.remove('hidden');
  modalReadyAt = Date.now() + guardMs; // 防止拖动摇杆时误点
}
function hideModal() { $('modal').classList.add('hidden'); }

function save() { S.persist(game); }

// ---------- 基地界面 ----------
function renderTop() {
  $('rScrap').textContent = fmt(game.scrap);
  $('rFood').textContent = fmt(game.food);
  $('rSurv').textContent = `${game.survivors.length}/${S.survivorCap(game)}`;
  $('btnSound').textContent = game.sound ? '🔊' : '🔇';
}

function renderStore() {
  const r = S.rates(game);
  const btn = $('btnCollect');
  if (r.scrap + r.food <= 0) {
    $('storeInfo').innerHTML = '💡 建造<b>回收站</b>和<b>农场</b>后，离线也会自动产出资源';
    btn.classList.add('hidden');
    return;
  }
  const cap = S.storeCap(game), st = game.store;
  const full = st.scrap >= cap.scrap - 0.5 && st.food >= cap.food - 0.5;
  $('storeInfo').innerHTML = `📦 仓库 🔩 <b>${fmt(st.scrap)}</b><small>/${fmt(cap.scrap)}</small> · 🌽 <b>${fmt(st.food)}</b><small>/${fmt(cap.food)}</small><br><small>${full ? '⚠️ 仓库满了，快收取！' : `每小时 🔩${fmt(r.scrap)} 🌽${fmt(r.food)}，最多存 8 小时`}</small>`;
  btn.classList.remove('hidden');
  btn.disabled = Math.floor(st.scrap) + Math.floor(st.food) <= 0;
}

function renderBuild() {
  $('tab-build').innerHTML = BUILDINGS.map(b => {
    const lv = game.buildings[b.key], max = lv >= b.max;
    const chk = S.checkUpgrade(game, b.key);
    const needHq = !max && b.key !== 'hq' && lv >= game.buildings.hq;
    const eff = lv > 0 ? `当前：${b.effect(lv)}` : '';
    const next = max ? '' : ` <span class="arrow">→</span> ${b.effect(lv + 1)}`;
    return `<div class="card" id="card-${b.key}">
      <div class="card-ic">${b.icon}</div>
      <div class="card-main">
        <div class="card-title">${b.name}<span class="lv">${lv > 0 ? 'Lv ' + lv : '未建造'}</span></div>
        <div class="card-intro">${b.intro}</div>
        <div class="card-eff">${eff}${next}</div>
      </div>
      <button class="btn-up ${chk.ok ? '' : 'dim'}" data-up="${b.key}" ${max ? 'disabled' : ''}>
        ${max ? '满级' : lv > 0 ? '升级' : '建造'}<small>${max ? '' : needHq ? '需指挥部' : '🔩 ' + fmt(S.cost(b.key, lv))}</small>
      </button></div>`;
  }).join('');
}

function renderPeople() {
  const n = game.survivors.length, cap = S.survivorCap(game);
  $('tab-people').innerHTML = `
    <div class="info-box">👥 幸存者 <b>${n}/${cap}</b><br>
      每位幸存者：资源产量 <b>+8%</b>，攻击 <b>+2%</b><br>
      <small class="muted">出征时，地图上的黄色光柱是求救的幸存者，跑过去就能救回来</small></div>
    <button class="btn big" id="btnRecruit" ${n >= cap ? 'disabled' : ''}>${n >= cap ? '宿舍住满了' : '招募幸存者'}<small>🌽 ${S.recruitCost(game)}</small></button>
    <div class="section-title">据点成员</div>
    <div class="chips">${game.survivors.map(nm => `<span class="chip">🧑 ${nm}</span>`).join('') || '<span class="muted">据点里还没有人……</span>'}</div>
    <div class="section-title">战绩</div>
    <div class="muted" style="font-size:13px">出征 ${game.stats.runs} 次 · 累计击杀 ${fmt(game.stats.kills)} 只丧尸</div>`;
}

function renderGo() {
  const st = S.battleStats(game);
  const zones = ZONES.map((z, i) => {
    const locked = i > game.cleared, cleared = i < game.cleared, best = game.stats.best[i];
    return `<div class="zone ${locked ? 'locked' : ''} ${i === game.zone ? 'sel' : ''}" data-zone="${i}">
      <div class="zone-main">
        <div class="zone-name">${locked ? '🔒' : cleared ? '✅' : '☠️'} ${i + 1}. ${z.name}</div>
        <div class="zone-desc">${locked ? '先通关上一个区域' : z.desc}</div>
        <div class="zone-meta">丧尸强度 ×${z.hp} · 奖励 ×${z.reward}${best ? ` · 最久坚持 ${mmss(best)}` : ''}</div>
      </div>${locked ? '' : '<span class="zone-go">出发 ▶</span>'}</div>`;
  }).join('');
  const weaps = Object.entries(WEAPONS).map(([k, w]) => {
    const lock = !S.weaponUnlocked(game, k);
    return `<button class="weap ${k === game.weapon ? 'sel' : ''} ${lock ? 'locked' : ''}" data-weap="${k}">
      <b>${w.icon} ${w.name}</b><small>${lock ? `军械库 Lv${w.armory} 解锁` : w.desc}</small></button>`;
  }).join('');
  $('tab-go').innerHTML = `
    <div class="section-title">① 选择武器</div><div class="weapons">${weaps}</div>
    <div class="stat-line">攻击 ×${st.dmgMul.toFixed(2)} · 生命 ${st.maxHp} · 回血 ${st.regen.toFixed(1)}/秒</div>
    <div class="section-title">② 点区域直接出发（坚持 ${BATTLE_TIME / 60} 分钟即可撤离）</div>${zones}`;
}

const slotIcon = k => GEAR_SLOTS.find(x => x.key === k).icon;
const itemStats = it => Object.entries(it.stats).map(([k, v]) => S.statText(k, v)).join(' · ');

function renderGear() {
  const slots = GEAR_SLOTS.map(sl => {
    const it = game.bag.find(x => x.id === game.gear[sl.key]);
    const c = it ? RARITIES[it.rarity].color : '';
    return `<div class="slot" style="${it ? `border-color:${c}` : ''}">
      <div class="s-ic">${sl.icon}</div>
      <div class="s-name" style="${it ? `color:${c}` : ''}">${it ? it.name : sl.name}</div>
      <div class="s-st">${it ? Object.entries(it.stats).map(([k, v]) => S.statText(k, v)).join('<br>') : '<span class="muted">未装备</span>'}</div></div>`;
  }).join('');
  const t = S.gearTotals(game);
  const total = Object.entries(t).filter(([, v]) => v > 0).map(([k, v]) => S.statText(k, Math.round(v * 1000) / 1000)).join(' · ');
  const items = [...game.bag].sort((a, b) => b.rarity - a.rarity || b.zone - a.zone).map(it => {
    const rr = RARITIES[it.rarity], on = game.gear[it.slot] === it.id;
    return `<div class="item ${on ? 'on' : ''}" style="border-color:${rr.color}">
      <div class="item-main"><div class="item-name" style="color:${rr.color}">${slotIcon(it.slot)} ${it.name}<small>${rr.name} · 区域${it.zone + 1}</small></div>
        <div class="item-st">${itemStats(it)}</div></div>
      <button class="btn ${on ? 'ghost' : ''}" data-equip="${it.id}">${on ? '卸下' : '装备'}</button>
      <button class="btn ghost" data-dis="${it.id}">分解<br><small>🔩${S.dismantleValue(it)}</small></button></div>`;
  }).join('');
  $('tab-gear').innerHTML = `<div class="slots">${slots}</div>
    <div class="stat-line">${total ? '装备加成：' + total : '击败尸王会掉落装备，品质有 普通 / 精良 / 史诗 / 传说'}</div>
    <div class="section-title">背包 ${game.bag.length}/${BAG_SIZE}（满了以后新装备会自动分解）</div>
    ${items || '<div class="muted" style="text-align:center;padding:20px">背包是空的。去出征，在第 4 分钟击败尸王吧！</div>'}`;
}

$('tab-gear').addEventListener('click', e => {
  const eq = e.target.closest('[data-equip]');
  if (eq) { S.equip(game, +eq.dataset.equip); sfx.play('build'); save(); renderGear(); return; }
  const d = e.target.closest('[data-dis]');
  if (d) {
    // 分解要点两次，防止误删
    if (d.dataset.confirm !== '1') { d.dataset.confirm = '1'; d.innerHTML = '确定？'; setTimeout(() => { if (d.isConnected) renderGear(); }, 2500); return; }
    const v = S.dismantle(game, +d.dataset.dis);
    sfx.play('coin'); toast(`分解获得 🔩${v}`); save(); renderAll();
  }
});

function renderTab() {
  for (const b of document.querySelectorAll('.tabs button')) b.classList.toggle('active', b.dataset.tab === tab);
  for (const k of ['build', 'people', 'gear', 'go']) $('tab-' + k).classList.toggle('hidden', k !== tab);
  if (tab === 'build') renderBuild();
  else if (tab === 'people') renderPeople();
  else if (tab === 'gear') renderGear();
  else renderGo();
}

function renderAll() { renderTop(); renderStore(); renderTab(); }

function switchTab(t) { tab = t; renderTab(); }

function selectBuilding(key) {
  baseView.select(key);
  if (tab !== 'build') switchTab('build');
  const el = $('card-' + key);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 700);
}

// ---------- 基地按钮 ----------
document.querySelector('.tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (b) { sfx.play('click'); switchTab(b.dataset.tab); }
});

$('tab-build').addEventListener('click', e => {
  const b = e.target.closest('[data-up]');
  if (!b) return;
  const key = b.dataset.up;
  const r = S.upgrade(game, key);
  if (!r.ok) { toast(r.reason); sfx.play('click'); return; }
  const def = BUILDINGS.find(x => x.key === key);
  sfx.play('build');
  toast(r.lv === 1 ? `${def.icon} ${def.name} 建好了！` : `${def.icon} ${def.name} 升到 Lv${r.lv}`);
  baseView.refresh(game);
  baseView.select(key);
  save();
  renderAll();
});

$('tab-people').addEventListener('click', e => {
  if (!e.target.closest('#btnRecruit')) return;
  const r = S.recruit(game);
  if (!r.ok) { toast(r.reason); return; }
  sfx.play('rescue');
  toast(`🧑 ${r.name} 加入了据点`);
  baseView.refresh(game);
  save();
  renderAll();
});

$('tab-go').addEventListener('click', e => {
  const z = e.target.closest('[data-zone]');
  if (z) {
    const i = +z.dataset.zone;
    if (i > game.cleared) { toast('先通关上一个区域'); return; }
    game.zone = i; sfx.play('click'); startBattle(); return;
  }
  const w = e.target.closest('[data-weap]');
  if (w) {
    const k = w.dataset.weap;
    if (!S.weaponUnlocked(game, k)) { toast(`需要军械库 Lv${WEAPONS[k].armory}`); return; }
    game.weapon = k; sfx.play('click'); save(); renderGo(); return;
  }
});

$('btnCollect').addEventListener('click', () => {
  S.tick(game, Date.now());
  const r = S.collect(game);
  if (r.scrap + r.food <= 0) return;
  sfx.play('coin');
  toast(`收取 🔩${r.scrap} 🌽${r.food}`);
  save();
  renderAll();
});

$('btnSound').addEventListener('click', () => {
  game.sound = !game.sound;
  sfx.setEnabled(game.sound);
  save();
  renderTop();
});

// 点击 3D 基地里的建筑 → 跳到对应卡片
let tapStart = null;
$('gl').addEventListener('pointerdown', e => { tapStart = { x: e.clientX, y: e.clientY, t: Date.now() }; });
$('gl').addEventListener('pointerup', e => {
  if (mode !== 'base' || !tapStart) return;
  const moved = Math.hypot(e.clientX - tapStart.x, e.clientY - tapStart.y);
  if (moved < 12 && Date.now() - tapStart.t < 500) {
    const key = baseView.pick(e.clientX, e.clientY, innerWidth, innerHeight);
    if (key) { sfx.play('click'); selectBuilding(key); }
  }
  tapStart = null;
});

// ---------- 战斗 ----------
const joyIn = { x: 0, z: 0, on: false }, aimIn = { x: 0, z: 0, on: false }, keys = {};

function startBattle() {
  sfx.unlock();
  S.tick(game, Date.now());
  save();
  battle = new Battle({
    zoneIndex: game.zone, weaponKey: game.weapon, stats: S.battleStats(game),
    cb: { onHud, onLevelUp, onEnd, onMsg, onHurt },
  });
  battle.resize(innerWidth, innerHeight);
  mode = 'battle';
  $('baseUI').classList.add('hidden');
  $('battleUI').classList.remove('hidden');
  $('bossBar').classList.add('hidden');
  onHud(battle.hudData());
  onMsg(`${ZONES[game.zone].name}：会自动开枪，右边拖动可以手动瞄准`);
  $('joyHint').classList.remove('off');
  setTimeout(() => $('joyHint').classList.add('off'), 6000);
}

function goHome() {
  if (battle) { battle.dispose(); battle = null; }
  releaseJoy();
  mode = 'base';
  $('battleUI').classList.add('hidden');
  $('baseUI').classList.remove('hidden');
  baseView.refresh(game);
  baseView.resize(innerWidth, innerHeight);
  renderAll();
}

function onHud(d) {
  $('hpFill').style.width = `${(d.hp / d.maxHp) * 100}%`;
  $('hpText').textContent = `${Math.ceil(d.hp)} / ${Math.round(d.maxHp)}`;
  $('xpFill').style.width = `${Math.min(100, (d.xp / d.need) * 100)}%`;
  $('lvText').textContent = `Lv ${d.level}`;
  $('hTime').textContent = mmss(d.left);
  $('hKills').textContent = d.kills;
  $('hScrap').textContent = d.scrap;
  $('hSurv').textContent = d.rescued;
  const bb = $('bossBar');
  if (d.boss >= 0) { bb.classList.remove('hidden'); $('bossFill').style.width = `${d.boss * 100}%`; }
  else bb.classList.add('hidden');
}

function onMsg(text) {
  const el = $('hMsg');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth; // 重新触发动画
  el.classList.add('show');
}

function onHurt() {
  const el = $('hurt');
  el.classList.remove('on');
  void el.offsetWidth;
  el.classList.add('on');
}

function onLevelUp(opts) {
  releaseJoy();
  showModal(`<h2>⬆️ 升级！</h2><div class="muted">选择一项强化</div>
    <div class="skills">${opts.map(o => `<button class="skill" data-skill="${o.key}">
      <span class="sk-ic">${o.icon}</span><b>${o.name}${o.lv ? ` <small>Lv${o.lv}/${o.max}</small>` : ''}</b><span>${o.desc}</span></button>`).join('')}</div>`, 450);
}

function onEnd(r) {
  releaseJoy();
  const sum = S.applyResult(game, r);
  S.tick(game, Date.now());
  save();
  const title = r.win ? '🎉 成功撤离！' : r.retreat ? '🏃 撤退回据点' : '💀 你倒下了……';
  const next = sum.firstClear ? (game.cleared < ZONES.length ? `<p class="good">🔓 解锁新区域：${ZONES[game.cleared].name}</p>` : '<p class="good">🏆 全部区域通关！你是末日传说！</p>') : '';
  const surv = sum.joined.length ? `<p class="good">🧑 ${sum.joined.join('、')} 加入了据点</p>` : '';
  const food = sum.extraFood ? `<p class="muted">宿舍住不下，获救者留下了 🌽${sum.extraFood} 食物</p>` : '';
  const tip = !r.win ? '<p class="muted">💡 回据点升级军械库、训练场，下次能撑更久</p>' : '';
  let drop = '';
  if (sum.item) {
    const it = sum.item, rr = RARITIES[it.rarity];
    drop = `<div class="drop-card" style="border-color:${rr.color}"><div class="muted">👑 尸王掉落</div>
      <b style="color:${rr.color}">${slotIcon(it.slot)} ${it.name}</b> <small style="color:${rr.color}">${rr.name}</small>
      <div class="item-st">${itemStats(it)}</div>
      ${sum.itemScrap ? `<div class="muted">背包满了，已自动分解为 🔩${sum.itemScrap}</div>` : '<div class="muted">已放进背包，去「装备」页穿上</div>'}</div>`;
  } else if (r.win) drop = '<p class="muted">💡 撤离前击败尸王，可以获得装备</p>';
  setTimeout(() => {
    showModal(`<h2>${title}</h2>
      <div class="result">
        <div>坚持时间<b>${mmss(r.time)}</b></div>
        <div>击杀<b>${r.kills}</b></div>
        <div>带回物资<b>🔩 ${r.scrap}${sum.bonus ? ` + ${sum.bonus}` : ''}</b></div>
        <div>救出幸存者<b>${r.rescued}</b></div>
      </div>${sum.bonus ? `<p class="good">撤离奖励 🔩${sum.bonus}${sum.firstClear ? '（首通双倍）' : ''}</p>` : ''}${drop}${next}${surv}${food}${tip}
      <button class="btn big" data-act="home">返回据点</button>`, 500);
  }, r.win || r.retreat ? 200 : 900);
}

function pauseBattle() {
  if (!battle || battle.over || battle.paused) return;
  battle.paused = true;
  releaseJoy();
  showModal(`<h2>⏸ 暂停</h2><p class="muted">撤退会保留已经捡到的物资，但没有撤离奖励</p>
    <button class="btn big" data-act="resume">继续战斗</button>
    <button class="btn big ghost" data-act="retreat">撤退</button>`);
}

$('btnPause').addEventListener('click', e => { e.stopPropagation(); pauseBattle(); });

$('modalBox').addEventListener('click', e => {
  const t = e.target.closest('[data-act],[data-skill]');
  if (!t || Date.now() < modalReadyAt) return;
  sfx.play('click');
  if (t.dataset.skill) { hideModal(); battle && battle.applySkill(t.dataset.skill); return; }
  switch (t.dataset.act) {
    case 'resume': hideModal(); if (battle) battle.paused = false; break;
    case 'retreat': hideModal(); battle && battle.retreat(); break;
    case 'home': hideModal(); goHome(); break;
  }
});

// 双摇杆：左半屏 = 移动，右半屏 = 瞄准（按住朝该方向开火，松手恢复自动瞄准）
// 两个摇杆都是“浮动”的：手指按在哪，摇杆中心就在哪
const ui = $('battleUI'), R = 55;
const sticks = {
  move: { el: 'joy', knob: 'joyKnob', input: joyIn, p: null },
  aim: { el: 'joyAim', knob: 'joyAimKnob', input: aimIn, p: null },
};
function releaseStick(st) { st.p = null; st.input.x = st.input.z = 0; st.input.on = false; $(st.el).classList.add('hidden'); }
function releaseJoy() { releaseStick(sticks.move); releaseStick(sticks.aim); }
function placeStick(st) {
  const j = $(st.el);
  j.style.left = st.p.x + 'px';
  j.style.top = st.p.y + 'px';
  $(st.knob).style.transform = `translate(${st.input.x * R}px, ${st.input.z * R}px)`;
}
// 电脑鼠标：按住左键 = 朝鼠标所在方向开火（相对角色在屏幕上的位置）
const mouseAim = { on: false, x: 0, y: 0 };
function updateMouseAim(e) { mouseAim.x = e.clientX; mouseAim.y = e.clientY; }
ui.addEventListener('pointerdown', e => {
  sfx.unlock();
  if (e.target.closest('button')) return;
  if (e.pointerType === 'mouse') {
    mouseAim.on = true; updateMouseAim(e);
    try { ui.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
    $('joyHint').classList.add('off');
    e.preventDefault();
    return;
  }
  const st = e.clientX < innerWidth / 2 ? sticks.move : sticks.aim;
  if (st.p) return;
  st.p = { id: e.pointerId, x: e.clientX, y: e.clientY };
  st.input.on = true;
  try { ui.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
  $(st.el).classList.remove('hidden');
  $('joyHint').classList.add('off');
  placeStick(st);
  e.preventDefault();
});
ui.addEventListener('pointermove', e => {
  if (e.pointerType === 'mouse') { updateMouseAim(e); return; }
  for (const st of Object.values(sticks)) {
    if (!st.p || e.pointerId !== st.p.id) continue;
    let dx = e.clientX - st.p.x, dy = e.clientY - st.p.y;
    const L = Math.hypot(dx, dy);
    if (L > R) { st.p.x += dx / L * (L - R); st.p.y += dy / L * (L - R); dx = dx / L * R; dy = dy / L * R; } // 手指拖远了，摇杆跟着走
    st.input.x = dx / R; st.input.z = dy / R;
    placeStick(st);
  }
});
const joyEnd = e => { if (e.pointerType === 'mouse') mouseAim.on = false; for (const st of Object.values(sticks)) if (st.p && e.pointerId === st.p.id) releaseStick(st); };
ui.addEventListener('pointerup', joyEnd);
ui.addEventListener('pointercancel', joyEnd);

// 电脑上测试：WASD 移动，方向键瞄准
const KEYMAP = { KeyW: 'u', KeyS: 'd', KeyA: 'l', KeyD: 'r', ArrowUp: 'au', ArrowDown: 'ad', ArrowLeft: 'al', ArrowRight: 'ar' };
addEventListener('keydown', e => {
  if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = true;
  if (e.code === 'Escape' || e.code === 'KeyP') pauseBattle();
});
addEventListener('keyup', e => { if (KEYMAP[e.code]) keys[KEYMAP[e.code]] = false; });

// ---------- 系统事件 ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  baseView.resize(innerWidth, innerHeight);
  if (battle) battle.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));
document.addEventListener('pointerdown', () => sfx.unlock());
document.addEventListener('gesturestart', e => e.preventDefault()); // 禁止双指缩放
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { pauseBattle(); S.tick(game, Date.now()); save(); }
  else if (mode === 'base') { S.tick(game, Date.now()); renderAll(); }
});

// 基地界面每秒刷新一次仓库数字
let lastBuildRefresh = 0;
setInterval(() => {
  if (mode !== 'base') return;
  S.tick(game, Date.now());
  renderTop();
  renderStore();
  if (Date.now() - lastBuildRefresh > 10000) { lastBuildRefresh = Date.now(); save(); }
}, 1000);

// ---------- 游戏循环 ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (mode === 'battle' && battle) {
    battle.setInput(
      joyIn.x + (keys.r ? 1 : 0) - (keys.l ? 1 : 0),
      joyIn.z + (keys.d ? 1 : 0) - (keys.u ? 1 : 0)
    );
    const kx = (keys.ar ? 1 : 0) - (keys.al ? 1 : 0), kz = (keys.ad ? 1 : 0) - (keys.au ? 1 : 0);
    if (kx || kz) battle.setAim(kx, kz, true);
    else if (mouseAim.on) {
      const sp = battle.playerScreen(innerWidth, innerHeight);
      battle.setAim(mouseAim.x - sp.x, mouseAim.y - sp.y, true);
    } else battle.setAim(aimIn.x, aimIn.z, aimIn.on);
    battle.update(dt);
    battle.render(renderer, dt);
  } else {
    baseView.update(dt);
    renderer.render(baseView.scene, baseView.camera);
  }
}

baseView.onSelect = selectBuilding;
resize();
renderAll();
$('loading').classList.add('hidden');
$('baseUI').classList.remove('hidden');
requestAnimationFrame(frame);

// 离线收益提示
const gainS = Math.floor(game.store.scrap - before.scrap), gainF = Math.floor(game.store.food - before.food);
if (gainS + gainF > 0) setTimeout(() => toast(`离开期间仓库存了 🔩${gainS} 🌽${gainF}`), 600);

// 调试入口：只有网址带 #debug 时才开放，用于自动化测试
if (location.hash === '#debug') window.__dbg = { get battle() { return battle; }, get game() { return game; }, renderAll };

// 注册离线缓存（添加到主屏幕后断网也能玩）
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => { /* 忽略 */ });
  // 新版本装好后自动刷新一次（战斗中不打断，回到据点再刷新）
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return;
    reloading = true;
    const tryReload = () => { if (mode === 'base') { save(); location.reload(); } else setTimeout(tryReload, 1000); };
    tryReload();
  });
}

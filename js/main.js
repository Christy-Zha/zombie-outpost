// 主程序：界面切换、按钮事件、摇杆输入、游戏循环
import * as THREE from '../vendor/three.module.min.js';
import { BUILDINGS, WEAPONS, ZONES, BATTLE_TIME, GEAR_SLOTS, RARITIES, BAG_SIZE, COMPANIONS, SQUAD_MAX, COMP_MAX_LV, compNeed, compMul, CMD_MAX_LV, cmdNeed, TALENTS, WEAPON_MAX_LV, weaponUpCost } from './data.js';
import * as S from './save.js';
import { Battle } from './battle.js';
import { BaseView, BASE_TEXTURES } from './base.js';
import { loadEnv } from './env.js';
import { sfx } from './sfx.js';
import { CHAPTERS, CAST } from './story.js';
import { loadModels } from './models.js';

const $ = id => document.getElementById(id);
const fmt = n => { n = Math.floor(n); return n >= 100000 ? (n / 1000).toFixed(0) + 'k' : n >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(n); };
const mmss = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

// ---------- 初始化 ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('gl'), antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;            // 据点里有真实阴影（战斗场景不开投影，省性能）
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false;       // 据点是静态的，阴影只在建筑变化时重算一次
renderer.toneMapping = THREE.ACESFilmicToneMapping; // 电影感的明暗过渡
renderer.toneMappingExposure = 1.15;

// 启动时并行加载：人物模型（本地有才有）+ 写实场景素材（随仓库发布）
const BATTLE_TEXTURES = ['brown_mud_leaves_01', 'asphalt_02', 'concrete_floor_01', 'brown_mud', 'concrete_tiles'];
const [loadedModels] = await Promise.all([loadModels(), loadEnv([...new Set([...BASE_TEXTURES, ...BATTLE_TEXTURES])])]);
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
  const n = game.survivors.length, cap = S.survivorCap(game), c = game.cmd, t = S.talent(game);
  const need = cmdNeed(c.lv);
  const talents = TALENTS.map(x => {
    const lv = t[x.key], max = lv >= x.max;
    return `<div class="tal">
      <span class="tal-ic">${x.icon}</span>
      <div class="tal-main"><b>${x.name}</b> <small>${lv}/${x.max}</small><div class="muted">${lv ? x.desc(lv) : '未学习'}${max ? '' : ` → ${x.desc(lv + 1)}`}</div></div>
      <button class="btn small ${c.pts > 0 && !max ? '' : 'ghost'}" data-tal="${x.key}" ${max ? 'disabled' : ''}>${max ? '满' : '+1'}</button></div>`;
  }).join('');
  const comps = S.unlockedComps(game).map(nm => {
    const d = COMPANIONS[nm], cp = game.comps[nm], inSquad = game.squad.includes(nm);
    const mul = compMul(cp.lv);
    return `<div class="card comp ${inSquad ? 'on' : ''}">
      <div class="card-ic">${d.icon}</div>
      <div class="card-main">
        <div class="card-title">${nm}<span class="lv">Lv ${cp.lv} · ${d.role}</span></div>
        <div class="card-intro">${d.desc}</div>
        <div class="mini-bar"><i style="width:${cp.lv >= COMP_MAX_LV ? 100 : cp.xp / compNeed(cp.lv) * 100}%"></i></div>
        <div class="card-eff">生命 ${Math.round(d.hp * mul)} · 伤害 ×${mul.toFixed(2)}</div>
      </div>
      <div class="comp-btns">
        <button class="btn small ${inSquad ? '' : 'ghost'}" data-squad="${nm}">${inSquad ? '✓ 出战' : '出战'}</button>
        <button class="btn small ghost" data-train="${nm}">训练<br><small>🌽${S.trainCost(game)}</small></button>
      </div></div>`;
  }).join('');
  $('tab-people').innerHTML = `
    <div class="info-box cmd">
      <div>🎖️ 指挥官 <b>Lv ${c.lv}</b>　天赋点 <b>${c.pts}</b></div>
      <div class="mini-bar"><i style="width:${c.lv >= CMD_MAX_LV ? 100 : c.xp / need * 100}%"></i></div>
      <small class="muted">经验 ${c.xp}/${need} · 每次出征都会积累经验，每升 1 级得 1 个天赋点</small>
    </div>
    <div class="section-title">天赋（永久加成）<button class="link" id="btnResetTal">重置（🔩${S.resetTalentCost(game)}）</button></div>
    <div class="tals">${talents}</div>
    <div class="section-title">队友（出征最多带 ${SQUAD_MAX} 人：${game.squad.join('、') || '还没选'}）</div>
    ${comps || '<div class="muted" style="padding:8px">推进主线剧情，同伴会加入成为队友（第一章结束后陈医生加入）</div>'}
    <div class="section-title">据点成员 ${n}/${cap}（每人：产量 +8%，攻击 +2%）</div>
    <button class="btn big" id="btnRecruit" ${n >= cap ? 'disabled' : ''}>${n >= cap ? '宿舍住满了' : '招募幸存者'}<small>🌽 ${S.recruitCost(game)}</small></button>
    <div class="chips">${game.survivors.map(nm => `<span class="chip">${COMPANIONS[nm] ? COMPANIONS[nm].icon : '🧑'} ${nm}</span>`).join('') || '<span class="muted">据点里还没有人……</span>'}</div>
    <div class="section-title">战绩</div>
    <div class="muted" style="font-size:13px">出征 ${game.stats.runs} 次 · 累计击杀 ${fmt(game.stats.kills)} 只丧尸 · 击败尸王 ${game.stats.bossKills} 次</div>`;
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
  const TYPE = { collect: '🔍 搜集', defend: '🛡️ 坚守', rescue: '🆘 营救', boss: '☠️ 强敌' };
  let gi = 0;
  const chapters = CHAPTERS.map(c => {
    const first = gi;
    const rows = c.stages.map((stg, si) => {
      const i = gi++, locked = i > game.story.stage, done = i < game.story.stage;
      const full = Math.round(c.reward.scrap * (S.STAGE_SHARE[si] || 0.35));
      return `<div class="stage ${locked ? 'locked' : ''} ${done ? 'done' : ''}" data-stage="${i}">
        <div class="zone-main"><b>${locked ? '🔒' : done ? '✅' : '🔦'} ${stg.title}</b>
          <div class="zone-meta">${TYPE[stg.type]} · ${done ? `重玩 🔩${Math.round(full * 0.25)}` : `🔩${full}${si === c.stages.length - 1 && c.reward.survivor ? ` · 「${c.reward.survivor}」加入` : ''}`}</div></div>
        ${locked ? '' : '<span class="zone-go">进入</span>'}</div>`;
    }).join('');
    const doneAll = game.story.stage >= gi, open = game.story.stage >= first;
    return `<div class="chapter ${open ? '' : 'locked'}"><div class="ch-title">${doneAll ? '✅' : open ? '📖' : '🔒'} ${c.title}</div>${open ? rows : '<div class="muted" style="padding:4px 2px 8px">完成上一章解锁</div>'}</div>`;
  }).join('');
  const total = gi;
  const squad = S.unlockedComps(game).map(nm => `<button class="sq ${game.squad.includes(nm) ? 'sel' : ''}" data-squad="${nm}">${COMPANIONS[nm].icon} ${nm}<small>Lv${game.comps[nm].lv}</small></button>`).join('');
  $('tab-go').innerHTML = `
    <div class="section-title">① 选择武器</div><div class="weapons">${weaps}</div>
    <div class="section-title">② 带队友（最多 ${SQUAD_MAX} 人）</div>
    <div class="squad">${squad || '<span class="muted">推进剧情解锁队友</span>'}</div>
    <div class="stat-line">攻击 ×${st.dmgMul.toFixed(2)} · 生命 ${st.maxHp} · 回血 ${st.regen.toFixed(1)}/秒 · 武器 Lv${game.weaponLv[game.weapon] || 0}</div>
    <div class="section-title">③ 📖 主线剧情《启明之殇》 ${game.story.stage}/${total} 关</div>${chapters}
    <div class="section-title">④ ☠️ 自由出征（坚持 ${BATTLE_TIME / 60} 分钟撤离，刷物资和装备）</div>${zones}`;
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
  const wup = Object.entries(WEAPONS).map(([k, w]) => {
    const lv = game.weaponLv[k] || 0, lock = !S.weaponUnlocked(game, k), max = lv >= WEAPON_MAX_LV, chk = S.checkWeaponUp(game, k);
    return `<div class="tal">
      <span class="tal-ic">${w.icon}</span>
      <div class="tal-main"><b>${w.name}</b> <small>+${lv}</small><div class="muted">${lock ? `军械库 Lv${w.armory} 解锁` : `伤害 +${lv * 10}% · 射速 +${(lv * 2.5).toFixed(1)}%`}</div></div>
      <button class="btn small ${chk.ok ? '' : 'ghost'}" data-wup="${k}" ${lock || max ? 'disabled' : ''}>${max ? '满级' : `强化<br><small>🔩${fmt(weaponUpCost(k, lv))}</small>`}</button></div>`;
  }).join('');
  $('tab-gear').innerHTML = `<div class="section-title" style="margin-top:0">🔧 武器强化（等级上限 = 军械库等级 + 2）</div><div class="tals">${wup}</div>
    <div class="section-title">🎒 装备（击败尸王 / 剧情强敌掉落）</div>
    <div class="slots">${slots}</div>
    <div class="stat-line">${total ? '装备加成：' + total : '击败尸王会掉落装备，品质有 普通 / 精良 / 史诗 / 传说'}</div>
    <div class="section-title">背包 ${game.bag.length}/${BAG_SIZE}（满了以后新装备会自动分解）</div>
    ${items || '<div class="muted" style="text-align:center;padding:20px">背包是空的。去出征，在第 4 分钟击败尸王吧！</div>'}`;
}

$('tab-gear').addEventListener('click', e => {
  const wu = e.target.closest('[data-wup]');
  if (wu) { const r = S.weaponUp(game, wu.dataset.wup); if (!r.ok) toast(r.reason); else { sfx.play('build'); toast(`${WEAPONS[wu.dataset.wup].name} 强化到 +${r.lv}`); } save(); renderAll(); return; }
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
  const tal = e.target.closest('[data-tal]');
  if (tal) { const r = S.learnTalent(game, tal.dataset.tal); if (!r.ok) toast(r.reason); else sfx.play('build'); save(); renderPeople(); return; }
  if (e.target.closest('#btnResetTal')) { const r = S.resetTalents(game); toast(r.ok ? `已返还 ${r.pts} 个天赋点` : r.reason); save(); renderAll(); return; }
  const sq = e.target.closest('[data-squad]');
  if (sq) { const r = S.toggleSquad(game, sq.dataset.squad); if (!r.ok) toast(r.reason); sfx.play('click'); save(); renderPeople(); return; }
  const tr = e.target.closest('[data-train]');
  if (tr) { const r = S.trainComp(game, tr.dataset.train); if (!r.ok) toast(r.reason); else { sfx.play('build'); toast(r.ups ? `${tr.dataset.train} 升到 Lv${r.lv}！` : '训练完成，经验增加'); } save(); renderAll(); return; }
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
  const stg = e.target.closest('[data-stage]');
  if (stg) {
    const i = +stg.dataset.stage;
    if (i > game.story.stage) { toast('先通关上一关'); return; }
    const { ch, si, st } = S.stageAt(i);
    sfx.play('click');
    playDialogue(si === 0 ? [...ch.intro, ...st.intro] : st.intro, () => startBattle({ stage: i }));
    return;
  }
  const sq = e.target.closest('[data-squad]');
  if (sq) { const r = S.toggleSquad(game, sq.dataset.squad); if (!r.ok) toast(r.reason); sfx.play('click'); save(); renderGo(); return; }
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


// ---------- 剧情对白播放器 ----------
// lines: [[说话人, 台词], ...]；点击屏幕：正在打字就直接显示完整句子，否则下一句
let dlg = null;
function playDialogue(lines, onDone) {
  dlg = { lines, i: -1, onDone, typing: null, full: '' };
  $('dlg').classList.remove('hidden');
  nextLine();
}
function nextLine() {
  if (!dlg) return;
  dlg.i++;
  if (dlg.i >= dlg.lines.length) { endDialogue(); return; }
  const [who, text] = dlg.lines[dlg.i];
  const nameEl = $('dlgName'), textEl = $('dlgText');
  nameEl.textContent = who;
  nameEl.style.color = (CAST[who] && CAST[who].color) || '#fff';
  textEl.classList.toggle('narr', !who);
  dlg.full = text;
  let n = 0;
  textEl.textContent = '';
  clearInterval(dlg.typing);
  dlg.typing = setInterval(() => {
    n += 1;
    textEl.textContent = text.slice(0, n);
    if (n >= text.length) { clearInterval(dlg.typing); dlg.typing = null; }
  }, 35);
}
function endDialogue() {
  if (!dlg) return;
  clearInterval(dlg.typing);
  const cb = dlg.onDone;
  dlg = null;
  $('dlg').classList.add('hidden');
  if (cb) cb();
}
$('dlg').addEventListener('click', e => {
  if (!dlg) return;
  if (e.target.closest('#dlgSkip')) { sfx.play('click'); endDialogue(); return; }
  if (dlg.typing) { clearInterval(dlg.typing); dlg.typing = null; $('dlgText').textContent = dlg.full; return; }
  sfx.play('click');
  nextLine();
});

// ---------- 战斗 ----------
const joyIn = { x: 0, z: 0, on: false }, aimIn = { x: 0, z: 0, on: false }, keys = {};

function startBattle({ stage = null } = {}) {
  sfx.unlock();
  S.tick(game, Date.now());
  save();
  let story = null;
  if (stage !== null) { const { ch, st } = S.stageAt(stage); story = { ...st, index: stage, zone: ch.zone, chapterTitle: ch.title }; }
  battle = new Battle({
    zoneIndex: story ? story.zone : game.zone, weaponKey: game.weapon, stats: S.battleStats(game, game.weapon),
    cb: { onHud, onLevelUp, onEnd, onMsg, onHurt, onRadio }, story,
  });
  $('hRadio').classList.remove('show');
  $('sSurv').classList.toggle('hidden', !!story);
  $('sAmmo').classList.toggle('hidden', !story);
  $('hObj').classList.toggle('hidden', !story);
  battle.resize(innerWidth, innerHeight);
  mode = 'battle';
  $('baseUI').classList.add('hidden');
  $('battleUI').classList.remove('hidden');
  $('bossBar').classList.add('hidden');
  onHud(battle.hudData());
  onMsg(story ? `${story.title}：${battle.objText()}` : `${ZONES[game.zone].name}：会自动开枪，右边拖动可以手动瞄准`);
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
  $('hTime').textContent = d.story ? mmss(d.t) : mmss(d.left);
  if (d.story) {
    $('hAmmo').textContent = d.ammo;
    $('sAmmo').style.color = d.ammo <= 10 ? '#ff6b5b' : '';
    $('hObj').textContent = d.obj;
  }
  $('hSquad').innerHTML = d.allies.map(a => `<div class="sq-hud ${a.down ? 'down' : ''}"><span>${a.icon} ${a.name}${a.down ? (a.revive > 0 ? ' 扶起中…' : ' 倒地') : ''}</span><i style="width:${a.down ? a.revive / 2 * 100 : a.hp / a.max * 100}%"></i></div>`).join('');
  $('hKills').textContent = d.kills;
  $('hScrap').textContent = d.scrap;
  $('hSurv').textContent = d.rescued;
  const bb = $('bossBar');
  if (d.boss >= 0) { bb.classList.remove('hidden'); bb.querySelector('span').textContent = '☠️ ' + d.bossName; $('bossFill').style.width = `${d.boss * 100}%`; }
  else bb.classList.add('hidden');
}

function onMsg(text) {
  const el = $('hMsg');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth; // 重新触发动画
  el.classList.add('show');
}

// 无线电字幕：不打断战斗，显示 4 秒
let radioTimer = 0;
function onRadio(who, text) {
  const el = $('hRadio');
  el.innerHTML = `<b style="color:${(CAST[who] && CAST[who].color) || '#fff'}">${who || '旁白'}</b>　${text}`;
  el.classList.add('show');
  clearTimeout(radioTimer);
  radioTimer = setTimeout(() => el.classList.remove('show'), 4200);
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
    drop = `<div class="drop-card" style="border-color:${rr.color}"><div class="muted">👑 ${r.bossName || '尸王'}掉落</div>
      <b style="color:${rr.color}">${slotIcon(it.slot)} ${it.name}</b> <small style="color:${rr.color}">${rr.name}</small>
      <div class="item-st">${itemStats(it)}</div>
      ${sum.itemScrap ? `<div class="muted">背包满了，已自动分解为 🔩${sum.itemScrap}</div>` : '<div class="muted">已放进背包，去「装备」页穿上</div>'}</div>`;
  } else if (r.win) drop = '<p class="muted">💡 撤离前击败尸王，可以获得装备</p>';
  const isStory = r.story !== null && r.story !== undefined;
  const stInfo = isStory ? S.stageAt(r.story) : null, nextSt = isStory ? S.stageAt(game.story.stage) : null;
  const storyLine = sum.storyFirst
    ? `<p class="good">📖 ${stInfo.st.title} 通关！${sum.chapterDone ? `「${stInfo.ch.title}」完成！` : ''}</p>${sum.storyJoin ? `<p class="good">🧑 「${sum.storyJoin}」加入了据点，可以带着出征了</p>` : ''}${nextSt ? `<p class="muted">下一关：${nextSt.st.title}</p>` : '<p class="good">🏆 主线全部通关！</p>'}`
    : (isStory && !r.win ? '<p class="muted">💡 打不过就回据点：升级军械库、强化武器、加天赋、带队友</p>' : '');
  const growth = `<p class="muted">🎖️ 指挥官经验 +${sum.cmdXp}${sum.cmdUps ? `，<b class="good">升到 Lv${game.cmd.lv}（天赋点 +${sum.cmdUps}）</b>` : ''}${Object.entries(sum.compUps).filter(([, u]) => u).map(([nm]) => `，${nm} 升到 Lv${game.comps[nm].lv}`).join('')}</p>`;
  const showResult = () => setTimeout(() => {
    showModal(`<h2>${title}</h2>
      <div class="result">
        <div>坚持时间<b>${mmss(r.time)}</b></div>
        <div>击杀<b>${r.kills}</b></div>
        <div>带回物资<b>🔩 ${r.scrap}${sum.bonus ? ` + ${sum.bonus}` : ''}</b></div>
        <div>救出幸存者<b>${r.rescued}</b></div>
      </div>${sum.bonus ? `<p class="good">${isStory ? '关卡奖励' : '撤离奖励'} 🔩${sum.bonus}${sum.firstClear ? '（首通双倍）' : ''}${sum.lootBonus ? ` · 拾荒 +${sum.lootBonus}` : ''}</p>` : ''}${storyLine}${growth}${drop}${next}${surv}${food}${isStory ? '' : tip}
      <button class="btn big" data-act="home">返回据点</button>`, 500);
  }, r.win || r.retreat ? 200 : 900);
  if (isStory && r.win) setTimeout(() => playDialogue(sum.chapterDone ? [...stInfo.st.outro, ...stInfo.ch.outro] : stInfo.st.outro, showResult), 600);
  else showResult();
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
    if (baseView.shadowDirty) { renderer.shadowMap.needsUpdate = true; baseView.shadowDirty = false; }
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
if (location.hash === '#debug') window.__dbg = { get battle() { return battle; }, get game() { return game; }, renderAll, startBattle, models: loadedModels };

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

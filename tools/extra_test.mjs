// 新玩法冒烟测试：夜袭守城 / 队友闲聊 / 支线关卡
// 用法：先起服务器(8765)和 Chrome(9333)，再 node tools/extra_test.mjs <截图目录>
import fs from 'node:fs';
const OUT = process.argv[2] || 'shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map(); const errs = [];
ws.addEventListener('message', e => {
  const m = JSON.parse(e.data);
  if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errs.push(m.params.args.map(a => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async x => { const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(x.slice(0, 60) + ' => ' + (r.result.exceptionDetails.exception?.description || '')); return r.result.result.value; };
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from(r.result.data, 'base64')); console.log('截图', n); };
const skipDlg = async () => { for (let i = 0; i < 30; i++) { await ev(`(() => { const o = document.querySelector('[data-opt]'); if (o) o.click(); else if (!document.getElementById('dlg').classList.contains('hidden')) document.getElementById('dlgSkip').click(); return true; })()`); await sleep(300); if (await ev(`document.getElementById('dlg').classList.contains('hidden')`)) return; } };
const waitBattle = async () => { for (let i = 0; i < 80; i++) { if (await ev('!!__dbg.battle')) return true; await sleep(500); } return false; };
const goHome = async () => { for (let i = 0; i < 30; i++) { const ok = await ev(`(() => { if (!__dbg.battle) return true; const h = document.querySelector('[data-act="home"]'); if (h) { h.click(); return false; } const o = document.querySelector('[data-opt]'); if (o) o.click(); else if (!document.getElementById('dlg').classList.contains('hidden')) document.getElementById('dlgSkip').click(); return false; })()`); if (ok) return; await sleep(400); } };

await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html#debug' });
await sleep(2000);
await ev(`(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); return true; })()`);
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?t=' + Date.now() + '#debug' });
await sleep(4000);
await ev(`(() => { const g = __dbg.game; Object.assign(g.buildings, { hq: 4, armory: 3, gym: 3, turret: 3, farm: 2, scrapyard: 2, dorm: 2, clinic: 2 }); g.comps['陈医生'] = { lv: 4, xp: 0 }; g.survivors.push('陈医生'); g.squad = ['陈医生']; g.stats.runs = 5; g.raid.next = 5; g.scrap = 500; __dbg.renderAll(); return true; })()`);
await sleep(800);
await shot('x1-raid-banner');

// ---- 1. 夜袭守城 ----
await ev(`document.getElementById('btnRaid').click(); true`);
console.log('夜袭开始:', await waitBattle());
await sleep(3000);
await shot('x2-raid');
console.log('夜袭 HUD:', await ev(`JSON.stringify((({ obj, core, allies }) => ({ obj, core, allies: allies.length }))(__dbg.battle.hudData()))`));
await ev(`(() => { const b = __dbg.battle; b.p.hp = b.p.maxHp = 99999; return true; })()`);
for (let k = 0; k < 14 && await ev('!!__dbg.battle && !__dbg.battle.over'); k++) {
  await ev(`(() => { const b = __dbg.battle; if (b.pendingLevels) { document.getElementById('modal').classList.add('hidden'); b.pendingLevels = 0; b.paused = false; } for (const z of b.zs) b.hurtZombie(z, 1e9, 0, 0, 0, true); b.waveT = 0; return true; })()`);
  await sleep(700);
}
await sleep(2500);
await shot('x3-raid-result');
console.log('夜袭结束:', await ev(`JSON.stringify({ wins: __dbg.game.raid.wins, next: __dbg.game.raid.next, runs: __dbg.game.stats.runs })`));
await goHome();
await sleep(800);

// ---- 2. 闲聊 ----
await ev(`document.querySelector('[data-tab="people"]').click(); true`);
await sleep(400);
await shot('x4-people');
await ev(`document.querySelector('[data-chat="陈医生"]').click(); true`);
await sleep(1500);
await shot('x5-chat');
await skipDlg();
console.log('好感:', await ev(`__dbg.game.bond['陈医生']`));

// ---- 3. 支线 ----
await ev(`(() => { __dbg.game.bond['陈医生'] = 30; __dbg.renderAll(); return true; })()`);
await sleep(300);
await ev(`document.querySelector('[data-side="陈医生:0"]').click(); true`);
await sleep(800);
await skipDlg();
console.log('支线开始:', await waitBattle());
await sleep(2000);
await ev(`(() => { const b = __dbg.battle; b.p.hp = b.p.maxHp = 99999; for (const o of b.objs) { o.got = true; b.objGot++; } if (b.hold) b.hold.t = b.hold.time; if (b.npcSpot && !b.npcSpot.free) b.npcSpot.free = 11; b.spawnExit(); return true; })()`);
await sleep(1500);
await ev(`(() => { const b = __dbg.battle; if (b.exit) { b.p.x = b.exit.x; b.p.z = b.exit.z; if (b.npc) { b.npc.x = b.exit.x; b.npc.z = b.exit.z; } } return true; })()`);
await sleep(3000);
await skipDlg();
await sleep(1000);
await shot('x6-side-result');
console.log('支线结果:', await ev(`JSON.stringify({ perks: __dbg.game.perks, sideDone: __dbg.game.sideDone })`));
console.log('错误:', errs.length ? errs.slice(0, 5) : '无');
process.exit(0);

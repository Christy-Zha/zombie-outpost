// 剧情模式冒烟测试：开场对白 → 夜间关卡 → 收集物品 → 撤离 → 结尾对白 → 结算
// 用法：先起服务器(8765)和 Chrome(9333)，再 node tools/story_test.mjs <截图目录> [章节号]
import fs from 'node:fs';
const OUT = process.argv[2] || 'shots';
const CH = +(process.argv[3] || 0);
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
const ev = async x => {
  const r = await send('Runtime.evaluate', { expression: x, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(x.slice(0, 80) + ' => ' + (r.result.exceptionDetails.exception?.description || ''));
  return r.result.result.value;
};
const shot = async n => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(`${OUT}/${n}.png`, Buffer.from(r.result.data, 'base64')); console.log('截图', n); };

await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html#debug' });
await sleep(2000);
await ev(`(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); return true; })()`);
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html?t=' + Date.now() + '#debug' });
await sleep(3000);
console.log('已加载的真实模型：', await ev('JSON.stringify(__dbg.models)'));
await ev(`(() => { const g = __dbg.game; g.story.stage = ${CH}; g.scrap = 500; g.comps['陈医生'] = { lv: 3, xp: 0 }; g.comps['阿杰'] = { lv: 2, xp: 0 }; g.squad = ['陈医生', '阿杰']; return true; })()`);
await ev(`document.querySelector('[data-tab="go"]').click(); true`);
await sleep(300);
await shot('s1-go-tab');
await ev(`document.querySelector('[data-stage="${CH}"]').click(); true`);
await sleep(1500);
await shot('s2-dialogue');
await ev(`document.getElementById('dlgSkip').click(); true`);
await sleep(2500);
await shot('s3-night');
console.log('HUD', await ev(`JSON.stringify(__dbg.battle.hudData())`));
// 无敌，然后按关卡类型“作弊”完成目标
await ev(`(() => { const b = __dbg.battle; b.p.hp = b.p.maxHp = 99999; for (const a of b.allies) a.hp = a.maxHp = 99999; return true; })()`);
const skip = `if (b.pendingLevels) { document.getElementById('modal').classList.add('hidden'); b.pendingLevels = 0; b.paused = false; }`;
console.log('关卡类型', await ev(`__dbg.battle.story.type`), '队友', await ev(`JSON.stringify(__dbg.battle.allies.map(a => a.name))`));
for (let k = 0; k < 6; k++) {
  await ev(`(() => { const b = __dbg.battle; ${skip}
    const t = b.story.type;
    if (t === 'collect') { const o = b.objs.find(o => !o.got); if (o) { b.p.x = o.x; b.p.z = o.z; o.search = 3; } }
    if (t === 'defend') { b.p.x = b.hold.x + 1; b.p.z = b.hold.z; b.hold.t = Math.min(b.hold.time - 1, b.hold.t + 25); }
    if (t === 'rescue' && !b.npc) { b.p.x = b.npcSpot.x; b.p.z = b.npcSpot.z; b.npcSpot.free = 11; }
    if (t === 'boss' && b.boss) b.hurtZombie(b.boss, b.boss.maxHp * 0.3, 0, 0);
    return true; })()`);
  await sleep(900);
  if (k === 2) await shot('s4-mid');
}
console.log('目标完成后', await ev(`JSON.stringify({ hud: __dbg.battle.hudData().obj, exit: !!__dbg.battle.exit, allies: __dbg.battle.hudData().allies.length })`));
await ev(`(() => { const b = __dbg.battle; ${skip} if (b.exit) { b.p.x = b.exit.x; b.p.z = b.exit.z; if (b.npc) { b.npc.x = b.exit.x + 1; b.npc.z = b.exit.z; } } if (b.hold) b.hold.t = b.hold.time; return true; })()`);
await sleep(2500);
await shot('s5-outro');
await ev(`document.getElementById('dlgSkip').click(); true`);
await sleep(1200);
await shot('s6-result');
console.log('存档', await ev(`JSON.stringify({ story: __dbg.game.story, survivors: __dbg.game.survivors, cmd: __dbg.game.cmd, comps: __dbg.game.comps })`));
const fps = await ev(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 1500) requestAnimationFrame(f); else r(Math.round(n / 1.5)); }; requestAnimationFrame(f); })`);
console.log('帧率（软件渲染）', fps);
console.log('错误:', errs.length ? errs : '无');
process.exit(0);

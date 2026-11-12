// 浏览器自动化冒烟测试：用 Chrome 无界面模式模拟 iPhone 打开游戏、截图、跑一局
// 前提：已在 8765 端口启动静态服务器，Chrome 已用 --remote-debugging-port=9333 启动
import fs from 'node:fs';

const OUT = process.argv[2] || 'shots';
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const page = list.find(t => t.type === 'page');
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && (m.params.type === 'error' || m.params.type === 'warning'))
    errors.push(m.params.type + ': ' + m.params.args.map(a => a.value ?? a.description).join(' '));
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(expr + ' => ' + JSON.stringify(r.result.exceptionDetails));
  return r.result.result.value;
};
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(`${OUT}/${name}.png`, Buffer.from(r.result.data, 'base64'));
  console.log('截图', name);
};
const key = async (code, type) => send('Input.dispatchKeyEvent', { type, code, key: code });

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html#debug' });
await sleep(2500);
// 清空存档后重新加载，保证从新档开始
await ev(`(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); localStorage.clear(); return true; })()`);
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await ev(`location.reload(); true`);
await sleep(2500);
await shot('01-base');

// 建造几个建筑
await ev(`__dbg.game.scrap = 2000; __dbg.renderAll(); true`);
for (const k of ['farm', 'scrapyard', 'armory', 'hq', 'dorm', 'radio', 'gym', 'clinic', 'armory', 'hq'])
  await ev(`document.querySelector('[data-up="${k}"]').click(); true`);
await sleep(800);
await shot('02-base-built');
await ev(`document.querySelector('[data-tab="go"]').click(); true`);
await sleep(300);
await shot('03-go-tab');

// 开始战斗，按住 D 向右走
await ev(`document.querySelector('[data-zone="0"]').click(); true`);
await sleep(500);
await key('KeyD', 'keyDown');
await sleep(4000);
await key('KeyD', 'keyUp');
await key('ArrowLeft', 'keyDown');
await sleep(1200);
await shot('04b-manual-aim');
await key('ArrowLeft', 'keyUp');
await shot('04-battle-start');
console.log('战斗状态', await ev(`JSON.stringify(__dbg.battle.hudData())`));

// 如果弹出升级就选第一个；给满技能测试电锯和燃烧瓶
await ev(`(() => { const b = __dbg.battle; b.skills.saw = 3; b.skills.molotov = 3; b.skills.multi = 2; return true; })()`);
for (let i = 0; i < 6; i++) {
  await sleep(1500);
  await ev(`(() => { const b = __dbg.battle; if (b.paused && b.pendingLevels > 0) { document.getElementById('modal').classList.add('hidden'); b.applySkill(b.rollSkills()[0].key); } return true; })()`);
}
await shot('05-battle-skills');

// 快进到尸王出现
await ev(`(() => { const b = __dbg.battle; b.t = 238; b.nextHorde = 240; b.p.hp = 9999; b.p.maxHp = 9999; return true; })()`);
await sleep(4000);
await ev(`(() => { const b = __dbg.battle; if (b.paused && b.pendingLevels > 0) { document.getElementById('modal').classList.add('hidden'); b.applySkill(b.rollSkills()[0].key); } return true; })()`);
await sleep(1500);
await shot('06-boss');
console.log('尸王阶段', await ev(`JSON.stringify({ hud: __dbg.battle.hudData(), zombies: __dbg.battle.zs.length, bullets: __dbg.battle.bullets.length })`));

// 测帧率
const fps = await ev(`new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else r(n / 2); }; requestAnimationFrame(f); })`);
console.log('无界面软件渲染下的帧率（真机会快很多）:', fps);

// 快进到胜利
await ev(`(() => { const b = __dbg.battle; b.pendingLevels = 0; b.paused = false; document.getElementById('modal').classList.add('hidden'); b.t = 299.8; b.bossKilled = true; return true; })()`);
await sleep(1500);
await shot('07-result');
console.log('结算后存档', await ev(`JSON.stringify({ scrap: __dbg.game.scrap, cleared: __dbg.game.cleared, survivors: __dbg.game.survivors })`));
await ev(`document.querySelector('[data-act="home"]').click(); true`);
await sleep(800);
await shot('08-home');
await ev(`document.querySelector('[data-tab="gear"]').click(); true`);
await sleep(300);
await ev(`(() => { const b = document.querySelector('[data-equip]'); if (b) b.click(); return true; })()`);
await sleep(300);
await shot('08b-gear');
console.log('装备后战斗属性', await ev(`JSON.stringify(__dbg.game.gear)`));

// 横屏
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await sleep(800);
await shot('09-landscape');

console.log('错误/警告:', errors.length ? errors : '无');
ws.close();
process.exit(0);

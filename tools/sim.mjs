// 平衡性模拟：在浏览器里加速跑若干局，机器人绕圈走位 + 随机选技能
// 用法同 cdp_test.mjs（需要先开服务器和 Chrome）
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value;

await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html#debug' });
await sleep(2500);
// 清掉离线缓存，确保跑的是最新代码
await ev(`(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); return true; })()`);
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/tools/sim.html' });
await sleep(1000);

// 不同基地配置：新手 / 中期
const setups = [
  { name: '新手（全 0 级，手枪）', zone: 0, b: {}, weapon: 'pistol' },
  { name: '小有发展（军械3 训练3 医疗2，霰弹枪）', zone: 0, b: { hq: 3, armory: 3, gym: 3, clinic: 2, radio: 1 }, weapon: 'shotgun' },
  { name: '区域2（军械5 训练5 医疗4，冲锋枪）', zone: 1, b: { hq: 5, armory: 5, gym: 5, clinic: 4, radio: 3 }, weapon: 'smg' },
];
for (const st of setups) {
  const res = await ev(`(async () => {
    const { Battle } = await import('../js/battle.js');
    const S = await import('../js/save.js');
    const out = [];
    for (let run = 0; run < 3; run++) {
      const g = S.defaultSave();
      Object.assign(g.buildings, ${JSON.stringify(st.b)});
      let ended = null;
      const b = new Battle({ zoneIndex: ${st.zone}, weaponKey: '${st.weapon}', stats: S.battleStats(g),
        cb: { onHud(){}, onMsg(){}, onHurt(){}, onEnd(r){ ended = r; },
              onLevelUp(opts){ setTimeout(() => {}, 0); b._pick = opts[Math.floor(Math.random() * opts.length)].key; } } });
      const dt = 1 / 30;
      let a = 0;
      while (!ended && b.t < 400) {
        if (b._pick) { const k = b._pick; b._pick = null; b.applySkill(k); }
        a += dt * 0.5;
        // 机器人：绕大圈走，顺便往最近的物资/救援点靠
        let ix = Math.cos(a), iz = Math.sin(a);
        if (b.beacon) { const dx = b.beacon.x - b.p.x, dz = b.beacon.z - b.p.z, d = Math.hypot(dx, dz); ix = dx / d; iz = dz / d; }
        b.setInput(ix, iz);
        b.update(dt);
      }
      out.push({ time: Math.round(ended.time), win: ended.win, kills: ended.kills, scrap: ended.scrap, level: ended.level, rescued: ended.rescued });
      b.dispose();
    }
    return out;
  })()`);
  console.log(st.name);
  for (const r of res || []) console.log('  ', JSON.stringify(r));
}
ws.close();
process.exit(0);

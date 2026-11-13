// 剧情关卡平衡模拟：不同成长阶段 × 不同关卡，机器人按任务目标行动，统计过关率
// 用法：先起服务器(8765)和 Chrome(9333)，再 node tools/sim_story.mjs [每组局数]
const RUNS = +(process.argv[2] || 3);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', ev => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description); return r.result.result.value; };
await send('Network.enable'); await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Page.navigate', { url: 'http://127.0.0.1:8765/index.html' });
await sleep(1500);
await ev(`(async () => { for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); for (const k of await caches.keys()) await caches.delete(k); return true; })()`);
await send('Page.navigate', { url: 'http://127.0.0.1:8765/tools/sim.html' }); // 空页面里跑，不加载真实模型，速度快
await sleep(800);

const SETUPS = {
  新手: { b: {}, w: 'pistol', wl: 0, t: {}, squad: [] },
  初期: { b: { hq: 3, armory: 2, gym: 2, clinic: 1 }, w: 'pistol', wl: 2, t: { gun: 2, hp: 2 }, squad: [['陈医生', 3]] },
  中期: { b: { hq: 6, armory: 5, gym: 5, clinic: 4, radio: 3 }, w: 'smg', wl: 5, t: { gun: 5, hp: 5, aid: 3, lead: 3 }, squad: [['陈医生', 8], ['阿杰', 8]] },
  后期: { b: { hq: 9, armory: 8, gym: 8, clinic: 7, radio: 6 }, w: 'smg', wl: 9, t: { gun: 9, hp: 9, aid: 6, lead: 8, ammo: 6 }, squad: [['周队长', 15], ['陈医生', 15]] },
};
const STAGES = [0, 8, 11, 20, 26, 29, 38, 44]; // 1-1、3-3(孟主任)、4-3、7-3(零号病人)、9-3、10-3(秦锋)、13-3、15-3(韩振)

const code = (setup, stage) => `(async () => {
  const { Battle } = await import('../js/battle.js');
  const S = await import('../js/save.js');
  const out = [];
  for (let run = 0; run < ${RUNS}; run++) {
    const g = S.defaultSave();
    Object.assign(g.buildings, ${JSON.stringify(setup.b)});
    g.weapon = '${setup.w}'; g.weaponLv['${setup.w}'] = ${setup.wl};
    g.cmd.talents = ${JSON.stringify(setup.t)};
    for (const [n, lv] of ${JSON.stringify(setup.squad)}) { g.comps[n] = { lv, xp: 0 }; g.squad.push(n); }
    const { ch, st } = S.stageAt(${stage});
    let ended = null, pick = null;
    const b = new Battle({ zoneIndex: ch.zone, weaponKey: g.weapon, stats: S.battleStats(g), story: { ...st, index: ${stage}, zone: ch.zone },
      cb: { onHud() {}, onMsg() {}, onHurt() {}, onRadio() {}, onEnd(r) { ended = r; }, onLevelUp(o) { pick = o[Math.floor(Math.random() * o.length)].key; } } });
    const dt = 1 / 30; let a = 0;
    while (!ended && b.t < 600) {
      if (pick) { const k = pick; pick = null; b.applySkill(k); }
      const p = b.p; a += dt;
      // 机器人：朝当前目标走；打 Boss 时绕圈；坚守时在圈内绕小圈
      let tx = p.x, tz = p.z, kite = false;
      const st2 = b.story;
      if (st2.type === 'collect') { const o = b.objs.find(o => !o.got); const t = o || b.exit; if (t) { tx = t.x; tz = t.z; } }
      else if (st2.type === 'defend') { tx = b.hold.x + Math.cos(a) * 2.5; tz = b.hold.z + Math.sin(a) * 2.5; }
      else if (st2.type === 'rescue') { const t = b.npc ? b.exit : b.npcSpot; if (t) { tx = t.x; tz = t.z; } }
      else if (st2.type === 'boss' && b.boss) { tx = b.boss.x + Math.cos(a * 0.6) * 9; tz = b.boss.z + Math.sin(a * 0.6) * 9; }
      let ix = tx - p.x, iz = tz - p.z; const L = Math.hypot(ix, iz);
      if (L > 0.5) { ix /= L; iz /= L; } else { ix = iz = 0; }
      b.setInput(ix, iz);
      b.update(dt);
    }
    out.push(ended ? (ended.win ? 'W' : 'L') + Math.round(ended.time) : 'T');
    b.dispose();
  }
  return out.join(' ');
})()`;

console.log('关卡：', STAGES.map(i => `#${i}`).join(' '), '（W=过关 L=失败，数字=用时秒）');
for (const [name, setup] of Object.entries(SETUPS)) {
  const row = [];
  for (const st of STAGES) row.push(`#${st}: ${await ev(code(setup, st))}`);
  console.log(`${name}  ${row.join(' | ')}`);
}
ws.close();
process.exit(0);

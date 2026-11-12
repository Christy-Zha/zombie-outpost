// 从 Mixamo 自动下载角色 + 动作（FBX）到 models_src/<角色>/<动作>.fbx
// 前提：用 --remote-debugging-port=9334 打开一个 Chrome 窗口，并由用户本人在里面登录 Mixamo。
// 脚本只在那个已登录的页面里调用 Mixamo 网站自己的接口，不读取、不保存任何密码或令牌。
// 用法：node tools/mixamo_download.mjs [只下载某个角色]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SUFFIX = '-b96c-11e4-a802-0aaa78deedf9'; // Mixamo 老动作的 id 后缀都一样

// 角色 id + 每个动作的 id（在 Mixamo 网站上搜出来的）
const JOBS = {
  player: { character: '2b100d25-62a3-4edf-a80b-4e68c4f8234e', name: 'Swat', anims: { idle: 'c9cd4ed4', run: 'c9c814a0', shoot: 'c9c94dfa', death: 'c9ceab40' } },
  zombie: { character: '3d9daeb8-c2d5-45ce-b835-7cd403c72fc7', name: 'Copzombie', anims: { walk: 'c9cbd4d9', run: 'c9c6b0ab', attack: 'c9cbd7ad', death: 'c9cc240a' } },
  mutant: { character: 'cccc84b6-d072-4972-99da-75c5702e25f6', name: 'Mutant', anims: { walk: 'c9c93a8c', run: 'c9c93cdc', attack: 'c9c93c1d', death: 'c9c93d98' } },
};

const only = process.argv[2];
const list = await (await fetch('http://127.0.0.1:9334/json/list')).json();
const page = list.find(t => t.type === 'page' && t.url.includes('mixamo.com'));
if (!page) { console.error('没找到已打开的 Mixamo 页面'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pend = new Map();
ws.addEventListener('message', e => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } });
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result.result.value;
};

// 在页面里执行：发起导出 → 轮询 → 返回下载地址
const exportOne = (character, animId, productName) => ev(`(async () => {
  const H = { Authorization: 'Bearer ' + localStorage.getItem('access_token'), 'X-Api-Key': 'mixamo2', Accept: 'application/json', 'Content-Type': 'application/json' };
  const det = await (await fetch('https://www.mixamo.com/api/v1/products/${animId}?similar=0&character_id=${character}', { headers: H })).json();
  const g = det.details.gms_hash;
  const gms = { ...g, inplace: !!det.details.supports_inplace, params: g.params.map(p => p[1]).join(',') }; // 能原地就原地
  const body = { character_id: '${character}', gms_hash: [gms], preferences: { format: 'fbx7_2019', skin: 'true', fps: '30', reducekf: '0' }, product_name: ${JSON.stringify(productName)}, type: 'Motion' };
  const ex = await fetch('https://www.mixamo.com/api/v1/animations/export', { method: 'POST', headers: H, body: JSON.stringify(body) });
  if (!ex.ok) return { error: '导出请求失败 ' + ex.status + ' ' + (await ex.text()).slice(0, 200) };
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const m = await (await fetch('https://www.mixamo.com/api/v1/characters/${character}/monitor', { headers: H })).json();
    if (m.status === 'completed') return { url: m.job_result, name: det.name, inplace: gms.inplace };
    if (m.status === 'failed') return { error: '导出失败 ' + JSON.stringify(m).slice(0, 200) };
  }
  return { error: '等待超时' };
})()`);

for (const [who, job] of Object.entries(JOBS)) {
  if (only && who !== only) continue;
  const dir = path.join(ROOT, 'models_src', who);
  fs.mkdirSync(dir, { recursive: true });
  for (const [anim, shortId] of Object.entries(job.anims)) {
    const out = path.join(dir, anim + '.fbx');
    if (fs.existsSync(out) && fs.statSync(out).size > 10000) { console.log(`⏭  ${who}/${anim}.fbx 已存在`); continue; }
    process.stdout.write(`⬇️  ${job.name} · ${anim} … `);
    const r = await exportOne(job.character, shortId + SUFFIX, job.name);
    if (r.error) { console.log('❌', r.error); continue; }
    const res = await fetch(r.url);
    if (!res.ok) { console.log('❌ 下载失败', res.status); continue; }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(out, buf);
    console.log(`完成（${r.name}，${(buf.length / 1048576).toFixed(1)} MB${r.inplace ? '，原地' : ''}）`);
  }
}
ws.close();
process.exit(0);

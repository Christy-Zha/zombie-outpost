// 把 models_src/<角色>/*.fbx（Mixamo 下载的）转换成 models/<角色>.glb
// 用法：node tools/convert_models.mjs            —— 转换全部角色
//      node tools/convert_models.mjs zombie     —— 只转换 zombie
//      node tools/convert_models.mjs --src 目录 --out 目录   —— 自定义目录（测试用）
// 原理：自己起一个静态服务器 + 无界面 Chrome，在浏览器里用 Three.js 读 FBX、导出 GLB。不需要安装任何软件。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args.splice(i, 2)[1] : d; };
const SRC = path.resolve(ROOT, opt('--src', 'models_src'));
const OUT = path.resolve(ROOT, opt('--out', 'models'));
const only = args[0];

// 每种角色的动作顺序（第一个存在的文件提供模型本体），以及贴图上限
const PLAN = {
  player: { anims: ['idle', 'run', 'shoot', 'death'], tex: 1024, tris: 15000 },
  zombie: { anims: ['walk', 'run', 'attack', 'death'], tex: 512, tris: 6000 },
  mutant: { anims: ['walk', 'run', 'attack', 'death'], tex: 1024, tris: 10000 },
  // 队友 / 新丧尸：只有模型本体 + 1 个动作，其余动作在游戏里共用 player / zombie 的
  c_chen: { anims: ['idle'], tex: 512, tris: 6000 }, c_min: { anims: ['idle'], tex: 512, tris: 6000 },
  c_jie: { anims: ['idle'], tex: 512, tris: 6000 }, c_zhou: { anims: ['idle'], tex: 512, tris: 6000 },
  c_xiao: { anims: ['idle'], tex: 512, tris: 6000 },
  z_exploder: { anims: ['walk'], tex: 512, tris: 5000 }, z_spitter: { anims: ['walk'], tex: 512, tris: 5000 },
  z_screamer: { anims: ['walk'], tex: 512, tris: 5000 }, z_armored: { anims: ['walk'], tex: 512, tris: 5000 },
  z_runner: { anims: ['walk'], tex: 512, tris: 5000 }, z_walker2: { anims: ['walk'], tex: 512, tris: 5000 },
};

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('找不到 Chrome 或 Edge 浏览器'); process.exit(1); }

// ---------- 静态服务器（只读，服务整个项目目录） ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.fbx': 'application/octet-stream', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { if (process.env.DEBUG) console.log('   [404]', path.relative(ROOT, p)); res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const toUrl = f => `http://127.0.0.1:${PORT}/` + path.relative(ROOT, f).split(path.sep).map(encodeURIComponent).join('/');

// ---------- 无界面浏览器 ----------
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'zo-conv-'));
const DBG = 9400 + Math.floor(Math.random() * 400);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`, '--no-first-run', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let page;
for (let i = 0; i < 40 && !page; i++) {
  await sleep(300);
  try { page = (await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json()).find(t => t.type === 'page'); } catch { /* 还没启动好 */ }
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(r => ws.addEventListener('open', r));
let id = 0;
const pending = new Map();
const logs = [];
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (process.env.DEBUG && m.method === 'Runtime.consoleAPICalled' && m.params.type !== 'log') console.log('   [浏览器]', m.params.args.map(a => a.value ?? a.description).join(' ').slice(0, 200));
  if (m.method === 'Runtime.exceptionThrown') logs.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
const send = (method, params = {}) => new Promise(r => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async expr => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails.text);
  return r.result.result.value;
};
await send('Runtime.enable');
await send('Page.navigate', { url: toUrl(path.join(ROOT, 'tools/converter/convert.html')) });
for (let i = 0; i < 40 && !(await ev('!!window.__ready').catch(() => false)); i++) await sleep(250);

// ---------- 逐个角色转换 ----------
const cleanup = () => { try { ws.close(); } catch { } chrome.kill(); server.close(); try { fs.rmSync(profile, { recursive: true, force: true }); } catch { } };
fs.mkdirSync(OUT, { recursive: true });
const dirs = fs.existsSync(SRC) ? fs.readdirSync(SRC).filter(d => fs.statSync(path.join(SRC, d)).isDirectory()) : [];
let done = 0;
for (const name of dirs) {
  if (only && name !== only) continue;
  const dir = path.join(SRC, name);
  const fbx = fs.readdirSync(dir).filter(f => f.toLowerCase().endsWith('.fbx'));
  if (!fbx.length) { console.log(`⏭  ${name}：文件夹里还没有 .fbx 文件`); continue; }
  const plan = PLAN[name] || { anims: [], tex: 1024, tris: 10000 };
  // 按计划顺序排列；不在计划里的文件也收进来（动画名 = 文件名）
  const stem = f => path.basename(f, path.extname(f)).toLowerCase();
  fbx.sort((a, b) => {
    const ia = plan.anims.indexOf(stem(a)), ib = plan.anims.indexOf(stem(b));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const missing = plan.anims.filter(a => !fbx.some(f => stem(f) === a));
  const files = fbx.map(f => ({ url: toUrl(path.join(dir, f)), anim: stem(f) }));
  process.stdout.write(`🔄 ${name}：${fbx.join(', ')} … `);
  try {
    const r = await ev(`convert(${JSON.stringify(files)}, ${plan.tex}, ${plan.tris})`);
    const buf = Buffer.from(r.b64, 'base64');
    const out = path.join(OUT, `${name}.glb`);
    fs.writeFileSync(out, buf);
    done++;
    console.log(`完成\n   → ${path.relative(ROOT, out)}  ${(buf.length / 1048576).toFixed(2)} MB，${r.trisBefore > r.tris ? `三角面 ${r.trisBefore} → ${r.tris}` : `${r.tris} 个三角面`}，身高 ${r.height.toFixed(1)}`);
    console.log(`   动作：${r.anims.join('、')}`);
    if (r.bad && r.bad.length) console.log('   ⚠️ 贴图解码失败：', r.bad.join(' | '));
    if (missing.length) console.log(`   ⚠️ 缺少动作：${missing.join('、')}（文件名要叫 ${missing.map(m => m + '.fbx').join(' / ')}）`);
    if (r.tris > plan.tris * 1.3) console.log('   ⚠️ 减面没减到目标（模型结构复杂），手机上同屏数量要少一些');
  } catch (e) {
    console.log('失败\n   ', String(e.message || e).split('\n')[0]);
  }
}
if (logs.length) console.log('浏览器报错：', logs.slice(0, 5));
console.log(done ? `\n共转换 ${done} 个角色` : '\n没有转换任何角色');
cleanup();
process.exit(0);

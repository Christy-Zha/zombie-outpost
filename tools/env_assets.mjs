// 下载 Poly Haven（CC0 免费可商用）的写实道具模型和贴图，压缩成手机友好的大小
// 输出：assets/env/<模型>.glb（贴图 512px JPEG）、assets/tex/<贴图>_diff.jpg / _nor.jpg（512px）
// 用法：node tools/env_assets.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAW = path.join(ROOT, '_model_research', 'polyhaven'); // 原始下载（不进 git）
const OUT_M = path.join(ROOT, 'assets', 'env');
const OUT_T = path.join(ROOT, 'assets', 'tex');

// 用到的模型
// 用到的模型：名字 → 减面目标（0 = 不减）
export const MODELS = {
  concrete_road_barrier: 1500, barrel_03: 0, wooden_crate_02: 2000, old_military_crate: 2500, ammo_box: 1500,
  portable_generator: 4000, metal_jerrycan: 2000, medical_box: 1500, old_tyre: 1500, street_lamp_01: 2500,
  covered_car: 5000, propane_tank: 2000, utility_box_01: 2000,
};
// 用到的贴图（是否需要法线贴图）
export const TEXTURES = {
  brown_mud_leaves_01: true, asphalt_02: true, concrete_floor_01: true, concrete_block_wall: true,
  concrete_brick_wall_001: true, corrugated_iron: true, rusted_shutter: true, green_metal_rust: true,
  rust_coarse_01: true, brown_planks_05: true, brick_wall_001: true, brown_mud: true, concrete_tiles: true,
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function dl(url, file) {
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url);
    if (r.ok) { fs.writeFileSync(file, Buffer.from(await r.arrayBuffer())); return; }
    await sleep(1000);
  }
  throw new Error('下载失败 ' + url);
}

// ---------- 1. 下载原始素材 ----------
console.log('⬇️  下载 Poly Haven 素材…');
const info = {};
for (const m of Object.keys(MODELS)) {
  const files = await (await fetch('https://api.polyhaven.com/files/' + m)).json();
  const g = files.gltf['1k'].gltf;
  const dir = path.join(RAW, 'models', m);
  await dl(g.url, path.join(dir, m + '.gltf'));
  for (const [rel, v] of Object.entries(g.include)) await dl(v.url, path.join(dir, rel));
  const meta = await (await fetch('https://api.polyhaven.com/info/' + m)).json();
  info[m] = { tris: meta.polycount, authors: Object.keys(meta.authors || {}) };
  process.stdout.write('.');
}
for (const [t, nor] of Object.entries(TEXTURES)) {
  const files = await (await fetch('https://api.polyhaven.com/files/' + t)).json();
  await dl(files.Diffuse['1k'].jpg.url, path.join(RAW, 'tex', t + '_diff.jpg'));
  if (nor) await dl(files.nor_gl['1k'].jpg.url, path.join(RAW, 'tex', t + '_nor.jpg'));
  const meta = await (await fetch('https://api.polyhaven.com/info/' + t)).json();
  info[t] = { authors: Object.keys(meta.authors || {}) };
  process.stdout.write('.');
}
console.log(' 完成');

// ---------- 2. 在无界面浏览器里压缩转换 ----------
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.jpg': 'image/jpeg', '.png': 'image/png', '.gltf': 'model/gltf+json', '.bin': 'application/octet-stream' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p).toLowerCase()] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
const toUrl = f => `http://127.0.0.1:${PORT}/` + path.relative(ROOT, f).split(path.sep).map(encodeURIComponent).join('/');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'zo-env-'));
const DBG = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn(CHROME, ['--headless=new', `--remote-debugging-port=${DBG}`, `--user-data-dir=${profile}`, '--no-first-run', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
let page;
for (let i = 0; i < 40 && !page; i++) { await sleep(300); try { page = (await (await fetch(`http://127.0.0.1:${DBG}/json/list`)).json()).find(t => t.type === 'page'); } catch { } }
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
await send('Page.navigate', { url: toUrl(path.join(ROOT, 'tools/converter/env.html')) });
for (let i = 0; i < 40 && !(await ev('!!window.__ready').catch(() => false)); i++) await sleep(250);

fs.mkdirSync(OUT_M, { recursive: true });
fs.mkdirSync(OUT_T, { recursive: true });
let total = 0;
for (const [m, target] of Object.entries(MODELS)) {
  const r = await ev(`convertModel(${JSON.stringify(toUrl(path.join(RAW, 'models', m, m + '.gltf')))}, 512, ${target})`);
  const buf = Buffer.from(r.b64, 'base64');
  fs.writeFileSync(path.join(OUT_M, m + '.glb'), buf);
  total += buf.length;
  console.log(`🧱 ${m.padEnd(24)} ${(buf.length / 1024).toFixed(0).padStart(5)} KB  原 ${r.tris} 面  尺寸 ${r.size.map(v => v.toFixed(2)).join('×')}`);
}
for (const [t, nor] of Object.entries(TEXTURES)) {
  for (const kind of nor ? ['diff', 'nor'] : ['diff']) {
    const b64 = await ev(`resizeTexture(${JSON.stringify(toUrl(path.join(RAW, 'tex', `${t}_${kind}.jpg`)))}, 512)`);
    const buf = Buffer.from(b64, 'base64');
    fs.writeFileSync(path.join(OUT_T, `${t}_${kind}.jpg`), buf);
    total += buf.length;
  }
  process.stdout.write('🖼 ' + t + ' ');
}
console.log(`\n共 ${(total / 1048576).toFixed(2)} MB`);
// 记录作者，写进 assets/CREDITS.md
const lines = ['# 素材来源', '', '以下模型和贴图来自 [Poly Haven](https://polyhaven.com)，授权 CC0（公共领域，可免费商用）。感谢作者们：', ''];
for (const [k, v] of Object.entries(info)) lines.push(`- ${k}：${v.authors.join('、')}`);
fs.writeFileSync(path.join(ROOT, 'assets', 'CREDITS.md'), lines.join('\n') + '\n');
ws.close(); chrome.kill(); server.close();
try { fs.rmSync(profile, { recursive: true, force: true }); } catch { }
process.exit(0);

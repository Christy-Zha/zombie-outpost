// 音效 + 背景氛围：全部用代码合成，不需要音频文件
// iPhone 注意事项：
// 1. 必须在“手指抬起 / 点击”时才能开启声音 → unlock() 挂在 touchend / click 上
// 2. 侧面静音开关会把网页合成音静音 → 设置 audioSession 为“播放”，老系统用一段无声 <audio> 顶上
// 3. 切到后台再回来，声音会变成“被打断”状态 → 只要不是 running 就重新 resume

let ctx = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null, enabled = true, shaper = null;
const last = {};
let silentEl = null;

// 同一种音效的最短间隔（秒），防止射速快时声音糊成一片
const GAP = { shot: 0.07, smg: 0.06, shotgun: 0.1, rifle: 0.1, bow: 0.1, launch: 0.15, hit: 0.04, kill: 0.05, gem: 0.05, coin: 0.06, hurt: 0.2, fire: 0.12, groan: 0.5, spit: 0.25, scream: 1.2, ally: 0.09, radio: 0.3, type: 0.05, step: 0.1 };

function out(bus) { return bus || sfxBus; }

function tone(type, f0, f1, dur, vol, t, delay = 0, bus) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  const s = t + delay;
  o.type = type;
  o.frequency.setValueAtTime(f0, s);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), s + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.setValueAtTime(vol, s);
  g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
  o.connect(g).connect(out(bus));
  o.start(t);
  o.stop(s + dur + 0.02);
}

function noise(dur, vol, t, freq = 1500, type = 'lowpass', q = 0.7, bus, delay = 0) {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  const s = t + delay;
  src.buffer = noiseBuf;
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.setValueAtTime(vol, s);
  g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
  src.connect(f).connect(g).connect(out(bus));
  src.start(t, Math.random() * 1.5);
  src.stop(s + dur + 0.02);
}

// 枪声：短促的爆裂噪声 + 低频“砰” + 一点失真，听起来更有分量
function gun(t, { crack = 2500, body = 140, vol = 0.3, len = 0.12, tail = 0.25 }) {
  noise(0.03, vol * 1.1, t, crack, 'highpass', 0.5);
  noise(len, vol, t, crack * 0.6, 'lowpass', 0.8);
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(body, t);
  o.frequency.exponentialRampToValueAtTime(40, t + len * 1.5);
  g.gain.setValueAtTime(vol * 1.2, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len * 1.5);
  o.connect(shaper).connect(g).connect(sfxBus);
  o.start(t); o.stop(t + len * 1.5 + 0.02);
  if (tail) noise(tail, vol * 0.18, t, 500, 'lowpass', 0.5, null, 0.04); // 回声
}

// 丧尸吼叫：锯齿波 + 两个“元音”共振峰，音高抖动
function groan(t, vol = 0.12, pitch = 1) {
  const dur = 0.6 + Math.random() * 0.6;
  const o = ctx.createOscillator(), g = ctx.createGain();
  const f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), mix = ctx.createGain();
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  o.type = 'sawtooth';
  const base = (70 + Math.random() * 40) * pitch;
  o.frequency.setValueAtTime(base * 1.3, t);
  o.frequency.exponentialRampToValueAtTime(base * 0.8, t + dur);
  lfo.frequency.value = 6 + Math.random() * 6; lg.gain.value = base * 0.08;
  lfo.connect(lg).connect(o.frequency);
  f1.type = 'bandpass'; f1.frequency.value = 500 + Math.random() * 200; f1.Q.value = 5;
  f2.type = 'bandpass'; f2.frequency.value = 1100 + Math.random() * 300; f2.Q.value = 6;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.12);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f1).connect(mix); o.connect(f2).connect(mix);
  mix.connect(g).connect(sfxBus);
  noise(dur * 0.8, vol * 0.25, t, 900, 'bandpass', 2); // 喉咙里的气声
  o.start(t); lfo.start(t);
  o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
}

const DEF = {
  shot: t => gun(t, { crack: 3000, body: 160, vol: 0.22, len: 0.08, tail: 0.2 }),
  smg: t => gun(t, { crack: 3500, body: 190, vol: 0.14, len: 0.05, tail: 0.1 }),
  shotgun: t => gun(t, { crack: 1800, body: 90, vol: 0.4, len: 0.22, tail: 0.4 }),
  rifle: t => { gun(t, { crack: 2600, body: 110, vol: 0.38, len: 0.18, tail: 0.6 }); tone('sawtooth', 300, 60, 0.2, 0.06, t); },
  bow: t => { tone('triangle', 260, 90, 0.12, 0.18, t); noise(0.1, 0.12, t, 3000, 'bandpass', 3); },
  launch: t => { tone('sine', 160, 50, 0.2, 0.35, t); noise(0.15, 0.2, t, 800); },
  ally: t => gun(t, { crack: 2800, body: 170, vol: 0.09, len: 0.06, tail: 0 }),
  hit: t => { tone('triangle', 220, 120, 0.05, 0.05, t); noise(0.04, 0.06, t, 600); },
  kill: t => { noise(0.12, 0.14, t, 500); tone('sine', 120, 50, 0.1, 0.08, t); },
  gem: t => tone('sine', 1000, 1500, 0.06, 0.05, t),
  coin: t => { tone('triangle', 800, 800, 0.05, 0.1, t); tone('triangle', 1200, 1200, 0.08, 0.1, t, 0.05); },
  hurt: t => { tone('sawtooth', 180, 70, 0.18, 0.18, t); noise(0.12, 0.15, t, 400); },
  level: t => [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.12, 0.15, t, i * 0.07)),
  rescue: t => [392, 523, 659].forEach((f, i) => tone('sine', f, f, 0.18, 0.18, t, i * 0.1)),
  boss: t => { groan(t, 0.35, 0.5); groan(t + 0.1, 0.25, 0.4); noise(1.2, 0.2, t, 250); tone('sawtooth', 70, 35, 1.4, 0.2, t); },
  boom: t => { noise(0.9, 0.5, t, 500); noise(0.08, 0.4, t, 3000, 'highpass'); tone('sine', 90, 25, 0.7, 0.45, t); },
  fire: t => { noise(0.3, 0.16, t, 700, 'lowpass', 1); noise(0.2, 0.05, t, 2500, 'bandpass', 2); },
  groan: t => groan(t),
  spit: t => { noise(0.25, 0.16, t, 1200, 'bandpass', 4); tone('sine', 400, 150, 0.15, 0.06, t); },
  scream: t => { for (let i = 0; i < 3; i++) tone('sawtooth', 900 + i * 230, 1400 + i * 300, 0.9, 0.05, t, i * 0.02); noise(0.9, 0.12, t, 2500, 'bandpass', 3); },
  radio: t => { noise(0.18, 0.08, t, 2200, 'bandpass', 1.5); tone('square', 1300, 1300, 0.04, 0.03, t, 0.16); },
  type: t => tone('square', 520 + Math.random() * 80, 520, 0.02, 0.015, t),
  build: t => { tone('square', 300, 300, 0.06, 0.08, t); tone('square', 450, 450, 0.08, 0.08, t, 0.08); tone('triangle', 900, 900, 0.15, 0.1, t, 0.16); },
  click: t => tone('sine', 700, 700, 0.04, 0.06, t),
  win: t => [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.16, 0.15, t, i * 0.12)),
  lose: t => [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f, 0.25, 0.15, t, i * 0.18)),
};

// ---------- 背景氛围：风声 + 低沉和弦（据点）/ 心跳般的低音（战斗）----------
let amb = null, ambMode = null, musicTimer = null, step = 0;
const CHORDS = [[110, 130.8, 164.8], [98, 116.5, 146.8], [87.3, 110, 130.8], [82.4, 98, 123.5]]; // A 小调下行
function startAmbient(mode) {
  stopAmbient();
  if (!ctx || !mode) return;
  // 风：循环噪声 → 带通，频率慢慢摆动
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  const lfo = ctx.createOscillator(), lg = ctx.createGain();
  src.buffer = noiseBuf; src.loop = true;
  f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.8;
  lfo.frequency.value = 0.07; lg.gain.value = 250;
  lfo.connect(lg).connect(f.frequency);
  g.gain.value = mode === 'base' ? 0.05 : 0.07;
  src.connect(f).connect(g).connect(musicBus);
  src.start(); lfo.start();
  amb = { stop: () => { try { src.stop(); lfo.stop(); } catch (e) { /* 已停止 */ } } };
  step = 0;
  const tick = () => {
    if (!ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime + 0.05;
    if (mode === 'base') {
      // 每 4 秒一个慢和弦，柔和地淡入淡出
      if (step % 8 === 0) for (const fr of CHORDS[(step / 8) % 4]) pad(fr, t, 4.2, 0.035);
    } else {
      // 战斗：低音脉冲（像心跳），夜里更慢更压抑
      const beat = mode === 'night' ? 4 : 2;
      if (step % beat === 0) { tone('sine', 55, 40, 0.35, 0.16, t, 0, musicBus); tone('sine', 55, 40, 0.25, 0.1, t, 0.22, musicBus); }
      if (step % 16 === 0) for (const fr of CHORDS[(step / 16) % 4]) pad(fr / 2, t, 7.5, 0.03);
    }
    step++;
  };
  tick();
  musicTimer = setInterval(tick, 500);
}
function pad(freq, t, dur, vol) {
  for (const det of [-4, 4]) {
    const o = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
    o.type = 'sawtooth'; o.frequency.value = freq; o.detune.value = det;
    f.type = 'lowpass'; f.frequency.value = 600;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.4);
    g.gain.linearRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
}
function stopAmbient() {
  if (amb) amb.stop();
  amb = null;
  clearInterval(musicTimer); musicTimer = null;
}

// 无声 WAV（0.5 秒），老款 iPhone 用它把网页切到“媒体播放”模式，避免被静音开关静音
function silentWav() {
  const n = 4000, b = new ArrayBuffer(44 + n), v = new DataView(b);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
  w(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
  return URL.createObjectURL(new Blob([b], { type: 'audio/wav' }));
}

export const sfx = {
  unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 不支持 */ }
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = enabled ? 0.6 : 0;
      master.connect(ctx.destination);
      sfxBus = ctx.createGain(); sfxBus.connect(master);
      musicBus = ctx.createGain(); musicBus.gain.value = 0.8; musicBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      shaper = ctx.createWaveShaper();
      const c = new Float32Array(256);
      for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 2.5); }
      shaper.curve = c;
      if (!navigator.audioSession) {
        silentEl = new Audio(silentWav());
        silentEl.loop = true;
        silentEl.setAttribute('playsinline', '');
      }
      if (ambMode) setTimeout(() => startAmbient(ambMode), 50);
    }
    if (silentEl && silentEl.paused) silentEl.play().catch(() => {});
    if (ctx.state !== 'running') {
      ctx.resume().then(() => { if (ambMode && !musicTimer) startAmbient(ambMode); }).catch(() => {});
    }
    // 播一个空声音，iPhone 才算真正“解锁”
    const b = ctx.createBufferSource(); b.buffer = ctx.createBuffer(1, 1, 22050); b.connect(ctx.destination); b.start(0);
  },
  setEnabled(v) {
    enabled = v;
    if (master) master.gain.value = v ? 0.6 : 0;
  },
  // 背景氛围：'base' 据点 / 'battle' 割草 / 'night' 剧情和夜袭 / null 关掉
  ambient(mode) {
    if (mode === ambMode && musicTimer) return;
    ambMode = mode;
    if (ctx && ctx.state === 'running') startAmbient(mode);
  },
  // 测试用：当前状态 + 输出音量（0 = 完全没声音）
  debug() {
    if (!ctx) return { state: 'none' };
    if (!this._an) { this._an = ctx.createAnalyser(); this._an.fftSize = 2048; master.connect(this._an); }
    const d = new Float32Array(2048); this._an.getFloatTimeDomainData(d);
    return { state: ctx.state, ambient: ambMode, music: !!musicTimer, rms: Math.sqrt(d.reduce((m, x) => m + x * x, 0) / d.length) };
  },
  // vol：0~1 的音量系数（比如远处的丧尸吼叫小声一点）
  play(name, vol = 1) {
    if (!enabled || !ctx || ctx.state !== 'running' || !DEF[name]) return;
    const t = ctx.currentTime;
    if (last[name] !== undefined && t - last[name] < (GAP[name] || 0)) return;
    last[name] = t;
    if (vol !== 1) { const prev = sfxBus; const g = ctx.createGain(); g.gain.value = vol; g.connect(prev); sfxBus = g; try { DEF[name](t); } finally { sfxBus = prev; } return; }
    DEF[name](t);
  },
};

// 解锁：iPhone 只认“手指抬起 / 点击 / 按键”
for (const ev of ['touchend', 'click', 'keydown', 'pointerup']) document.addEventListener(ev, () => sfx.unlock(), { passive: true });
// 切到后台时暂停（省电），回来后下一次触摸自动恢复
document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) { ctx.suspend().catch(() => {}); if (silentEl) silentEl.pause(); }
  else ctx.resume().catch(() => {});
});

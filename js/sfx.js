// 音效：全部用代码合成，不需要音频文件
// iPhone 要求必须在用户第一次点击后才能发声，所以要先调用 unlock()

let ctx = null, master = null, noiseBuf = null, enabled = true;
const last = {};

// 同一种音效的最短间隔（秒），防止射速快时声音糊成一片
const GAP = { shot: 0.07, smg: 0.06, shotgun: 0.1, rifle: 0.1, hit: 0.04, kill: 0.05, gem: 0.05, coin: 0.06, hurt: 0.2, fire: 0.3 };

function tone(type, f0, f1, dur, vol, t, delay = 0) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  const s = t + delay;
  o.type = type;
  o.frequency.setValueAtTime(f0, s);
  o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), s + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.setValueAtTime(vol, s);
  g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(s + dur + 0.02);
}

function noise(dur, vol, t, freq = 1500) {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf;
  f.type = 'lowpass';
  f.frequency.value = freq;
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
}

const DEF = {
  shot: t => { tone('square', 700, 220, 0.06, 0.08, t); noise(0.05, 0.12, t, 2500); },
  smg: t => { tone('square', 900, 300, 0.04, 0.05, t); noise(0.04, 0.08, t, 3000); },
  shotgun: t => { noise(0.18, 0.35, t, 1000); tone('sine', 120, 50, 0.15, 0.2, t); },
  rifle: t => { noise(0.22, 0.3, t, 1800); tone('sawtooth', 300, 60, 0.2, 0.12, t); },
  hit: t => tone('triangle', 220, 120, 0.05, 0.06, t),
  kill: t => noise(0.09, 0.12, t, 700),
  gem: t => tone('sine', 1000, 1500, 0.06, 0.06, t),
  coin: t => { tone('triangle', 800, 800, 0.05, 0.1, t); tone('triangle', 1200, 1200, 0.08, 0.1, t, 0.05); },
  hurt: t => tone('sawtooth', 180, 70, 0.18, 0.2, t),
  level: t => [523, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.12, 0.15, t, i * 0.07)),
  rescue: t => [392, 523, 659].forEach((f, i) => tone('sine', f, f, 0.18, 0.18, t, i * 0.1)),
  boss: t => { tone('sawtooth', 90, 40, 1.2, 0.3, t); noise(1.0, 0.2, t, 300); },
  boom: t => { noise(0.6, 0.45, t, 600); tone('sine', 100, 30, 0.5, 0.3, t); },
  fire: t => noise(0.35, 0.2, t, 800),
  build: t => { tone('square', 300, 300, 0.06, 0.08, t); tone('square', 450, 450, 0.08, 0.08, t, 0.08); tone('triangle', 900, 900, 0.15, 0.1, t, 0.16); },
  click: t => tone('sine', 700, 700, 0.04, 0.06, t),
  win: t => [523, 659, 784, 659, 784, 1046].forEach((f, i) => tone('triangle', f, f, 0.16, 0.15, t, i * 0.12)),
  lose: t => [392, 330, 262, 196].forEach((f, i) => tone('triangle', f, f, 0.25, 0.15, t, i * 0.18)),
};

export const sfx = {
  unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  },
  setEnabled(v) { enabled = v; },
  play(name) {
    if (!enabled || !ctx || ctx.state !== 'running' || !DEF[name]) return;
    const t = ctx.currentTime;
    if (last[name] !== undefined && t - last[name] < (GAP[name] || 0)) return;
    last[name] = t;
    DEF[name](t);
  },
};

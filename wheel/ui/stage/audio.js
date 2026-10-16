// 音效（E.1）：Web Audio 即時合成 tick、fanfare、鼓聲，零音檔。
// getSound() 回傳 settings.sound：{ enabled, tick, fanfare, drumroll }（0–1）

export function createAudio(getSound) {
  let ac = null;
  let drum = null;
  let lastTick = 0;

  function ctx() {
    if (ac) return ac;
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) return null;
    try { ac = new AC(); } catch { ac = null; }
    return ac;
  }
  const cfg = () => getSound() || { enabled: false };
  const on = () => !!cfg().enabled;

  function tone(freq, start, dur, vol, type = 'triangle') {
    const c = ctx(); if (!c) return;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), start + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(c.destination);
    o.start(start); o.stop(start + dur + 0.05);
  }

  let noiseBuf = null;
  function noise(start, dur, vol, freq = 1800) {
    const c = ctx(); if (!c) return;
    if (!noiseBuf) {
      noiseBuf = c.createBuffer(1, c.sampleRate * 0.5, c.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    const s = c.createBufferSource(); s.buffer = noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(Math.max(0.0002, vol), start);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f).connect(g).connect(c.destination);
    s.start(start, Math.random() * 0.3, dur + 0.02);
  }

  return {
    /** 首次互動時呼叫（C.7-19） */
    unlock() { const c = ctx(); if (c && c.state === 'suspended') c.resume().catch(() => {}); },
    blocked() { return on() && (!ac || ac.state !== 'running'); },
    tick() {
      if (!on()) return;
      const c = ctx(); if (!c || c.state !== 'running') return;
      const now = c.currentTime;
      if (now - lastTick < 0.03) return;
      lastTick = now;
      tone(1700, now, 0.035, 0.25 * (cfg().tick ?? 0.6), 'square');
    },
    flip() {
      if (!on()) return;
      const c = ctx(); if (!c) return;
      noise(c.currentTime, 0.16, 0.25 * (cfg().fanfare ?? 0.8), 900);
    },
    fanfare(short = false) {
      if (!on()) return;
      const c = ctx(); if (!c) return;
      const v = 0.22 * (cfg().fanfare ?? 0.8);
      const t0 = c.currentTime + 0.02;
      const notes = short ? [659.25, 987.77] : [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((f, i) => tone(f, t0 + i * 0.11, 0.22, v));
      const end = t0 + notes.length * 0.11;
      const chord = short ? [987.77, 1318.5] : [523.25, 659.25, 783.99, 1046.5];
      chord.forEach(f => tone(f, end, short ? 0.35 : 0.9, v * 0.7));
    },
    drumStart() {
      if (!on() || drum) return;
      const c = ctx(); if (!c) return;
      const v = 0.35 * (cfg().drumroll ?? 0.7);
      let n = 0;
      const hit = () => { if (!c) return; noise(c.currentTime, 0.07, v * (0.6 + 0.4 * Math.random()), 220); n++; };
      hit();
      drum = setInterval(hit, 65);
    },
    drumStop() { if (drum) { clearInterval(drum); drum = null; } },
    destroy() { this.drumStop(); if (ac) { try { ac.close(); } catch { /* */ } ac = null; } },
  };
}

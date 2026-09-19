/* 효과음 (Web Audio로 합성, 파일 없음).
   각 등급 소리의 시작 시각은 effects.js의 연출 타이밍에 맞춰 두었다. 타이밍을 바꾸면 여기 t 값도 같이 바꾼다. */
(function (TG) {
  'use strict';
  let ac = null, out = null, muted = false;
  const N = n => 440 * Math.pow(2, (n - 69) / 12);

  function ctx() {
    if (muted) return null;
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ac = new AC(); } catch { return null; }
      out = ac.createGain(); out.gain.value = 0.6;
      const comp = ac.createDynamicsCompressor();
      out.connect(comp); comp.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, o = {}) {
    const a = ctx(); if (!a) return;
    const { t = 0, dur = 0.3, type = 'sine', vol = 0.1, to = null, attack = 0.006, detune = 0, lp = null } = o;
    const s = a.currentTime + t;
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = type; osc.detune.value = detune;
    osc.frequency.setValueAtTime(freq, s);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, s + dur);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(vol, s + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    let node = osc;
    if (lp) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; osc.connect(f); node = f; }
    node.connect(g); g.connect(out);
    osc.start(s); osc.stop(s + dur + 0.05);
  }
  function noise(o = {}) {
    const a = ctx(); if (!a) return;
    const { t = 0, dur = 0.3, vol = 0.1, freq = 1000, to = null, kind = 'lowpass', attack = 0.004 } = o;
    const s = a.currentTime + t;
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = kind; f.frequency.setValueAtTime(freq, s);
    if (to) f.frequency.exponentialRampToValueAtTime(to, s + dur);
    const g = a.createGain();
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(vol, s + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(s); src.stop(s + dur + 0.05);
  }
  // 배음을 섞은 종소리
  function bell(f, o = {}) {
    const dur = o.dur || 1.6, vol = o.vol || 0.06, t = o.t || 0;
    tone(f, { t, dur, vol });
    tone(f * 2.76, { t, dur: dur * 0.55, vol: vol * 0.32 });
    tone(f * 5.4, { t, dur: dur * 0.3, vol: vol * 0.12 });
  }
  const chord = (notes, o) => notes.forEach(n => tone(N(n), o));

  TG.audio = {
    setMuted(v) { muted = v; },
    unlock() { ctx(); },

    lever() { noise({ dur: 0.12, vol: 0.2, freq: 900 }); tone(120, { dur: 0.18, type: 'triangle', vol: 0.2, to: 55 }); },
    tick() { tone(1500, { dur: 0.02, type: 'square', vol: 0.016, lp: 3000 }); },
    land() { tone(95, { dur: 0.22, vol: 0.26, to: 48 }); noise({ dur: 0.06, vol: 0.07, freq: 500 }); },

    /* 기본 · 커먼 · 언커먼: 짧고 작게 */
    basic() { tone(N(84), { dur: 0.35, vol: 0.03 }); },
    common() { bell(N(91), { vol: 0.045, dur: 1.1 }); tone(N(98), { t: 0.07, dur: 0.9, vol: 0.02 }); },
    uncommon() {
      bell(N(86), { vol: 0.05, dur: 1.3 }); bell(N(93), { t: 0.09, vol: 0.035, dur: 1.2 });
      noise({ dur: 0.8, vol: 0.02, freq: 2600, kind: 'bandpass', attack: 0.3 });
    },

    /* 레어: 어두워짐(0) → 선(0.64) → 이름 가르기(0.64~1.12) → 원(1.12) */
    rare() {
      noise({ t: 0.64, dur: 0.5, vol: 0.05, freq: 3000, to: 9000, kind: 'bandpass', attack: 0.35 });
      bell(N(95), { t: 1.12, vol: 0.06, dur: 2 });
      bell(N(102), { t: 1.18, vol: 0.03, dur: 1.8 });
      tone(N(55), { t: 1.12, dur: 2, vol: 0.045, attack: 0.05 });
    },

    /* 에픽: 정적(0~0.22) → 빛 모임(0.6) → 이름 · 문양(1.42) → 빛 쓸기(2.57) → 수렴(3.47) */
    epic() {
      chord([50, 57, 62], { t: 0.55, dur: 2.6, type: 'sawtooth', vol: 0.02, attack: 1.0, lp: 800 });
      bell(N(86), { t: 1.42, vol: 0.06, dur: 2.4 });
      bell(N(93), { t: 1.5, vol: 0.04, dur: 2.2 });
      noise({ t: 2.57, dur: 0.9, vol: 0.03, freq: 4000, to: 1500, kind: 'bandpass', attack: 0.3 });
      tone(N(98), { t: 3.47, dur: 1.2, vol: 0.03 });
    },

    /* 레전더리: 암전(0) → 낮은 빛(0.38) → 심장(0.9, heart) → 선(1.36) → 이름(1.88) → 빛의 선(3.38) → 강조(3.9) */
    legendary() {
      tone(42, { dur: 1.8, vol: 0.42, to: 28 }); noise({ dur: 0.9, vol: 0.1, freq: 260 });
      noise({ t: 1.36, dur: 0.8, vol: 0.03, freq: 1800, to: 5000, kind: 'bandpass', attack: 0.4 });
      chord([45, 52, 57, 61, 64], { t: 1.8, dur: 3.2, type: 'sawtooth', vol: 0.017, attack: 1.3, lp: 1300 });
      noise({ t: 3.38, dur: 0.6, vol: 0.06, freq: 6000, to: 2000, kind: 'bandpass', attack: 0.05 });
      bell(N(93), { t: 3.9, vol: 0.07, dur: 2.4 });
      bell(N(100), { t: 3.96, vol: 0.04, dur: 2.2 });
    },
    heart() { tone(58, { dur: 0.2, vol: 0.5, to: 38 }); tone(52, { t: 0.22, dur: 0.24, vol: 0.36, to: 36 }); },

    /* 신화 */
    mythicDrone(d) { tone(55, { dur: d, vol: 0.1, attack: d * 0.5 }); tone(82.4, { dur: d, vol: 0.035, attack: d * 0.6 }); noise({ dur: d, vol: 0.03, freq: 180, attack: d * 0.6 }); },
    // 검정/하양이 부딪칠수록 커지다가, 정점에서 한 번에 끊긴다
    mythicMembrane(d) {
      noise({ dur: d, vol: 0.1, freq: 300, to: 2400, kind: 'bandpass', attack: d * 0.9 });
      tone(110, { dur: d, vol: 0.05, attack: d * 0.85 }); tone(113, { dur: d, vol: 0.05, attack: d * 0.85 });
    },
    mythicSlash() { noise({ dur: 0.16, vol: 0.32, freq: 6500, kind: 'highpass', attack: 0.002 }); tone(3520, { t: 0.02, dur: 1.6, vol: 0.03 }); tone(46, { dur: 0.6, vol: 0.36, to: 30 }); },
    mythicShards() {
      for (let i = 0; i < 6; i++) tone(2200 + Math.random() * 3200, { t: 0.05 + i * 0.08 + Math.random() * 0.05, dur: 0.3, vol: 0.018 });
      noise({ dur: 1.2, vol: 0.035, freq: 1200, to: 300, kind: 'bandpass', attack: 0.05 });
    },
    mythicCard() { noise({ dur: 1.1, vol: 0.045, freq: 700, to: 250, kind: 'bandpass', attack: 0.6 }); },
    mythicName() { tone(65.4, { dur: 4, vol: 0.15, attack: 0.03 }); tone(130.8, { dur: 3.2, vol: 0.055, attack: 0.03 }); tone(196, { dur: 2.6, vol: 0.028, attack: 0.05 }); },
    mythicStar() { tone(N(100), { dur: 2.4, vol: 0.03, attack: 0.4 }); },
  };
})(window.TG = window.TG || {});

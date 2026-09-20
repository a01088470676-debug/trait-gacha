/* 효과음 (Web Audio로 합성, 파일 없음).
   단순한 소리만 쓴다: 사인/삼각/사각 음과 잡음 한두 겹. 잔향(리버브)은 쓰지 않는다.
   소리는 미리 예약해 두기 때문에, 끄거나 연출이 끝날 때 예약된 것까지 꺼야 한다 (fadeOut/stopAll).
   각 등급 소리의 시작 시각은 effects.js의 연출 타이밍에 맞춰 두었다. 타이밍을 바꾸면 여기 t 값도 같이 바꾼다. */
(function (TG) {
  'use strict';
  let ac = null, out = null, muted = false;
  const live = new Set();
  const N = n => 440 * Math.pow(2, (n - 69) / 12);

  function ctx() {
    if (muted) return null;
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ac = new AC(); } catch { return null; }
      out = ac.createGain(); out.gain.value = 0.55;
      const comp = ac.createDynamicsCompressor();
      out.connect(comp); comp.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function track(node, g) {
    const e = { node, g };
    live.add(e);
    node.addEventListener('ended', () => live.delete(e), { once: true });
  }
  // 예약해 둔 소리를 ms 동안 줄여서 끈다 (특성이 나오면 fadeOut, 소리 끄기·건너뛰기는 stopAll)
  function fadeOut(ms) {
    if (!ac) return;
    const now = ac.currentTime, t = Math.max(0.05, ms / 1000);
    live.forEach(e => {
      try {
        e.g.gain.cancelScheduledValues(now);
        e.g.gain.setValueAtTime(Math.max(0.0001, e.g.gain.value), now);
        e.g.gain.exponentialRampToValueAtTime(0.0001, now + t);
        e.node.stop(now + t + 0.05);      // 아직 시작 전인 소리는 아예 울리지 않는다
      } catch {}
    });
    live.clear();
  }
  const stopAll = () => fadeOut(120);

  function tone(freq, o = {}) {
    const a = ctx(); if (!a) return;
    const { t = 0, dur = 0.3, type = 'sine', vol = 0.1, to = null, attack = 0.006, lp = null } = o;
    const s = a.currentTime + t;
    const osc = a.createOscillator(), g = a.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, s);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, s + dur);
    g.gain.setValueAtTime(0.0001, s);
    g.gain.exponentialRampToValueAtTime(vol, s + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
    let node = osc;
    if (lp) { const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; osc.connect(f); node = f; }
    node.connect(g); g.connect(out);
    osc.start(s); osc.stop(s + dur + 0.05);
    track(osc, g);
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
    track(src, g);
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
    setMuted(v) { muted = v; if (v) stopAll(); },
    stopAll, fadeOut,
    get liveCount() { return live.size; },      // 예약돼 아직 울릴 소리의 개수 (확인용)
    unlock() { ctx(); },

    lever() { noise({ dur: 0.12, vol: 0.2, freq: 900 }); tone(120, { dur: 0.18, type: 'triangle', vol: 0.2, to: 55 }); },
    tick() { tone(1500, { dur: 0.02, type: 'square', vol: 0.016, lp: 3000 }); },
    land() { tone(95, { dur: 0.22, vol: 0.26, to: 48 }); noise({ dur: 0.06, vol: 0.07, freq: 500 }); },

    /* 커먼: 작은 별들이 도는 반짝임 */
    common() { [96, 100, 103, 108].forEach((n, i) => tone(N(n), { t: i * 0.11, dur: 0.7, vol: 0.022 })); },

    /* 흰 별이 turns바퀴 도는 동안: 차오르는 소리 + 한 바퀴마다 높아지는 종소리 */
    summon(turns, d) {
      tone(N(60), { dur: d, vol: 0.03, to: N(72), attack: d * 0.7 });
      noise({ dur: d, vol: 0.025, freq: 500, to: 3000, kind: 'bandpass', attack: d * 0.8 });
      for (let k = 1; k <= turns; k++) bell(N(79 + k * 2), { t: d * k / turns - 0.05, vol: 0.03, dur: 0.9 });
    },
    // 언커먼 반짝
    uncommonTwinkle() {
      bell(N(96), { vol: 0.05, dur: 1.2 }); tone(N(103), { t: 0.05, dur: 0.8, vol: 0.025 });
      noise({ dur: 0.35, vol: 0.02, freq: 7000, kind: 'highpass', attack: 0.01 });
    },
    // 레어: 별이 부서짐 → 한 글자씩 써짐
    rareShatter() {
      for (let i = 0; i < 7; i++) tone(2500 + Math.random() * 3000, { t: i * 0.05 + Math.random() * 0.04, dur: 0.35, vol: 0.022 });
      noise({ dur: 0.5, vol: 0.06, freq: 4000, to: 1500, kind: 'bandpass', attack: 0.005 });
      tone(90, { dur: 0.3, vol: 0.18, to: 50 });
    },
    rareWrite(chars, step) {
      for (let i = 0; i < chars; i++) noise({ t: i * step, dur: 0.22, vol: 0.02, freq: 3500, to: 1800, kind: 'bandpass', attack: 0.04 });
      bell(N(91), { t: chars * step + 0.3, vol: 0.05, dur: 1.8 });
    },
    // 에픽: 점점 빨라지는 회전 → 흰 화면
    epicSpin(d) {
      tone(110, { dur: d, type: 'sawtooth', vol: 0.03, to: 880, attack: d * 0.9, lp: 1800 });
      noise({ dur: d, vol: 0.05, freq: 600, to: 6000, kind: 'bandpass', attack: d * 0.9 });
    },
    epicWhite() {
      tone(55, { dur: 1.4, vol: 0.3, to: 38 });
      chord([72, 76, 79, 84], { t: 0.05, dur: 2.6, type: 'triangle', vol: 0.03, attack: 0.08 });
      bell(N(96), { t: 0.4, vol: 0.04, dur: 2 });
    },
    // 레전더리: 금이 가는 소리 → 깨짐 → 파편이 돎
    legendCrack(d) {
      for (let i = 0; i < 10; i++) { const t = d * (1 - Math.pow(1 - i / 10, 1.8)); noise({ t, dur: 0.05, vol: 0.05 + i * 0.006, freq: 5000, kind: 'highpass' }); }
      tone(70, { dur: d, vol: 0.06, to: 110, attack: d * 0.8 });
    },
    legendBreak() {
      tone(48, { dur: 1.2, vol: 0.4, to: 30 }); noise({ dur: 0.9, vol: 0.14, freq: 1200, to: 200 });
      for (let i = 0; i < 6; i++) tone(2000 + Math.random() * 2500, { t: 0.03 + i * 0.06, dur: 0.4, vol: 0.02 });
      chord([79, 84, 88, 91], { t: 0.35, dur: 2.6, type: 'triangle', vol: 0.03, attack: 0.05 });
    },
    legendOrbit() { bell(N(100), { vol: 0.035, dur: 2 }); },

    /* 신화 */
    mythicQuestion(i) { tone(N(64 - i), { dur: 0.45, type: 'triangle', vol: 0.03 }); noise({ dur: 0.1, vol: 0.03, freq: 2500, kind: 'bandpass' }); },
    mythicGlitch(d) {
      const n = Math.max(6, Math.round(d * 12));
      for (let i = 0; i < n; i++) {
        const t = i * d / n;
        noise({ t, dur: 0.05, vol: 0.18, freq: 1500 + Math.random() * 6000, kind: 'bandpass' });
        tone(120 + Math.random() * 1800, { t, dur: 0.05, type: 'square', vol: 0.05 });
      }
      tone(40, { dur: d, vol: 0.28, to: 26 });
    },
    mythicFlick(i, fast) { tone(fast ? 2400 : 900, { dur: 0.04, type: 'square', vol: 0.06 }); if (i % 2 === 0) tone(60, { dur: 0.18, vol: 0.12, to: 40 }); },
    mythicEye(d) {
      tone(55, { dur: d + 1, vol: 0.09, attack: d * 0.6 });
      tone(82.4, { dur: d + 1, vol: 0.03, attack: d * 0.6 });
      noise({ dur: d, vol: 0.04, freq: 300, to: 1200, kind: 'bandpass', attack: d * 0.7 });
      bell(N(79), { t: d * 0.75, vol: 0.03, dur: 2 });
    },
    mythicCut(i) {
      noise({ dur: 0.14, vol: 0.28, freq: 6500, kind: 'highpass', attack: 0.002 });
      tone(3000 + Math.random() * 1200, { t: 0.01, dur: 1, vol: 0.025 });
      if (i === 0) tone(46, { dur: 0.6, vol: 0.32, to: 30 });
    },
    mythicFall() {
      for (let i = 0; i < 8; i++) noise({ t: 0.1 + Math.random() * 1, dur: 0.12, vol: 0.05, freq: 1800 + Math.random() * 2500, kind: 'bandpass' });
      noise({ dur: 1.4, vol: 0.06, freq: 900, to: 150, kind: 'bandpass', attack: 0.1 });
      tone(38, { dur: 1.6, vol: 0.26, to: 24 });
    },
    mythicName() {
      tone(65.4, { dur: 3.4, vol: 0.15, attack: 0.03 });
      tone(130.8, { dur: 2.8, vol: 0.055, attack: 0.03 });
      tone(196, { dur: 2.4, vol: 0.028, attack: 0.05 });
      bell(N(91), { t: 0.12, vol: 0.035, dur: 2 });
    },
  };
})(window.TG = window.TG || {});

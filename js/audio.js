/* 효과음 (Web Audio로 합성, 파일 없음).
   소리는 세 겹으로 쌓는다: 낮은 몸통(sub) + 가운데 화음(pad/bell) + 위쪽 반짝임(arp/noise).
   공간감은 피드백 딜레이로 만든 잔향 버스(send)로 낸다.
   각 등급 소리의 시작 시각은 effects.js의 연출 타이밍에 맞춰 두었다. 타이밍을 바꾸면 여기 t 값도 같이 바꾼다. */
(function (TG) {
  'use strict';
  let ac = null, dry = null, wet = null, rev = null, muted = false;
  const REV_GAIN = 0.4;
  // 소리는 미리 예약해 두기 때문에, 끄거나 연출이 끝날 때 예약된 것까지 꺼야 한다
  const live = new Set();
  const N = n => 440 * Math.pow(2, (n - 69) / 12);

  function ctx() {
    if (muted) return null;
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ac = new AC(); } catch { return null; }
      const master = ac.createGain(); master.gain.value = 0.6;
      const comp = ac.createDynamicsCompressor();
      master.connect(comp); comp.connect(ac.destination);
      dry = ac.createGain(); dry.gain.value = 1; dry.connect(master);
      // 잔향: 짧은 딜레이 두 개를 되먹여 공간감만 살짝 준다
      wet = ac.createGain(); wet.gain.value = 1;
      // 딜레이 두 줄을 각각 따로 되먹인다. (예전처럼 하나의 되먹임을 두 줄에 함께 주면
      //  한 바퀴 이득이 0.8을 넘어 소리가 몇 초씩 계속 울렸다)
      const d1 = ac.createDelay(1), d2 = ac.createDelay(1), f1 = ac.createGain(), f2 = ac.createGain(), lp = ac.createBiquadFilter();
      rev = ac.createGain();
      d1.delayTime.value = 0.13; d2.delayTime.value = 0.21;
      f1.gain.value = 0.22; f2.gain.value = 0.18;
      lp.type = 'lowpass'; lp.frequency.value = 3200; rev.gain.value = REV_GAIN;
      wet.connect(d1); wet.connect(d2);
      d1.connect(f1); f1.connect(d1);
      d2.connect(f2); f2.connect(d2);
      d1.connect(lp); d2.connect(lp);
      lp.connect(rev); rev.connect(master);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  // send: 0~1, 잔향으로 보내는 양
  function out(node, send) {
    node.connect(dry);
    if (send && wet) { const g = ac.createGain(); g.gain.value = send; node.connect(g); g.connect(wet); }
  }
  // 예약해 둔 소리와 잔향 꼬리를 ms 동안 줄여서 끈다
  // (특성이 나오면 fadeOut으로 자연스럽게, 소리 끄기·건너뛰기는 stopAll로 즉시)
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
    if (rev) {
      try {
        rev.gain.cancelScheduledValues(now);
        rev.gain.setValueAtTime(Math.max(0.0001, rev.gain.value), now);
        rev.gain.exponentialRampToValueAtTime(0.0001, now + t);
        rev.gain.setValueAtTime(REV_GAIN, now + t + 0.25);
      } catch {}
    }
  }
  const stopAll = () => fadeOut(120);
  function track(node, g) {
    const e = { node, g };
    live.add(e);
    node.addEventListener('ended', () => live.delete(e), { once: true });
  }
  function tone(freq, o = {}) {
    const a = ctx(); if (!a) return;
    const { t = 0, dur = 0.3, type = 'sine', vol = 0.1, to = null, attack = 0.006, detune = 0, lp = null, send = 0.25 } = o;
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
    node.connect(g); out(g, send);
    osc.start(s); osc.stop(s + dur + 0.05);
    track(osc, g);
  }
  function noise(o = {}) {
    const a = ctx(); if (!a) return;
    const { t = 0, dur = 0.3, vol = 0.1, freq = 1000, to = null, kind = 'lowpass', attack = 0.004, send = 0.2 } = o;
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
    src.connect(f); f.connect(g); out(g, send);
    src.start(s); src.stop(s + dur + 0.05);
    track(src, g);
  }
  // 배음을 섞은 종소리
  function bell(f, o = {}) {
    const dur = o.dur || 1.6, vol = o.vol || 0.06, t = o.t || 0, send = o.send == null ? 0.45 : o.send;
    tone(f, { t, dur, vol, send });
    tone(f * 2.76, { t, dur: dur * 0.55, vol: vol * 0.32, send });
    tone(f * 5.4, { t, dur: dur * 0.3, vol: vol * 0.12, send });
  }
  // 살짝 어긋난 두 겹으로 두께를 주는 화음
  function pad(notes, o = {}) {
    notes.forEach(n => {
      tone(N(n), Object.assign({ detune: -7 }, o));
      tone(N(n), Object.assign({ detune: 7 }, o, { vol: (o.vol || 0.02) * 0.8 }));
    });
  }
  const arp = (notes, o = {}) => notes.forEach((n, i) => bell(N(n), Object.assign({}, o, { t: (o.t || 0) + i * (o.step || 0.08) })));
  const sub = (f, o = {}) => tone(f, Object.assign({ dur: 1.4, vol: 0.4, send: 0.1 }, o));

  TG.audio = {
    setMuted(v) { muted = v; if (v) stopAll(); },
    stopAll, fadeOut,
    get liveCount() { return live.size; },      // 예약돼 아직 울릴 소리의 개수 (확인용)
    unlock() { ctx(); },

    lever() { noise({ dur: 0.12, vol: 0.2, freq: 900 }); tone(120, { dur: 0.18, type: 'triangle', vol: 0.2, to: 55 }); },
    tick() { tone(1500, { dur: 0.02, type: 'square', vol: 0.016, lp: 3000, send: 0.05 }); },
    land() { tone(95, { dur: 0.22, vol: 0.26, to: 48, send: 0.15 }); noise({ dur: 0.06, vol: 0.07, freq: 500 }); },

    /* 커먼: 작은 별들이 도는 반짝임 */
    common() {
      arp([96, 100, 103, 108], { step: 0.11, vol: 0.022, dur: 1.1 });
      pad([60, 67], { dur: 1.6, type: 'triangle', vol: 0.012, attack: 0.5, send: 0.5 });
    },

    /* 흰 별이 turns바퀴 도는 동안: 차오르는 소리 + 한 바퀴마다 높아지는 종 + 낮은 지속음 */
    summon(turns, d) {
      tone(N(60), { dur: d, vol: 0.03, to: N(72), attack: d * 0.7, send: 0.4 });
      pad([36, 48], { dur: d + 0.4, type: 'sawtooth', vol: 0.012, attack: d * 0.6, lp: 700, send: 0.3 });
      noise({ dur: d, vol: 0.025, freq: 500, to: 3000, kind: 'bandpass', attack: d * 0.8, send: 0.4 });
      for (let k = 1; k <= turns; k++) bell(N(79 + k * 2), { t: d * k / turns - 0.05, vol: 0.03, dur: 0.9 });
    },
    // 언커먼: 반짝 + 맑은 화음
    uncommonTwinkle() {
      bell(N(96), { vol: 0.05, dur: 1.4 }); bell(N(100), { t: 0.06, vol: 0.035, dur: 1.2 });
      arp([103, 108, 112], { t: 0.12, step: 0.07, vol: 0.02, dur: 0.8 });
      pad([57, 64, 69], { t: 0.05, dur: 2.4, type: 'triangle', vol: 0.016, attack: 0.5, send: 0.6 });
      noise({ dur: 0.35, vol: 0.02, freq: 7000, kind: 'highpass', attack: 0.01 });
    },
    // 레어: 유리 깨짐 + 차가운 현 + 한 글자씩 써지는 소리
    rareShatter() {
      for (let i = 0; i < 9; i++) bell(2200 + Math.random() * 3200, { t: i * 0.045 + Math.random() * 0.04, dur: 0.5, vol: 0.016, send: 0.6 });
      noise({ dur: 0.5, vol: 0.06, freq: 4000, to: 1500, kind: 'bandpass', attack: 0.005 });
      sub(90, { dur: 0.4, vol: 0.2, to: 50 });
      pad([52, 59, 64, 71], { t: 0.1, dur: 3, type: 'sawtooth', vol: 0.013, attack: 1.1, lp: 1400, send: 0.6 });
    },
    rareWrite(chars, step) {
      for (let i = 0; i < chars; i++) {
        noise({ t: i * step, dur: 0.22, vol: 0.02, freq: 3500, to: 1800, kind: 'bandpass', attack: 0.04 });
        tone(N(88 + (i % 3) * 3), { t: i * step, dur: 0.5, vol: 0.016, type: 'triangle', send: 0.5 });
      }
      bell(N(91), { t: chars * step + 0.3, vol: 0.05, dur: 2 });
      bell(N(98), { t: chars * step + 0.36, vol: 0.03, dur: 1.8 });
    },
    // 에픽: 점점 빨라지는 회전 → 흰 화면에서 터지는 합창풍 화음
    epicSpin(d) {
      tone(110, { dur: d, type: 'sawtooth', vol: 0.03, to: 880, attack: d * 0.9, lp: 1800, send: 0.4 });
      noise({ dur: d, vol: 0.05, freq: 600, to: 6000, kind: 'bandpass', attack: d * 0.9, send: 0.4 });
      for (let i = 0; i < 5; i++) tone(N(72 + i * 2), { t: d * (i / 5), dur: 0.3, vol: 0.02, type: 'triangle', send: 0.5 });
    },
    epicWhite() {
      sub(55, { dur: 1.6, vol: 0.32, to: 38 });
      pad([60, 64, 67, 72, 76], { t: 0.04, dur: 3.2, type: 'sawtooth', vol: 0.016, attack: 0.1, lp: 2400, send: 0.7 });
      arp([84, 88, 91, 96], { t: 0.18, step: 0.09, vol: 0.035, dur: 2.2 });
      noise({ t: 0.02, dur: 1.4, vol: 0.05, freq: 8000, to: 2000, kind: 'bandpass', attack: 0.02, send: 0.6 });
    },
    // 레전더리: 금이 가는 소리 → 깨짐 → 팡파르 → 파편이 도는 여운
    legendCrack(d) {
      for (let i = 0; i < 12; i++) { const t = d * (1 - Math.pow(1 - i / 12, 1.8)); noise({ t, dur: 0.05, vol: 0.05 + i * 0.005, freq: 5000, kind: 'highpass' }); }
      tone(70, { dur: d, vol: 0.06, to: 110, attack: d * 0.8, send: 0.3 });
      pad([40, 47], { dur: d + 0.5, type: 'sawtooth', vol: 0.014, attack: d * 0.7, lp: 900, send: 0.4 });
    },
    legendBreak() {
      sub(48, { dur: 1.6, vol: 0.42, to: 30 });
      noise({ dur: 0.9, vol: 0.14, freq: 1200, to: 200 });
      for (let i = 0; i < 8; i++) bell(1800 + Math.random() * 2600, { t: 0.03 + i * 0.055, dur: 0.6, vol: 0.016, send: 0.6 });
      pad([43, 50, 55, 59, 62], { t: 0.25, dur: 3.4, type: 'sawtooth', vol: 0.02, attack: 0.15, lp: 2000, send: 0.6 });
      arp([79, 84, 88, 91], { t: 0.3, step: 0.1, vol: 0.035, dur: 2.4 });
    },
    legendOrbit() { bell(N(100), { vol: 0.035, dur: 2.4 }); bell(N(107), { t: 0.12, vol: 0.02, dur: 2 }); },

    /* ---------- 신화 ---------- */
    // 물음표가 하나씩 늘어날 때
    mythicQuestion(i) { tone(N(64 - i), { dur: 0.5, type: 'triangle', vol: 0.03, send: 0.6 }); noise({ dur: 0.1, vol: 0.03, freq: 2500, kind: 'bandpass' }); },
    // 글리치
    mythicGlitch(d) {
      const n = Math.max(6, Math.round(d * 12));
      for (let i = 0; i < n; i++) {
        const t = i * d / n;
        noise({ t, dur: 0.05, vol: 0.18, freq: 1500 + Math.random() * 6000, kind: 'bandpass', send: 0.1 });
        tone(120 + Math.random() * 1800, { t, dur: 0.05, type: 'square', vol: 0.05, send: 0.1 });
      }
      sub(40, { dur: d, vol: 0.3, to: 26 });
    },
    // 검정/하양이 번갈아 바뀔 때: 바뀔 때마다 한 번씩
    mythicFlick(i, fast) { tone(fast ? 2400 : 900, { dur: 0.04, type: 'square', vol: 0.06, send: 0.1 }); if (i % 2 === 0) sub(60, { dur: 0.18, vol: 0.12, to: 40 }); },
    // 눈이 떠질 때
    mythicEye(d) {
      pad([31, 38, 43], { dur: d + 1.5, type: 'sawtooth', vol: 0.022, attack: d * 0.6, lp: 600, send: 0.5 });
      noise({ dur: d, vol: 0.05, freq: 300, to: 1200, kind: 'bandpass', attack: d * 0.7, send: 0.5 });
      bell(N(79), { t: d * 0.75, vol: 0.03, dur: 3, send: 0.8 });
      tone(N(43), { t: d * 0.75, dur: 3.5, vol: 0.05, type: 'triangle', attack: 0.3, send: 0.6 });
    },
    // 칼질 (i번째)
    mythicCut(i) {
      noise({ dur: 0.14, vol: 0.28, freq: 6500, kind: 'highpass', attack: 0.002, send: 0.3 });
      tone(3000 + Math.random() * 1200, { t: 0.01, dur: 1.2, vol: 0.025, send: 0.7 });
      if (i === 0) sub(46, { dur: 0.6, vol: 0.34, to: 30 });
    },
    // 파편이 떨어짐
    mythicFall() {
      noise({ dur: 1.6, vol: 0.08, freq: 900, to: 120, kind: 'bandpass', attack: 0.1, send: 0.4 });
      for (let i = 0; i < 10; i++) noise({ t: 0.15 + Math.random() * 1.1, dur: 0.12, vol: 0.05, freq: 1800 + Math.random() * 2500, kind: 'bandpass' });
      sub(38, { dur: 2, vol: 0.3, to: 24 });
    },
    // 이름이 나타날 때
    mythicName() {
      sub(65.4, { dur: 4, vol: 0.2 });
      pad([41, 48, 53, 60], { dur: 4.5, type: 'sawtooth', vol: 0.018, attack: 0.08, lp: 1800, send: 0.7 });
      arp([84, 91, 96, 103], { t: 0.1, step: 0.12, vol: 0.03, dur: 2.6 });
      noise({ dur: 1.8, vol: 0.05, freq: 6000, to: 1500, kind: 'bandpass', attack: 0.05, send: 0.6 });
    },
  };
})(window.TG = window.TG || {});

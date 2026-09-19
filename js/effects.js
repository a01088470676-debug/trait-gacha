/* 모든 뽑기 연출.
   - 기본 · 커먼 · 언커먼: 릴이 결과에 멈춘 뒤 릴 창 안에서 공개 (playBasicEffect ~ playUncommonEffect)
   - 레어 이상: 릴이 뒤에서 도는 동안 화면 중앙 무대(#fxStage)에서 공개 (playRareEffect ~ playMythicEffect)
   애니메이션은 Web Animations API(transform · opacity · clip-path 위주)로 돌리고,
   requestAnimationFrame은 입자 캔버스와 신화의 흑백 막에만 쓴다. 만든 요소는 끝나면 지운다. */
(function (TG) {
  'use strict';
  const { $, rand, pick, fmtPct, RM } = TG.util;
  const audio = TG.audio;
  const stageEl = $('fxStage');
  const glowEl = $('ambientGlow'), veilEl = $('ambientVeil');
  const winFx = $('winFx'), winFxBack = $('winFxBack');
  const SVGNS = 'http://www.w3.org/2000/svg';
  const color = id => TG.TRAIT_TIERS[id].color;

  /* ---------- 실행 관리: 10회 뽑기의 '건너뛰기'가 진행 중인 연출을 바로 끊을 수 있게 ---------- */
  let run = { cancelled: false, timers: new Set() };
  let dismissFinish = null;
  function newRun() { run = { cancelled: false, timers: new Set() }; return run; }
  const cancelled = () => run.cancelled;
  function sleep(ms) {
    const r = run;
    return new Promise(res => {
      if (r.cancelled) return res();
      const fin = () => { clearTimeout(id); r.timers.delete(fin); res(); };
      const id = setTimeout(fin, ms);
      r.timers.add(fin);
    });
  }
  function abort() {
    run.cancelled = true;
    [...run.timers].forEach(f => f());
    run.timers.clear();
    if (dismissFinish) dismissFinish();
  }

  /* ---------- 작은 도구 ---------- */
  const A = (el, frames, opts) => el.animate(frames, Object.assign({ fill: 'forwards', easing: 'cubic-bezier(.2,.7,.2,1)' }, opts));
  const after = (anim, fn) => anim.finished.then(fn).catch(() => {});
  function el(tag, cls, parent) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.append(e);
    return e;
  }
  function svg(tag, attrs, parent) {
    const e = document.createElementNS(SVGNS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.append(e);
    return e;
  }
  const vw = () => window.innerWidth, vh = () => window.innerHeight;
  const center = () => ({ x: vw() / 2, y: vh() / 2 });

  /* ---------- 빛 입자 (작고 정돈된 것만) ---------- */
  const cv = $('fxCanvas'), cx = cv.getContext('2d');
  let motes = [], moteRunning = false, moteLast = 0;
  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(vw() * dpr); cv.height = Math.round(vh() * dpr);
    cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);
  function addMote(p) {
    if (motes.length > 240) return;
    p.t = p.t || 0;
    motes.push(p);
    if (!moteRunning) { moteRunning = true; moteLast = performance.now(); requestAnimationFrame(moteLoop); }
  }
  function moteLoop(now) {
    const dt = Math.min(0.05, (now - moteLast) / 1000); moteLast = now;
    cx.clearRect(0, 0, vw(), vh());
    for (let i = motes.length - 1; i >= 0; i--) {
      const p = motes[i];
      p.t += dt;
      if (p.t < 0) continue;
      if (p.t >= p.life) { motes.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      const a = Math.sin(Math.PI * p.t / p.life) * (p.a == null ? 1 : p.a);
      cx.globalCompositeOperation = p.dark ? 'source-over' : 'lighter';
      cx.fillStyle = p.color;
      cx.globalAlpha = a; cx.beginPath(); cx.arc(p.x, p.y, p.size, 0, 6.283); cx.fill();
      if (p.glow) { cx.globalAlpha = a * 0.16; cx.beginPath(); cx.arc(p.x, p.y, p.size * 3.2, 0, 6.283); cx.fill(); }
    }
    cx.globalAlpha = 1; cx.globalCompositeOperation = 'source-over';
    if (motes.length) requestAnimationFrame(moteLoop);
    else { moteRunning = false; cx.clearRect(0, 0, vw(), vh()); }
  }
  const count = k => RM ? Math.ceil(k * 0.5) : k;
  // 이름 주변에서 위로 천천히 떠오르는 입자
  function risingMotes(r, { n, colors, speed = 36 }) {
    for (let i = 0; i < count(n); i++) {
      addMote({ x: r.x + rand(-r.w * 0.42, r.w * 0.42), y: r.y + rand(-r.h * 0.1, r.h * 0.3), vx: rand(-5, 5), vy: -rand(speed * 0.55, speed),
        size: rand(0.8, 1.6), life: rand(1.1, 1.8), t: -rand(0, 0.35), color: pick(colors), glow: true, a: 0.9 });
    }
  }
  // 바깥에서 중앙으로 모이는 입자
  function convergeMotes(c, { n, colors, radius }) {
    for (let i = 0; i < count(n); i++) {
      const ang = rand(0, Math.PI * 2), R = rand(radius * 0.55, radius), life = rand(0.75, 1.05);
      const x = c.x + Math.cos(ang) * R, y = c.y + Math.sin(ang) * R;
      addMote({ x, y, vx: (c.x - x) / life * 0.9, vy: (c.y - y) / life * 0.9, size: rand(0.8, 1.5), life, t: -rand(0, 0.3), color: pick(colors), glow: true });
    }
  }
  // 신화 마지막 화면의 아주 미세한 검정/하양 입자
  function dust(n) {
    for (let i = 0; i < count(n); i++) {
      const dark = Math.random() < 0.35;
      addMote({ x: rand(0, vw()), y: rand(0, vh()), vx: rand(-6, 6), vy: -rand(4, 12), size: rand(0.6, 1.2), life: rand(3, 5), t: -rand(0, 1.5),
        color: dark ? '#000' : pick(['#ffffff', '#bdbdbd']), dark, a: dark ? 0.8 : 0.45 });
    }
  }

  /* ---------- 회전 중 전조: 등급이 높을수록 주변 공간의 조명이 바뀐다 ---------- */
  const AMBIENT = {
    3: { c: '#5ea6ff', glow: 0.26, veil: 0.25 },
    4: { c: '#a980ff', glow: 0.32, veil: 0.42 },
    5: { c: '#e6b85c', glow: 0.24, veil: 0.62 },
    6: { c: '#ffffff', glow: 0.05, veil: 0.55, mono: true },
  };
  function setAnticipation(level) {
    const a = AMBIENT[level]; if (!a) return;
    glowEl.style.setProperty('--amb', a.c);
    glowEl.style.opacity = a.glow;
    veilEl.style.opacity = a.veil;
    if (a.mono) document.documentElement.classList.add('fx-mono');
  }
  function clearAnticipation() {
    glowEl.style.opacity = 0;
    veilEl.style.opacity = 0;
    document.documentElement.classList.remove('fx-mono');
  }

  /* ==========================================================
     릴 안 연출 (기본 · 커먼 · 언커먼)
     ========================================================== */
  function clearReelFx() { winFx.replaceChildren(); winFxBack.replaceChildren(); }
  function rowFx(cls, back) { return el('div', 'row-fx ' + cls, back ? winFxBack : winFx); }
  function nameRect(item) {
    const r = item.querySelector('.nm').getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
  }
  // 흐릿하던 결과 이름을 선명하게
  function revealInReel(item, dur, blur = 5) {
    const nm = item.querySelector('.nm');
    item.classList.remove('pending');
    item.classList.add('res');
    return A(nm, [
      { opacity: 0.16, filter: `blur(${blur}px)`, transform: 'scale(.985)' },
      { opacity: 1, filter: 'blur(0px)', transform: 'scale(1)' },
    ], { duration: dur });
  }
  function rowSweep(tint, dur) {
    const s = rowFx('row-sweep');
    s.style.setProperty('--sw', tint);
    after(A(s, [{ transform: 'translateX(-65%)', opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: 'translateX(65%)', opacity: 0 }],
      { duration: dur, easing: 'cubic-bezier(.4,0,.2,1)' }), () => s.remove());
  }

  // 기본: 화면 변화 거의 없음. 흐림 → 선명, 아주 작은 빛 한 번
  async function playBasicEffect(res, item, quick) {
    newRun();
    audio.basic();
    revealInReel(item, quick ? 200 : 260);
    rowSweep('rgba(255,255,255,.14)', quick ? 380 : 540);
    await sleep(quick ? 220 : 420);
  }

  // 커먼: 글자 뒤 얇은 빛 · 얇은 halo · 흰 입자 몇 개가 천천히 위로
  async function playCommonEffect(res, item, quick) {
    newRun();
    audio.common();
    revealInReel(item, 320);
    const nm = item.querySelector('.nm');
    A(nm, [{ textShadow: '0 0 0 rgba(255,255,255,0)' }, { textShadow: '0 0 12px rgba(255,255,255,.42)', offset: 0.35 }, { textShadow: '0 0 8px rgba(255,255,255,.14)' }], { duration: 900 });
    const line = rowFx('row-line', true);
    line.style.setProperty('--lc', 'rgba(255,255,255,.6)');
    A(line, [{ transform: 'scaleX(0)', opacity: 0 }, { transform: 'scaleX(1)', opacity: 0.75, offset: 0.5 }, { transform: 'scaleX(1)', opacity: 0.22 }], { duration: 820 });
    risingMotes(nameRect(item), { n: quick ? 5 : 7, colors: ['#ffffff'] });
    await sleep(quick ? 380 : 720);
  }

  // 언커먼: 녹색 빛이 은은하게 퍼진다 (충격파처럼 딱딱한 원은 쓰지 않는다)
  async function playUncommonEffect(res, item, quick) {
    newRun();
    const c = color('uncommon');
    audio.uncommon();
    revealInReel(item, 360);
    const glow = rowFx('row-glow', true);
    glow.style.setProperty('--gc', c);
    A(glow, [{ opacity: 0, transform: 'scale(.7)' }, { opacity: 1, transform: 'scale(1)', offset: 0.4 }, { opacity: 0.55, transform: 'scale(1)' }], { duration: 1000 });
    const ring = rowFx('row-ring', true);
    ring.style.setProperty('--gc', c);
    after(A(ring, [
      { opacity: 0, transform: 'translate(-50%,-50%) scale(.3)' },
      { opacity: 0.8, offset: 0.15 },
      { opacity: 0, transform: 'translate(-50%,-50%) scale(1.55)' },
    ], { duration: 900, easing: 'cubic-bezier(.1,.6,.3,1)' }), () => ring.remove());
    await sleep(160);
    rowSweep('rgba(190,255,220,.32)', 620);
    risingMotes(nameRect(item), { n: quick ? 6 : 9, colors: ['#bff5d6', '#ffffff', c] });
    await sleep(quick ? 420 : 760);
  }

  function playReelReveal(res, item, quick) {
    if (res.level === 0) return playBasicEffect(res, item, quick);
    if (res.level === 1) return playCommonEffect(res, item, quick);
    return playUncommonEffect(res, item, quick);
  }

  /* ==========================================================
     중앙 무대 공통
     ========================================================== */
  function openStage(kind) {
    stageEl.getAnimations().forEach(a => a.cancel());
    stageEl.replaceChildren();
    stageEl.className = 'fx-stage ' + kind;
    stageEl.hidden = false;
    return stageEl;
  }
  const layer = cls => el('div', 'fx-layer' + (cls ? ' ' + cls : ''), stageEl);
  function nameBox(parent, text) {
    const box = el('div', 'fx-namebox', parent);
    const name = el('div', 'fx-name', box);
    name.textContent = text;
    return { box, name };
  }
  // 글자 모양 안에서만 지나가는 빛
  function sweepLayer(box, text, tint) {
    const s = el('div', 'fx-name fx-sweep', box);
    s.textContent = text;
    s.setAttribute('aria-hidden', 'true');
    s.style.setProperty('--sw', tint);
    return s;
  }
  function flash(tint, strength) {
    const f = el('div', 'fx-flash', stageEl);
    f.style.background = tint;
    after(A(f, [{ opacity: RM ? strength * 0.35 : strength }, { opacity: 0 }], { duration: 260, easing: 'ease-out' }), () => f.remove());
  }
  // 등급 이름 · 확률은 중앙이 아니라 아래쪽 보조 정보로만
  function showMeta(res, hint) {
    const foot = el('div', 'fx-foot', stageEl);
    const meta = el('div', 'fx-meta', foot);
    meta.textContent = `${res.tier.en}  ·  ${res.tier.ko}` + (res.each ? `  ·  ${fmtPct(res.each)}` : '');
    A(meta, [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 600 });
    const h = el('div', 'fx-hint', foot);
    h.textContent = hint || '화면을 누르면 계속';
    A(h, [{ opacity: 0 }, { opacity: 1 }], { duration: 600, delay: 450 });
  }
  function waitDismiss({ auto } = {}) {
    return new Promise(resolve => {
      if (run.cancelled || stageEl.hidden) return resolve();
      const openedAt = performance.now();
      let timer = null;
      const ready = () => performance.now() - openedAt > 350;
      function finish() {
        stageEl.removeEventListener('click', onClick);
        document.removeEventListener('keydown', onKey, true);
        clearTimeout(timer);
        dismissFinish = null;
        resolve();
      }
      function onClick() { if (ready()) finish(); }
      function onKey(e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
          e.preventDefault(); e.stopPropagation();
          if (ready()) finish();
        }
      }
      stageEl.addEventListener('click', onClick);
      document.addEventListener('keydown', onKey, true);
      if (auto) timer = setTimeout(finish, auto);
      dismissFinish = finish;
      stageEl.focus({ preventScroll: true });
    });
  }
  async function closeStage(instant) {
    if (stageEl.hidden) return;
    if (!instant) await A(stageEl, [{ opacity: 1 }, { opacity: 0 }], { duration: 380, easing: 'ease' }).finished.catch(() => {});
    stageEl.getAnimations({ subtree: true }).forEach(a => a.cancel());
    stageEl.hidden = true;
    stageEl.replaceChildren();
    stageEl.className = 'fx-stage';
    motes = motes.filter(m => !m.dark && !m.stageOnly);
    document.documentElement.classList.remove('fx-mono');
  }

  /* 원형 문양 (SVG). 에픽은 정교한 육각 문양, 레전더리는 팔각 별 문양 */
  function sigil(kind, parent) {
    const size = Math.round(Math.min(vw() * 0.86, vh() * 0.7, kind === 'legend' ? 620 : 540));
    const s = svg('svg', { viewBox: '-100 -100 200 200', class: 'fx-sigil', width: size, height: size }, parent);
    const px = 200 / size;                     // 문양 좌표계에서 화면 1px
    const paths = [], parts = [];
    const pol = (r, deg) => { const t = (deg - 90) * Math.PI / 180; return [r * Math.cos(t), r * Math.sin(t)]; };
    const P = (r, deg) => pol(r, deg).map(v => v.toFixed(2)).join(' ');
    const circle = (r, x = 0, y = 0) => `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
    const arc = (r, a0, a1) => `M ${P(r, a0)} A ${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${P(r, a1)}`;
    const ticks = (r0, r1, n, skip) => { let d = ''; for (let i = 0; i < n; i++) { if (skip && skip(i)) continue; const a = i * 360 / n; d += `M ${P(r0, a)} L ${P(r1, a)} `; } return d; };
    const star = (r, n, step, rot = 0) => { let d = ''; for (let i = 0; i <= n; i++) d += (i ? 'L ' : 'M ') + P(r, rot + ((i * step) % n) * 360 / n) + ' '; return d; };
    const add = (d, { w = 1, op = 1, part = false } = {}) => {
      const p = svg('path', { d, pathLength: 1, 'stroke-width': (px * w).toFixed(3) }, s);
      p.style.opacity = op;
      p.style.strokeDasharray = '1';
      p.style.strokeDashoffset = '1';
      paths.push(p);
      if (part) parts.push(p);
      return p;
    };
    if (kind === 'epic') {
      add(circle(94), { op: 0.9 });
      add(circle(88), { op: 0.45 });
      add(ticks(88, 94, 72), { op: 0.5 });
      add(circle(60), { op: 0.8 });
      add(star(60, 3, 1, 0), { op: 0.75 });
      add(star(60, 3, 1, 60), { op: 0.75 });
      [0, 120, 240].forEach(a => { const [x, y] = pol(60, a); add(circle(2.6, x, y), { op: 0.9 }); });
      add(circle(26), { op: 0.55 });
      [0, 90, 180, 270].forEach(a => add(arc(74, a + 14, a + 62), { w: 1.3, part: true }));   // 빛처럼 사라질 부분
    } else {
      add(circle(96), { op: 0.9 });
      add(circle(90), { op: 0.42 });
      add(ticks(90, 96, 96, i => i % 12 === 0), { op: 0.45 });
      add(star(84, 8, 3), { op: 0.78 });
      add(circle(44), { op: 0.8 });
      add(circle(38), { op: 0.38 });
      for (let i = 0; i < 8; i++) add(`M ${P(90, i * 45)} L ${P(100, i * 45)}`, { w: 1.6, part: true });   // 빛의 선으로 바뀔 부분
    }
    return { svg: s, paths, parts, size };
  }
  function drawSigil(sg, dur) {
    sg.paths.forEach((p, i) => A(p, [{ strokeDashoffset: '1' }, { strokeDashoffset: '0' }],
      { duration: RM ? dur * 0.6 : dur, delay: i * 45, easing: 'cubic-bezier(.4,0,.2,1)' }));
  }

  /* ==========================================================
     레어 — 빛의 선
     ========================================================== */
  async function playRareEffect(res) {
    newRun();
    openStage('t-rare');
    const L = layer();
    const ring = el('div', 'fx-ring', L);
    const { box, name } = nameBox(L, res.name);
    const hline = el('div', 'fx-hline', box);
    const vline = el('div', 'fx-vline', box);
    const ghost = el('div', 'fx-name fx-ghost', box);
    ghost.textContent = res.name; ghost.setAttribute('aria-hidden', 'true');
    [ring, name, ghost, vline, hline].forEach(e => { e.style.opacity = '0'; });
    requestAnimationFrame(() => stageEl.classList.add('dim'));          // 1. 주변이 어두워짐
    audio.rare();
    await sleep(380); if (cancelled()) return;
    A(hline, [{ transform: 'translate(-50%,-50%) scaleX(0)', opacity: 0 }, { transform: 'translate(-50%,-50%) scaleX(1)', opacity: 0.9 }], { duration: 360 });   // 2. 가는 선
    await sleep(260); if (cancelled()) return;
    const wipe = RM ? 700 : 480;                                           // 3. 선이 이름을 가로지름
    const ease = 'cubic-bezier(.55,0,.25,1)';
    A(name, [{ opacity: 1, clipPath: 'inset(0 100% 0 0)', filter: 'blur(5px)' }, { opacity: 1, clipPath: 'inset(0 0% 0 0)', filter: 'blur(5px)' }], { duration: wipe, easing: ease });
    A(vline, [{ left: '0%', opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.88 }, { left: '100%', opacity: 0 }], { duration: wipe, easing: ease });
    await sleep(wipe); if (cancelled()) return;
    A(name, [{ filter: 'blur(5px)' }, { filter: 'blur(0px)' }], { duration: 320 });   // 4. 선명해짐
    A(ring, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.3)' }, { opacity: 0.55, offset: 0.2 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.45)' }],
      { duration: 900, easing: 'cubic-bezier(.15,.6,.3,1)' });                       // 5. 얇은 빛의 원
    A(ghost, [{ opacity: 0.42, transform: 'scale(1)', filter: 'blur(0px)' }, { opacity: 0, transform: 'scale(1.07)', filter: 'blur(6px)' }], { duration: 760, easing: 'ease-out' });   // 6. 잔상
    await sleep(700); if (cancelled()) return;
    A(hline, [{ opacity: 0.9 }, { opacity: 0.2 }], { duration: 700 });              // 7. 안정화
    showMeta(res);
  }

  /* ==========================================================
     에픽 — 정교한 문양 하나
     ========================================================== */
  async function playEpicEffect(res) {
    newRun();
    openStage('t-epic');
    const L = layer();
    const orb = el('div', 'fx-orb', L);
    const sg = sigil('epic', L);
    const { box, name } = nameBox(L, res.name);
    const sweep = sweepLayer(box, res.name, 'rgba(236,222,255,.95)');
    const pin = el('div', 'fx-pin', L);
    [orb, name, pin].forEach(e => { e.style.opacity = '0'; });
    audio.epic();
    await sleep(220); if (cancelled()) return;                             // 2. 정적
    stageEl.classList.add('dim');                                           // 3. 어두워짐
    await sleep(380); if (cancelled()) return;
    A(orb, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.25)' }, { opacity: 0.9, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 1100, easing: 'cubic-bezier(.3,0,.2,1)' });   // 4. 보랏빛이 천천히 모임
    convergeMotes(center(), { n: 14, colors: ['#e3d6ff', '#c7adff'], radius: Math.min(vw(), vh()) * 0.34 });
    await sleep(820); if (cancelled()) return;
    A(name, [{ opacity: 0, filter: 'blur(8px)', letterSpacing: '.34em' }, { opacity: 1, filter: 'blur(0px)', letterSpacing: '.08em' }], { duration: 760 });   // 5. 이름
    drawSigil(sg, 1100);                                                    // 6. 원형 문양
    A(sg.svg, [{ transform: 'translate(-50%,-50%) rotate(0deg)' }, { transform: 'translate(-50%,-50%) rotate(270deg)' }],
      { duration: RM ? 1 : 4200, easing: 'cubic-bezier(.25,.6,.2,1)' });   // 7. 천천히 회전
    await sleep(1150); if (cancelled()) return;
    sg.parts.forEach((p, i) => A(p, [{ opacity: 1, stroke: '#ffffff' }, { opacity: 1, offset: 0.25 }, { opacity: 0 }], { duration: 800, delay: i * 90 }));   // 8. 일부가 빛처럼 사라짐
    A(sweep, [{ opacity: 1, backgroundPosition: '150% 0' }, { opacity: 1, backgroundPosition: '-50% 0' }], { duration: 900, easing: 'cubic-bezier(.45,0,.25,1)' });   // 9. 빛 쓸기
    await sleep(900); if (cancelled()) return;
    A(pin, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(3.2)' }, { opacity: 0.95, transform: 'translate(-50%,-50%) scale(1)', offset: 0.6 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.15)' }],
      { duration: 620, easing: 'cubic-bezier(.5,0,.2,1)' });               // 10. 작은 빛이 중앙으로 수렴
    A(orb, [{ opacity: 0.9 }, { opacity: 0.3 }], { duration: 900 });
    await sleep(420); if (cancelled()) return;
    showMeta(res);
  }

  /* ==========================================================
     레전더리 — 압도적인 희귀함 (폭죽 · 색종이 없음)
     ========================================================== */
  async function playLegendaryEffect(res) {
    newRun();
    openStage('t-legend');
    stageEl.classList.add('black');                                         // 2. 순간 암전
    const L = layer();
    const glow = el('div', 'fx-lowglow', L);
    const travel = el('div', 'fx-travel', L);
    const spark = el('div', 'fx-travel-spark', travel);
    const sg = sigil('legend', L);
    const { box, name } = nameBox(L, res.name);
    const sweep = sweepLayer(box, res.name, 'rgba(255,246,222,1)');
    [glow, travel, name].forEach(e => { e.style.opacity = '0'; });
    audio.legendary();
    await sleep(380); if (cancelled()) return;
    A(glow, [{ opacity: 0 }, { opacity: 0.85 }], { duration: 900, easing: 'ease-out' });   // 3. 낮은 금빛
    await sleep(520); if (cancelled()) return;
    audio.heart();                                                          // 4. 심장박동처럼 한 번 수축
    if (!RM) {
      A(L, [{ transform: 'scale(1)' }, { transform: 'scale(.982)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-in-out', fill: 'none' });
      A($('stage'), [{ transform: 'scale(1)' }, { transform: 'scale(.992)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-in-out', fill: 'none' });
    }
    await sleep(460); if (cancelled()) return;
    A(travel, [{ opacity: 0, transform: 'translate(-50%,-50%) scaleX(.2)' }, { opacity: 0.5, transform: 'translate(-50%,-50%) scaleX(1)' }], { duration: 700 });   // 5. 금빛 선이 중앙을 따라 이동
    A(spark, [{ left: '0%', opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.85 }, { left: '100%', opacity: 0 }], { duration: 760, easing: 'cubic-bezier(.5,0,.3,1)' });
    await sleep(520); if (cancelled()) return;
    A(name, [{ opacity: 0, filter: 'blur(10px)', transform: 'translateY(8px)', letterSpacing: '.26em' },
             { opacity: 1, filter: 'blur(0px)', transform: 'none', letterSpacing: '.08em' }], { duration: 1200, easing: 'cubic-bezier(.25,.6,.2,1)' });   // 6. 천천히 나타남
    drawSigil(sg, 1400);                                                    // 7. 금색 문양이 아주 느리게 회전
    const spin = A(sg.svg, [{ transform: 'translate(-50%,-50%) rotate(-20deg)' }, { transform: 'translate(-50%,-50%) rotate(40deg)' }], { duration: RM ? 1 : 9000, easing: 'linear' });
    await sleep(1500); if (cancelled()) return;
    // 8~9. 문양의 일부가 빛의 선으로 바뀌어 화면 밖으로
    sg.parts.forEach(p => A(p, [{ opacity: 1 }, { opacity: 0 }], { duration: 260 }));
    const rot = -20 + 60 * Math.min(1, (spin.currentTime || 0) / 9000);
    const R = sg.size / 2 * 0.93, far = Math.hypot(vw(), vh());
    for (let i = 0; i < 8; i++) {
      const ray = el('div', 'fx-ray', L);
      const ang = i * 45 - 90 + rot;
      after(A(ray, [
        { transform: `rotate(${ang}deg) translateX(${R}px) scaleX(.01)`, opacity: 0 },
        { transform: `rotate(${ang}deg) translateX(${R}px) scaleX(1)`, opacity: 1, offset: 0.25 },
        { transform: `rotate(${ang}deg) translateX(${far}px) scaleX(2.4)`, opacity: 0 },
      ], { duration: RM ? 1200 : 720, delay: i * 18, easing: 'cubic-bezier(.6,0,.9,.6)' }), () => ray.remove());
    }
    await sleep(520); if (cancelled()) return;
    // 10. 마지막 순간 짧고 강한 금색 하이라이트
    A(sweep, [{ opacity: 1, backgroundPosition: '150% 0' }, { opacity: 1, backgroundPosition: '-50% 0' }], { duration: 420, easing: 'cubic-bezier(.5,0,.2,1)' });
    A(name, [{ textShadow: '0 0 20px rgba(230,184,92,.32)' }, { textShadow: '0 0 34px rgba(255,214,130,.85)', offset: 0.3 }, { textShadow: '0 0 18px rgba(230,184,92,.28)' }], { duration: 900 });
    await sleep(500); if (cancelled()) return;
    // 11. 효과가 사라지고 이름만 남음
    A(sg.svg, [{ opacity: 1 }, { opacity: 0.1 }], { duration: 1100 });
    A(glow, [{ opacity: 0.85 }, { opacity: 0.22 }], { duration: 1100 });
    A(travel, [{ opacity: 0.5 }, { opacity: 0 }], { duration: 800 });
    await sleep(400); if (cancelled()) return;
    showMeta(res);
  }

  /* ==========================================================
     신화 — BLACK / WHITE → 현실 절단 → 화면 조각 → 특성 조각 → 별 하나
     ========================================================== */

  // PHASE 1: 검정과 하양의 막이 양쪽에서 밀려와 교차한다 (1/4 해상도 캔버스라 경계가 자연스럽게 부드럽다)
  function playBlackWhiteTransition(dur) {
    return new Promise(resolve => {
      const c = el('canvas', 'mem', stageEl);
      const q = 0.25;
      const W = Math.max(160, Math.round(vw() * q)), H = Math.max(120, Math.round(vh() * q));
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      const ph = [rand(0, 6), rand(0, 6), rand(0, 6)];
      const r = run, t0 = performance.now();
      A(c, [{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
      (function frame(now) {
        if (r.cancelled) { resolve(c); return; }
        const p = Math.min(1, (now - t0) / dur);
        drawMembranes(g, W, H, p, (now - t0) / 1000, ph);
        if (p < 1) requestAnimationFrame(frame); else resolve(c);
      })(t0);
    });
  }
  function drawMembranes(g, W, H, p, t, ph) {
    const ease = x => x * x * (3 - 2 * x);
    g.fillStyle = '#111113'; g.fillRect(0, 0, W, H);
    const approach = ease(Math.min(1, p / 0.5));
    const clash = p < 0.5 ? 0 : Math.pow((p - 0.5) / 0.5, 1.6);       // 후반으로 갈수록 강하게 충돌
    const amp = W * (0.025 + 0.2 * clash);
    const sp = 1.2 + 4.5 * clash;
    const gap = W * 0.06 * (1 - approach);
    const bx0 = -W * 0.12 + (W * 0.62 - gap) * approach;                 // 검정의 앞쪽
    const wx0 = W * 1.12 - (W * 0.62 - gap) * approach;                  // 하양의 앞쪽
    for (let y = 0; y < H; y++) {
      const k = y / H;
      const w1 = Math.sin(k * 9 + t * sp + ph[0]) * 0.55 + Math.sin(k * 23 - t * sp * 1.7 + ph[1]) * 0.3 + Math.sin(k * 47 + t * sp * 2.3) * 0.15;
      const w2 = Math.sin(k * 8.3 - t * sp * 1.1 + ph[2]) * 0.55 + Math.sin(k * 19 + t * sp * 1.5 + ph[0]) * 0.3 + Math.sin(k * 41 - t * sp * 2.1) * 0.15;
      const bx = bx0 + w1 * amp, wx = wx0 - w2 * amp;
      let bEnd = bx, wStart = wx;
      if (bx > wx) {                                                      // 겹치는 줄: 줄마다 이기는 쪽이 번갈아 → 서로 파고드는 모양
        if (Math.sin(k * 13 + t * sp * 0.9 + ph[1]) > 0) wStart = bx; else bEnd = wx;
      }
      g.fillStyle = '#000'; g.fillRect(0, y, Math.max(0, bEnd), 1);
      g.fillStyle = '#fff'; g.fillRect(wStart, y, W - wStart, 1);
      g.fillStyle = 'rgba(128,128,128,.55)';                             // 경계의 중간 회색
      if (bEnd > 0 && bEnd < W) g.fillRect(bEnd - 1, y, 2, 1);
      if (wStart > 0 && wStart < W) g.fillRect(wStart - 1, y, 2, 1);
    }
  }

  // 검기 방향: 왼쪽 위 → 오른쪽 아래, 또는 오른쪽 위 → 왼쪽 아래 (무작위)
  function slashGeometry() {
    const W = vw(), H = vh(), dir = Math.random() < 0.5 ? 1 : -1;
    const j = () => rand(-0.08, 0.08);
    const P0 = dir === 1 ? { x: -W * 0.04, y: H * (0.06 + j()) } : { x: W * 1.04, y: H * (0.06 + j()) };
    const P1 = dir === 1 ? { x: W * 1.04, y: H * (0.94 + j()) } : { x: -W * 0.04, y: H * (0.94 + j()) };
    const dx = P1.x - P0.x, dy = P1.y - P0.y, len = Math.hypot(dx, dy);
    const u = { x: dx / len, y: dy / len };
    return { P0, P1, u, nrm: { x: -u.y, y: u.x }, len, ang: Math.atan2(dy, dx) * 180 / Math.PI };
  }
  const along = (g, t) => ({ x: g.P0.x + g.u.x * g.len * t, y: g.P0.y + g.u.y * g.len * t });
  const polyCss = pts => `polygon(${pts.map(p => `${p.x.toFixed(1)}px ${p.y.toFixed(1)}px`).join(',')})`;

  // PHASE 2: 한 번 베었다 — 얇은 검은 중심선 + 흰 가장자리 + 약한 검은 글로
  async function playMythicSlash(g) {
    const s = el('div', 'slash', stageEl);
    const ext = Math.hypot(vw(), vh()) * 0.08;
    s.style.left = (g.P0.x - g.u.x * ext) + 'px';
    s.style.top = (g.P0.y - g.u.y * ext) + 'px';
    s.style.width = (g.len + ext * 2) + 'px';
    s.style.transform = `rotate(${g.ang}deg) scaleX(0)`;
    await A(s, [{ transform: `rotate(${g.ang}deg) scaleX(0)` }, { transform: `rotate(${g.ang}deg) scaleX(1)` }],
      { duration: RM ? 420 : 130, easing: 'cubic-bezier(.7,0,.2,1)' }).finished.catch(() => {});
    flash('#ffffff', 0.16);
    cracksAlong(g);
    after(A(s, [{ opacity: 1, transform: `rotate(${g.ang}deg) scaleX(1) scaleY(1)` }, { opacity: 1, offset: 0.3 }, { opacity: 0, transform: `rotate(${g.ang}deg) scaleX(1) scaleY(.25)` }],
      { duration: 900, easing: 'ease-out' }), () => s.remove());
    await sleep(140);
  }
  // 검기가 지나간 자리에 잠깐 남는 아주 얇은 균열
  function cracksAlong(g) {
    const s = svg('svg', { class: 'cracks', viewBox: `0 0 ${vw()} ${vh()}`, preserveAspectRatio: 'none' }, stageEl);
    const k = Math.min(vw(), vh()) / 800 + 0.3;
    const lines = [`M ${g.P0.x} ${g.P0.y} L ${g.P1.x} ${g.P1.y}`];
    for (let i = 0; i < 5; i++) {
      const b = along(g, rand(0.12, 0.88)), side = Math.random() < 0.5 ? 1 : -1;
      let x = b.x, y = b.y, d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      for (let n = 0; n < 3; n++) {
        const ang = Math.atan2(g.nrm.y * side, g.nrm.x * side) + rand(-0.7, 0.7), L = rand(18, 46) * k;
        x += Math.cos(ang) * L; y += Math.sin(ang) * L;
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      lines.push(d);
    }
    lines.forEach((d, i) => {
      const p = svg('path', { d, pathLength: 1 }, s);
      p.style.strokeDasharray = '1';
      A(p, [{ strokeDashoffset: '1' }, { strokeDashoffset: '0' }], { duration: 220, delay: i * 25 });
      if (i === 0) p.style.opacity = '0.35';
    });
    after(A(s, [{ opacity: 1 }, { opacity: 1, offset: 0.3 }, { opacity: 0 }], { duration: 1500 }), () => s.remove());
  }

  // 멈춘 흑백 화면을 절단선 양쪽 두 덩어리로
  function splitHalves(snap, g) {
    const big = Math.max(vw(), vh()) * 3;
    const a = { x: g.P0.x - g.u.x * big, y: g.P0.y - g.u.y * big }, b = { x: g.P1.x + g.u.x * big, y: g.P1.y + g.u.y * big };
    return [1, -1].map(side => {
      const d = el('div', 'half', stageEl);
      d.style.backgroundImage = `url("${snap}")`;
      const o = { x: g.nrm.x * big * side, y: g.nrm.y * big * side };
      d.style.clipPath = polyCss([a, b, { x: b.x + o.x, y: b.y + o.y }, { x: a.x + o.x, y: a.y + o.y }]);
      d._side = side;
      return d;
    });
  }

  // PHASE 3: 절단면을 따라 떨어져 나갈 조각 (8~15개). 조각 크기만큼만 요소를 만든다
  function createWorldFragments(snap, g, n) {
    const k = Math.min(vw(), vh()) / 800 + 0.25;
    const ts = [];
    for (let i = 0; i <= n; i++) ts.push(0.08 + 0.84 * i / n + (i && i < n ? rand(-0.015, 0.015) : 0));
    const shards = [];
    for (let i = 0; i < n; i++) {
      const side = (i % 2 ? 1 : -1) * (Math.random() < 0.25 ? -1 : 1);
      const pa = along(g, ts[i]), pb = along(g, ts[i + 1]), mid = along(g, (ts[i] + ts[i + 1]) / 2 + rand(-0.01, 0.01));
      const off = (p, d) => ({ x: p.x + g.nrm.x * d * side, y: p.y + g.nrm.y * d * side });
      const poly = [pa, pb, off(pb, rand(16, 60) * k), off(mid, rand(40, 110) * k), off(pa, rand(16, 60) * k)];
      const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
      const x0 = Math.min(...xs), y0 = Math.min(...ys);
      const d = el('div', 'shard', stageEl);
      Object.assign(d.style, {
        left: x0 + 'px', top: y0 + 'px', width: (Math.max(...xs) - x0) + 'px', height: (Math.max(...ys) - y0) + 'px',
        backgroundImage: `url("${snap}")`, backgroundSize: `${vw()}px ${vh()}px`, backgroundPosition: `${-x0}px ${-y0}px`,
        clipPath: polyCss(poly.map(p => ({ x: p.x - x0, y: p.y - y0 }))),
      });
      d._side = side;
      shards.push(d);
    }
    return shards;
  }
  async function animateFragments(halves, shards, g) {
    const D = Math.max(vw(), vh()), k = RM ? 0.3 : 1;
    const gapOf = s => `translate(${(g.nrm.x * s * 10 * k).toFixed(1)}px, ${(g.nrm.y * s * 10 * k).toFixed(1)}px)`;
    halves.forEach(h => A(h, [{ transform: 'translate(0,0)' }, { transform: gapOf(h._side) }], { duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }));
    shards.forEach(sh => {
      const s = sh._side, dist = rand(0.35, 0.8) * D * k, drift = rand(-0.18, 0.18) * D * k, fall = rand(0.05, 0.22) * D * k;
      const tx = g.nrm.x * s * dist + g.u.x * drift, ty = g.nrm.y * s * dist + g.u.y * drift + fall;
      after(A(sh, [
        { transform: 'translate3d(0,0,0)', opacity: 1, filter: 'blur(0px)' },
        { transform: `translate3d(${tx.toFixed(0)}px, ${ty.toFixed(0)}px, ${(rand(-200, 120) * k).toFixed(0)}px) rotateX(${(rand(-70, 70) * k).toFixed(0)}deg) rotateY(${(rand(-70, 70) * k).toFixed(0)}deg) rotateZ(${(rand(-50, 50) * k).toFixed(0)}deg)`, opacity: 0, filter: 'blur(2px)' },
      ], { duration: rand(950, 1500), delay: rand(40, 200), easing: 'cubic-bezier(.12,.62,.25,1)' }), () => sh.remove());
    });
    await sleep(520); if (cancelled()) return;
    // 세계가 두 조각으로 갈라져 멀어진다
    halves.forEach(h => {
      const s = h._side, off = D * 0.55 * k;
      after(A(h, [
        { transform: `${gapOf(s)} rotate(0deg)`, opacity: 1 },
        { transform: `translate(${(g.nrm.x * s * off).toFixed(0)}px, ${(g.nrm.y * s * off).toFixed(0)}px) rotate(${s * 3 * k}deg)`, opacity: 0 },
      ], { duration: 1300, easing: 'cubic-bezier(.5,0,.75,.4)' }), () => h.remove());
    });
    await sleep(900);
  }

  // PHASE 4: 조각 하나가 돌아와 특성 카드가 된다. 카드 바탕(검정/하양)과 반대 색으로 이름을 쓴다
  function createMythicTraitFragment(res, snap) {
    const L = layer('m-layer');
    const dark = Math.random() < 0.65;
    const wrap = el('div', 'm-card-wrap ' + (dark ? 'dark' : 'light'), L);
    const card = el('div', 'm-card', wrap);
    const tex = el('div', 'm-tex', card);
    tex.style.backgroundImage = `url("${snap}")`;
    const name = el('div', 'm-name', card);
    name.textContent = res.name;
    const rule = el('div', 'm-rule', card);
    const r = (a, b) => rand(a, b).toFixed(1);
    card.style.clipPath = `polygon(${r(0, 4)}% ${r(2, 12)}%, ${r(28, 42)}% 0%, ${r(68, 82)}% ${r(0, 5)}%, 100% ${r(6, 20)}%, ${r(96, 100)}% ${r(76, 96)}%, ${r(58, 72)}% 100%, ${r(18, 32)}% ${r(95, 100)}%, 0% ${r(68, 88)}%)`;
    wrap.style.opacity = '0';
    name.style.opacity = '0';
    return { layer: L, wrap, card, name, rule };
  }
  async function enterCard(c) {
    const left = Math.random() < 0.5, up = Math.random() < 0.5 ? -1 : 1;
    const frames = RM
      ? [{ opacity: 0, transform: 'scale(.96)' }, { opacity: 1, transform: 'none' }]
      : [{ opacity: 0, transform: `translate(${(left ? -1 : 1) * vw() * 0.55}px, ${up * vh() * 0.34}px) rotateZ(${left ? -28 : 28}deg) rotateY(${left ? 68 : -68}deg) rotateX(18deg) scale(.8)` },
         { opacity: 1, offset: 0.3 },
         { opacity: 1, transform: 'translate(0px,0px) rotateZ(0deg) rotateY(0deg) rotateX(0deg) scale(1)' }];
    await A(c.wrap, frames, { duration: RM ? 500 : 1250, easing: 'cubic-bezier(.16,.84,.24,1)' }).finished.catch(() => {});
  }
  async function revealCardName(c) {
    A(c.name, [{ opacity: 1, clipPath: 'inset(0 50% 0 50%)', filter: 'blur(6px)' }, { opacity: 1, clipPath: 'inset(0 0% 0 0%)', filter: 'blur(0px)' }], { duration: 760, easing: 'cubic-bezier(.3,0,.2,1)' });
    A(c.rule, [{ opacity: 0, transform: 'scaleX(0)' }, { opacity: 0.45, transform: 'scaleX(1)' }], { duration: 900, delay: 250 });
    await sleep(800);
  }

  // PHASE 5: 정확히 1개의 별이 이름 주변을 공전하고, 뒤로 얇은 궤적 하나가 따라온다
  function createSingleOrbitStar(c) {
    const r = c.wrap.getBoundingClientRect();
    const cxp = r.left + r.width / 2, cyp = r.top + r.height / 2;
    const rx = r.width / 2 + Math.max(22, vw() * 0.035), ry = r.height / 2 + Math.max(18, vh() * 0.03);
    const pad = 14, W = 2 * (rx + pad), H = 2 * (ry + pad);
    const box = el('div', 'orbit', c.layer);
    Object.assign(box.style, { left: (cxp - W / 2) + 'px', top: (cyp - H / 2) + 'px', width: W + 'px', height: H + 'px', transform: `rotate(${rand(-8, -4).toFixed(1)}deg)`, opacity: '0' });
    const d = `M ${pad} ${pad + ry} a ${rx} ${ry} 0 1 1 ${2 * rx} 0 a ${rx} ${ry} 0 1 1 ${-2 * rx} 0`;
    const s = svg('svg', { class: 'orbit-svg', width: W, height: H }, box);
    const period = RM ? 60000 : 6800;
    // 궤적은 하나지만 끝으로 갈수록 옅어지게 세 겹의 길이로 그린다
    [[6, 0.5], [14, 0.24], [24, 0.1]].forEach(([len, op]) => {
      const p = svg('path', { d, pathLength: 100, class: 'orbit-trail' }, s);
      p.style.strokeDasharray = `${len} ${100 - len}`;
      p.style.opacity = op;
      A(p, [{ strokeDashoffset: String(len) }, { strokeDashoffset: String(len - 100) }], { duration: period, iterations: Infinity, easing: 'linear', fill: 'none' });
    });
    const star = el('div', 'orbit-star', box);
    star.style.offsetPath = `path("${d}")`;
    A(star, [{ offsetDistance: '0%' }, { offsetDistance: '100%' }], { duration: period, iterations: Infinity, easing: 'linear', fill: 'none' });
    A(box, [{ opacity: 0 }, { opacity: 1 }], { duration: 900 });
  }
  // 화면 가장자리에 남는 아주 약한 균열
  function edgeCracks() {
    const W = vw(), H = vh(), k = Math.min(W, H) / 800 + 0.3;
    const s = svg('svg', { class: 'edge-cracks', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' }, stageEl);
    [[0, rand(0.1, 0.3) * H, 1, 0], [W, rand(0.6, 0.9) * H, -1, 0], [rand(0.6, 0.85) * W, 0, 0, 1], [rand(0.15, 0.4) * W, H, 0, -1]].forEach(([x, y, dx, dy]) => {
      let d = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
      for (let i = 0; i < 4; i++) {
        const ang = Math.atan2(dy, dx) + rand(-0.6, 0.6), L = rand(16, 40) * k;
        x += Math.cos(ang) * L; y += Math.sin(ang) * L;
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      const p = svg('path', { d, pathLength: 1 }, s);
      p.style.strokeDasharray = '1';
      A(p, [{ strokeDashoffset: '1' }, { strokeDashoffset: '0' }], { duration: 900 });
    });
  }

  async function playMythicEffect(res) {
    newRun();
    openStage('t-mythic');
    document.documentElement.classList.add('fx-mono');
    audio.mythicDrone(3.1);
    await sleep(260); if (cancelled()) return;                                  // 정적
    stageEl.classList.add('dim');                                               // 아주 어두운 회색까지
    await sleep(800); if (cancelled()) return;
    audio.mythicMembrane(RM ? 2.2 : 1.9);
    const mem = await playBlackWhiteTransition(RM ? 2200 : 1900);              // BLACK / WHITE 교차 → 충돌
    if (cancelled()) return;
    await sleep(110); if (cancelled()) return;                                  // 0.1초 정지
    const g = slashGeometry();
    const snap = mem.toDataURL('image/png');
    const halves = splitHalves(snap, g);
    mem.remove();
    audio.mythicSlash();
    await playMythicSlash(g); if (cancelled()) return;                          // 대각선 검기
    const shards = createWorldFragments(snap, g, RM ? 8 : 12);
    audio.mythicShards();
    await animateFragments(halves, shards, g); if (cancelled()) return;         // 조각 분리 → 날아감
    const card = createMythicTraitFragment(res, snap);
    audio.mythicCard();
    await enterCard(card); if (cancelled()) return;                             // 조각 하나가 중앙으로, 정면으로 회전
    audio.mythicName();
    await revealCardName(card); if (cancelled()) return;                        // 신화 특성 이름
    await sleep(380); if (cancelled()) return;
    createSingleOrbitStar(card);                                                // 별 1개 + 궤적 1개
    audio.mythicStar();
    edgeCracks();
    dust(14);
    await sleep(700); if (cancelled()) return;
    showMeta(res);
  }

  function playStage(res) {
    if (res.level === 3) return playRareEffect(res);
    if (res.level === 4) return playEpicEffect(res);
    if (res.level === 5) return playLegendaryEffect(res);
    return playMythicEffect(res);
  }

  TG.effects = {
    setAnticipation, clearAnticipation, clearReelFx,
    playReelReveal, playStage, waitDismiss, closeStage, abort,
    playBasicEffect, playCommonEffect, playUncommonEffect,
    playRareEffect, playEpicEffect, playLegendaryEffect, playMythicEffect,
    playBlackWhiteTransition, playMythicSlash, createWorldFragments, animateFragments, createMythicTraitFragment, createSingleOrbitStar,
  };
})(window.TG = window.TG || {});

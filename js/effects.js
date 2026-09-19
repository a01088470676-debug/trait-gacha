/* 모든 뽑기 연출.
   - 기본 · 커먼: 릴이 결과에 멈춘 뒤 릴 위에서 공개 (playBasicEffect, playCommonEffect)
   - 언커먼 ~ 레전더리: 릴이 뒤에서 도는 동안 화면 중앙 무대(#fxStage)에서 공개.
     흰 별이 나타나 등급이 오를수록 한 바퀴씩 더 돌며(2~5바퀴) 등급 색으로 차오른 뒤 등급마다 다르게 변한다.
   - 신화: 흑백 → 검기 → 화면 조각 → 특성 조각 → 별 하나 (playMythicEffect)
   애니메이션은 Web Animations API(transform · opacity · clip-path 위주)로 돌리고,
   requestAnimationFrame은 입자 캔버스와 신화의 흑백 막에만 쓴다. 만든 요소는 끝나면 지운다. */
(function (TG) {
  'use strict';
  const { $, rand, pick, fmtPct, RM } = TG.util;
  const audio = TG.audio;
  const stageEl = $('fxStage');
  const glowEl = $('ambientGlow'), veilEl = $('ambientVeil');
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
  const motion = k => RM ? k * 0.4 : k;          // 움직임 거리 (reduced-motion이면 줄임)

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
  // 중앙에서 바깥으로 살짝 퍼지는 입자
  function burstMotes(c, { n, colors, speed = 160 }) {
    for (let i = 0; i < count(n); i++) {
      const ang = rand(0, Math.PI * 2), s = rand(speed * 0.4, speed);
      addMote({ x: c.x, y: c.y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, size: rand(0.9, 1.8), life: rand(0.6, 1.0), color: pick(colors), glow: true });
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
    2: { c: '#62d69b', glow: 0.2, veil: 0.2 },
    3: { c: '#5cc8ff', glow: 0.26, veil: 0.28 },
    4: { c: '#a980ff', glow: 0.32, veil: 0.42 },
    5: { c: '#ffb43a', glow: 0.26, veil: 0.6 },
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

  /* ---------- 궤도: 요소 주변을 도는 타원 경로 ---------- */
  // layer 안에 rect(화면 좌표)를 감싸는 타원 궤도를 만든다. pointAt(0~1)은 그 지점의 layer 좌표.
  function makeOrbit(layer, r, { padX = 26, padY = 20, tilt = -6, period = 6000 } = {}) {
    const lr = layer.getBoundingClientRect();
    const cxp = r.left + r.width / 2 - lr.left, cyp = r.top + r.height / 2 - lr.top;
    const rx = r.width / 2 + padX, ry = r.height / 2 + padY, pad = 16, W = 2 * (rx + pad), H = 2 * (ry + pad);
    const box = el('div', 'orbit', layer);
    Object.assign(box.style, { left: (cxp - W / 2) + 'px', top: (cyp - H / 2) + 'px', width: W + 'px', height: H + 'px', transform: `rotate(${tilt}deg)` });
    const d = `M ${pad} ${pad + ry} a ${rx} ${ry} 0 1 1 ${2 * rx} 0 a ${rx} ${ry} 0 1 1 ${-2 * rx} 0`;
    const guideSvg = svg('svg', { class: 'orbit-guide', width: W, height: H }, box);
    const guide = svg('path', { d }, guideSvg);
    const total = guide.getTotalLength();
    const rad = tilt * Math.PI / 180;
    const pointAt = f => {
      const p = guide.getPointAtLength((((f % 1) + 1) % 1) * total);
      const dx = p.x - W / 2, dy = p.y - H / 2;
      return { x: cxp + dx * Math.cos(rad) - dy * Math.sin(rad), y: cyp + dx * Math.sin(rad) + dy * Math.cos(rad) };
    };
    // phase(0~1)에서 출발해 한 바퀴에 period ms로 계속 돈다
    const add = (node, phase) => {
      node.classList.add('orbiter');
      node.style.offsetPath = `path("${d}")`;
      box.append(node);
      A(node, [{ offsetDistance: `${phase * 100}%` }, { offsetDistance: `${phase * 100 + 100}%` }], { duration: period, iterations: Infinity, easing: 'linear', fill: 'none' });
      return node;
    };
    return { box, d, pointAt, add };
  }
  const miniStar = (cls, tint) => { const s = el('div', 'orb-star' + (cls ? ' ' + cls : '')); s.style.setProperty('--sc', tint); return s; };

  /* ---------- 릴 위에 띄우는 층 (커먼 · 10회 뽑기의 언커먼) ---------- */
  let floatEl = null;
  function floatLayer() {
    if (!floatEl) floatEl = el('div', 'fx-float', document.body);
    return floatEl;
  }
  function clearReelFx() { if (floatEl) { floatEl.getAnimations({ subtree: true }).forEach(a => a.cancel()); floatEl.replaceChildren(); } }
  const nameRectOf = item => item.querySelector('.nm').getBoundingClientRect();

  /* ==========================================================
     기본 — 회색. 이름만 나오고 이펙트 없음
     ========================================================== */
  async function playBasicEffect(res, item) {
    newRun();
    item.classList.add('res');
  }

  /* ==========================================================
     커먼 — 흰색. 작은 별들이 이름을 향해 빙빙 돌다(2바퀴) 공중으로 날아감
     ========================================================== */
  async function playCommonEffect(res, item, quick) {
    newRun();
    item.classList.add('res');
    audio.common();
    const layer = floatLayer();
    const r = nameRectOf(item);
    const dur = quick ? 1000 : 1700;
    const o = makeOrbit(layer, r, { padX: 22, padY: 16, tilt: -4 });
    // 궤도가 좁아지며 이름 쪽으로 감겨 든다
    A(o.box, [{ transform: 'rotate(-4deg) scale(1.35)' }, { transform: 'rotate(-4deg) scale(1)' }], { duration: dur, easing: 'cubic-bezier(.3,0,.4,1)' });
    const n = 6;
    for (let i = 0; i < n; i++) {
      const s = miniStar('small', '#ffffff');
      s.classList.add('orbiter');
      s.style.offsetPath = `path("${o.d}")`;
      o.box.append(s);
      const ph = i / n * 100;
      A(s, [{ offsetDistance: `${ph}%`, opacity: 0 }, { opacity: 1, offset: 0.12 }, { offsetDistance: `${ph + 200}%`, opacity: 1 }], { duration: dur, easing: 'cubic-bezier(.35,0,.5,1)' });
      after(A(s, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${rand(-30, 30).toFixed(0)}px, ${(-motion(rand(160, 260))).toFixed(0)}px) scale(.4)`, opacity: 0 }],
        { duration: 800, delay: dur + i * 40, easing: 'cubic-bezier(.4,0,.8,.5)' }), () => s.remove());
    }
    setTimeout(() => o.box.remove(), dur + 1200);
    await sleep(quick ? 650 : dur + 250);
  }

  /* 10회 뽑기의 언커먼: 흐름을 멈추지 않도록 릴 위에서 짧게 반짝만 */
  async function playUncommonQuick(res, item) {
    newRun();
    item.classList.add('res');
    audio.uncommonTwinkle();
    const r = nameRectOf(item);
    const g = el('div', 'fx-glint small', floatLayer());
    Object.assign(g.style, { left: (r.right + 6) + 'px', top: (r.top + r.height * 0.2) + 'px' });
    g.style.setProperty('--gc', '#dfffee');
    after(A(g, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.2) rotate(0deg)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1) rotate(45deg)', offset: 0.4 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.3) rotate(90deg)' }],
      { duration: 520, easing: 'ease-out' }), () => g.remove());
    await sleep(420);
  }

  function playReelReveal(res, item, quick) {
    if (res.level === 0) return playBasicEffect(res, item);
    if (res.level === 1) return playCommonEffect(res, item, quick);
    return playUncommonQuick(res, item);
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
    motes = motes.filter(m => !m.dark);
    document.documentElement.classList.remove('fx-mono');
  }

  /* ---------- 공통 도입: 흰 별이 N바퀴 돌며 가운데부터 등급 색으로 차오른다 ---------- */
  // 5각 별 꼭짓점 (중심 50% 50%, 바깥 반지름 50%, 안쪽 20%)
  const STAR_PTS = [[50, 0], [61.76, 33.82], [97.55, 34.55], [69.02, 56.18], [79.39, 90.45], [50, 70], [20.61, 90.45], [30.98, 56.18], [2.45, 34.55], [38.24, 33.82]];
  async function summonStar(parent, { turns, fill, glow, dur }) {
    dur = RM ? dur * 0.6 : dur;
    const size = Math.round(Math.max(120, Math.min(230, Math.min(vw(), vh()) * 0.34)));
    const wrap = el('div', 'ss', parent);
    wrap.style.width = wrap.style.height = size + 'px';
    const rot = el('div', 'ss-rot', wrap);
    el('div', 'ss-base', rot);
    const f = el('div', 'ss-fill', rot);
    f.style.background = fill;
    A(wrap, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.2)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1)' }], { duration: 420, easing: 'cubic-bezier(.2,1.3,.4,1)' });
    A(wrap, [{ filter: 'drop-shadow(0 0 10px rgba(255,255,255,.45))' }, { filter: `drop-shadow(0 0 22px ${glow})` }], { duration: dur });
    A(rot, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${turns * 360}deg)` }], { duration: dur, easing: 'cubic-bezier(.45,.05,.4,1)' });
    A(f, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: dur * 0.95, easing: 'cubic-bezier(.5,0,.6,1)' });
    audio.summon(turns, dur / 1000);
    await sleep(dur);
    return { wrap, rot, size };
  }
  // 별을 가운데서 뻗는 삼각형 10조각으로 나눈다 (조각마다 무게중심 · 바깥 방향을 기억)
  function starShards(wrap, bg) {
    const out = [];
    for (let i = 0; i < 10; i++) {
      const a = STAR_PTS[i], b = STAR_PTS[(i + 1) % 10];
      const s = el('div', 'ss-shard', wrap);
      s.style.clipPath = `polygon(50% 50%, ${a[0]}% ${a[1]}%, ${b[0]}% ${b[1]}%)`;
      s.style.background = bg;
      const c = [(50 + a[0] + b[0]) / 3, (50 + a[1] + b[1]) / 3];
      s.style.transformOrigin = `${c[0]}% ${c[1]}%`;
      const dx = c[0] - 50, dy = c[1] - 50, len = Math.hypot(dx, dy) || 1;
      s._c = c; s._dir = [dx / len, dy / len];
      out.push(s);
    }
    return out;
  }

  /* ==========================================================
     언커먼 — 초록. 흰 별 2바퀴 → 초록으로 차오름 → 반짝 → 이름 → 별 2개가 이름 주변을 돎
     ========================================================== */
  async function playUncommonEffect(res, q = 1) {
    newRun();
    openStage('t-unc');
    requestAnimationFrame(() => stageEl.classList.add('dim'));
    const L = layer();
    const C = color('uncommon');
    const st = await summonStar(L, { turns: 2, fill: C, glow: 'rgba(98,214,155,.85)', dur: 1500 * q });
    if (cancelled()) return;
    // 반짝
    const glint = el('div', 'fx-glint', L);
    glint.style.setProperty('--gc', '#eafff3');
    after(A(glint, [{ opacity: 0, transform: 'translate(-50%,-50%) scale(.2) rotate(0deg)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.2) rotate(45deg)', offset: 0.35 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.6) rotate(90deg)' }],
      { duration: 620, easing: 'ease-out' }), () => glint.remove());
    after(A(st.wrap, [{ opacity: 1, transform: 'translate(-50%,-50%) scale(1)', filter: 'brightness(1)' }, { opacity: 1, transform: 'translate(-50%,-50%) scale(1.12)', filter: 'brightness(1.8)', offset: 0.3 }, { opacity: 0, transform: 'translate(-50%,-50%) scale(.2)', filter: 'brightness(2)' }],
      { duration: 520, easing: 'ease-in' }), () => st.wrap.remove());
    burstMotes(center(), { n: 10, colors: [C, '#ffffff'] });
    audio.uncommonTwinkle();
    await sleep(380); if (cancelled()) return;
    // 이름
    const { box, name } = nameBox(L, res.name);
    A(name, [{ opacity: 0, transform: 'translateY(8px)', filter: 'blur(4px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: 520 });
    await sleep(320); if (cancelled()) return;
    // 이름 근처를 도는 별 2개
    const o = makeOrbit(L, box.getBoundingClientRect(), { padX: 22, padY: 16, tilt: -5, period: RM ? 40000 : 5200 });
    o.add(miniStar('', '#d9ffea'), 0);
    o.add(miniStar('', '#d9ffea'), 0.5);
    A(o.box, [{ opacity: 0 }, { opacity: 1 }], { duration: 600 });
    await sleep(500); if (cancelled()) return;
    showMeta(res);
  }

  /* ==========================================================
     레어 — 하늘색. 흰 별 3바퀴 → 하늘색 → 별이 조각나며 사라짐 → 이름이 한 획씩 채워짐
     → 네모 → 세모 → 동그라미로 변하는 도형 1개가 이름 주변을 돎
     ========================================================== */
  // 글꼴에는 한글 획순 정보가 없어서, 글자마다 윤곽을 따라 그린 뒤 속을 채운다
  async function strokeText(parent, text, { fill, stroke, perChar = 520, stagger = 150 }) {
    const box = el('div', 'fx-namebox', parent);
    let fs = Math.max(32, Math.min(78, vw() * 0.06));
    try { await Promise.race([document.fonts.load(`700 ${fs}px "Noto Serif KR"`, text), new Promise(r => setTimeout(r, 700))]); } catch {}
    const s = svg('svg', { class: 'fx-stroke', 'aria-label': text }, box);
    const t = svg('text', { x: 0, y: 0 }, s);
    const spans = [...text].map(ch => { const sp = svg('tspan', {}, t); sp.textContent = ch; return sp; });
    const layout = () => {
      t.style.fontSize = fs + 'px';
      const w = t.getComputedTextLength();
      const pad = fs * 0.2;
      s.setAttribute('width', Math.ceil(w + pad * 2));
      s.setAttribute('height', Math.ceil(fs * 1.45));
      t.setAttribute('x', pad);
      t.setAttribute('y', Math.round(fs * 1.08));
      return w;
    };
    const maxW = Math.min(vw() * 0.9, 1000) - 40;
    const w = layout();
    if (w > maxW) { fs = fs * maxW / w; layout(); }
    const L = Math.round(fs * 7);           // 한 글자 윤곽 길이보다 넉넉하게
    t.style.strokeWidth = (fs * 0.02).toFixed(2) + 'px';
    t.style.stroke = stroke; t.style.fill = fill;
    const per = RM ? perChar * 0.6 : perChar;
    spans.forEach((sp, i) => {
      sp.style.strokeDasharray = `${L} ${L}`;
      sp.style.strokeDashoffset = String(L);
      sp.style.fillOpacity = '0';
      A(sp, [{ strokeDashoffset: String(L) }, { strokeDashoffset: '0' }], { duration: per, delay: i * stagger, easing: 'cubic-bezier(.45,0,.3,1)' });
      A(sp, [{ fillOpacity: 0 }, { fillOpacity: 1 }], { duration: per * 0.6, delay: i * stagger + per * 0.55, easing: 'ease-out' });
    });
    audio.rareWrite(spans.length, stagger / 1000);
    return { box, duration: (spans.length - 1) * stagger + per * 1.15 };
  }
  // 둘레를 같은 간격으로 N점 찍은 네모 · 세모 · 동그라미 (점 수가 같아야 모양이 자연스럽게 바뀐다)
  function perimeterPoints(verts, N) {
    const segs = verts.map((p, i) => { const q = verts[(i + 1) % verts.length]; return { p, q, len: Math.hypot(q[0] - p[0], q[1] - p[1]) }; });
    const total = segs.reduce((s, g) => s + g.len, 0);
    const out = [];
    for (let i = 0; i < N; i++) {
      let d = i / N * total, k = 0;
      while (d > segs[k].len) { d -= segs[k].len; k++; }
      const g = segs[k], t = d / g.len;
      out.push([g.p[0] + (g.q[0] - g.p[0]) * t, g.p[1] + (g.q[1] - g.p[1]) * t]);
    }
    return out;
  }
  function morphShape(tint) {
    const N = 24;
    const fmt = pts => pts.map(p => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
    const square = fmt(perimeterPoints([[0, -34], [34, -34], [34, 34], [-34, 34], [-34, -34]], N));
    const tri = fmt(perimeterPoints([[0, -40], [34.6, 20], [-34.6, 20]], N));
    const circle = fmt([...Array(N)].map((_, i) => { const a = -Math.PI / 2 + i / N * Math.PI * 2; return [Math.cos(a) * 34, Math.sin(a) * 34]; }));
    const wrapEl = el('div', 'cube');
    const s = svg('svg', { viewBox: '-50 -50 100 100', class: 'morph' }, wrapEl);
    const poly = svg('polygon', { points: square, fill: 'none', stroke: tint, 'stroke-width': 6, 'stroke-linejoin': 'round' }, s);
    svg('animate', { attributeName: 'points', values: [square, tri, circle, square].join(';'), dur: RM ? '12s' : '4.8s', repeatCount: 'indefinite',
      calcMode: 'spline', keyTimes: '0;0.333;0.667;1', keySplines: '.6 0 .4 1;.6 0 .4 1;.6 0 .4 1' }, poly);
    return wrapEl;
  }
  async function playRareEffect(res, q = 1) {
    newRun();
    openStage('t-rare');
    requestAnimationFrame(() => stageEl.classList.add('dim'));
    const L = layer();
    const C = color('rare');
    const st = await summonStar(L, { turns: 3, fill: C, glow: 'rgba(92,200,255,.9)', dur: 1900 * q });
    if (cancelled()) return;
    // 별이 조각나며 사라짐
    const shards = starShards(st.wrap, C);
    st.rot.remove();
    const k = st.size / 200;
    shards.forEach(s => {
      const d = motion(rand(110, 230)) * k;
      A(s, [{ transform: 'translate(0,0) rotate(0deg) scale(1)', opacity: 1 }, { transform: `translate(${(s._dir[0] * d).toFixed(0)}px, ${(s._dir[1] * d).toFixed(0)}px) rotate(${rand(-140, 140).toFixed(0)}deg) scale(.5)`, opacity: 0 }],
        { duration: 820, easing: 'cubic-bezier(.15,.7,.3,1)' });
    });
    burstMotes(center(), { n: 12, colors: [C, '#ffffff'], speed: 220 });
    audio.rareShatter();
    await sleep(360); if (cancelled()) return;
    // 이름이 한 획씩 채워짐
    const t = await strokeText(L, res.name, { fill: '#eef9ff', stroke: '#a8e4ff' });
    if (cancelled()) return;
    await sleep(t.duration); if (cancelled()) return;
    st.wrap.remove();
    // 모양이 바뀌는 도형 1개
    const o = makeOrbit(L, t.box.getBoundingClientRect(), { padX: 36, padY: 28, tilt: -6, period: RM ? 40000 : 9000 });
    o.add(morphShape(C), 0.1);
    A(o.box, [{ opacity: 0 }, { opacity: 1 }], { duration: 600 });
    await sleep(500); if (cancelled()) return;
    showMeta(res);
  }

  /* ==========================================================
     에픽 — 보라. 흰 별 4바퀴 → 보라로 가득 → 점점 빨라짐 → 흰 배경
     → 가운데 이름, 뒤에 마법진과 위에서 아래로 펼쳐지는 은하수
     ========================================================== */
  function sigil(kind, parent) {
    const size = Math.round(Math.min(vw() * 0.86, vh() * 0.7, 540));
    const s = svg('svg', { viewBox: '-100 -100 200 200', class: 'fx-sigil', width: size, height: size }, parent);
    const px = 200 / size;
    const paths = [];
    const pol = (r, deg) => { const t = (deg - 90) * Math.PI / 180; return [r * Math.cos(t), r * Math.sin(t)]; };
    const P = (r, deg) => pol(r, deg).map(v => v.toFixed(2)).join(' ');
    const circle = (r, x = 0, y = 0) => `M ${x - r} ${y} a ${r} ${r} 0 1 0 ${2 * r} 0 a ${r} ${r} 0 1 0 ${-2 * r} 0`;
    const ticks = (r0, r1, n) => { let d = ''; for (let i = 0; i < n; i++) { const a = i * 360 / n; d += `M ${P(r0, a)} L ${P(r1, a)} `; } return d; };
    const star = (r, n, step, rot = 0) => { let d = ''; for (let i = 0; i <= n; i++) d += (i ? 'L ' : 'M ') + P(r, rot + ((i * step) % n) * 360 / n) + ' '; return d; };
    const add = (d, { w = 1, op = 1 } = {}) => {
      const p = svg('path', { d, pathLength: 1, 'stroke-width': (px * w).toFixed(3) }, s);
      p.style.opacity = op;
      p.style.strokeDasharray = '1';
      p.style.strokeDashoffset = '1';
      paths.push(p);
    };
    add(circle(94), { op: 0.9 });
    add(circle(88), { op: 0.45 });
    add(ticks(88, 94, 72), { op: 0.5 });
    add(circle(60), { op: 0.8 });
    add(star(60, 3, 1, 0), { op: 0.75 });
    add(star(60, 3, 1, 60), { op: 0.75 });
    [0, 120, 240].forEach(a => { const [x, y] = pol(60, a); add(circle(2.6, x, y), { op: 0.9 }); });
    add(circle(26), { op: 0.55 });
    return { svg: s, paths, size };
  }
  function drawSigil(sg, dur) {
    sg.paths.forEach((p, i) => A(p, [{ strokeDashoffset: '1' }, { strokeDashoffset: '0' }],
      { duration: RM ? dur * 0.6 : dur, delay: i * 45, easing: 'cubic-bezier(.4,0,.2,1)' }));
  }
  // 위에서 아래로 흐르는 은하수 띠 (희미한 안개 + 작은 별들)
  function milkyWay(parent) {
    const W = vw(), H = vh();
    const mw = el('div', 'mw', parent);
    el('div', 'mw-haze', mw);
    const s = svg('svg', { class: 'mw-stars', viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none' }, mw);
    const n = Math.round(Math.min(140, Math.max(60, W * H / 9000)));
    const tints = ['#6b3fd4', '#8f62f0', '#b89aff', '#3b1d74'];
    for (let i = 0; i < n; i++) {
      const y = rand(0, H);
      const g = (rand(0, 1) + rand(0, 1) + rand(0, 1) - 1.5) / 1.5;          // 가운데로 몰린 분포
      const x = W / 2 + g * W * 0.14 + (y / H - 0.5) * W * 0.18;
      const c = svg('circle', { cx: x.toFixed(1), cy: y.toFixed(1), r: rand(0.6, 2.1).toFixed(2), fill: pick(tints) }, s);
      c.style.opacity = rand(0.35, 0.95).toFixed(2);
      if (i % 9 === 0) { c.classList.add('tw'); c.style.animationDelay = rand(0, 2.4).toFixed(2) + 's'; }
    }
    A(mw, [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }], { duration: RM ? 600 : 1500, easing: 'cubic-bezier(.3,0,.2,1)' });
    return mw;
  }
  async function playEpicEffect(res, q = 1) {
    newRun();
    openStage('t-epic');
    requestAnimationFrame(() => stageEl.classList.add('dim'));
    const L = layer();
    const C = color('epic');
    const st = await summonStar(L, { turns: 4, fill: C, glow: 'rgba(169,128,255,.9)', dur: 2300 * q });
    if (cancelled()) return;
    // 보라로 가득 찬 별이 점점 빨라짐
    const spinMs = (RM ? 700 : 1300) * q;
    A(st.rot, [{ transform: 'rotate(1440deg)' }, { transform: `rotate(${1440 + 360 * (RM ? 2 : 9)}deg)` }], { duration: spinMs, easing: 'cubic-bezier(.55,0,1,1)' });
    A(st.wrap, [{ transform: 'translate(-50%,-50%) scale(1)', filter: 'drop-shadow(0 0 22px rgba(169,128,255,.9))' },
                { transform: 'translate(-50%,-50%) scale(.82)', filter: 'drop-shadow(0 0 44px rgba(255,255,255,1))' }], { duration: spinMs, easing: 'ease-in' });
    audio.epicSpin(spinMs / 1000);
    await sleep(spinMs * 0.9); if (cancelled()) return;
    // 흰 배경
    const white = el('div', 'fx-white', stageEl);
    await A(white, [{ opacity: 0 }, { opacity: RM ? 0.7 : 1 }], { duration: 240, easing: 'ease-in' }).finished.catch(() => {});
    if (cancelled()) return;
    audio.epicWhite();
    stageEl.classList.add('white');
    st.wrap.remove();
    milkyWay(L);
    const sg = sigil('epic', L);
    const { name } = nameBox(L, res.name);
    name.style.opacity = '0';
    after(A(white, [{ opacity: RM ? 0.7 : 1 }, { opacity: 0 }], { duration: 800, easing: 'ease-out' }), () => white.remove());
    drawSigil(sg, 1500);
    A(sg.svg, [{ transform: 'translate(-50%,-50%) rotate(0deg)' }, { transform: 'translate(-50%,-50%) rotate(60deg)' }], { duration: RM ? 1 : 14000, easing: 'linear' });
    await sleep(380); if (cancelled()) return;
    A(name, [{ opacity: 0, filter: 'blur(8px)', letterSpacing: '.3em' }, { opacity: 1, filter: 'blur(0px)', letterSpacing: '.08em' }], { duration: 820 });
    await sleep(1100); if (cancelled()) return;
    showMeta(res);
  }

  /* ==========================================================
     레전더리 — 노랑 · 주황. 흰 별 5바퀴 → 노랑·주황 그라데이션 → 가운데부터 천천히 금이 가다 깨짐
     → 가운데 이름 → 부서진 파편이 작아지며 이름 주변을 돎
     ========================================================== */
  const LEGEND_FILL = 'linear-gradient(180deg,#ffe36b 0%,#ffb43a 55%,#ff7a1a 100%)';
  // 가운데에서 꼭짓점 쪽으로 뻗는 들쭉날쭉한 금
  function crackStar(wrap, dur) {
    const s = svg('svg', { class: 'ss-crack', viewBox: '0 0 100 100' }, wrap);
    const tips = [0, 2, 4, 6, 8].map(i => STAR_PTS[i]);
    tips.concat([[50, 90], [18, 50]]).forEach((tip, i) => {
      let x = 50, y = 52, d = `M ${x} ${y}`;
      const steps = 4;
      for (let k = 1; k <= steps; k++) {
        const t = k / steps * 0.82;
        x = 50 + (tip[0] - 50) * t + rand(-3.5, 3.5);
        y = 52 + (tip[1] - 52) * t + rand(-3.5, 3.5);
        d += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
      }
      const p = svg('path', { d, pathLength: 1 }, s);
      p.style.strokeDasharray = '1';
      A(p, [{ strokeDashoffset: '1' }, { strokeDashoffset: '0' }], { duration: dur * 0.75, delay: i * dur * 0.04, easing: 'cubic-bezier(.5,0,.8,.6)' });
    });
    return s;
  }
  async function playLegendaryEffect(res, q = 1) {
    newRun();
    openStage('t-legend');
    requestAnimationFrame(() => stageEl.classList.add('dim'));
    const L = layer();
    const st = await summonStar(L, { turns: 5, fill: LEGEND_FILL, glow: 'rgba(255,170,60,.95)', dur: 2700 * q });
    if (cancelled()) return;
    // 가운데부터 천천히 금이 감
    const crackMs = (RM ? 700 : 1300) * q;
    const cr = crackStar(st.wrap, crackMs);
    if (!RM) {
      const j = n => `translate(calc(-50% + ${n}px), calc(-50% + ${(-n * 0.6).toFixed(1)}px))`;
      A(st.wrap, [{ transform: j(0) }, { transform: j(0.6) }, { transform: j(-0.8) }, { transform: j(1.2) }, { transform: j(-1.5) }, { transform: j(1.8) }, { transform: j(0) }],
        { duration: crackMs, easing: 'linear', fill: 'none' });
    }
    A(st.wrap, [{ filter: 'drop-shadow(0 0 22px rgba(255,170,60,.95))' }, { filter: 'drop-shadow(0 0 40px rgba(255,236,180,1))' }], { duration: crackMs });
    audio.legendCrack(crackMs / 1000);
    await sleep(crackMs); if (cancelled()) return;
    // 깨짐
    const shards = starShards(st.wrap, LEGEND_FILL);
    st.rot.remove(); cr.remove();
    const k = st.size / 200;
    const burst = shards.map(s => ({ s, d: motion(rand(60, 120)) * k, r: rand(-90, 90) }));
    burst.forEach(({ s, d, r }) => A(s, [{ transform: 'translate(0px,0px) rotate(0deg) scale(1)' }, { transform: `translate(${(s._dir[0] * d).toFixed(1)}px, ${(s._dir[1] * d).toFixed(1)}px) rotate(${r.toFixed(0)}deg) scale(1)` }],
      { duration: 520, easing: 'cubic-bezier(.1,.8,.3,1)' }));
    const core = el('div', 'fx-core', L);
    after(A(core, [{ opacity: 0.95, transform: 'translate(-50%,-50%) scale(.4)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.8)' }], { duration: 700, easing: 'ease-out' }), () => core.remove());
    audio.legendBreak();
    await sleep(420); if (cancelled()) return;
    // 가운데 이름
    const { box, name } = nameBox(L, res.name);
    A(name, [{ opacity: 0, filter: 'blur(10px)', transform: 'scale(.96)' }, { opacity: 1, filter: 'blur(0px)', transform: 'none' }], { duration: 900 });
    await sleep(240); if (cancelled()) return;
    // 파편이 작아지며 이름 주변 궤도로
    const o = makeOrbit(L, box.getBoundingClientRect(), { padX: 42, padY: 30, tilt: -7, period: RM ? 60000 : 8000 });
    const wr = st.wrap.getBoundingClientRect(), lr = L.getBoundingClientRect();
    const scale = 0.24;
    burst.forEach(({ s, d, r }, i) => {
      const p = o.pointAt(i / burst.length);
      const bx = wr.left - lr.left + s._c[0] / 100 * wr.width + s._dir[0] * d;
      const by = wr.top - lr.top + s._c[1] / 100 * wr.height + s._dir[1] * d;
      A(s, [{ transform: `translate(${(s._dir[0] * d).toFixed(1)}px, ${(s._dir[1] * d).toFixed(1)}px) rotate(${r.toFixed(0)}deg) scale(1)` },
            { transform: `translate(${(s._dir[0] * d + p.x - bx).toFixed(1)}px, ${(s._dir[1] * d + p.y - by).toFixed(1)}px) rotate(${(r + 180).toFixed(0)}deg) scale(${scale})` }],
        { duration: RM ? 500 : 950, easing: 'cubic-bezier(.4,0,.2,1)' });
    });
    await sleep(RM ? 500 : 950); if (cancelled()) return;
    // 같은 자리 · 같은 모양의 궤도 조각으로 바꿔 계속 돌게 한다
    const piece = st.size * scale;
    burst.forEach(({ s, r }, i) => {
      const f = el('div', 'orb-shard');
      Object.assign(f.style, { width: piece + 'px', height: piece + 'px', clipPath: s.style.clipPath, background: LEGEND_FILL,
        offsetAnchor: `${s._c[0]}% ${s._c[1]}%`, transformOrigin: `${s._c[0]}% ${s._c[1]}%`, transform: `rotate(${(r + 180).toFixed(0)}deg)` });
      o.add(f, i / burst.length);
    });
    st.wrap.remove();
    audio.legendOrbit();
    await sleep(500); if (cancelled()) return;
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

  // quick: 10회 뽑기에서는 도입(별 회전)을 조금 빠르게
  function playStage(res, quick) {
    const q = quick ? 0.7 : 1;
    if (res.level === 2) return playUncommonEffect(res, q);
    if (res.level === 3) return playRareEffect(res, q);
    if (res.level === 4) return playEpicEffect(res, q);
    if (res.level === 5) return playLegendaryEffect(res, q);
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

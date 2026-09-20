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
    audio.stopAll();                      // 예약된 소리까지 바로 끈다
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
    audio.stopAll();                      // 화면이 닫히면 소리 꼬리도 같이 끊는다
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
  async function playUncommonEffect(res, q = 1, opts = {}) {
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
    if (!opts.noMeta) showMeta(res);
    return { box };
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
  async function playRareEffect(res, q = 1, opts = {}) {
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
    if (!opts.noMeta) showMeta(res);
    return { box: t.box };
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
  async function playEpicEffect(res, q = 1, opts = {}) {
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
    const { box, name } = nameBox(L, res.name);
    name.style.opacity = '0';
    after(A(white, [{ opacity: RM ? 0.7 : 1 }, { opacity: 0 }], { duration: 800, easing: 'ease-out' }), () => white.remove());
    drawSigil(sg, 1500);
    A(sg.svg, [{ transform: 'translate(-50%,-50%) rotate(0deg)' }, { transform: 'translate(-50%,-50%) rotate(60deg)' }], { duration: RM ? 1 : 14000, easing: 'linear' });
    await sleep(380); if (cancelled()) return;
    A(name, [{ opacity: 0, filter: 'blur(8px)', letterSpacing: '.3em' }, { opacity: 1, filter: 'blur(0px)', letterSpacing: '.08em' }], { duration: 820 });
    await sleep(1100); if (cancelled()) return;
    if (!opts.noMeta) showMeta(res);
    return { box };
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
  async function playLegendaryEffect(res, q = 1, opts = {}) {
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
    if (!opts.noMeta) showMeta(res);
    return { box };
  }

  /* ==========================================================
     신화 — 가짜 등급 연출 → ?? → 글리치 → 암전 → 흑백 점멸 → 눈 → 칼질 → 파편 → 이름
     ========================================================== */

  /* 1) 기본~레전더리 중 하나를 골라 그 등급 연출을 그대로 보여 준다 */
  function fakePick() {
    const rows = TG.stats(TG.state.pool).rows.filter(r => r.level < 6 && r.traits.length);
    if (!rows.length) { const level = Math.floor(rand(0, 6)); return { level, name: TG.TIERS[level].ko + ' 특성' }; }
    const row = pick(rows);
    return { level: row.level, name: pick(row.traits) };
  }
  const FAKE_PLAYERS = { 2: playUncommonEffect, 3: playRareEffect, 4: playEpicEffect, 5: playLegendaryEffect };
  async function playFakeTier(f, q) {
    const pseudo = { name: f.name, tier: TG.TIERS[f.level], level: f.level, each: 0 };
    if (f.level >= 2) {
      const r = await FAKE_PLAYERS[f.level](pseudo, q, { noMeta: true });
      return r && r.box;
    }
    openStage(f.level === 0 ? 't-basic' : 't-common');
    requestAnimationFrame(() => stageEl.classList.add('dim'));
    const L = layer();
    const { box, name } = nameBox(L, f.name);
    A(name, [{ opacity: 0, filter: 'blur(5px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 520 });
    if (f.level === 1) {                                   // 커먼: 작은 별이 두 바퀴 돌고 날아감
      audio.common();
      await sleep(320);
      const o = makeOrbit(L, box.getBoundingClientRect(), { padX: 26, padY: 20, tilt: -4 });
      A(o.box, [{ transform: 'rotate(-4deg) scale(1.3)' }, { transform: 'rotate(-4deg) scale(1)' }], { duration: 1500 });
      for (let i = 0; i < 6; i++) {
        const s = miniStar('small', '#ffffff');
        s.classList.add('orbiter');
        s.style.offsetPath = `path("${o.d}")`;
        o.box.append(s);
        A(s, [{ offsetDistance: `${i / 6 * 100}%` }, { offsetDistance: `${i / 6 * 100 + 200}%` }], { duration: 1500, easing: 'cubic-bezier(.35,0,.5,1)' });
        after(A(s, [{ transform: 'translate(0,0)', opacity: 1 }, { transform: `translate(0, ${-motion(200)}px) scale(.4)`, opacity: 0 }], { duration: 700, delay: 1500 + i * 40 }), () => s.remove());
      }
      await sleep(1900);
    } else {
      await sleep(900);
    }
    return box;
  }

  /* 2) 이름 뒤에 물음표가 하나씩 늘어난다 */
  async function questionMarks(box, n = 7) {
    const host = box.parentElement;
    const holder = el('div', 'q-holder', host);
    const r = box.getBoundingClientRect(), lr = host.getBoundingClientRect();
    const base = Math.min(130, Math.max(60, r.height));
    for (let i = 0; i < n; i++) {
      const q = el('div', 'q-mark', holder);
      q.textContent = '?';
      const side = i % 2 ? 1 : -1;
      Object.assign(q.style, {
        left: (r.left + r.width / 2 - lr.left + side * rand(r.width * 0.12, r.width * 0.62)) + 'px',
        top: (r.top + r.height / 2 - lr.top + rand(-r.height * 0.5, r.height * 0.45)) + 'px',
        fontSize: (rand(0.7, 1.5) * base) + 'px',
      });
      A(q, [{ opacity: 0, transform: `translate(-50%,-50%) scale(.4) rotate(${rand(-25, 25).toFixed(0)}deg)` },
            { opacity: rand(0.3, 0.7).toFixed(2), transform: `translate(-50%,-50%) scale(1) rotate(${rand(-14, 14).toFixed(0)}deg)` }], { duration: 320 });
      audio.mythicQuestion(i);
      await sleep(190 - i * 8);
      if (cancelled()) return;
    }
    await sleep(300);
  }

  /* 3) 글리치 10종 — 하나만 무작위로 터진다 */
  const gShake = frames => A(stageEl, frames, { duration: 900, easing: 'steps(6,end)', fill: 'none' });
  const GLITCHES = [
    // 1. 색 분리
    async () => {
      gShake([{ filter: 'none', transform: 'translate(0,0)' },
        { filter: 'drop-shadow(5px 0 rgba(255,0,70,.9)) drop-shadow(-5px 0 rgba(0,220,255,.9))', transform: 'translate(-7px,2px)', offset: 0.2 },
        { filter: 'drop-shadow(-8px 0 rgba(255,0,70,.9)) drop-shadow(8px 0 rgba(0,220,255,.9))', transform: 'translate(9px,-3px)', offset: 0.55 },
        { filter: 'drop-shadow(3px 0 rgba(255,0,70,.9)) drop-shadow(-3px 0 rgba(0,220,255,.9))', transform: 'translate(-3px,1px)', offset: 0.8 },
        { filter: 'none', transform: 'translate(0,0)' }]);
      await sleep(900);
    },
    // 2. 가로로 잘려 밀림
    async () => {
      const bands = [];
      for (let i = 0; i < 9; i++) {
        const b = el('div', 'g-band', stageEl);
        const h = rand(3, 9);
        Object.assign(b.style, { top: rand(0, 100 - h) + '%', height: h + '%' });
        A(b, [{ opacity: 0, transform: 'translateX(0)' },
              { opacity: 1, transform: `translateX(${rand(-16, 16).toFixed(1)}vw)`, offset: rand(0.2, 0.7).toFixed(2) },
              { opacity: 0, transform: 'translateX(0)' }], { duration: 900, easing: 'steps(5,end)' });
        bands.push(b);
      }
      gShake([{ transform: 'translateX(0)' }, { transform: 'translateX(-12px)', offset: 0.3 }, { transform: 'translateX(14px)', offset: 0.65 }, { transform: 'translateX(0)' }]);
      await sleep(900);
      bands.forEach(b => b.remove());
    },
    // 3. 깜빡임
    async () => {
      const f = el('div', 'g-flash', stageEl);
      A(f, [{ opacity: 0, background: '#fff' }, { opacity: .9, offset: .1 }, { opacity: 0, offset: .2 },
            { opacity: .7, background: '#000', offset: .35 }, { opacity: 0, offset: .5 },
            { opacity: .85, background: '#fff', offset: .7 }, { opacity: 0 }], { duration: 900, easing: 'steps(8,end)' });
      gShake([{ opacity: 1 }, { opacity: .2, offset: .25 }, { opacity: 1, offset: .35 }, { opacity: .3, offset: .6 }, { opacity: 1 }]);
      await sleep(900);
      f.remove();
    },
    // 4. 화면이 위아래로 흐름
    async () => {
      gShake([{ transform: 'translateY(0)' }, { transform: 'translateY(-38vh)', offset: .18 }, { transform: 'translateY(26vh)', offset: .4 },
        { transform: 'translateY(-14vh)', offset: .62 }, { transform: 'translateY(6vh)', offset: .82 }, { transform: 'translateY(0)' }]);
      const f = el('div', 'g-scan', stageEl);
      A(f, [{ opacity: .5, transform: 'translateY(-100%)' }, { opacity: .5, transform: 'translateY(100%)' }], { duration: 900, easing: 'linear' });
      await sleep(900);
      f.remove();
    },
    // 5. 심하게 흔들림
    async () => {
      const j = () => `translate(${rand(-22, 22).toFixed(0)}px, ${rand(-16, 16).toFixed(0)}px) rotate(${rand(-1.6, 1.6).toFixed(2)}deg)`;
      gShake([{ transform: 'none' }, { transform: j(), offset: .15 }, { transform: j(), offset: .3 }, { transform: j(), offset: .45 },
        { transform: j(), offset: .6 }, { transform: j(), offset: .75 }, { transform: j(), offset: .9 }, { transform: 'none' }]);
      await sleep(900);
    },
    // 6. 색 반전
    async () => {
      gShake([{ filter: 'none' }, { filter: 'invert(1)', offset: .12 }, { filter: 'none', offset: .24 },
        { filter: 'invert(1) hue-rotate(90deg)', offset: .46 }, { filter: 'none', offset: .58 },
        { filter: 'invert(1)', offset: .78 }, { filter: 'none' }], { });
      await sleep(900);
    },
    // 7. 사각 블록이 튐
    async () => {
      const blocks = [];
      for (let i = 0; i < 22; i++) {
        const b = el('div', 'g-block', stageEl);
        Object.assign(b.style, { left: rand(0, 92) + '%', top: rand(0, 92) + '%', width: rand(4, 22) + '%', height: rand(1.5, 9) + '%', background: Math.random() < 0.5 ? '#fff' : '#111' });
        A(b, [{ opacity: 0 }, { opacity: 1, offset: rand(0.1, 0.8).toFixed(2) }, { opacity: 0 }], { duration: 900, easing: 'steps(4,end)' });
        blocks.push(b);
      }
      await sleep(900);
      blocks.forEach(b => b.remove());
    },
    // 8. 버벅거림 (같은 장면이 튀며 반복)
    async () => {
      gShake([{ transform: 'scale(1)' }, { transform: 'scale(1.06) translate(6px,-4px)', offset: .12 }, { transform: 'scale(1)', offset: .2 },
        { transform: 'scale(1.06) translate(-8px,5px)', offset: .42 }, { transform: 'scale(1)', offset: .5 },
        { transform: 'scale(1.1) translate(4px,6px)', offset: .72 }, { transform: 'scale(1)' }]);
      const f = el('div', 'g-flash', stageEl);
      f.style.background = '#000';
      A(f, [{ opacity: 0 }, { opacity: 1, offset: .13 }, { opacity: 0, offset: .16 }, { opacity: 0, offset: .43 },
            { opacity: 1, offset: .46 }, { opacity: 0, offset: .5 }, { opacity: 1, offset: .73 }, { opacity: 0, offset: .76 }, { opacity: 0 }],
        { duration: 900, easing: 'steps(12,end)' });
      await sleep(900);
      f.remove();
    },
    // 9. 오류 문구
    async () => {
      const wrap = el('div', 'g-err', stageEl);
      const lines = ['ERROR 0xE7 — TRAIT TABLE CORRUPTED', 'NULL REFERENCE: tier[?]', '>>> RECALCULATING ODDS', 'SIGNAL LOST', '?? ?? ?? ??', 'UNKNOWN ENTRY DETECTED'];
      for (let i = 0; i < 14; i++) {
        const l = el('div', 'g-err-line', wrap);
        l.textContent = pick(lines);
        l.style.top = rand(4, 92) + '%';
        l.style.left = rand(2, 55) + '%';
        A(l, [{ opacity: 0 }, { opacity: 1, offset: rand(0.05, 0.7).toFixed(2) }, { opacity: 0 }], { duration: 900, easing: 'steps(3,end)' });
      }
      gShake([{ transform: 'none' }, { transform: 'translate(-6px,3px)', offset: .3 }, { transform: 'translate(7px,-4px)', offset: .7 }, { transform: 'none' }]);
      await sleep(900);
      wrap.remove();
    },
    // 10. 글자가 깨져 뒤섞임
    async () => {
      const pool = '?!@#$%&*ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ0123456789';
      const targets = [...stageEl.querySelectorAll('.fx-name, .fx-stroke tspan')];
      const olds = targets.map(t => t.textContent);
      gShake([{ transform: 'none' }, { transform: 'translate(-5px,2px)', offset: .4 }, { transform: 'translate(6px,-3px)', offset: .8 }, { transform: 'none' }]);
      for (let k = 0; k < 9; k++) {
        targets.forEach((t, i) => { t.textContent = [...olds[i]].map(c => (c === ' ' ? ' ' : pick(pool))).join(''); });
        await sleep(90);
        if (cancelled()) break;
      }
      targets.forEach((t, i) => { t.textContent = olds[i]; });
      await sleep(120);
    },
  ];

  /* 4) 창이 완전히 검정색으로 */
  async function toBlack() {
    const L = stageEl.querySelector('.fx-layer');
    if (L) A(L, [{ opacity: 1 }, { opacity: 0 }], { duration: 280 });
    await sleep(300);
    stageEl.className = 'fx-stage t-mythic black';
    stageEl.replaceChildren();
    await sleep(160);
  }

  /* 5) 하양과 검정이 번갈아, 점점 빠르게, 검정에서 멈춤 */
  async function bwFlicker() {
    const f = el('div', 'bw', stageEl);
    let t = RM ? 240 : 190, i = 0;
    while (t > (RM ? 90 : 34)) {
      f.style.background = i % 2 ? '#000' : '#fff';
      audio.mythicFlick(i, t < 90);
      await sleep(t);
      if (cancelled()) { f.remove(); return; }
      t *= 0.82; i++;
    }
    f.style.background = '#000';
    await sleep(420);
    f.remove();
  }

  /* 6) 검정 배경에 흰 눈이 천천히 뜬다 */
  async function openEye() {
    const W = vw(), H = vh(), cx = W / 2, cy = H / 2;
    const w = Math.min(W * 0.62, 780), h = Math.min(w * 0.4, H * 0.38);
    const s = svg('svg', { class: 'eye-svg', xmlns: SVGNS, width: W, height: H, viewBox: `0 0 ${W} ${H}` }, stageEl);
    const id = 'eyeclip' + Math.floor(rand(100000, 999999));
    const dEye = `M ${cx - w / 2} ${cy} Q ${cx} ${cy - h} ${cx + w / 2} ${cy} Q ${cx} ${cy + h} ${cx - w / 2} ${cy} Z`;
    const cp = svg('clipPath', { id }, svg('defs', {}, s));
    svg('path', { d: dEye }, cp);
    const g = svg('g', {}, s);
    svg('path', { d: dEye, fill: '#f4f4f2' }, g);
    const inner = svg('g', { 'clip-path': `url(#${id})` }, g);
    const irisR = h * 0.74;
    svg('circle', { cx, cy, r: irisR, fill: '#0a0a0b' }, inner);
    svg('circle', { cx, cy, r: irisR, fill: 'none', stroke: '#ffffff', 'stroke-width': 2, opacity: 0.45 }, inner);
    const pupil = svg('circle', { cx, cy, r: irisR * 0.45, fill: '#000000' }, inner);
    svg('circle', { cx: cx - irisR * 0.32, cy: cy - irisR * 0.34, r: irisR * 0.15, fill: '#ffffff' }, inner);
    svg('path', { d: `M ${cx - w / 2} ${cy} Q ${cx} ${cy - h} ${cx + w / 2} ${cy}`, fill: 'none', stroke: '#ffffff', 'stroke-width': 3 }, g);
    g.style.transformOrigin = `${cx}px ${cy}px`;
    pupil.style.transformBox = 'fill-box';
    pupil.style.transformOrigin = 'center';
    const d = RM ? 1300 : 2200;
    audio.mythicEye(d / 1000);
    A(g, [{ transform: 'scaleY(.02)' }, { transform: 'scaleY(1)' }], { duration: d, easing: 'cubic-bezier(.25,.7,.25,1)' });
    A(pupil, [{ transform: 'scale(1.7)' }, { transform: 'scale(1)' }], { duration: d * 1.15, easing: 'cubic-bezier(.3,.6,.2,1)' });
    A(inner, [{ transform: 'translateX(0)' }, { transform: `translateX(${motion(14).toFixed(0)}px)`, offset: 0.7 }, { transform: 'translateX(0)' }], { duration: d * 1.3, easing: 'ease-in-out' });
    await sleep(d + 520);
    g.style.transform = 'scaleY(1)';          // 조각 낼 때 쓸 수 있게 최종 상태를 남긴다
    pupil.style.transform = 'scale(1)';
    return s;
  }

  /* 7) 무작위로 1~10번, 칼이 화면을 가른다 */
  function cutGeometry() {
    const W = vw(), H = vh(), R = Math.hypot(W, H);
    const a = rand(0, Math.PI);
    const u = { x: Math.cos(a), y: Math.sin(a) }, nrm = { x: -u.y, y: u.x };
    const off = rand(-0.34, 0.34) * Math.min(W, H);
    const c = { x: W / 2 + nrm.x * off, y: H / 2 + nrm.y * off };
    return { P0: { x: c.x - u.x * R * 0.6, y: c.y - u.y * R * 0.6 }, P1: { x: c.x + u.x * R * 0.6, y: c.y + u.y * R * 0.6 },
      u, nrm, len: R * 1.2, ang: a * 180 / Math.PI };
  }
  async function swordCuts() {
    const n = 1 + Math.floor(Math.random() * 10);
    const lines = [];
    const ext = Math.hypot(vw(), vh()) * 0.06;
    for (let i = 0; i < n; i++) {
      const g = cutGeometry();
      lines.push(g);
      const s = el('div', 'slash', stageEl);
      Object.assign(s.style, { left: (g.P0.x - g.u.x * ext) + 'px', top: (g.P0.y - g.u.y * ext) + 'px', width: (g.len + ext * 2) + 'px', transform: `rotate(${g.ang}deg) scaleX(0)` });
      audio.mythicCut(i);
      A(s, [{ transform: `rotate(${g.ang}deg) scaleX(0)` }, { transform: `rotate(${g.ang}deg) scaleX(1)` }], { duration: RM ? 320 : 110, easing: 'cubic-bezier(.7,0,.2,1)' });
      after(A(s, [{ opacity: 1 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], { duration: 950, delay: 140 }), () => s.remove());
      await sleep(RM ? 340 : (n > 6 ? 130 : 210));
      if (cancelled()) return lines;
    }
    await sleep(240);
    return lines;
  }

  /* 8) 잘린 자리를 따라 화면이 조각나 떨어진다 */
  function splitByLine(polys, g) {
    const side = p => (p.x - g.P0.x) * g.nrm.x + (p.y - g.P0.y) * g.nrm.y;
    const out = [];
    for (const poly of polys) {
      const A2 = [], B = [];
      for (let i = 0; i < poly.length; i++) {
        const c = poly[i], nx = poly[(i + 1) % poly.length];
        const sc = side(c), sn = side(nx);
        if (sc >= 0) A2.push(c);
        if (sc <= 0) B.push(c);
        if ((sc > 0 && sn < 0) || (sc < 0 && sn > 0)) {
          const t = sc / (sc - sn);
          const ip = { x: c.x + (nx.x - c.x) * t, y: c.y + (nx.y - c.y) * t };
          A2.push(ip); B.push(ip);
        }
      }
      if (A2.length >= 3) out.push(A2);
      if (B.length >= 3) out.push(B);
    }
    return out;
  }
  const svgSnapshot = s => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(s));
  async function fallFragments(lines, eye) {
    const W = vw(), H = vh();
    let polys = [[{ x: -2, y: -2 }, { x: W + 2, y: -2 }, { x: W + 2, y: H + 2 }, { x: -2, y: H + 2 }]];
    for (const g of lines) {
      if (polys.length > 40) break;
      polys = splitByLine(polys, g);
    }
    const snap = svgSnapshot(eye);
    eye.remove();
    // 조각은 검은 화면이라 그냥 두면 보이지 않는다. 바깥 요소에 그림자를 줘서 잘린 가장자리가 빛나게 한다
    const frags = polys.map(poly => {
      const xs = poly.map(p => p.x), ys = poly.map(p => p.y);
      const x0 = Math.min(...xs), y0 = Math.min(...ys);
      const wrap = el('div', 'frag-wrap', stageEl);
      Object.assign(wrap.style, { left: x0 + 'px', top: y0 + 'px', width: (Math.max(...xs) - x0) + 'px', height: (Math.max(...ys) - y0) + 'px' });
      const f = el('div', 'frag', wrap);
      Object.assign(f.style, {
        backgroundImage: `linear-gradient(160deg, rgba(255,255,255,.14), rgba(255,255,255,.02) 55%), url("${snap}")`,
        backgroundSize: `auto, ${W}px ${H}px`,
        backgroundPosition: `0 0, ${-x0}px ${-y0}px`,
        clipPath: `polygon(${poly.map(p => `${(p.x - x0).toFixed(1)}px ${(p.y - y0).toFixed(1)}px`).join(',')})`,
      });
      return wrap;
    });
    audio.mythicFall();
    frags.forEach(f => {
      after(A(f, [{ transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
                  { transform: `translate(${rand(-70, 70).toFixed(0)}px, ${(H * rand(0.8, 1.4) + 200).toFixed(0)}px) rotate(${rand(-38, 38).toFixed(0)}deg)`, opacity: 0 }],
        { duration: rand(RM ? 900 : 1150, RM ? 1200 : 1750), delay: rand(0, 280), easing: 'cubic-bezier(.35,0,.9,.55)' }), () => f.remove());
    });
    await sleep(760);
  }

  /* 9) 이름이 나오는 방식 10종 — 하나만 무작위로 */
  function titleBox(L, text) {
    const box = el('div', 'fx-namebox', L);
    const name = el('div', 'fx-name m-title', box);
    name.textContent = text;
    return { box, name };
  }
  function charSpans(name, text) {
    name.replaceChildren(...[...text].map(ch => {
      const s = document.createElement('span');
      s.className = 'ch';                 // 띄어쓰기는 CSS white-space:pre 로 살린다
      s.textContent = ch;
      return s;
    }));
    return [...name.children];
  }
  const REVEALS = [
    // 1. 글자가 하나씩 떨어진다
    async (L, text) => {
      const { name } = titleBox(L, text);
      charSpans(name, text).forEach((c, i) => A(c, [{ opacity: 0, transform: `translateY(${-motion(90)}px)`, filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }],
        { duration: 520, delay: i * 70, easing: 'cubic-bezier(.2,1.2,.35,1)' }));
      await sleep(600 + text.length * 70);
    },
    // 2. 위아래 두 조각이 맞물린다
    async (L, text) => {
      const { box, name } = titleBox(L, text);
      name.style.opacity = '0';
      const top = el('div', 'fx-name m-title m-half', box), bot = el('div', 'fx-name m-title m-half', box);
      top.textContent = bot.textContent = text;
      top.style.clipPath = 'inset(0 0 50% 0)'; bot.style.clipPath = 'inset(50% 0 0 0)';
      A(top, [{ opacity: 0, transform: `translate(${-motion(120)}px, ${-motion(30)}px)` }, { opacity: 1, transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.2,.9,.2,1)' });
      A(bot, [{ opacity: 0, transform: `translate(${motion(120)}px, ${motion(30)}px)` }, { opacity: 1, transform: 'none' }], { duration: 700, easing: 'cubic-bezier(.2,.9,.2,1)' });
      await sleep(780);
      name.style.opacity = '1'; top.remove(); bot.remove();
      A(name, [{ filter: 'brightness(2.4)' }, { filter: 'brightness(1)' }], { duration: 400 });
      await sleep(300);
    },
    // 3. 뒤섞이다 확정된다
    async (L, text) => {
      const poolCh = '?!@#$%&*ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ0123456789';
      const { name } = titleBox(L, text);
      const spans = charSpans(name, text);
      for (let k = 0; k < 10; k++) {
        spans.forEach((c, i) => { if (k < 9 - i) c.textContent = pick(poolCh); });
        await sleep(70);
        if (cancelled()) break;
      }
      spans.forEach((c, i) => { c.textContent = text[i]; });
      A(name, [{ filter: 'brightness(2.2)' }, { filter: 'brightness(1)' }], { duration: 420 });
      await sleep(380);
    },
    // 4. 획을 따라 그려진 뒤 채워진다
    async (L, text) => {
      const t = await strokeText(L, text, { fill: '#ffffff', stroke: '#cfd6e4', perChar: 460, stagger: 130 });
      t.box.classList.add('m-strokebox');
      await sleep(t.duration);
    },
    // 5. 내리꽂힌다
    async (L, text) => {
      const { name } = titleBox(L, text);
      A(name, [{ opacity: 0, transform: 'scale(2.8)', filter: 'blur(10px)' }, { opacity: 1, offset: 0.5 }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0px)' }],
        { duration: 520, easing: 'cubic-bezier(.3,1.4,.4,1)' });
      const ring = el('div', 'm-ring', L);
      after(A(ring, [{ opacity: .8, transform: 'translate(-50%,-50%) scale(.2)' }, { opacity: 0, transform: 'translate(-50%,-50%) scale(1.6)' }], { duration: 900, easing: 'cubic-bezier(.1,.7,.3,1)' }), () => ring.remove());
      flash('#ffffff', 0.35);
      await sleep(900);
    },
    // 6. 타자기
    async (L, text) => {
      const { name } = titleBox(L, text);
      const spans = charSpans(name, text);
      spans.forEach(c => { c.style.opacity = '0'; });
      const cur = el('span', 'm-cursor', name);
      for (let i = 0; i < spans.length; i++) {
        spans[i].style.opacity = '1';
        name.append(cur);
        await sleep(110);
        if (cancelled()) break;
      }
      await sleep(420);
      cur.remove();
    },
    // 7. 빛의 선이 지나가며 드러난다
    async (L, text) => {
      const { box, name } = titleBox(L, text);
      const line = el('div', 'm-wipe', box);
      A(name, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }], { duration: 760, easing: 'cubic-bezier(.5,0,.2,1)' });
      after(A(line, [{ left: '-4%', opacity: 0 }, { opacity: 1, offset: .1 }, { opacity: 1, offset: .9 }, { left: '104%', opacity: 0 }], { duration: 820, easing: 'cubic-bezier(.5,0,.2,1)' }), () => line.remove());
      await sleep(900);
    },
    // 8. 위아래에서 닫히며 나타난다
    async (L, text) => {
      const { box, name } = titleBox(L, text);
      A(name, [{ clipPath: 'inset(50% 0 50% 0)', opacity: 0 }, { clipPath: 'inset(0 0 0 0)', opacity: 1 }], { duration: 700, easing: 'cubic-bezier(.2,.9,.2,1)' });
      ['top', 'bottom'].forEach(side => {
        const l = el('div', 'm-shutter ' + side, box);
        after(A(l, [{ transform: 'scaleX(0)', opacity: 1 }, { transform: 'scaleX(1)', opacity: 1, offset: .45 }, { transform: 'scaleX(1)', opacity: 0 }], { duration: 900 }), () => l.remove());
      });
      await sleep(900);
    },
    // 9. 잔상이 모여든다
    async (L, text) => {
      const { box, name } = titleBox(L, text);
      name.style.opacity = '0';
      for (let i = 0; i < 4; i++) {
        const gh = el('div', 'fx-name m-title m-ghost', box);
        gh.textContent = text;
        after(A(gh, [{ opacity: .5, transform: `translate(${rand(-1, 1) * motion(140)}px, ${rand(-1, 1) * motion(90)}px) scale(${rand(1.1, 1.4).toFixed(2)})`, filter: 'blur(6px)' },
                     { opacity: 0, transform: 'none', filter: 'blur(0px)' }], { duration: 700, delay: i * 60, easing: 'cubic-bezier(.3,.8,.2,1)' }), () => gh.remove());
      }
      await sleep(620);
      name.style.opacity = '1';
      A(name, [{ filter: 'brightness(2.6)' }, { filter: 'brightness(1)' }], { duration: 420 });
      await sleep(420);
    },
    // 10. 조각이 날아와 맞춰진다
    async (L, text) => {
      const { name } = titleBox(L, text);
      charSpans(name, text).forEach((c, i) => A(c, [
        { opacity: 0, transform: `translate(${rand(-1, 1) * motion(260)}px, ${rand(-1, 1) * motion(200)}px) rotate(${rand(-70, 70).toFixed(0)}deg) scale(${rand(0.5, 1.6).toFixed(2)})`, filter: 'blur(4px)' },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' }], { duration: 620, delay: i * 55, easing: 'cubic-bezier(.2,1.1,.3,1)' }));
      await sleep(700 + text.length * 55);
    },
  ];

  async function playMythicEffect(res) {
    newRun();
    const fake = fakePick();
    const box = await playFakeTier(fake, 0.85);              // 1) 가짜 등급 연출
    if (cancelled()) return;
    await sleep(520); if (cancelled()) return;
    if (box) await questionMarks(box);                       // 2) ?? 가 하나씩
    if (cancelled()) return;
    await pick(GLITCHES)();                                  // 3) 글리치 10종 중 1개
    if (cancelled()) return;
    audio.mythicGlitch(0.5);
    await toBlack();                                         // 4) 완전한 검정
    if (cancelled()) return;
    await bwFlicker();                                       // 5) 흑백 점멸
    if (cancelled()) return;
    const eye = await openEye();                             // 6) 눈이 천천히 뜸
    if (cancelled()) return;
    const cuts = await swordCuts();                          // 7) 칼질 1~10번
    if (cancelled()) return;
    const L = layer('m-layer');
    audio.mythicName();
    const naming = pick(REVEALS)(L, res.name);               // 9) 이름 10종 중 1개
    await fallFragments(cuts, eye);                          // 8) 파편이 떨어짐
    await naming;
    if (cancelled()) return;
    await sleep(420);
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
    playFakeTier, questionMarks, GLITCHES, bwFlicker, openEye, swordCuts, fallFragments, REVEALS,
  };
})(window.TG = window.TG || {});

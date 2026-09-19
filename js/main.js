/* 시작 · 저장 상태 · 스킨 · 창(확률표/확률 설정/스킨/공유/10회 결과) · 최근 결과 · 키보드 · 소리 버튼 */
(function (TG) {
  'use strict';
  const { $, pick, clone, safeParse, lsGet, lsSet, lsDel, fmtPct, tierVar } = TG.util;
  // 공유 링크가 가리킬 주소 (GitHub Pages). 사이트에서 열었을 때는 그 주소를 그대로 쓴다.
  const SITE_URL = 'https://a01088470676-debug.github.io/trait-gacha/';
  const LS = { pool: 'trait-gacha:pool', skin: 'trait-gacha:skin', custom: 'trait-gacha:custom', img: 'trait-gacha:bgimg', muted: 'trait-gacha:muted' };
  const TIERS = TG.TIERS;

  /* ---------- 스킨 정의 ---------- */
  const FONTS = {
    blackhan: { label: '검은고딕 (굵게)', family: "'Black Han Sans'", weight: 400 },
    dohyeon:  { label: '도현 (반듯하게)', family: "'Do Hyeon'",       weight: 400 },
    jua:      { label: '주아 (둥글게)',   family: "'Jua'",            weight: 400 },
    gaegu:    { label: '개구 (손글씨)',   family: "'Gaegu'",          weight: 700 },
  };
  const SHAPES = { arch: '아치형', square: '각진형', capsule: '캡슐형' };
  const PATTERNS = { none: '없음', dots: '물방울', grid: '격자', stripes: '사선 줄무늬', checker: '체크', stars: '별', diamonds: '다이아' };
  const BG_MODES = { gradient: '그라데이션', solid: '단색', image: '이미지' };
  const COLOR_KEYS = ['body1', 'body2', 'trim', 'sign', 'title', 'reel', 'reelText', 'bulb', 'knob'];
  const COLOR_LABELS = { body1: '몸체 위쪽', body2: '몸체 아래쪽', trim: '장식 테두리', sign: '간판 바탕', title: '제목 글자', reel: '릴 바탕', reelText: '릴 글자', bulb: '표시등', knob: '레버 손잡이' };
  const PRESETS = [
    { id: 'classic', name: '클래식 카지노', eyebrow: 'TRAIT SLOT · Nº 07',
      bg: { mode: 'gradient', c1: '#1f4a3d', c2: '#0a1310', pattern: 'none', pc: '#ffffff', pa: 10 },
      m: { body1: '#a8283a', body2: '#530b15', trim: '#d6a24a', sign: '#1a0907', title: '#fff3d6', reel: '#1c1411', reelText: '#f4ecd6', bulb: '#ffd98a', knob: '#e2283a', shape: 'arch', font: 'blackhan' } },
    { id: 'neon', name: '네온 아케이드', eyebrow: 'NEON ARCADE · 1999',
      bg: { mode: 'gradient', c1: '#2a0f4a', c2: '#05020c', pattern: 'grid', pc: '#ff3df2', pa: 18 },
      m: { body1: '#241a45', body2: '#0b0718', trim: '#00e5ff', sign: '#07030f', title: '#ff4df0', reel: '#08060f', reelText: '#e9f7ff', bulb: '#00e5ff', knob: '#ff2bd6', shape: 'square', font: 'dohyeon' } },
    { id: 'sakura', name: '벚꽃', eyebrow: 'SAKURA · SPRING',
      bg: { mode: 'gradient', c1: '#ffe6ee', c2: '#f7b6cb', pattern: 'dots', pc: '#ffffff', pa: 55 },
      m: { body1: '#fff5f8', body2: '#f2bfd0', trim: '#d98fa6', sign: '#fff0f5', title: '#d4507a', reel: '#fffafc', reelText: '#6e2842', bulb: '#ff8fb1', knob: '#ff6f9c', shape: 'capsule', font: 'jua' } },
    { id: 'ocean', name: '깊은 바다', eyebrow: 'DEEP SEA · 3000M',
      bg: { mode: 'gradient', c1: '#0f5f80', c2: '#03101f', pattern: 'dots', pc: '#7fe3ff', pa: 14 },
      m: { body1: '#1f86ad', body2: '#0a3553', trim: '#bfe9f2', sign: '#04202f', title: '#e6fbff', reel: '#04141f', reelText: '#dff7ff', bulb: '#7fe3ff', knob: '#ff8a5c', shape: 'arch', font: 'dohyeon' } },
    { id: 'pixel', name: '레트로 픽셀', eyebrow: 'PRESS START · 1P',
      bg: { mode: 'solid', c1: '#2b2d6e', c2: '#1d1f52', pattern: 'checker', pc: '#4a4fb8', pa: 45 },
      m: { body1: '#e04848', body2: '#a82828', trim: '#ffd23f', sign: '#161616', title: '#ffd23f', reel: '#101010', reelText: '#ffffff', bulb: '#ffd23f', knob: '#48c9e0', shape: 'square', font: 'dohyeon' } },
    { id: 'palace', name: '황금 궁전', eyebrow: 'ROYAL · GOLD · CLUB',
      bg: { mode: 'gradient', c1: '#3a2d14', c2: '#0b0906', pattern: 'diamonds', pc: '#d4af37', pa: 10 },
      m: { body1: '#232323', body2: '#050505', trim: '#d4af37', sign: '#0a0a0a', title: '#f5d77a', reel: '#0d0c0a', reelText: '#f5e6b8', bulb: '#ffe08a', knob: '#d4af37', shape: 'arch', font: 'blackhan' } },
    { id: 'ice', name: '얼음 왕국', eyebrow: 'FROZEN · KINGDOM',
      bg: { mode: 'gradient', c1: '#eef8ff', c2: '#9cc9ee', pattern: 'stars', pc: '#ffffff', pa: 90 },
      m: { body1: '#f6fbff', body2: '#b7d8f0', trim: '#6fa9d6', sign: '#e3f3ff', title: '#2a679b', reel: '#0f2c47', reelText: '#eaf6ff', bulb: '#bfe8ff', knob: '#4f9fe0', shape: 'capsule', font: 'jua' } },
    { id: 'lava', name: '용암 동굴', eyebrow: 'MAGMA · 1200℃',
      bg: { mode: 'gradient', c1: '#4a0d02', c2: '#0d0200', pattern: 'stripes', pc: '#ff5a1f', pa: 8 },
      m: { body1: '#2e2a28', body2: '#0f0d0c', trim: '#ff6a1f', sign: '#140400', title: '#ffb347', reel: '#120300', reelText: '#ffd9b8', bulb: '#ff7a2e', knob: '#ff3b1f', shape: 'square', font: 'blackhan' } },
    { id: 'forest', name: '숲속 오두막', eyebrow: 'FOREST · CABIN',
      bg: { mode: 'gradient', c1: '#4a7a44', c2: '#142a17', pattern: 'diamonds', pc: '#b4e09f', pa: 8 },
      m: { body1: '#9a653b', body2: '#4a2c16', trim: '#d8b47a', sign: '#2a1a0c', title: '#f6e7c8', reel: '#f3ead6', reelText: '#3b2a1a', bulb: '#ffe6a3', knob: '#6aa84f', shape: 'arch', font: 'gaegu' } },
    { id: 'space', name: '우주 정거장', eyebrow: 'ORBIT · STATION · 9',
      bg: { mode: 'gradient', c1: '#1b1045', c2: '#020108', pattern: 'stars', pc: '#ffffff', pa: 80 },
      m: { body1: '#555b72', body2: '#1c1f2b', trim: '#a78bfa', sign: '#0b0a16', title: '#c4b5fd', reel: '#07060f', reelText: '#e9e5ff', bulb: '#a78bfa', knob: '#22d3ee', shape: 'capsule', font: 'dohyeon' } },
  ].map(p => Object.assign({ title: '특성 뽑기' }, p, { bg: Object.assign({ dim: 35 }, p.bg) }));

  const HEXRE = /^#[0-9a-fA-F]{6}$/;
  const clampNum = (v, lo, hi, def) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : def; };
  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function lum(h) { const [r, g, b] = hexRgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
  function rgba(h, a) { const [r, g, b] = hexRgb(h); return `rgba(${r},${g},${b},${a})`; }
  function sanitizeSkin(s, base) {
    const o = clone(base || PRESETS[0]);
    o.id = 'custom'; o.name = '내 스킨';
    if (!s || typeof s !== 'object') return o;
    if (typeof s.title === 'string') o.title = s.title.trim().slice(0, 16);
    if (typeof s.eyebrow === 'string') o.eyebrow = s.eyebrow.trim().slice(0, 30);
    const b = s.bg && typeof s.bg === 'object' ? s.bg : {};
    if (BG_MODES[b.mode]) o.bg.mode = b.mode;
    for (const k of ['c1', 'c2', 'pc']) if (HEXRE.test(b[k])) o.bg[k] = b[k].toLowerCase();
    if (PATTERNS[b.pattern]) o.bg.pattern = b.pattern;
    o.bg.pa = clampNum(b.pa, 0, 100, o.bg.pa);
    o.bg.dim = clampNum(b.dim, 0, 85, o.bg.dim);
    const m = s.m && typeof s.m === 'object' ? s.m : {};
    for (const k of COLOR_KEYS) if (HEXRE.test(m[k])) o.m[k] = m[k].toLowerCase();
    if (SHAPES[m.shape]) o.m.shape = m.shape;
    if (FONTS[m.font]) o.m.font = m.font;
    return o;
  }

  /* ---------- 상태 ---------- */
  TG.state = { pool: TG.sanitizePool(safeParse(lsGet(LS.pool)) || TG.DEFAULT_POOL) };
  let custom = safeParse(lsGet(LS.custom)) ? sanitizeSkin(safeParse(lsGet(LS.custom))) : null;
  let skinSel = lsGet(LS.skin) || 'classic';
  if (skinSel === 'custom' ? !custom : !PRESETS.some(p => p.id === skinSel)) skinSel = 'classic';
  let bgImage = lsGet(LS.img);

  /* ---------- 스킨 적용 ---------- */
  function currentSkin() {
    if (skinSel === 'custom' && custom) return custom;
    return PRESETS.find(p => p.id === skinSel) || PRESETS[0];
  }
  function patternCss(kind, c) {
    switch (kind) {
      case 'dots': return `radial-gradient(circle, ${c} 2.5px, transparent 3px) 0 0/26px 26px`;
      case 'grid': return `linear-gradient(${c} 1px, transparent 1px) 0 0/44px 44px, linear-gradient(90deg, ${c} 1px, transparent 1px) 0 0/44px 44px`;
      case 'stripes': return `repeating-linear-gradient(45deg, ${c} 0 14px, transparent 14px 34px)`;
      case 'checker': return `conic-gradient(${c} 25%, transparent 0 50%, ${c} 0 75%, transparent 0) 0 0/48px 48px`;
      case 'stars': return [[18, 24, 1.6], [62, 12, 1.1], [84, 58, 1.8], [38, 72, 1.2], [70, 88, 1.4], [8, 86, 1], [50, 44, 2.2]]
        .map(([x, y, r]) => `radial-gradient(${r}px ${r}px at ${x}% ${y}%, ${c}, transparent) 0 0/240px 240px`).join(', ');
      case 'diamonds': return `linear-gradient(45deg, ${c} 25%, transparent 25% 75%, ${c} 75%) 0 0/40px 40px, linear-gradient(45deg, ${c} 25%, transparent 25% 75%, ${c} 75%) 20px 20px/40px 40px`;
      default: return '';
    }
  }
  function bgCss(s) {
    const b = s.bg, layers = [];
    const pat = b.pa > 0 ? patternCss(b.pattern, rgba(b.pc, b.pa / 100)) : '';
    if (pat) layers.push(pat);
    if (b.mode === 'image' && s === custom && bgImage) {
      const d = (b.dim / 100).toFixed(2);
      layers.push(`linear-gradient(rgba(0,0,0,${d}), rgba(0,0,0,${d}))`, `url("${bgImage}") center/cover no-repeat`);
    } else if (b.mode === 'solid') {
      layers.push(`linear-gradient(${b.c1}, ${b.c1})`);
    } else {
      layers.push(`radial-gradient(130% 90% at 50% 0%, ${b.c1} 0%, ${b.c2} 100%)`);
    }
    return layers.join(', ');
  }
  function skinVars(s, el) {
    const st = el.style;
    COLOR_KEYS.forEach(k => st.setProperty('--' + k, s.m[k]));
    const f = FONTS[s.m.font] || FONTS.blackhan;
    st.setProperty('--display', `${f.family}, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif`);
    st.setProperty('--display-weight', f.weight);
    // 흰 글씨/검은 글씨 대비가 같아지는 밝기(약 0.18)를 기준으로 글자색을 고른다
    st.setProperty('--plate-ink', lum(s.m.trim) > 0.18 ? '#21160a' : '#fff8ec');
    st.setProperty('--on-body', (lum(s.m.body1) + lum(s.m.body2)) / 2 > 0.18 ? 'rgba(30,20,24,.72)' : 'rgba(255,245,235,.78)');
  }
  const bgEl = $('bg'), machine = $('machine'), titleEl = $('title'), eyebrowEl = $('eyebrow');
  function applySkin() {
    const s = currentSkin();
    skinVars(s, document.documentElement);
    document.documentElement.style.background = s.bg.mode === 'solid' ? s.bg.c1 : s.bg.c2;
    bgEl.style.background = bgCss(s);
    machine.dataset.shape = s.m.shape;
    titleEl.textContent = s.title || '특성 뽑기';
    eyebrowEl.textContent = s.eyebrow;
    eyebrowEl.hidden = !s.eyebrow;
    requestAnimationFrame(TG.slot.syncLeverLen);
  }

  /* ---------- 알림 ---------- */
  const toastEl = $('toast');
  let toastTimer = null;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2600);
  }

  /* ---------- 최근 결과 ---------- */
  const hist = [];
  const historyEl = $('history');
  function addHistory(results) {
    results.forEach(r => hist.unshift(r));
    if (hist.length > 20) hist.length = 20;
    historyEl.replaceChildren(...hist.map(h => {
      const li = document.createElement('li');
      li.dataset.l = h.level;
      li.style.setProperty('--c', tierVar(h.level));
      li.title = `${h.tier.ko} · ${fmtPct(h.each)}`;
      const pip = document.createElement('i'); pip.className = 'pip';
      const s = document.createElement('span'); s.textContent = h.name;
      li.append(pip, s);
      return li;
    }));
  }

  /* ---------- 10회 결과 ---------- */
  function showTen(results) {
    const best = results.reduce((a, b) => (b.level > a.level ? b : a), results[0]);
    $('tenLead').textContent = `가장 높은 등급: ${best.tier.ko} · ${best.name}`;
    $('tenGrid').replaceChildren(...results.map((r, i) => {
      const li = document.createElement('li');
      li.className = 'ten-card' + (r === best && r.level >= 3 ? ' best' : '');
      li.dataset.l = r.level;
      li.style.setProperty('--c', tierVar(r.level));
      li.style.animationDelay = (i * 60) + 'ms';
      const t = document.createElement('span'); t.className = 'ten-tier'; t.textContent = `${r.tier.en} · ${r.tier.ko}`;
      const n = document.createElement('span'); n.className = 'ten-name'; n.textContent = r.name;
      li.append(t, n);
      return li;
    }));
    dialogs.dlgTen.showModal();
  }
  TG.slot.onResult = addHistory;
  TG.slot.onTenDone = showTen;
  $('tenAgain').addEventListener('click', () => { dialogs.dlgTen.close(); TG.slot.pullTen(); });

  /* ---------- 창 열고 닫기 ---------- */
  const dialogs = { dlgTable: $('dlgTable'), dlgSettings: $('dlgSettings'), dlgSkin: $('dlgSkin'), dlgShare: $('dlgShare'), dlgTen: $('dlgTen') };
  const onOpen = { dlgTable: renderOddsTable, dlgSkin: renderSkinUI, dlgShare: buildShare };
  function openDialog(id) {
    if (TG.slot.busy) { toast('뽑기가 끝난 뒤에 열 수 있어요'); return; }
    if (onOpen[id]) onOpen[id]();
    if (id === 'dlgSkin') document.body.classList.add('sheet-open');
    dialogs[id].showModal();
  }
  document.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openDialog(b.dataset.open)));
  document.querySelectorAll('[data-swap]').forEach(b => b.addEventListener('click', () => { b.closest('dialog').close(); openDialog(b.dataset.swap); }));
  Object.values(dialogs).forEach(d => {
    d.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => d.close()));
    // 창을 닫으면 레버로 초점을 옮겨서 Space가 곧바로 레버를 당기게 한다
    d.addEventListener('close', () => { if (!document.querySelector('dialog[open]')) $('lever').focus({ preventScroll: true }); });
    d.addEventListener('click', e => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
    });
  });
  dialogs.dlgSkin.addEventListener('close', () => document.body.classList.remove('sheet-open'));
  dialogs.dlgSettings.addEventListener('close', () => { if (!TG.slot.busy) TG.slot.seed(); });

  /* ---------- 확률표 ---------- */
  function renderOddsTable() {
    const { rows, total, rawSum } = TG.stats(TG.state.pool);
    $('oddsBody').replaceChildren(...rows.map(r => {
      const tr = document.createElement('tr');
      tr.dataset.l = r.level;
      if (!r.w) tr.classList.add('off');
      const c1 = document.createElement('td');
      const chip = document.createElement('span'); chip.className = 'chip'; chip.style.setProperty('--c', tierVar(r.level));
      const pip = document.createElement('i'); pip.className = 'pip';
      chip.append(pip, r.ko); c1.append(chip);
      const c2 = document.createElement('td'); c2.className = 'num'; c2.textContent = r.w ? fmtPct(r.pct) : '나오지 않음';
      const c3 = document.createElement('td'); c3.className = 'traits'; c3.textContent = r.traits.length ? r.traits.join(', ') : '—';
      const c4 = document.createElement('td'); c4.className = 'num'; c4.textContent = r.w ? fmtPct(r.each) : '—';
      tr.append(c1, c2, c3, c4);
      return tr;
    }));
    $('oddsTotal').textContent = total ? '100%' : '0%';
    const note = $('oddsNote');
    if (!total) note.textContent = '지금은 나올 수 있는 특성이 없어요. 확률 설정에서 확률과 특성을 채워 주세요.';
    else if (Math.abs(rawSum - 100) > 1e-6 || rows.some(r => r.raw > 0 && !r.traits.length))
      note.textContent = `입력한 확률 합계가 ${fmtPct(rawSum)}라서, 표의 확률은 실제로 나오는 등급끼리 비율대로 다시 계산한 값이에요.`;
    else note.textContent = '';
  }

  /* ---------- 확률 설정 ---------- */
  const tierList = $('tierList'), sumEl = $('sum'), saveStateEl = $('saveState'), resetBtn = $('resetBtn');
  const parseTraits = s => s.split(/[,\n]/).map(x => x.trim()).filter(Boolean);
  function buildPanel() {
    tierList.replaceChildren(...TIERS.map((t, i) => {
      const li = document.createElement('li');
      li.className = 'tier-row';
      li.dataset.l = i;
      li.style.setProperty('--c', tierVar(i));
      li.innerHTML =
        `<div class="tr-head">
          <span class="chip" style="--c:${tierVar(i)}"><i class="pip"></i>${t.ko}</span>
          <button type="button" class="preview">연출 미리보기</button>
          <label class="prob"><input id="prob-${t.id}" type="number" inputmode="decimal" min="0" max="100" step="any" aria-label="${t.ko} 확률"><span>%</span></label>
        </div>
        <p class="fx-desc">${t.desc}</p>
        <textarea id="traits-${t.id}" rows="2" spellcheck="false" aria-label="${t.ko} 특성 이름, 쉼표나 줄바꿈으로 구분"></textarea>
        <p class="tr-meta" id="meta-${t.id}"></p>`;
      const input = li.querySelector('input'), ta = li.querySelector('textarea');
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        TG.state.pool[t.id].prob = Number.isFinite(v) && v > 0 ? v : 0;
        poolEdited();
      });
      ta.addEventListener('input', () => { TG.state.pool[t.id].traits = parseTraits(ta.value); poolEdited(); });
      li.querySelector('.preview').addEventListener('click', () => { dialogs.dlgSettings.close(); TG.slot.preview(i); });
      return li;
    }));
  }
  function fillPanel() {
    for (const t of TIERS) {
      $('prob-' + t.id).value = TG.state.pool[t.id].prob;
      $('traits-' + t.id).value = TG.state.pool[t.id].traits.join(', ');
    }
  }
  function renderDerived() {
    const { rows, total, rawSum } = TG.stats(TG.state.pool);
    sumEl.replaceChildren();
    const left = document.createElement('span');
    left.append('합계 ');
    const b = document.createElement('b'); b.textContent = fmtPct(rawSum); left.append(b);
    const note = document.createElement('span'); note.className = 'sum-note';
    if (!total) { sumEl.dataset.state = 'bad'; note.textContent = '확률과 특성을 하나 이상 넣어 주세요'; }
    else if (Math.abs(rawSum - 100) < 1e-6 && rows.every(r => r.raw <= 0 || r.traits.length)) { sumEl.dataset.state = 'ok'; note.textContent = '딱 100%예요'; }
    else { sumEl.dataset.state = 'warn'; note.textContent = '실제로 나오는 등급끼리 비율대로 다시 나눠서 뽑아요'; }
    sumEl.append(left, note);
    for (const r of rows) {
      const m = $('meta-' + r.id);
      m.classList.remove('warn');
      if (r.raw > 0 && !r.traits.length) { m.textContent = '특성이 없어서 이 등급은 나오지 않아요'; m.classList.add('warn'); }
      else if (!r.w) m.textContent = '확률 0% · 나오지 않아요';
      else m.textContent = `특성 ${r.traits.length}개 · 실제 ${fmtPct(r.pct)} · 특성마다 ${fmtPct(r.each)}`;
    }
  }
  function setSave(msg, bad = false) { saveStateEl.textContent = msg; saveStateEl.classList.toggle('bad', bad); }
  let poolTimer = null;
  function savePool() {
    if (lsSet(LS.pool, JSON.stringify(TG.state.pool))) setSave('이 브라우저에 저장됨');
    else setSave('저장하지 못했어요 (브라우저 저장소가 막혀 있어요)', true);
  }
  function poolEdited() {
    renderDerived();
    setSave('저장 중…');
    clearTimeout(poolTimer);
    poolTimer = setTimeout(savePool, 500);
  }
  let resetArm = null;
  resetBtn.addEventListener('click', () => {
    if (!resetArm) {
      resetBtn.textContent = '한 번 더 누르면 초기화돼요';
      resetBtn.classList.add('armed');
      resetArm = setTimeout(() => { resetArm = null; resetBtn.textContent = '기본값으로 되돌리기'; resetBtn.classList.remove('armed'); }, 3000);
      return;
    }
    clearTimeout(resetArm); resetArm = null;
    resetBtn.textContent = '기본값으로 되돌리기'; resetBtn.classList.remove('armed');
    TG.state.pool = clone(TG.DEFAULT_POOL);
    fillPanel();
    poolEdited();
  });

  /* ---------- 스킨 창 ---------- */
  const skinGrid = $('skinGrid'), editor = $('editor'), copyToCustom = $('copyToCustom');
  function thumbFor(s) {
    const t = document.createElement('span');
    t.className = 'thumb';
    t.style.background = bgCss(s);
    skinVars(s, t);
    const mini = document.createElement('span');
    mini.className = 'mini'; mini.dataset.shape = s.m.shape;
    mini.innerHTML = '<span class="mini-sign"></span><span class="mini-win"><i></i></span><span class="mini-plate"></span>';
    t.append(mini);
    return t;
  }
  function skinCard(id, name, s) {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'skin-card'; b.dataset.id = id;
    b.setAttribute('aria-pressed', String(skinSel === id));
    if (s) b.append(thumbFor(s));
    else {
      const t = document.createElement('span'); t.className = 'thumb';
      t.style.background = 'repeating-linear-gradient(45deg,#23252e 0 10px,#1b1d24 10px 20px)';
      t.innerHTML = '<span class="thumb-plus">+ 새로 만들기</span>';
      b.append(t);
    }
    const n = document.createElement('span'); n.className = 'skin-name'; n.textContent = name;
    b.append(n);
    b.addEventListener('click', () => selectSkin(id));
    return b;
  }
  function renderSkinGrid() {
    skinGrid.replaceChildren(...PRESETS.map(p => skinCard(p.id, p.name, p)), skinCard('custom', '내 스킨 (커스텀)', custom));
  }
  function renderSkinUI() {
    renderSkinGrid();
    editor.hidden = skinSel !== 'custom';
    copyToCustom.hidden = skinSel === 'custom';
    copyToCustom.textContent = custom ? '지금 스킨으로 내 스킨 덮어쓰기' : '지금 스킨을 복사해서 내 스킨 만들기';
    if (skinSel === 'custom') fillEditor();
  }
  const saveSkinSel = () => lsSet(LS.skin, skinSel);
  const saveCustom = () => { if (custom) lsSet(LS.custom, JSON.stringify(custom)); };
  function selectSkin(id) {
    if (id === 'custom' && !custom) { custom = sanitizeSkin(currentSkin(), currentSkin()); saveCustom(); }
    skinSel = id;
    saveSkinSel();
    applySkin();
    renderSkinUI();
  }
  let copyArm = null;
  copyToCustom.addEventListener('click', () => {
    if (custom && !copyArm) {
      copyToCustom.textContent = '한 번 더 누르면 내 스킨을 덮어써요';
      copyToCustom.classList.add('armed');
      copyArm = setTimeout(() => { copyArm = null; copyToCustom.classList.remove('armed'); renderSkinUI(); }, 3000);
      return;
    }
    clearTimeout(copyArm); copyArm = null; copyToCustom.classList.remove('armed');
    custom = sanitizeSkin(currentSkin(), currentSkin());
    saveCustom();
    selectSkin('custom');
  });

  function fillSelect(sel, map) {
    sel.replaceChildren(...Object.entries(map).map(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = typeof l === 'string' ? l : l.label; return o; }));
  }
  fillSelect($('c-bgMode'), BG_MODES);
  fillSelect($('c-pattern'), PATTERNS);
  fillSelect($('c-shape'), SHAPES);
  fillSelect($('c-font'), FONTS);
  $('colorFields').replaceChildren(...COLOR_KEYS.map(k => {
    const l = document.createElement('label'); l.className = 'color-field';
    const i = document.createElement('input'); i.type = 'color'; i.id = 'c-' + k;
    const s = document.createElement('span'); s.textContent = COLOR_LABELS[k];
    l.append(i, s);
    i.addEventListener('input', () => { custom.m[k] = i.value; customEdited(); });
    return l;
  }));
  function syncEditorVisibility() {
    const mode = custom.bg.mode;
    $('f-bg2').hidden = mode === 'solid';
    $('f-img').hidden = mode !== 'image';
    $('f-bg1').querySelector('span').textContent = mode === 'image' ? '이미지 없을 때 색 1' : '배경 색 1';
    $('f-bg2').querySelector('span').textContent = mode === 'image' ? '이미지 없을 때 색 2' : '배경 색 2';
    $('imgNote').textContent = bgImage ? '이미지가 적용돼 있어요.' : '아직 고른 이미지가 없어요.';
    $('c-imgClear').hidden = !bgImage;
  }
  function fillEditor() {
    if (!custom) return;
    $('c-bgMode').value = custom.bg.mode;
    $('c-bg1').value = custom.bg.c1;
    $('c-bg2').value = custom.bg.c2;
    $('c-pattern').value = custom.bg.pattern;
    $('c-pc').value = custom.bg.pc;
    $('c-pa').value = custom.bg.pa; $('o-pa').textContent = custom.bg.pa + '%';
    $('c-dim').value = custom.bg.dim; $('o-dim').textContent = custom.bg.dim + '%';
    $('c-shape').value = custom.m.shape;
    $('c-font').value = custom.m.font;
    COLOR_KEYS.forEach(k => { $('c-' + k).value = custom.m[k]; });
    $('c-title').value = custom.title;
    $('c-eyebrow').value = custom.eyebrow;
    syncEditorVisibility();
  }
  let customTimer = null, gridTimer = null;
  function customEdited() {
    applySkin();
    clearTimeout(customTimer);
    customTimer = setTimeout(saveCustom, 400);
    clearTimeout(gridTimer);
    gridTimer = setTimeout(renderSkinGrid, 150);
  }
  const bindBg = (id, key) => $(id).addEventListener('input', e => { custom.bg[key] = e.target.value; customEdited(); });
  bindBg('c-bg1', 'c1'); bindBg('c-bg2', 'c2'); bindBg('c-pc', 'pc'); bindBg('c-pattern', 'pattern');
  $('c-bgMode').addEventListener('input', e => { custom.bg.mode = e.target.value; syncEditorVisibility(); customEdited(); });
  $('c-pa').addEventListener('input', e => { custom.bg.pa = Number(e.target.value); $('o-pa').textContent = custom.bg.pa + '%'; customEdited(); });
  $('c-dim').addEventListener('input', e => { custom.bg.dim = Number(e.target.value); $('o-dim').textContent = custom.bg.dim + '%'; customEdited(); });
  $('c-shape').addEventListener('input', e => { custom.m.shape = e.target.value; customEdited(); });
  $('c-font').addEventListener('input', e => { custom.m.font = e.target.value; customEdited(); });
  $('c-title').addEventListener('input', e => { custom.title = e.target.value.slice(0, 16); customEdited(); });
  $('c-eyebrow').addEventListener('input', e => { custom.eyebrow = e.target.value.slice(0, 30); customEdited(); });
  function readAsDataURL(file) {
    return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(file); });
  }
  async function shrinkImage(file) {
    const src = await readAsDataURL(file);
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
    const k = Math.min(1, 1920 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    c.getContext('2d').drawImage(img, 0, 0, w, h);
    return c.toDataURL('image/jpeg', 0.82);
  }
  $('c-img').addEventListener('change', async e => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast('이미지 파일만 고를 수 있어요'); return; }
    try { bgImage = await shrinkImage(file); }
    catch { toast('이미지를 읽지 못했어요. 다른 파일로 해 보세요'); return; }
    if (!lsSet(LS.img, bgImage)) toast('이미지가 커서 저장하지 못했어요. 새로고침하면 사라져요');
    custom.bg.mode = 'image';
    $('c-bgMode').value = 'image';
    syncEditorVisibility();
    customEdited();
  });
  $('c-imgClear').addEventListener('click', () => {
    bgImage = null; lsDel(LS.img);
    syncEditorVisibility();
    customEdited();
  });

  /* ---------- 공유 (링크 / 코드) ---------- */
  function b64u(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64u(str) {
    const s = str.replace(/-/g, '+').replace(/_/g, '/');
    const bin = atob(s + '==='.slice((s.length + 3) % 4));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function pipeBytes(bytes, stream) {
    const res = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await res.arrayBuffer());
  }
  async function encode(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    if (typeof CompressionStream === 'function') {
      try { return 'z' + b64u(await pipeBytes(raw, new CompressionStream('deflate-raw'))); } catch {}
    }
    return 'j' + b64u(raw);
  }
  async function decode(code) {
    if (!code || code.length > 200000) throw new Error('bad');
    let bytes = unb64u(code.slice(1));
    if (code[0] === 'z') bytes = await pipeBytes(bytes, new DecompressionStream('deflate-raw'));
    else if (code[0] !== 'j') throw new Error('bad');
    return JSON.parse(new TextDecoder().decode(bytes));
  }
  function sharePayload() {
    let skin;
    if (skinSel === 'custom' && custom) {
      const c = clone(custom);
      delete c.id; delete c.name;
      if (c.bg.mode === 'image') c.bg.mode = 'gradient';
      skin = { c };
    } else skin = { p: skinSel };
    return { v: 1, pool: TIERS.map(t => [TG.state.pool[t.id].prob, TG.state.pool[t.id].traits]), skin };
  }
  function applyPayload(d) {
    if (!d || d.v !== 1 || !Array.isArray(d.pool)) throw new Error('bad');
    const obj = {};
    TIERS.forEach((t, i) => { const r = d.pool[i]; obj[t.id] = Array.isArray(r) ? { prob: r[0], traits: r[1] } : null; });
    TG.state.pool = TG.sanitizePool(obj);
    lsSet(LS.pool, JSON.stringify(TG.state.pool));
    const s = d.skin || {};
    if (typeof s.p === 'string' && PRESETS.some(p => p.id === s.p)) skinSel = s.p;
    else if (s.c) {
      custom = sanitizeSkin(s.c, PRESETS[0]);
      if (custom.bg.mode === 'image') custom.bg.mode = 'gradient';
      saveCustom();
      skinSel = 'custom';
    }
    saveSkinSel();
    applySkin();
    fillPanel();
    renderDerived();
    if (!TG.slot.busy) TG.slot.seed();
  }
  const shareBase = () => /\.github\.io$/.test(location.hostname) ? location.origin + location.pathname : SITE_URL;
  const shareLink = $('shareLink'), shareCode = $('shareCode');
  async function buildShare() {
    shareLink.value = '만드는 중…'; shareCode.value = '';
    $('shareImgNote').hidden = !(skinSel === 'custom' && custom && custom.bg.mode === 'image');
    $('importMsg').textContent = '';
    const code = await encode(sharePayload());
    shareLink.value = shareBase() + '#s=' + code;
    shareCode.value = code;
  }
  async function copyText(text, el) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch {
      try { el.focus(); el.select(); return document.execCommand('copy'); } catch { return false; }
    }
  }
  $('copyLink').addEventListener('click', async () => toast(await copyText(shareLink.value, shareLink) ? '링크를 복사했어요' : '복사가 막혀 있어요. 링크를 직접 선택해서 복사해 주세요'));
  $('copyCode').addEventListener('click', async () => toast(await copyText(shareCode.value, shareCode) ? '코드를 복사했어요' : '복사가 막혀 있어요. 코드를 직접 선택해서 복사해 주세요'));
  $('importBtn').addEventListener('click', async () => {
    const text = $('importCode').value.trim();
    const m = text.match(/#s=([A-Za-z0-9_-]+)/);
    const code = m ? m[1] : text.replace(/\s+/g, '');
    const msg = $('importMsg');
    try {
      applyPayload(await decode(code));
      msg.textContent = '불러왔어요.';
      $('importCode').value = '';
      await buildShare();
      toast('받은 설정을 불러왔어요');
    } catch {
      msg.textContent = '코드를 읽지 못했어요. 끝까지 복사됐는지 확인해 주세요.';
    }
  });

  /* ---------- 소리 버튼 ---------- */
  const soundBtn = $('soundBtn');
  let muted = lsGet(LS.muted) === '1';
  const renderSound = () => { soundBtn.textContent = muted ? '소리 꺼짐' : '소리 켬'; soundBtn.setAttribute('aria-pressed', String(!muted)); };
  TG.audio.setMuted(muted); renderSound();
  soundBtn.addEventListener('click', () => {
    muted = !muted; TG.audio.setMuted(muted); lsSet(LS.muted, muted ? '1' : '0'); renderSound();
  });

  /* ---------- 키보드: Space / Enter = 1회 뽑기 ---------- */
  document.addEventListener('keydown', e => {
    if ((e.key !== ' ' && e.key !== 'Enter') || e.repeat) return;
    if (document.querySelector('dialog[open]') || !$('fxStage').hidden) return;
    const tag = e.target && e.target.tagName;
    if (['INPUT', 'TEXTAREA', 'BUTTON', 'SELECT', 'A', 'SUMMARY'].includes(tag) || (e.target && e.target.isContentEditable)) return;
    e.preventDefault();
    TG.slot.autoPull();
  });

  /* ---------- 시작 ---------- */
  applySkin();
  buildPanel();
  fillPanel();
  renderDerived();
  TG.slot.seed();
  TG.slot.syncLeverLen();
  if (lsGet(LS.pool)) setSave('이 브라우저에 저장됨');
  const hashMatch = location.hash.match(/^#s=([A-Za-z0-9_-]+)/);
  if (hashMatch) {
    decode(hashMatch[1])
      .then(d => { applyPayload(d); toast('공유받은 설정을 불러왔어요'); })
      .catch(() => toast('공유 링크를 읽지 못해서 원래 설정으로 열었어요'))
      .finally(() => { try { history.replaceState(null, '', location.pathname + location.search); } catch {} });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(TG.slot.syncLeverLen);
  // 개발자용: 콘솔에서 testTrait('mythic') 로 신화 연출을 바로 확인
  window.testTrait = t => TG.slot.testTrait(t);
})(window.TG = window.TG || {});

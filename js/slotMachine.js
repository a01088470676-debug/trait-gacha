/* 레버 · 슬롯 회전 · 결과 선택 · 결과 정지 · 연출 호출 · 1회/10회 뽑기.
   천장(몇 번 뽑으면 확정)은 없다. 매 뽑기는 확률표 그대로 독립적으로 뽑는다. */
(function (TG) {
  'use strict';
  const { $, pick, wait, fmtPct, tierVar, RM } = TG.util;
  const audio = TG.audio, fx = TG.effects;
  const frame = $('frame'), win = $('win'), strip = $('strip');
  const plate = $('plate'), plateTier = $('plateTier'), plateName = $('plateName'), plateOdds = $('plateOdds');
  const lever = $('lever'), knob = $('knob'), shaft = $('shaft');
  const pull1Btn = $('pull1'), pull10Btn = $('pull10'), skipBtn = $('skipBtn');
  const pool = () => TG.state.pool;

  /* ---------- 결과 선택 ---------- */
  const result = row => ({ tier: TG.TIERS[row.level], level: row.level, name: pick(row.traits), each: row.each });
  function draw() {
    const { rows, total } = TG.stats(pool());
    if (!total) return null;
    let r = Math.random() * total, chosen = null;
    for (const row of rows) { if (!row.w) continue; chosen = row; r -= row.w; if (r < 0) break; }
    return result(chosen);
  }
  function drawForced(level) {
    const row = TG.stats(pool()).rows[level];
    return row.traits.length ? result(row) : { tier: TG.TIERS[level], level, name: `${TG.TIERS[level].ko} 특성`, each: 0 };
  }

  /* ---------- 결과판 ---------- */
  function setPlate(res) {
    plate.dataset.l = res.level;
    plate.style.setProperty('--pc', tierVar(res.level));
    plateTier.textContent = res.tier.ko;
    plateName.textContent = res.name;
    plateOdds.textContent = res.each ? fmtPct(res.each) : '';
  }
  function setPlateText(tag, msg, color) {
    plate.dataset.l = '';
    plate.style.setProperty('--pc', color || 'var(--reelText)');
    plateTier.textContent = tag; plateName.textContent = msg; plateOdds.textContent = '';
  }

  /* ---------- 릴 ----------
     아래로 흘러내리는 무한 릴. 위쪽이 비기 전에 채워 넣고, 멈출 때는 지금 속도에 이어지는 감속 곡선으로 결과 칸에 세운다.
     requestAnimationFrame 루프는 릴 하나에 하나만 돈다. */
  function itemEl(e) {
    const d = document.createElement('div');
    d.className = 'item' + (e.pending ? ' pending' : '') + (e.res ? ' res' : '');
    d.dataset.l = e.level;
    d.style.setProperty('--c', tierVar(e.level));
    const pip = document.createElement('i'); pip.className = 'pip';
    const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = e.name;
    d.append(pip, nm);
    return d;
  }
  const reel = (() => {
    const K = 30;
    let list = [], fillers = [], y = 0, v = 0, H = 60, running = false, last = 0, lastIdx = null, lastTick = 0;
    let speedTo = null, stopper = null;
    const rf = () => fillers.length ? pick(fillers) : { name: '—', level: 0 };
    const measure = () => { const f = strip.firstElementChild; if (f) H = f.getBoundingClientRect().height || H; return H; };
    const render = () => strip.replaceChildren(...list.map(itemEl));
    function apply() {
      strip.style.transform = `translateY(${y.toFixed(2)}px)`;
      const k = v / H * 100;                               // 초당 칸 수 / 10
      strip.style.filter = (!RM && k > 1.2) ? `blur(${Math.min(2.6, (k - 1.2) * 1.1).toFixed(2)}px)` : '';
    }
    function ensure() { if (!running) { running = true; last = performance.now(); requestAnimationFrame(step); } }
    function step(now) {
      const dt = Math.min(48, now - last); last = now;
      if (stopper) {
        const s = stopper, t = Math.min(1, (now - s.t0) / s.dur);
        y = s.y0 + s.D * (1 - Math.pow(1 - t, s.p));
        v = s.D * s.p * Math.pow(1 - t, s.p - 1) / s.dur;
        if (t >= 1) {
          y = 0; v = 0; stopper = null; running = false; apply();
          list = list.slice(0, 3);
          while (strip.children.length > 3) strip.lastElementChild.remove();
          s.resolve(strip.children[1]);
          return;
        }
      } else {
        if (speedTo) {
          const t = Math.min(1, (now - speedTo.t0) / speedTo.dur), e = t * t * (3 - 2 * t);
          v = speedTo.from + (speedTo.to - speedTo.from) * e;
          if (t >= 1) speedTo = null;
        }
        y += v * dt;
        if (y > -H) {                                      // 위쪽을 채운다 (보이는 칸은 그대로)
          const pre = []; for (let i = 0; i < K; i++) pre.push(rf());
          const keep = list.slice(0, 4);
          list = pre.concat(keep);
          strip.prepend(...pre.map(itemEl));
          while (strip.children.length > list.length) strip.lastElementChild.remove();
          y -= K * H;
        }
      }
      const idx = Math.floor(y / H);
      if (idx !== lastIdx) {
        if (lastIdx !== null && !api.quiet && now - lastTick > 55) { audio.tick(); lastTick = now; }
        lastIdx = idx;
      }
      apply();
      if (running) requestAnimationFrame(step);
    }
    const api = {
      quiet: false,
      get spinning() { return running; },
      get itemH() { return measure(); },
      seed() { fillers = TG.entries(pool()); list = [rf(), rf(), rf()]; y = 0; v = 0; render(); apply(); },
      start(speed) { fillers = TG.entries(pool()); measure(); stopper = null; speedTo = null; v = speed; lastIdx = null; ensure(); },
      setSpeed(to, dur) { speedTo = { from: v, to, t0: performance.now(), dur }; },
      // entry를 가운데 칸에 세운다. 지금 속도에서 자연스럽게 이어지도록 감속 곡선의 세기를 맞춘다
      stopAt(entry, dur) {
        return new Promise(resolve => {
          measure();
          if (!running) { v = Math.max(v, H * 0.02); ensure(); }
          const vv = Math.max(v, H * 0.004);
          const tI = Math.floor(-y / H), frac = (-y / H) - tI;
          const m = Math.max(3, Math.round(vv * dur / (3 * H) - frac));
          const pre = [rf(), entry]; for (let i = 2; i < m; i++) pre.push(rf());
          list = pre.concat(list.slice(tI, tI + 4));
          render();
          y = -(m + frac) * H;
          const D = (m + frac) * H;
          speedTo = null;
          stopper = { y0: y, D, p: Math.min(6, Math.max(1.2, vv * dur / D)), t0: performance.now(), dur, resolve };
          apply();
        });
      },
    };
    return api;
  })();

  /* ---------- 뽑기 흐름 ---------- */
  let busy = false, skipping = false;
  const skipWaiters = new Set();
  function setBusy(b) { busy = b; pull1Btn.disabled = b; pull10Btn.disabled = b; }
  // 10회 뽑기에서 '건너뛰기'를 누르면 바로 풀리는 대기
  function pause(ms) {
    return new Promise(res => {
      if (skipping) return res();
      const fin = () => { clearTimeout(id); skipWaiters.delete(fin); res(); };
      const id = setTimeout(fin, ms);
      skipWaiters.add(fin);
    });
  }
  function clearResultMark() { fx.clearReelFx(); frame.classList.remove('has-result'); }
  function markResult(res) { frame.style.setProperty('--tc', tierVar(res.level)); frame.classList.add('has-result'); }
  const fastSpeed = () => reel.itemH * 0.028;   // 초당 28칸
  const cruiseSpeed = () => reel.itemH * 0.007; // 연출 중 뒤에서 도는 속도

  async function spinAndReveal(res, quick, auto) {
    if (!reel.spinning) reel.start(fastSpeed()); else reel.setSpeed(fastSpeed(), 200);
    const T = TG.TRAIT_TIERS[res.tier.id];
    if (T.reveal === 'reel') {
      // 기본 · 커먼 · 언커먼: 감속 → 결과 칸에 멈춤(아직 흐릿함) → 잠깐 정지 → 릴 안에서 공개
      await pause(quick ? 160 : 420);
      const item = await reel.stopAt({ name: res.name, level: res.level, pending: true }, quick ? 560 : 1250 + res.level * 120);
      audio.land();
      await pause(quick ? 60 : 140);
      if (skipping) { item.classList.remove('pending'); item.classList.add('res'); }
      else await fx.playReelReveal(res, item, quick);
      markResult(res);
      setPlate(res);
      return;
    }
    // 레어 이상: 느려지면서 주변 조명이 바뀌고, 릴은 뒤에서 계속 돌며 화면 중앙에서 공개
    await pause(quick ? 160 : 380);
    reel.setSpeed(cruiseSpeed(), quick ? 700 : 1100);
    fx.setAnticipation(res.level);
    await pause((quick ? 700 : 1100) + (quick ? 0 : T.fx.hold));
    reel.quiet = true;
    if (!skipping) {
      await fx.playStage(res);
      setPlate(res);
      await fx.waitDismiss({ auto });
    }
    await fx.closeStage(skipping);
    fx.clearAnticipation();
    reel.quiet = false;
    await reel.stopAt({ name: res.name, level: res.level, res: true }, skipping ? 380 : quick ? 480 : 800);
    audio.land();
    markResult(res);
    setPlate(res);
  }

  async function pullOnce(forced = null) {
    if (busy) return;
    const res = forced != null ? drawForced(forced) : draw();
    if (!res) { setPlateText('알림', '확률 설정에서 확률과 특성을 먼저 채워 주세요', 'var(--bad)'); return; }
    setBusy(true);
    lever.classList.remove('invite');
    clearResultMark();
    audio.lever();
    setPlateText('회전', '…');
    try {
      await spinAndReveal(res, false, null);
      if (forced == null && TG.slot.onResult) TG.slot.onResult([res]);
    } finally {
      setBusy(false);
    }
  }

  async function pullTen() {
    if (busy) return;
    if (!TG.stats(pool()).total) { setPlateText('알림', '확률 설정에서 확률과 특성을 먼저 채워 주세요', 'var(--bad)'); return; }
    setBusy(true);
    lever.classList.remove('invite');
    skipping = false;
    skipBtn.hidden = false;
    audio.unlock();
    audio.lever();
    const results = [];
    try {
      for (let i = 0; i < 10; i++) {
        const res = draw();
        results.push(res);
        if (skipping) continue;
        clearResultMark();
        setPlateText(`${i + 1} / 10`, '…');
        await spinAndReveal(res, true, TG.TRAIT_TIERS[res.tier.id].fx.autoNext);
        if (!skipping) await pause(res.level < 3 ? 200 : 120);
      }
      if (skipping) {                                   // 건너뛴 경우 마지막 결과로 바로 정리
        const lastRes = results[9];
        if (reel.spinning) await reel.stopAt({ name: lastRes.name, level: lastRes.level, res: true }, 380);
        else reel.show({ name: lastRes.name, level: lastRes.level, res: true });
        markResult(lastRes);
        setPlate(lastRes);
      }
    } finally {
      skipBtn.hidden = true;
      skipping = false;
      setBusy(false);
    }
    if (TG.slot.onResult) TG.slot.onResult(results);
    if (TG.slot.onTenDone) TG.slot.onTenDone(results);
  }
  reel.show = entry => {
    const f = TG.entries(pool());
    const rf = () => f.length ? pick(f) : { name: '—', level: 0 };
    strip.replaceChildren(itemEl(rf()), itemEl(entry), itemEl(rf()));
    strip.style.transform = 'translateY(0px)';
    strip.style.filter = '';
  };
  skipBtn.addEventListener('click', () => {
    skipping = true;
    skipBtn.hidden = true;
    fx.abort();
    [...skipWaiters].forEach(f => f());
  });

  /* ---------- 레버 ---------- */
  let leverLen = 130, leverAnim = false, dragState = null, lp = 0;
  function setLever(p) {
    lp = p;
    const th = p * Math.PI;
    const y = -leverLen * Math.cos(th);
    const s = 1 + 0.3 * Math.sin(th);
    knob.style.transform = `translate(-50%,-50%) translateY(${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
    shaft.style.top = Math.min(0, y).toFixed(1) + 'px';
    shaft.style.height = Math.abs(y).toFixed(1) + 'px';
    shaft.style.width = (12 + 4 * Math.sin(th)).toFixed(1) + 'px';
  }
  function syncLeverLen() {
    leverLen = Math.max(70, Math.min(150, Math.round(win.offsetHeight * 0.44)));
    setLever(lp);
  }
  const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  function animLever(from, to, dur, ease) {
    return new Promise(r => {
      const t0 = performance.now();
      (function f(now) {
        const t = Math.min(1, (now - t0) / dur);
        setLever(from + (to - from) * ease(t));
        if (t < 1) requestAnimationFrame(f); else r();
      })(t0);
    });
  }
  async function autoPull(forced = null) {
    if (busy || leverAnim) return;
    audio.unlock();
    leverAnim = true;
    await animLever(lp, 1, 260, t => t * t);
    pullOnce(forced);
    await animLever(1, 0, 560, easeOutBack);
    leverAnim = false;
  }
  async function finishDrag(p) {
    leverAnim = true;
    await animLever(p, 1, 60 + 120 * (1 - p), t => t);
    pullOnce();
    await animLever(1, 0, 560, easeOutBack);
    leverAnim = false;
  }
  lever.addEventListener('pointerdown', e => {
    if (busy || leverAnim) return;
    audio.unlock();
    dragState = { y: e.clientY, moved: false, fired: false };
    lever.setPointerCapture(e.pointerId);
    lever.classList.add('grabbing');
  });
  lever.addEventListener('pointermove', e => {
    if (!dragState || dragState.fired) return;
    const dy = e.clientY - dragState.y;
    if (Math.abs(dy) > 6) dragState.moved = true;
    const p = Math.max(0, Math.min(1, dy / (leverLen * 1.6)));
    setLever(p);
    if (p >= 0.85) { dragState.fired = true; finishDrag(p); }
  });
  function endDrag() {
    if (!dragState) return;
    const d = dragState; dragState = null;
    lever.classList.remove('grabbing');
    if (d.fired) return;
    if (!d.moved) autoPull();
    else { leverAnim = true; animLever(lp, 0, 380, easeOutBack).then(() => { leverAnim = false; }); }
  }
  lever.addEventListener('pointerup', endDrag);
  lever.addEventListener('pointercancel', endDrag);
  lever.addEventListener('click', e => { if (e.detail === 0) autoPull(); });
  pull1Btn.addEventListener('click', () => autoPull());
  pull10Btn.addEventListener('click', () => pullTen());
  window.addEventListener('resize', syncLeverLen);

  /* 표시등 (깜빡이지 않음) */
  const COUNT = 15;
  [$('bulbsTop'), $('bulbsBot')].forEach(row => {
    for (let i = 0; i < COUNT; i++) { const b = document.createElement('i'); b.className = 'bulb'; row.append(b); }
  });

  /* ---------- 강제 뽑기 (연출 미리보기 · 개발자 테스트) ----------
     콘솔에서 testTrait('mythic'), testTrait('신화'), testTrait(6) 처럼 부른다. */
  function levelOf(t) {
    if (typeof t === 'number') return t;
    const hit = TG.TIERS.find(x => x.id === t || x.ko === t || x.en === String(t).toUpperCase());
    return hit ? hit.level : null;
  }
  function testTrait(t) {
    const L = levelOf(t);
    if (L == null || L < 0 || L > 6) { console.warn('testTrait: basic, common, uncommon, rare, epic, legendary, mythic 중 하나를 넣어 주세요'); return false; }
    if (busy || leverAnim) { console.warn('testTrait: 지금 뽑는 중이에요'); return false; }
    autoPull(L);
    return true;
  }

  TG.slot = {
    seed: () => reel.seed(),
    pullOnce, pullTen, autoPull, testTrait, syncLeverLen, setPlateText,
    preview: L => autoPull(L),
    get busy() { return busy || leverAnim; },
    onResult: null,
    onTenDone: null,
  };
})(window.TG = window.TG || {});

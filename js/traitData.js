/* 등급 · 확률 · 특성 목록 · 등급 색상 · 등급별 연출 설정.
   가장 먼저 로드되는 파일이라 다른 파일이 함께 쓰는 작은 도구(TG.util)도 여기 둔다.
   파일을 더블클릭해서 열어도 동작하도록 ES 모듈 대신 전역 이름공간 TG를 쓴다. */
(function (TG) {
  'use strict';

  /* ---------- 공용 도구 ---------- */
  const RM = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  TG.util = {
    RM,
    $: id => document.getElementById(id),
    rand: (a, b) => a + Math.random() * (b - a),
    pick: arr => arr[Math.floor(Math.random() * arr.length)],
    wait: ms => new Promise(r => setTimeout(r, ms)),
    clone: o => JSON.parse(JSON.stringify(o)),
    safeParse: s => { try { return s ? JSON.parse(s) : null; } catch { return null; } },
    lsGet: k => { try { return localStorage.getItem(k); } catch { return null; } },
    lsSet: (k, v) => { try { localStorage.setItem(k, v); return true; } catch { return false; } },
    lsDel: k => { try { localStorage.removeItem(k); } catch {} },
    fmtPct: x => (Math.round(x * 1000) / 1000).toLocaleString('ko-KR', { maximumFractionDigits: 3 }) + '%',
    tierVar: L => `var(--t${L})`,
  };

  /* ---------- 등급 ----------
     reveal: 'reel'  = 릴이 결과에 멈춘 뒤 릴 위에서 공개
             'stage' = 릴은 뒤에서 계속 돌고, 화면 중앙 무대에서 공개
             (10회 뽑기에서는 흐름이 끊기지 않게 언커먼까지 'reel'로 짧게 보여 준다)
     fx.hold    = 회전이 느려진 뒤 무대가 열리기까지 더 기다리는 시간(ms)
     fx.autoNext = 10회 뽑기에서 자동으로 다음으로 넘어가는 시간(ms), null이면 눌러야 넘어감 */
  const TRAIT_TIERS = {
    basic:     { level: 0, ko: '기본',     en: 'BASIC',     color: '#a3a8b0', reveal: 'reel',  desc: '연출: 없음 (이름만 표시)',                                         fx: {} },
    common:    { level: 1, ko: '커먼',     en: 'COMMON',    color: '#e9edf3', reveal: 'reel',  desc: '연출: 작은 별들이 이름 주변을 두 바퀴 돌고 날아가요',               fx: {} },
    uncommon:  { level: 2, ko: '언커먼',   en: 'UNCOMMON',  color: '#62d69b', reveal: 'stage', desc: '연출: 흰 별이 2바퀴 돌며 초록으로 차오르고 반짝, 별 2개가 이름 주변을 돌아요', fx: { hold: 0,   autoNext: 1200 } },
    rare:      { level: 3, ko: '레어',     en: 'RARE',      color: '#5cc8ff', reveal: 'stage', desc: '연출: 흰 별 3바퀴 → 하늘색 → 조각나며 사라지고, 이름이 한 획씩 채워져요', fx: { hold: 0,   autoNext: 1400 } },
    epic:      { level: 4, ko: '에픽',     en: 'EPIC',      color: '#a980ff', reveal: 'stage', desc: '연출: 흰 별 4바퀴 → 보라 → 점점 빨라지다 흰 화면, 마법진과 은하수',      fx: { hold: 250, autoNext: 1600 } },
    legendary: { level: 5, ko: '레전더리', en: 'LEGENDARY', color: '#ffb43a', reveal: 'stage', desc: '연출: 흰 별 5바퀴 → 노랑·주황 → 금이 가다 깨지고, 파편이 이름 주변을 돌아요', fx: { hold: 450, autoNext: 1800 } },
    mythic:    { level: 6, ko: '신화',     en: 'MYTHIC',    color: '#f2f2f2', reveal: 'stage', desc: '연출: ??? 직접 뽑아서 확인하세요',                                 fx: { hold: 650, autoNext: null } },
  };
  const TIERS = Object.entries(TRAIT_TIERS)
    .map(([id, t]) => Object.assign({ id }, t))
    .sort((a, b) => a.level - b.level);

  const DEFAULT_POOL = {
    basic:     { prob: 45,  traits: ['튼튼함', '부지런함', '느긋함', '무난함', '꼼꼼함'] },
    common:    { prob: 25,  traits: ['날렵함', '끈기', '눈썰미', '손재주'] },
    uncommon:  { prob: 15,  traits: ['강철 피부', '바람의 발걸음', '날카로운 감각'] },
    rare:      { prob: 8,   traits: ['흡혈', '번개 반사신경', '얼음 심장'] },
    epic:      { prob: 4.5, traits: ['불사조의 피', '그림자 도약'] },
    legendary: { prob: 2,   traits: ['용의 심장', '시간 감속'] },
    mythic:    { prob: 0.5, traits: ['신의 가호'] },
  };

  function sanitizePool(d) {
    const out = {};
    for (const t of TIERS) {
      const v = d && typeof d === 'object' ? d[t.id] : null;
      const def = DEFAULT_POOL[t.id];
      const prob = v && Number.isFinite(Number(v.prob)) ? Math.max(0, Number(v.prob)) : def.prob;
      const traits = v && Array.isArray(v.traits)
        ? v.traits.filter(s => typeof s === 'string').map(s => s.trim().slice(0, 60)).filter(Boolean).slice(0, 300)
        : def.traits.slice();
      out[t.id] = { prob, traits };
    }
    return out;
  }

  // 특성이 없는 등급은 확률이 있어도 나오지 않는다. 합계가 100이 아니면 비율대로 다시 나눈다.
  function stats(pool) {
    const rows = TIERS.map(t => {
      const p = pool[t.id];
      return Object.assign({}, t, { raw: p.prob, traits: p.traits, w: p.traits.length ? p.prob : 0 });
    });
    const total = rows.reduce((s, r) => s + r.w, 0);
    const rawSum = rows.reduce((s, r) => s + r.raw, 0);
    rows.forEach(r => {
      r.pct = total ? r.w / total * 100 : 0;
      r.each = r.traits.length ? r.pct / r.traits.length : 0;
    });
    return { rows, total, rawSum };
  }

  function entries(pool) {
    const out = [];
    stats(pool).rows.forEach(r => { if (r.w) r.traits.forEach(n => out.push({ name: n, level: r.level })); });
    return out;
  }

  Object.assign(TG, { TRAIT_TIERS, TIERS, DEFAULT_POOL, sanitizePool, stats, entries });
})(window.TG = window.TG || {});

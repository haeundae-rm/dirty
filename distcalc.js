// distcalc.js — 정비보고서 → 정비보조 더티 배분 (관리자 앱 '더티 배분 만들기') 2026-11-07
// Claude 가 쓰던 run_dusting.py --auto (dusting_recalc.py 나누기 + dusting_guide.py 정비층·근무자 블록 + check_rows) 를 그대로 옮김
//  · 명단 = 정비보고서 상단 메이드 카드 순서 (배정수량이 숫자이고 0보다 큰 카드만 — 휴무 등은 빠짐)
//  · 메이드별 더티 = 기준표[배정수량 정수부] (없으면 0) → 메이드별 예외로 덮음
//  · 인당 목표 = round(총더티 / 더티 인원)  (파이썬 round: .5 는 짝수 쪽)
//  · 카드 순서대로 더티를 누적 → 그룹 = min(인원, ceil(누적 / 인당 목표)) → 그 번째 정비보조 담당
//  · 더티 0 메이드 = '더티 지원 없음'(근무자 빈칸), 기타 업무 인원 = 메이드 빈 줄
// 화면(dist.js)과 시험(node)에서 같이 씀 — 규칙을 바꿀 때는 test/dist_parity.py 로 파이썬 쪽과 대조
(function (G) {
  'use strict';
  var PALETTE = ['#1F5FA8', '#B23A48', '#2E7D4F', '#7D3C98', '#C77C0E', '#117A75', '#5D6D7E', '#9A7D0A'];

  function pyRound(x) { var f = Math.floor(x), d = x - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); }
  function nice(v) { return v === Math.floor(v) ? Math.floor(v) : v; }
  function floorsOf(rooms) {
    var fl = [];
    rooms.forEach(function (r) { var f = Math.floor(parseInt(r, 10) / 100); if (fl.indexOf(f) < 0) fl.push(f); });
    return fl.map(function (f) { return f + '층'; }).join(' / ');
  }

  /** 정비보고서 객실 → { 메이드: [객실…] } (이름 칸 공백 제거·쉼표로 공동 배정) */
  function roomsByMaid(rooms) {
    var by = {};
    (rooms || []).forEach(function (x) {
      if (!x.name) return;
      String(x.name).replace(/ /g, '').split(',').forEach(function (n) { if (n) (by[n] = by[n] || []).push(String(x.room)); });
    });
    Object.keys(by).forEach(function (n) { by[n].sort(function (a, b) { return parseInt(a, 10) - parseInt(b, 10); }); });
    return by;
  }
  /** 상단 메이드 카드 → [{name, unit}] (run_dusting --auto 와 같은 거르기) */
  function cardList(cards) {
    var out = [];
    (cards || []).forEach(function (c) {
      var u = String(c.unit === null || c.unit === undefined ? '' : c.unit).trim();
      if (/^\d+(\.\d+)?$/.test(u) && parseFloat(u) > 0) out.push({ name: c.name, unit: parseFloat(u) });
    });
    return out;
  }
  /** 기준표 = 배정수량 4~19 칸별 더티 (엑셀 [정비 지원 안내] 와 같음, 빈칸 = 0). 예전 모양 {top, topVal}(N 이상)도 받아서 바꿈 */
  function normRule(rule) {
    var R = {}, r = rule || {};
    for (var u = 4; u <= 19; u++) {
      var v = r[String(u)];
      if ((v === undefined || v === null || v === '') && r.top && u >= Number(r.top)) v = r.topVal;
      R[String(u)] = Math.max(0, Number(v) || 0);
    }
    return R;
  }
  /** 배정수량 → 더티 (정수부 기준, 20개 이상은 19칸, 4개 미만은 0) */
  function ruleOf(rule, unit) {
    var k = Math.trunc(unit), R = normRule(rule);
    if (k < 4) return 0;
    return R[String(Math.min(19, k))];
  }

  /**
   * data = engine.buildFromXlsx(...).data ({rooms, cards})
   * opt = { date, workers:[더티 담당], etc:[기타 업무], rule, over:{메이드: 더티}, move:{메이드: 근무자|''} }
   *   move = 미리보기에서 손으로 옮긴 것 (자동 나누기 뒤에 적용, ''= 지원 없음)
   * → { plan:[{d,w,c,m,f,n,r}], blocks:[{name,color,maids,dirty}], pool, per, total, warn:[] }
   */
  function compute(data, opt) {
    opt = opt || {};
    var date = String(opt.date || ''), warn = [];
    var by = roomsByMaid(data.rooms), cards = cardList(data.cards);
    var workers = (opt.workers || []).map(function (w) { return String(w).trim(); }).filter(Boolean);
    var etc = (opt.etc || []).map(function (w) { return String(w).trim(); }).filter(Boolean);
    if (workers.length > 8) throw new Error('더티 정비보조는 8명까지예요.');
    if (cards.length > 50) throw new Error('출근 메이드가 ' + cards.length + '명이라 50명을 넘어요.');
    var dupW = workers.filter(function (w, i) { return workers.indexOf(w) !== i; });
    if (dupW.length) throw new Error('더티 명단에 같은 이름이 두 번 있어요: ' + dupW.join(', '));
    var both = etc.filter(function (w) { return workers.indexOf(w) >= 0; });
    if (both.length) throw new Error('더티와 기타 업무에 같이 들어간 이름: ' + both.join(', '));
    var over = opt.over || {}, move = opt.move || {}, memo = opt.memo || {};

    var maids = cards.map(function (c) {
      var d = ruleOf(opt.rule, c.unit);
      if (Object.prototype.hasOwnProperty.call(over, c.name) && over[c.name] !== '' && over[c.name] !== null) d = Number(over[c.name]) || 0;
      return { name: String(c.name).trim(), unit: c.unit, dirty: d, rooms: (by[String(c.name).trim()] || []).slice(), worker: '', group: 0, exc: Object.prototype.hasOwnProperty.call(over, c.name) };
    });
    // dusting_recalc.py
    var total = maids.reduce(function (s, m) { return s + m.dirty; }, 0), N = workers.length || 1;
    var per = workers.length ? pyRound(total / N) : 0;
    var cum = 0;
    maids.forEach(function (m) {
      cum += m.dirty;
      if (!m.name) return;
      var F = per ? Math.min(N, Math.ceil(cum / per)) : 0;
      m.group = F;
      m.worker = F >= 1 && F <= 8 && workers[F - 1] ? workers[F - 1] : '';
    });
    // 손으로 옮긴 것
    Object.keys(move).forEach(function (n) {
      var m = maids.filter(function (x) { return x.name === n; })[0];
      if (!m) return;
      var to = String(move[n] || '');
      if (to && workers.indexOf(to) < 0) return;
      m.worker = to; m.moved = true;
    });
    // 점검
    var names = maids.map(function (m) { return m.name; });
    var dupM = names.filter(function (n, i) { return names.indexOf(n) !== i; });
    if (dupM.length) warn.push('메이드 카드에 같은 이름이 두 번 있어요: ' + dupM.join(', ') + ' (첫 줄만 써요)');
    maids.forEach(function (m) { if (!m.rooms.length && m.dirty > 0) warn.push(m.name + ' 님은 객실 배정이 없어서 빠져요 (더티 ' + nice(m.dirty) + '실)'); });
    Object.keys(by).forEach(function (n) { if (names.indexOf(n) < 0) warn.push(n + ' 님(' + by[n].length + '실)은 메이드 카드에 없어서 빠져요'); });

    // dusting_guide.py — 더티가 있는 메이드가 있는 근무자만, 근무자 순서대로 색
    var live = maids.filter(function (m) { return m.rooms.length; });
    var blocks = [], ci = 0;
    workers.forEach(function (w) {
      if (!maids.some(function (m) { return m.worker === w && m.dirty > 0; })) return;
      var color = PALETTE[ci++ % PALETTE.length];   // 색 순서는 파이썬과 같게 (객실 없는 메이드만 맡은 근무자도 한 칸 차지)
      var lst = live.filter(function (m) { return m.worker === w && m.dirty > 0; });
      if (!lst.length) return;
      blocks.push({ name: w, color: color, maids: lst, dirty: nice(lst.reduce(function (s, m) { return s + m.dirty; }, 0)) });
    });
    var idle = workers.filter(function (w) { return !blocks.some(function (b) { return b.name === w; }); });
    if (idle.length) warn.push(idle.join(', ') + ' 님은 맡을 메이드가 없어서 기타 업무로 넣었어요');
    var pool = live.filter(function (m) { return !(m.dirty > 0 && blocks.some(function (b) { return b.name === m.worker; })); });

    var plan = [], seen = {};
    function push(o) { if (o.m) { if (seen[o.m]) return; seen[o.m] = 1; } plan.push(o); }
    blocks.forEach(function (b) {
      b.maids.forEach(function (m) { push({ d: date, w: b.name, c: b.color, m: m.name, f: floorsOf(m.rooms), n: nice(m.dirty), r: m.rooms.join(', ') }); });
    });
    pool.forEach(function (m) { push({ d: date, w: '', c: '', m: m.name, f: floorsOf(m.rooms), n: 0, r: m.rooms.join(', ') }); });
    etc.concat(idle).forEach(function (w) { plan.push({ d: date, w: w, c: '', m: '', f: String(memo[w] || '').slice(0, 30), n: 0, r: '' }); });   // 기타 업무 줄의 정비층 칸 = 비고 (예: 단체 침구)
    return {
      plan: plan, blocks: blocks, pool: pool, maids: maids, per: per, total: nice(total), warn: warn,
      etc: etc.concat(idle), roomsTotal: Object.keys(by).reduce(function (s, n) { return s + by[n].length; }, 0)
    };
  }

  var api = { compute: compute, normRule: normRule, roomsByMaid: roomsByMaid, cardList: cardList, ruleOf: ruleOf, floorsOf: floorsOf, PALETTE: PALETTE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else G.SupDistCalc = api;
})(typeof window !== 'undefined' ? window : globalThis);

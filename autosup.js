// autosup.js — 레포트 앱 객실 추가·제외·교환 → 정비 지원 자동 반영 (2026-11-21)
//  ① rmRows: 레포트 앱이 같이 적어 둔 변경(sup/{날짜}/rm/{id}, days/{날짜}/changes 와 같은 문서) → 정비 지원 '변경' 줄 (종류 '수정', 이전담당 '레포트')
//     · 휴대폰 안에서만 만드는 줄 (저장하지 않음). 이미 더티 체크한 객실은 빼지 않음
//  ② decide: 방이 바뀐 메이드의 유닛(객실 수, 로얄 2) → 더티 기준표(그날 배분 meta.rule) → 자동 처리
//     · 지원 없음 + 기준 더티 > 0 → 오늘 더티 근무 중인 정비보조 중 더티가 가장 적은 분에게 '가져옴'
//         같으면 아직 안 한 더티가 적은 분 → 메이드 층과 가까운 분 → 명단 순서. 대상이 없으면 알림 'need'
//     · 지원 중 + 기준 더티가 바뀜 → '수정'(수량). 정비보조·관리자가 손으로 수량을 고친 메이드는 그대로
//     · 자동으로 가져온 메이드가 기준 0 이 되고 더티 체크 0 → '되돌림'. 이미 시작했거나 원래 배정이면 알림 'under'
//     · 아침 배분에서 예외 수량(meta.over)·손으로 옮긴(meta.move) 메이드, 사람이 '되돌림' 한 메이드는 건드리지 않음
//     · 레포트 변경 뒤 30초 기다렸다가 (잘못 눌렀다 바로 되돌리는 경우)
//  자동 줄 = 이전담당 칸 '자동', 문서 ID 고정(auto-…) → 여러 휴대폰이 같이 계산해도 한 줄만 남음
// 화면(shim.js)과 시험(node)에서 같이 씀
(function (G) {
  'use strict';
  var ROYAL = { '3001': 1, '3002': 1, '3101': 1, '3102': 1 };
  var DEF_RULE = { '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 4, '11': 6, '12': 8, '13': 10, '14': 11, '15': 11, '16': 11, '17': 11, '18': 11, '19': 11 };
  var WAIT = 30000;

  function num(v) { var n = typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Date.parse(v); return isNaN(n) ? 0 : n; }
  function roomsOf(v) { return String(v || '').split(/[,\s/]+/).map(function (s) { return s.replace(/^'/, '').replace(/\.0$/, '').replace(/호$/, ''); }).filter(function (s) { return /^\d{3,4}$/.test(s); }); }
  function unitOf(rooms) { return (rooms || []).reduce(function (s, r) { return s + (ROYAL[String(r)] ? 2 : 1); }, 0); }
  function ruleOf(rule, u) {
    var k = Math.trunc(u); if (k < 4) return 0;
    var R = rule && typeof rule === 'object' ? rule : DEF_RULE, v = R[String(Math.min(19, k))];
    if ((v === undefined || v === null || v === '') && R.top && k >= Number(R.top)) v = R.topVal;   // 예전 모양 {top, topVal}
    return Math.max(0, Math.round(Number(v) || 0));
  }
  function hash(s) { var h = 5381; s = String(s); for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
  function floorOf(r) { return Math.floor(parseInt(r, 10) / 100); }
  function has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

  /** 레포트 변경 문서 [{id, data}] → { rows:[{id, at, row}], touched:{메이드: 마지막 변경 시각} } */
  function rmRows(docs, date, checked) {
    checked = checked || {};
    var list = (docs || []).filter(function (d) { return d && d.data && d.data.maid && d.data.room; }).slice();
    list.sort(function (a, b) { return (num(a.data.clientAt) || num(a.data.at)) - (num(b.data.clientAt) || num(b.data.at)) || (a.id < b.id ? -1 : 1); });
    var rows = [], touched = {};
    function step(id, at, maid, add, del) {
      maid = String(maid || '').trim(); if (!maid) return;
      if (del && checked[del]) del = '';   // 정비보조가 이미 체크한 객실은 목록에 남김 (실적 그대로)
      if (!add && !del) return;
      rows.push({ id: id, at: at, row: [null, date, '수정', maid, '', add || '', '', del || '', '레포트'] });
      touched[maid] = Math.max(touched[maid] || 0, at);
    }
    list.forEach(function (d) {
      var x = d.data, at = num(x.at) || num(x.clientAt), room = String(x.room);
      if (x.kind === '추가') step(d.id, at, x.maid, room, '');
      else if (x.kind === '제외') step(d.id, at, x.maid, '', room);
      else if (x.kind === '교환' && x.to && x.toRoom) {
        step(d.id + ':1', at, x.maid, '', room); step(d.id + ':2', at, x.to, room, '');
        step(d.id + ':3', at, x.to, '', String(x.toRoom)); step(d.id + ':4', at, x.maid, String(x.toRoom), '');
      }
    });
    return { rows: rows, touched: touched };
  }

  /** 오늘 더티 근무 중인 정비보조 (퇴근·근무 종료·기타 업무 빼고, 출근 기록이 있어야) */
  function eligible(st) {
    var att = st.att || {};
    return (st.workers || []).filter(function (w) {
      var a = att[w.name];
      if (w.ended || !a || !a.in || a.out) return false;
      if (a.task === '기타 업무') return false;
      if (!a.task && w.etc && !w.maids.length) return false;
      return true;
    });
  }
  function doneOf(m, checks) { return m.rooms.filter(function (r) { return checks[r]; }).length; }
  function pick(st, m) {
    var checks = st.checks || {}, mf = m.rooms.map(floorOf);
    var cand = eligible(st).map(function (w, i) {
      var load = 0, rem = 0, dist = 99;
      w.maids.forEach(function (x) {
        load += Number(x.dirty) || 0; rem += Math.max(0, (Number(x.dirty) || 0) - doneOf(x, checks));
        x.rooms.forEach(function (r) { var f = floorOf(r); mf.forEach(function (g) { dist = Math.min(dist, Math.abs(f - g)); }); });
      });
      return { w: w, load: load, rem: rem, dist: dist, i: i };
    });
    cand.sort(function (a, b) { return (a.load - b.load) || (a.rem - b.rem) || (a.dist - b.dist) || (a.i - b.i); });
    return cand.length ? cand[0] : null;
  }

  /**
   * st = state_() 결과(레포트 줄 반영 뒤), ctx = { date, plan: sup/{날짜} 문서, touched, now }
   * → { actions:[{id, row, kind, maid, worker, n}], alerts:[{maid, st, unit, n, w, msg}], retry: ms(0 = 없음) }
   */
  function decide(st, ctx) {
    var out = { actions: [], alerts: [], retry: 0 };
    var plan = ctx.plan || {}, meta = plan.meta || {}, now = ctx.now || Date.now(), touched = ctx.touched || {};
    if (!Array.isArray(plan.plan) || !plan.plan.length || st.noPlan) return out;
    var rule = meta.rule || DEF_RULE, over = meta.over || {}, move = meta.move || {}, units = meta.units || {};
    var P = {};
    plan.plan.forEach(function (x) { if (x && x.m && !P[String(x.m).trim()]) P[String(x.m).trim()] = { rooms: roomsOf(x.r), n: Number(x.n) || 0 }; });
    var all = [];
    (st.workers || []).forEach(function (w) { w.maids.forEach(function (m) { all.push(m); }); });
    (st.pool || []).forEach(function (m) { all.push(m); });
    var checks = st.checks || {}, chg = st.changes || [];

    all.forEach(function (m) {
      var t = touched[m.name], p = P[m.name];
      if (!t || !p) return;
      if (has(over, m.name) || has(move, m.name)) return;
      if (now - t < WAIT) { var left = WAIT - (now - t) + 200; out.retry = out.retry ? Math.min(out.retry, left) : left; return; }
      var baseU = Number(units[m.name]) > 0 ? Number(units[m.name]) : unitOf(p.rooms);
      var unit = Math.round((baseU + unitOf(m.rooms) - unitOf(p.rooms)) * 10) / 10;
      var target = ruleOf(rule, unit);
      var mine = chg.filter(function (c) { return c.maid === m.name; });
      var autoN = mine.filter(function (c) { return c.from === '자동'; }).length;
      var manualQty = mine.some(function (c) { return c.kind === '수정' && c.from !== '자동' && c.from !== '레포트' && c.dirty !== null && c.dirty !== undefined && c.dirty !== ''; });
      var humanBack = mine.some(function (c) { return c.kind === '되돌림' && c.from !== '자동'; });
      var takes = mine.filter(function (c) { return c.kind === '가져옴'; });
      var autoTaken = m.taken && takes.length && takes[takes.length - 1].from === '자동';
      var done = doneOf(m, checks);
      function act(kind, worker, n) {
        var row = [null, ctx.date, kind, m.name, worker, '', kind === '되돌림' ? '' : n, '', '자동'];
        out.actions.push({ id: 'auto-' + hash(ctx.date + '|' + m.name) + '-' + autoN + '-' + (kind === '가져옴' ? 'take' : kind === '수정' ? 'qty' : 'back'), row: row, kind: kind, maid: m.name, worker: worker, n: n });
      }
      function alert(s, w, msg) { out.alerts.push({ maid: m.name, st: s, unit: unit, n: target, w: w || '', msg: msg }); }
      if (m.worker) {
        if (target > 0) {
          if (!manualQty && target !== m.dirty) { act('수정', m.worker, target); alert('auto', m.worker, unit + '유닛 → 더티 ' + m.dirty + '실을 ' + target + '실로 바꿈'); }
          else if (autoTaken) alert('auto', m.worker, unit + '유닛 → ' + m.worker + ' 님에게 자동 배정 (더티 ' + m.dirty + '실)');
        } else if (autoTaken && done === 0) { act('되돌림', m.worker, ''); alert('auto', m.worker, unit + '유닛으로 줄어 자동 배정을 풀었어요'); }
        else if (m.dirty > 0 && ruleOf(rule, baseU) > 0) alert('under', m.worker, unit + '유닛으로 줄었는데 더티 지원 중 (' + m.worker + ' 님, 더티 ' + m.dirty + '실' + (done ? ', ' + done + '실 완료' : '') + ')');
      } else if (target > 0 && !humanBack) {
        var c = pick(st, m);
        if (c) { act('가져옴', c.w.name, target); alert('auto', c.w.name, unit + '유닛 → ' + c.w.name + ' 님에게 자동 배정 (더티 ' + target + '실)'); }
        else alert('need', '', unit + '유닛인데 더티 근무 중인 정비보조가 없어요 (기준 더티 ' + target + '실)');
      } else if (!m.worker && autoN) alert('auto', '', unit + '유닛 · 자동 배정 풀림');
    });
    return out;
  }

  var api = { rmRows: rmRows, decide: decide, eligible: eligible, pick: pick, unitOf: unitOf, ruleOf: ruleOf, hash: hash, roomsOf: roomsOf, WAIT: WAIT, DEF_RULE: DEF_RULE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else G.SupAuto = api;
})(typeof window !== 'undefined' ? window : globalThis);

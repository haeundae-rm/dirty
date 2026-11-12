// dist.js — 관리자 '더티 배분 만들기' (2026-11-07)
// 정비보고서 엑셀을 이 기기에서 읽고(engine.js, 레포트 앱과 같은 코드) → 정비보조 고르기 · 기준표 · 예외 → 미리보기 → 확정
// 확정 = Firestore sup/{날짜} 에 배정(plan)을 바로 씀 → 정비보조 휴대폰에 바로 뜸, 시트 '배정' 탭은 중계(SupFirebase ⑦)가 1~2분 안에
// 계산은 distcalc.js (Claude 가 쓰던 run_dusting.py 와 같은 결과)
(function () {
  'use strict';
  var VER = (window.SupShim && SupShim.ver) || '';
  // 이 파일이 있는 폴더 (11/13: 관리자 허브 /rm/admin/ 에서도 이 파일을 불러 씀 → engine.js 는 늘 이 파일 옆 것)
  var BASE = document.currentScript && document.currentScript.src ? document.currentScript.src.replace(/[?#].*$/, '').replace(/[^/]*$/, '') : './';
  var DEF_RULE = { '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 4, '11': 6, '12': 8, '13': 10, '14': 11, '15': 11, '16': 11, '17': 11, '18': 11, '19': 11 };
  var K = null;   // 열려 있는 동안의 상태

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api() { return window.SupShim && SupShim.dist; }
  function md(d) { return Number(d.slice(5, 7)) + '/' + Number(d.slice(8)); }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

  // ---------- 관리자 화면에 버튼 붙이기 (render 다음마다)
  function inject() {
    try {
      if (!window.adminTok || !window.plan) return;
      var main = document.getElementById('main');
      if (!main || main.querySelector('.dz-open')) return;
      var am = main.querySelector('.amode');
      if (!am) return;
      var has = !window.plan.noPlan;
      var b = document.createElement('div');
      b.className = 'dz-open';
      b.innerHTML = '<button data-dist="1"><b>📋 더티 배분 ' + (has ? '다시 만들기' : '만들기') + '</b><small>레포트 앱 정비보고서 자동 불러오기 → 정비보조 확인 → 확정</small></button>';
      am.insertAdjacentElement('afterend', b);
    } catch (e) {}
  }
  // 정비보조 화면: '오늘은 기타 업무예요' 안내에 관리자가 적은 비고(예: 단체 침구)를 붙임
  function etcNote() {
    try {
      if (window.adminTok || !window.me || !window.SupShim || !SupShim.dist) return;
      var d = SupShim.dist.planDoc(SupShim.dist.today());
      var row = d && d.plan.filter(function (x) { return x && x.w === window.me && !x.m && x.f; })[0];
      if (!row) return;
      var n = document.querySelector('#main .notice');
      if (!n || !/오늘은 기타 업무예요/.test(n.textContent) || n.querySelector('.dz-etc')) return;
      var b = document.createElement('div'); b.className = 'dz-etc'; b.textContent = '📝 ' + row.f;
      n.querySelector('strong').insertAdjacentElement('afterend', b);
    } catch (e) {}
  }
  var r0 = window.render;
  window.render = function () { r0.apply(this, arguments); inject(); etcNote(); };

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-dist]');
    if (t && !t.closest('.dz')) { e.preventDefault(); open(); }
  });

  // ---------- 열기
  function open() {
    var A = api();
    if (!A || !A.isAdmin()) { alert('관리자 모드에서만 쓸 수 있어요.'); return; }
    var day = A.today();
    K = { date: day, file: '', data: null, sheet: '', sum: null, err: '', busy: false, saving: false,
          pick: {}, order: [], rule: null, memo: {}, over: {}, move: {}, res: null, ruleOpen: false, done: null, extra: '' };
    var box = document.createElement('div');
    box.className = 'dz'; box.id = 'dz';
    document.body.appendChild(box);
    document.body.classList.add('dz-lock');
    prefill(); draw(); loadRep(day);
    loadRule().then(function (r) { if (K) { K.rule = r; draw(); } });
    A.fetchPlan(A.shift(day, 1)).then(function () { if (K) draw(); }, function () {});
  }
  // 2026-11-12: 레포트 앱에서 올린 그날 정비보고서(카드·객실)를 불러옴 — 파일을 직접 고르면 그쪽이 우선
  function loadRep(d) {
    var A = api(); if (!K || !A.fetchReport || K.lastFile) return;
    K.repBusy = true; K.repNone = false; K.src = null; draw();
    A.fetchReport(d).then(function (x) {
      if (!K || K.date !== d || K.lastFile) return;
      K.repBusy = false;
      if (x && Array.isArray(x.cards) && Array.isArray(x.rooms) && x.rooms.length) {
        K.data = { rooms: x.rooms, cards: x.cards, groups: [], themes: [] }; K.sheet = x.sheet || ''; K.file = x.file || '';
        K.src = { at: x.at, who: x.who || '' }; K.err = '';
      } else K.repNone = true;
      draw();
    }, function () { if (!K || K.date !== d) return; K.repBusy = false; K.repNone = true; draw(); });
  }
  function hhmm(t) {
    var n = t && typeof t === 'object' ? (t.toMillis ? t.toMillis() : t.seconds * 1000) : Number(t);
    if (!n) return '';
    var x = new Date(n + 9 * 3600000); return ('0' + x.getUTCHours()).slice(-2) + ':' + ('0' + x.getUTCMinutes()).slice(-2);
  }
  function close() { var b = document.getElementById('dz'); if (b) b.remove(); document.body.classList.remove('dz-lock'); K = null; }

  function loadRule() {
    var local = null; try { local = JSON.parse(lsGet('dust_rule') || 'null'); } catch (e) {}
    var N = SupDistCalc.normRule;
    return api().getCfg().then(function (c) { return N((c && c.rule) || local || DEF_RULE); }, function () { return N(local || DEF_RULE); });
  }

  // 명단: 오늘 출근 기록(업무) → 이 날짜에 앱으로 만든 배정 → 비움
  function prefill() {
    var A = api(), p = window.plan || {}, att = p.att || {}, prev = A.planDoc(K.date);
    K.pick = {}; K.order = []; K.over = {}; K.move = {}; K.memo = {};
    if (prev && prev.meta) {
      (prev.meta.workers || []).forEach(function (n) { K.pick[n] = 'd'; K.order.push(n); });
      (prev.meta.etc || []).forEach(function (n) { if (!K.pick[n]) { K.pick[n] = 'e'; K.order.push(n); } });
      K.over = prev.meta.over || {}; K.move = prev.meta.move || {}; K.memo = prev.meta.memo || {};
    }
    if (K.date === A.today()) Object.keys(att).forEach(function (n) {
      var a = att[n]; if (!a || !a.in || a.out || K.pick[n]) return;
      K.pick[n] = a.task === '기타 업무' ? 'e' : 'd'; K.order.push(n);
    });
  }
  function names() {
    var A = api(), p = window.plan || {}, out = [];
    function add(n) { n = String(n || '').trim(); if (n && n !== '관리자' && out.indexOf(n) < 0) out.push(n); }
    K.order.forEach(add);
    Object.keys(p.att || {}).forEach(function (n) { if (p.att[n].in) add(n); });
    (p.workers || []).forEach(function (w) { add(w.name); });
    (p.known || []).forEach(add);
    A.knownNames().forEach(add);
    return out;
  }
  function workers() { return K.order.filter(function (n) { return K.pick[n] === 'd'; }); }
  function etcs() { return K.order.filter(function (n) { return K.pick[n] === 'e'; }); }

  function recompute() {
    K.res = null; K.cerr = '';
    if (!K.data || !K.rule) return;
    try {
      K.res = SupDistCalc.compute(K.data, { date: K.date, workers: workers(), etc: etcs(), rule: K.rule, over: K.over, move: K.move, memo: K.memo });
    } catch (e) { K.cerr = String(e && e.message || e); }
  }

  // ---------- 그리기
  var drawing = false;
  function draw() {
    if (drawing) { setTimeout(draw, 0); return; }   // 입력 칸이 사라지며 생기는 blur → change 가 그리는 도중에 또 부르는 것 막기
    drawing = true;
    try { draw0(); } finally { drawing = false; }
  }
  function draw0() {
    var box = document.getElementById('dz'); if (!box || !K) return;
    var y = box.scrollTop, A = api();
    recompute();
    var t = A.today(), tm = A.shift(t, 1);
    var h = '<div class="dz-in"><div class="dz-head"><h2>더티 배분 만들기</h2><button class="dz-x" data-dz="close" aria-label="닫기">✕</button></div>';
    if (K.done) { box.innerHTML = h + doneHtml() + '</div>'; return; }
    if (K.src && K.res && K.res.blocks && K.res.blocks.length) h += '<p class="dz-ready">✅ 배분안이 준비됐어요 — 레포트 앱 정비보고서 + ' + (K.date === t ? '출근 체크' : '지난 확정 명단') + '로 채웠어요. 아래 정비보조·미리보기를 확인하고 <b>확정</b>만 누르세요.</p>';
    // 1 날짜
    h += '<section class="dz-sec"><h3><i>1</i>날짜</h3><div class="dz-seg">' +
      [[t, '오늘'], [tm, '내일']].map(function (x) { return '<button data-dz="date" data-v="' + x[0] + '" aria-pressed="' + (K.date === x[0]) + '">' + x[1] + ' ' + md(x[0]) + '</button>'; }).join('') + '</div>' +
      (A.planDoc(K.date) ? '<p class="dz-warn">이 날짜에 이미 배정이 있어요. 확정하면 새 배정으로 바뀌어요 (이미 체크한 객실 실적은 그대로).</p>' : '') + '</section>';
    // 2 파일
    h += '<section class="dz-sec"><h3><i>2</i>정비보고서</h3>' +
      (K.src && K.data ? '<p class="dz-ok">📱 레포트 앱에서 올린 정비보고서를 불러왔어요<br><small>' + esc(K.file) + (hhmm(K.src.at) ? ' · ' + hhmm(K.src.at) + ' 올림' : '') + (K.src.who ? ' · ' + esc(K.src.who) : '') + '</small></p>' +
        '<p class="dz-warn">⚠ ' + (hhmm(K.src.at) ? hhmm(K.src.at) + '에 올린 내용이에요. ' : '') + '그 뒤 엑셀을 고쳤다면 — 배정이 바뀐 경우 레포트 앱에서 다시 올리고, 더티만 다시 할 거면 아래에서 엑셀 파일을 고르세요.</p>' : '') +
      (K.repBusy ? '<p class="dz-tip">레포트 앱에서 올린 정비보고서를 찾는 중…</p>' : '') +
      (K.repNone && !K.data && !K.busy ? '<p class="dz-tip">' + md(K.date) + ' 정비보고서는 레포트 앱에 아직 안 올라왔어요. 레포트 앱에서 먼저 올리거나 엑셀 파일을 골라 주세요.</p>' : '') +
      '<label class="dz-file' + (K.src && K.data ? ' dz-sub' : '') + '"><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" data-dz="file">' +
      (K.busy ? '읽는 중…' : K.src && K.data ? '📂 엑셀 파일로 바꾸기' : K.data ? '📄 ' + esc(K.file) + ' <small>다른 파일 고르기</small>' : '📂 엑셀 파일 고르기') + '</label>' +
      (K.err ? '<p class="dz-err">' + esc(K.err) + '</p>' : '') +
      (K.data ? '<p class="dz-ok">' + esc(K.sheet) + '일 시트 · 출근 메이드 ' + SupDistCalc.cardList(K.data.cards).length + '명 · 배정 객실 ' + (K.res ? K.res.roomsTotal : '-') + '실</p>' : '') + '</section>';
    // 3 정비보조
    var ws = workers(), es = etcs();
    h += '<section class="dz-sec"><h3><i>3</i>정비보조 <small>눌러서 🛏 더티 → 🧰 기타 → 빠짐</small></h3>' +
      '<p class="dz-tot">총원 <b>' + (ws.length + es.length) + '명</b> = 더티 ' + ws.length + '명 + 기타 업무 ' + es.length + '명</p><div class="dz-chips">' +
      names().map(function (n) {
        var s = K.pick[n], no = s === 'd' ? ws.indexOf(n) + 1 : 0;
        return '<button data-dz="who" data-v="' + esc(n) + '" class="' + (s === 'd' ? 'd' : s === 'e' ? 'e' : '') + '">' + (s === 'd' ? '<em>' + no + '</em>🛏 ' : s === 'e' ? '🧰 ' : '') + esc(n) + '</button>';
      }).join('') + '</div>' + (es.length ? '<div class="dz-memo">' + es.map(function (n) {
        return '<label><span>🧰 ' + esc(n) + '</span><input data-dz="memo" data-v="' + esc(n) + '" maxlength="30" placeholder="비고 (예: 단체 침구)" value="' + esc(K.memo[n] || '') + '"></label>';
      }).join('') + '</div>' : '') + '<div class="dz-add"><input data-dz="newname" maxlength="20" placeholder="새 이름" value="' + esc(K.extra) + '"><button data-dz="addname">+ 추가</button></div>' +
      '<p class="dz-tip">더티 번호 순서대로 카드 앞쪽(낮은 층) 메이드부터 맡아요. 순서를 바꾸려면 빼고 다시 누르세요.</p></section>';
    // 4 기준표
    var R = K.rule || DEF_RULE;
    h += '<section class="dz-sec"><h3><i>4</i>더티 기준 <small>배정수량 → 더티 실</small></h3><p class="dz-rule">' + esc(ruleText(R)) +
      ' <button class="dz-link" data-dz="ruletoggle">' + (K.ruleOpen ? '닫기' : '바꾸기') + '</button></p>';
    if (K.ruleOpen) {
      h += '<div class="dz-grid">';
      for (var u = 4; u <= 19; u++) h += '<label' + (Number(R[String(u)]) > 0 ? ' class="on"' : '') + '>' + u + '개' + (u === 19 ? ' 이상' : '') + '<input type="number" min="0" max="40" inputmode="numeric" data-dz="rule" data-v="' + u + '" value="' + esc(Number(R[String(u)]) || '') + '" placeholder="0"></label>';
      h += '</div><p class="dz-tip">배정수량별 더티 실 수예요. 빈칸 = 더티 없음. 바꾼 기준은 다음에도 그대로 써요 (소장·부소장 같이).</p>';
    }
    h += '</section>';
    // 5 미리보기
    h += '<section class="dz-sec"><h3><i>5</i>미리보기</h3>' + preview() + '</section>';
    var can = K.res && K.res.blocks.length && !K.saving;
    h += '<div class="dz-foot"><button class="dz-go" data-dz="save"' + (can ? '' : ' disabled') + '>' +
      (K.saving ? '저장 중…' : K.res && K.res.blocks.length ? md(K.date) + ' 배정 확정 · 정비보조 ' + (ws.length + es.length) + '명' : '파일과 더티 정비보조를 골라 주세요') + '</button></div></div>';
    box.innerHTML = h;
    box.scrollTop = y;
  }
  // '정비수 14개 이상 11실 / 13개 10실 / …' (19개부터 같은 값이 이어지는 칸은 'N개 이상'으로 묶음)
  function ruleText(R0) {
    var R = SupDistCalc.normRule(R0), parts = [], u = 19, top = Number(R['19']);
    if (top > 0) { while (u > 4 && Number(R[String(u - 1)]) === top) u--; parts.push(u + '개 이상 ' + top + '실'); u--; }
    for (; u >= 4; u--) if (Number(R[String(u)]) > 0) parts.push(u + '개 ' + R[String(u)] + '실');
    return parts.length ? '정비수 ' + parts.join(' / ') : '더티 지원 없음 (기준표가 비어 있어요)';
  }
  function preview() {
    if (!K.data) return '<p class="dz-tip">파일을 고르면 나와요.</p>';
    if (K.cerr) return '<p class="dz-err">' + esc(K.cerr) + '</p>';
    var r = K.res; if (!r) return '';
    if (!workers().length) return '<p class="dz-tip">🛏 더티 정비보조를 한 명 이상 골라 주세요.</p>';
    var ws = workers();
    var sel = function (m) {
      return '<select data-dz="move" data-v="' + esc(m.name) + '"><option value="">지원 없음</option>' + ws.map(function (w) { return '<option' + (m.worker === w && m.dirty > 0 ? ' selected' : '') + '>' + esc(w) + '</option>'; }).join('') + '</select>';
    };
    var row = function (m, pool) {
      return '<div class="dz-m' + (m.exc ? ' exc' : '') + (m.moved ? ' mv' : '') + '"><span class="nm">' + esc(m.name) + '<small>' + esc(SupDistCalc.floorsOf(m.rooms)) + ' · ' + m.unit + '개</small></span>' +
        '<input type="number" min="0" max="40" inputmode="numeric" data-dz="over" data-v="' + esc(m.name) + '" value="' + (pool ? 0 : m.dirty) + '" title="더티 실 (예외)">' + sel(m) + '</div>';
    };
    var h = '<p class="dz-tot">총 더티 <b>' + r.total + '실</b> · 인당 목표 <b>' + r.per + '실</b>' + (Object.keys(K.over).length || Object.keys(K.move).length ? ' · <button class="dz-link" data-dz="reset">예외·옮김 지우기</button>' : '') + '</p>';
    h += r.blocks.map(function (b) {
      return '<div class="dz-b" style="--wc:' + b.color + '"><div class="dz-bh"><b>' + esc(b.name) + '</b><span>메이드 ' + b.maids.length + '명 · 더티 ' + b.dirty + '실</span></div>' + b.maids.map(function (m) { return row(m, false); }).join('') + '</div>';
    }).join('');
    if (r.pool.length) h += '<details class="dz-b dz-pool"><summary>더티 지원 없음 ' + r.pool.length + '명 <small>숫자를 넣으면 지원 대상이 돼요</small></summary>' + r.pool.map(function (m) { return row(m, true); }).join('') + '</details>';
    if (r.etc.length) h += '<p class="dz-tip">🧰 기타 업무: ' + r.etc.map(esc).join(', ') + '</p>';
    if (r.warn.length) h += '<div class="dz-warns">' + r.warn.map(function (w) { return '<p>⚠ ' + esc(w) + '</p>'; }).join('') + '</div>';
    return h;
  }
  function doneHtml() {
    var R = K.rule || DEF_RULE, txt = '더티 지원 업무 기준 (정규 A): ' + ruleText(R);
    return '<section class="dz-sec dz-done"><div class="big">✅</div><h3>' + md(K.date) + ' 더티 배분을 올렸어요</h3><p>정비보조 휴대폰에 바로 보여요. 시트 \'배정\' 탭에는 1~2분 안에 들어가요.</p>' +
      '<p class="dz-ok">' + K.done.blocks.map(function (b) { return esc(b.name) + ' ' + b.maids.length + '명·' + b.dirty + '실'; }).join(' / ') + '</p>' +
      '<h4>룸메이드 공지방에 보낼 기준</h4><textarea readonly rows="3">' + esc(txt) + '</textarea><button class="dz-go" data-dz="copy">기준 복사하기</button>' +
      '<button class="dz-link" data-dz="close" style="margin-top:14px">닫기</button></section>';
  }

  // ---------- 동작
  function readFile(f) {
    if (!f) return;
    K.busy = true; K.err = ''; K.file = f.name; draw();
    var A = api();
    f.arrayBuffer().then(function (buf) {
      return import(BASE + 'engine.js?v=' + VER).then(function (E) { return E.buildFromXlsx(new Uint8Array(buf), K.date); });
    }).then(function (r) {
      if (!K) return;
      K.busy = false; K.data = r.data; K.sheet = r.sheet; K.bytes = null; K.lastFile = f; K.src = null; K.repNone = false; draw();
    }, function (e) {
      if (!K) return;
      K.busy = false; K.data = null;
      K.err = /DecompressionStream/.test(String(e)) ? '이 브라우저는 엑셀을 못 읽어요. 크롬이나 삼성 인터넷 최신판으로 열어 주세요.' : String(e && e.message || e);
      draw();
    });
  }
  function save() {
    var r = K.res; if (!r || !r.blocks.length || K.saving) return;
    var A = api(), prev = A.planDoc(K.date);
    if (prev && !confirm(md(K.date) + ' 배정이 이미 있어요. 새 배정으로 바꿀까요?\n\n· 이미 체크한 객실 실적은 그대로 남아요\n· 넘겨받기·가져오기 같은 담당 변경은 새 배정부터 다시 시작해요')) return;
    K.saving = true; draw();
    var memo = {}; etcs().forEach(function (n) { if (K.memo[n]) memo[n] = String(K.memo[n]).slice(0, 30); });
    var meta = { workers: workers(), etc: etcs(), over: K.over, move: K.move, memo: memo, rule: K.rule, file: String(K.file).slice(0, 80), sheet: K.sheet };
    A.savePlan(K.date, r.plan, meta).then(function () {
      if (!K) return;
      K.saving = false; K.done = r; draw();
      try { if (typeof refresh === 'function') refresh(true); } catch (e) {}
    }, function (e) {
      if (!K) return;
      K.saving = false; K.err = '저장하지 못했어요: ' + (e && (e.code || e.message) || e) + ' — 관리자 로그인과 인터넷을 확인해 주세요.'; draw();
      var box = document.getElementById('dz'); if (box) box.scrollTop = 0;
    });
  }
  function saveRule() {
    lsSet('dust_rule', JSON.stringify(K.rule));
    api().setCfg({ rule: K.rule }).then(null, function () {});
  }

  document.addEventListener('click', function (e) {
    if (!K) return;
    var t = e.target.closest && e.target.closest('.dz [data-dz]'); if (!t) return;
    var a = t.getAttribute('data-dz'), v = t.getAttribute('data-v');
    if (a === 'close') { close(); return; }
    if (a === 'date') {
      if (K.date === v) return;
      K.date = v; prefill();
      if (K.lastFile) { K.data = null; readFile(K.lastFile); } else { K.data = null; K.sheet = ''; K.file = ''; loadRep(v); }
      return;
    }
    if (a === 'who') {
      var s = K.pick[v];
      if (!s) { K.pick[v] = 'd'; if (K.order.indexOf(v) < 0) K.order.push(v); }
      else if (s === 'd') { K.pick[v] = 'e'; Object.keys(K.move).forEach(function (m) { if (K.move[m] === v) delete K.move[m]; }); }
      else { delete K.pick[v]; K.order.splice(K.order.indexOf(v), 1); }
      draw(); return;
    }
    if (a === 'addname') {
      var inp = document.querySelector('.dz [data-dz="newname"]'), n = String(inp && inp.value || '').replace(/\s+/g, ' ').trim().slice(0, 20);
      if (!n) return;
      K.extra = ''; if (!K.pick[n]) { K.pick[n] = 'd'; if (K.order.indexOf(n) < 0) K.order.push(n); }
      draw(); return;
    }
    if (a === 'ruletoggle') { K.ruleOpen = !K.ruleOpen; draw(); return; }
    if (a === 'reset') { K.over = {}; K.move = {}; draw(); return; }
    if (a === 'save') { save(); return; }
    if (a === 'copy') {
      var ta = document.querySelector('.dz textarea');
      var ok = function () { t.textContent = '복사했어요 ✓'; };
      if (navigator.clipboard) navigator.clipboard.writeText(ta.value).then(ok, function () { ta.select(); try { document.execCommand('copy'); ok(); } catch (x) {} });
      else { ta.select(); try { document.execCommand('copy'); ok(); } catch (x) {} }
    }
  });
  document.addEventListener('change', function (e) {
    if (!K) return;
    var t = e.target; if (!t.closest || !t.closest('.dz')) return;
    var a = t.getAttribute('data-dz'), v = t.getAttribute('data-v');
    if (a === 'file') { readFile(t.files && t.files[0]); return; }
    if (a === 'over') {
      var n = t.value === '' ? null : Math.max(0, Math.min(40, Math.round(Number(t.value) * 2) / 2));
      var m = K.res && K.res.maids.filter(function (x) { return x.name === v; })[0];
      var base = m ? SupDistCalc.ruleOf(K.rule, m.unit) : null;
      if (n === null || n === base) delete K.over[v]; else K.over[v] = n;
      if (n > 0 && K.move[v] === '') delete K.move[v];
      draw(); return;
    }
    if (a === 'move') { K.move[v] = t.value; draw(); return; }
    if (a === 'rule') {
      var R = SupDistCalc.normRule(K.rule || DEF_RULE);
      R[v] = Math.max(0, Math.min(40, Math.round(Number(t.value) || 0)));
      K.rule = R; saveRule(); draw(); return;
    }
    if (a === 'memo') { K.memo[v] = String(t.value || '').replace(/\s+/g, ' ').trim().slice(0, 30); draw(); return; }
  });
  document.addEventListener('input', function (e) {
    if (K && e.target.getAttribute && e.target.getAttribute('data-dz') === 'newname') K.extra = e.target.value;
  });
  document.addEventListener('keydown', function (e) {
    if (K && e.key === 'Enter' && e.target.getAttribute && e.target.getAttribute('data-dz') === 'newname') { e.preventDefault(); var b = document.querySelector('.dz [data-dz="addname"]'); if (b) b.click(); }
  });

  // ---------- 모양
  var css = document.createElement('style');
  css.textContent = [
    '.dz-open{margin:0 0 12px}.dz-open button{width:100%;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:14px 16px;border:0;border-radius:16px;background:var(--brand,#9A4708);color:#fff;font:inherit;text-align:left;box-shadow:var(--shadow,0 2px 10px rgba(0,0,0,.08));cursor:pointer}',
    '.dz-open b{font-size:17px}.dz-open small{opacity:.85;font-size:12.5px}',
    'body.dz-lock{overflow:hidden}',
    '.dz{position:fixed;inset:0;z-index:50;background:var(--bg,#F6F4F1);overflow-y:auto;-webkit-overflow-scrolling:touch}',
    '.dz-in{max-width:720px;margin:0 auto;padding:calc(10px + env(safe-area-inset-top)) 16px 120px}',
    '.dz-head{display:flex;align-items:center;justify-content:space-between;padding:6px 0 10px}.dz-head h2{margin:0;font-size:20px;color:var(--ink,#1C1712)}',
    '.dz-x{width:44px;height:44px;border:0;border-radius:12px;background:var(--tile,#F7F2EC);font-size:18px;cursor:pointer}',
    '.dz-sec{background:var(--surface,#fff);border-radius:18px;padding:14px 16px;margin:0 0 12px;box-shadow:var(--shadow,0 2px 10px rgba(0,0,0,.06))}',
    '.dz-sec h3{margin:0 0 10px;font-size:16px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dz-sec h3 small{font-weight:500;color:var(--muted);font-size:12.5px}',
    '.dz-sec h3 i{font-style:normal;width:24px;height:24px;border-radius:99px;background:var(--brand,#9A4708);color:#fff;font-size:13px;display:inline-flex;align-items:center;justify-content:center}',
    '.dz-seg{display:flex;gap:8px}.dz-seg button{flex:1;min-height:46px;border:1.5px solid var(--line);border-radius:12px;background:var(--surface,#fff);font:700 15px inherit;font-family:inherit;color:var(--ink);cursor:pointer}',
    '.dz-seg button[aria-pressed="true"]{background:var(--brand,#9A4708);border-color:var(--brand,#9A4708);color:#fff}',
    '.dz-file{display:flex;align-items:center;justify-content:center;gap:8px;min-height:56px;border:2px dashed var(--line);border-radius:14px;font-weight:700;color:var(--ink);cursor:pointer;text-align:center;padding:8px}',
    '.dz-file small{color:var(--muted);font-weight:500}.dz-file input{position:absolute;width:1px;height:1px;opacity:0}',
    '.dz-ready{margin:0 0 12px;padding:10px 12px;border-radius:12px;background:#E5F4EA;color:#1F5130;font-size:13.5px;line-height:1.45}',
    '.dz-file.dz-sub{min-height:40px;border-width:1px;font-size:.88em;color:var(--muted);margin-top:8px}.dz-ok small{color:var(--muted);font-weight:500}',
    '.dz-ok{margin:8px 0 0;color:var(--done,#1E8E3E);font-weight:700;font-size:14px}.dz-err{margin:8px 0 0;color:var(--warn,#B23A48);font-weight:700;font-size:14px}',
    '.dz-warn{margin:8px 0 0;color:#8A5A00;background:#FDF3DC;border-radius:10px;padding:8px 10px;font-size:13.5px}',
    '.dz-tot{margin:0 0 10px;font-size:14.5px}.dz-tip{margin:8px 0 0;color:var(--muted);font-size:13px}',
    '.dz-chips{display:flex;flex-wrap:wrap;gap:8px}.dz-chips button{min-height:44px;padding:0 14px;border:1.5px solid var(--line);border-radius:99px;background:var(--surface,#fff);font:700 15px inherit;font-family:inherit;color:var(--ink);cursor:pointer}',
    '.dz-chips button.d{background:var(--brand,#9A4708);border-color:var(--brand,#9A4708);color:#fff}.dz-chips button.e{background:#E7EEF7;border-color:#9DB4D3;color:#1F3B63}',
    '.dz-chips em{font-style:normal;display:inline-block;min-width:20px;height:20px;line-height:20px;border-radius:99px;background:#fff;color:var(--brand,#9A4708);font-size:12px;margin-right:4px;text-align:center}',
    '.dz-add{display:flex;gap:8px;margin-top:10px}.dz-add input{flex:1;min-height:44px;border:1.5px solid var(--line);border-radius:12px;padding:0 12px;font:16px inherit;font-family:inherit}',
    '.dz-add button{min-height:44px;padding:0 14px;border:0;border-radius:12px;background:var(--tile,#F7F2EC);font:700 15px inherit;font-family:inherit;cursor:pointer}',
    '.dz-rule{margin:0;font-size:14.5px;line-height:1.6}.dz-link{border:0;background:none;color:var(--brand,#9A4708);font:700 14px inherit;font-family:inherit;text-decoration:underline;cursor:pointer;padding:4px}',
    '.dz-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:10px}.dz-grid label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:var(--muted);font-weight:700}',
    '.dz-grid input{min-height:42px;border:1.5px solid var(--line);border-radius:10px;text-align:center;font:700 16px var(--f-num,inherit);width:100%;box-sizing:border-box}.dz-grid label.on input{border-color:var(--brand,#9A4708);background:#FDF0DC}',
    '.dz-memo{display:flex;flex-direction:column;gap:6px;margin-top:10px}.dz-memo label{display:grid;grid-template-columns:110px 1fr;gap:8px;align-items:center;font-weight:700;font-size:14px}.dz-memo input{min-height:42px;border:1.5px solid var(--line);border-radius:10px;padding:0 10px;font:15px inherit;font-family:inherit}',
    '.dz-etc{margin-top:6px;font-weight:700;color:#1F3B63}',
    '.dz-b{border:1.5px solid var(--line);border-left:6px solid var(--wc,#8A96A3);border-radius:14px;padding:4px 10px 6px;margin:0 0 10px}',
    '.dz-bh{display:flex;justify-content:space-between;align-items:baseline;padding:6px 0;border-bottom:1px solid var(--line);margin-bottom:4px}.dz-bh b{font-size:16px;color:var(--wc)}.dz-bh span{font-size:13.5px;color:var(--muted);font-weight:700}',
    '.dz-m{display:grid;grid-template-columns:1fr 62px 104px;gap:6px;align-items:center;padding:5px 0;border-bottom:1px dashed var(--line)}.dz-m:last-child{border-bottom:0}',
    '.dz-m .nm{font-weight:700;font-size:15px;display:flex;flex-direction:column}.dz-m .nm small{font-weight:500;color:var(--muted);font-size:12px}',
    '.dz-m input{min-height:40px;border:1.5px solid var(--line);border-radius:10px;text-align:center;font:700 16px var(--f-num,inherit);width:100%;box-sizing:border-box}',
    '.dz-m select{min-height:40px;border:1.5px solid var(--line);border-radius:10px;font:600 13.5px inherit;font-family:inherit;background:var(--surface,#fff);width:100%}',
    '.dz-m.exc input{border-color:#C77C0E;background:#FDF0DC}.dz-m.mv select{border-color:#C77C0E;background:#FDF0DC}',
    '.dz-pool{border-left-color:#B8C0CA}.dz-pool summary{padding:8px 0;font-weight:700;cursor:pointer}.dz-pool summary small{font-weight:500;color:var(--muted)}',
    '.dz-warns{background:#FDF3DC;border-radius:10px;padding:6px 10px;margin-top:8px}.dz-warns p{margin:4px 0;font-size:13px;color:#7A4E00}',
    '.dz-foot{position:fixed;left:0;right:0;bottom:0;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:linear-gradient(transparent,var(--bg,#F6F4F1) 30%)}',
    '.dz-go{display:block;width:100%;max-width:688px;margin:0 auto;min-height:56px;border:0;border-radius:16px;background:var(--done,#1E8E3E);color:#fff;font:800 17px inherit;font-family:inherit;cursor:pointer;box-shadow:0 6px 18px rgba(0,0,0,.18)}',
    '.dz-go[disabled]{background:#B9B2A9;box-shadow:none;cursor:default}',
    '.dz-done{text-align:center}.dz-done .big{font-size:44px}.dz-done h4{margin:18px 0 6px;font-size:14px}.dz-done textarea{width:100%;box-sizing:border-box;border:1.5px solid var(--line);border-radius:12px;padding:10px;font:15px inherit;font-family:inherit;resize:none;margin-bottom:8px}'
  ].join('\n');
  document.head.appendChild(css);

  window.SupDist = { open: open, close: close, _K: function () { return K; } };
})();

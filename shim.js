// shim.js — 정비 지원 Firebase 판 (2026-11-05 ⑧ 1부: 더티 체크 · 출퇴근 / 2026-11-06 2부: 객실 활동판)
// 화면(Index.html)은 예전 그대로 google.script.run.함수() 를 부름 → 이 파일이 그 호출을 받아
//   · 더티 체크·담당 변경·출퇴근 = Code.gs 원본 함수(server.js)를 휴대폰 안에서 그대로 실행
//       그 함수들이 읽고 쓰는 시트 탭(배정·체크·변경·근태)은 Firestore 에서 받은 줄로 만든 '가짜 시트'
//       appendRow 한 줄 = Firestore 문서 하나(sup/{날짜}/rows/{id}) → 휴대폰에 먼저 보관 → 화면 바로 반영 → 서버로
//   · 객실 활동판(2부) = act.js 가 휴대폰 안에서 계산. 활동 = acts/{ID} 문서, 객실 체크 = acts/{ID}/marks/{객실} 문서
//   · 내 근무(한 달)·월 출역표 = 지금처럼 Apps Script(SupFirebase.gs doPost)에 물어봄
// 관리자 확인은 Firebase 로그인(소장·부소장 계정) + 보안 규칙. 화면의 adminTok 은 '관리자 모드' 표시용 값일 뿐
(function () {
  'use strict';
  var APP_VER = '2026.11.08-9';
  var TZ = 'Asia/Seoul';
  var API_URL = 'https://script.google.com/macros/s/AKfycbyPvhvScAcDfGqyxdK9pvr8vtewfjAkHsbRBiN04GCNbzE4HL_zZHODWPPb4xUHQb0LCw/exec';
  var ADMINS = { '소장': 'unieshaeundae+admin@gmail.com', '부소장': 'unieshaeundae+sub@gmail.com' };
  var ADMIN_UIDS = ['iw2orXgIgPgTbLUQa0b41XJ9Dvd2', 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2'];
  var HEAD = {
    '배정': ['날짜', '근무자', '색상', '메이드', '정비층', '더티지원', '배정객실'],
    '체크': ['시각', '날짜', '객실', '메이드', '근무자', '상태', '비고'],
    '변경': ['시각', '날짜', '종류', '메이드', '근무자', '추가객실', '더티지원', '삭제객실', '이전담당'],
    '근태': ['시각', '날짜', '근무자', '구분', '업무', '메모', '입력', '지정시각']
  };
  var TABS = ['체크', '변경', '근태'];
  var LOCAL = ['getData', 'getState', 'setCheck', 'toggle', 'change', 'addWorker', 'moveMaids', 'attend', 'attEdit'];
  var REMOTE = ['myMonth', 'monthSheet'];
  var ACTS = ['actList', 'actGet', 'actMark', 'actSave', 'actStatus', 'actArchived'];

  var S = {
    store: null, user: null, admin: false, day: '', subs: [],
    plan: null, planGot: false, rows: [], rowsGot: false, names: null, namesGot: false, relay: null, roster: null,
    pending: 0, fromCache: true, local: [], sheets: null, ready: false, waiting: [], err: '', reports: 0
  };

  // ---------- 시각 (서울)
  var fmtCache = null;
  function parts(d) {
    fmtCache = fmtCache || new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    var o = {}; fmtCache.formatToParts(d).forEach(function (x) { o[x.type] = x.value; }); return o;
  }
  function formatDate(d, tz, f) {
    var p = parts(d instanceof Date ? d : new Date(d));
    return String(f).replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second);
  }
  function today() { return formatDate(new Date(), TZ, 'yyyy-MM-dd'); }
  function shift(d, n) { var t = new Date(d + 'T12:00:00+09:00'); t.setTime(t.getTime() + n * 864e5); return formatDate(t, TZ, 'yyyy-MM-dd'); }
  function num(v) { var n = typeof v === 'number' ? v : v instanceof Date ? v.getTime() : Date.parse(v); return isNaN(n) ? 0 : n; }

  // ---------- 가짜 시트 (Code.gs 가 쓰는 만큼만)
  function Range(rows, r, c, nr, nc) { this.rows = rows; this.r = r; this.c = c; this.nr = nr || 1; this.nc = nc || 1; }
  Range.prototype.getValues = function () {
    var out = [];
    for (var i = 0; i < this.nr; i++) {
      var src = this.rows[this.r - 1 + i] || [], o = [];
      for (var j = 0; j < this.nc; j++) { var v = src[this.c - 1 + j]; o.push(v === undefined || v === null ? '' : v); }
      out.push(o);
    }
    return out;
  };
  Range.prototype.getValue = function () { return this.getValues()[0][0]; };
  Range.prototype.setValue = function (v) { var row = this.rows[this.r - 1]; if (row) row[this.c - 1] = v; return this; };   // 제목 칸 정도만
  Range.prototype.setValues = function () { throw new Error('휴대폰에서는 시트 칸을 직접 바꿀 수 없어요.'); };
  Range.prototype.setNumberFormat = function () { return this; };
  Range.prototype.clearContent = function () { return this; };
  function Sheet(name) { this.name = name; }
  Sheet.prototype.rows = function () { return S.sheets[this.name]; };
  Sheet.prototype.getName = function () { return this.name; };
  Sheet.prototype.getLastRow = function () { return this.rows().length; };
  Sheet.prototype.getLastColumn = function () { return this.rows().reduce(function (m, r) { return Math.max(m, r.length); }, 0); };
  Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this.rows(), r, c, nr, nc); };
  Sheet.prototype.getDataRange = function () { var rows = this.rows(); return { getValues: function () { return rows.map(function (x) { return x.slice(); }); } }; };
  Sheet.prototype.appendRow = function (raw) {
    // 시트처럼: 앞에 ' 를 붙인 글자는 ' 를 떼고 보관
    this.rows().push(raw.map(function (v) { return typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v; }));
    send(this.name, raw);
  };
  Sheet.prototype.clear = function () { throw new Error('휴대폰에서는 시트를 지울 수 없어요.'); };
  var ss = {
    getSheetByName: function (n) { return S.sheets && S.sheets[n] ? new Sheet(n) : null; },
    insertSheet: function () { throw new Error('휴대폰에서는 새 탭을 만들 수 없어요.'); }
  };
  var cache = { planSync: '1' };   // syncPlan_ 은 휴대폰에서 돌지 않게 (배정 파일은 중계가 넣음)
  var env = {
    SpreadsheetApp: { getActive: function () { return ss; }, flush: function () {} },
    Utilities: {
      formatDate: formatDate,
      DigestAlgorithm: { SHA_256: 'sha256' },
      computeDigest: function (alg, s) { var h = []; for (var i = 0; i < 32; i++) h.push(((s.charCodeAt(i % s.length) * 31 + i * 7) & 255) - 128); return h; },
      parseCsv: function () { throw new Error('휴대폰에서는 쓰지 않음'); }
    },
    LockService: { getScriptLock: function () { return { waitLock: function () {}, tryLock: function () { return true; }, releaseLock: function () {} }; } },
    CacheService: { getScriptCache: function () { return { get: function (k) { return k in cache ? cache[k] : null; }, put: function (k, v) { cache[k] = String(v); }, remove: function (k) { delete cache[k]; } }; } },
    PropertiesService: { getScriptProperties: function () { return { getProperty: function () { return null; }, setProperty: function () {} }; } },
    DriveApp: { getFoldersByName: function () { return { hasNext: function () { return false; } }; } },
    HtmlService: {}, console: window.console
  };
  var SERVER = window.makeSupServer(env);
  var TOKEN = SERVER.adminToken_();

  // ---------- 객실 활동판 (2부): 활동판을 처음 열 때부터 acts 문서들을 실시간으로 받아 act.js 로 계산
  var A = { started: false, got: false, docs: {}, marks: {}, mgot: {}, msubs: {}, waiting: [], gone: {} };
  function actStart() {
    if (A.started || !S.store) return;
    A.started = true;
    S.store.listenQuery('acts', [], function (docs, meta) {
      if (!A.got && !docs.length && meta && meta.fromCache) { cacheWait('acts', function () { A.got = true; actChanged(); }); return; }   // 휴대폰 보관함이 비어 있을 때 첫 '빈 결과'는 기다림
      var m = {}; docs.forEach(function (d) { if (!A.gone[d.id]) m[d.id] = d.data; });   // 방금 지운 활동은 서버 삭제가 끝나기 전에도 다시 안 보이게
      A.docs = m; A.got = true;
      Object.keys(m).forEach(function (id) { if (m[id] && (m[id].status !== '보관' || S.admin)) marksSub(id); });   // 관리자는 보관함 활동 체크도 받음 (보관함 보기·삭제 가능 여부)
      actChanged();
    }, function (e) { A.got = true; report('listen', '활동판 ' + (e && (e.code || e.message))); actChanged(); });
  }
  function marksSub(id) {
    if (A.msubs[id]) return;
    A.msubs[id] = S.store.listenQuery('acts/' + id + '/marks', [], function (docs, meta) {
      if (!A.mgot[id] && !docs.length && meta && meta.fromCache) { cacheWait('m' + id, function () { A.mgot[id] = true; actChanged(); }); return; }
      var m = {}; docs.forEach(function (d) { m[d.id] = d.data; });
      A.marks[id] = m; A.mgot[id] = true; actChanged();
    }, function (e) { A.mgot[id] = true; report('listen', '활동 체크 ' + id + ' ' + (e && (e.code || e.message))); actChanged(); });
  }
  var cacheTimers = {};
  function cacheWait(k, f) { if (!cacheTimers[k]) cacheTimers[k] = setTimeout(f, 8000); }   // 인터넷이 없으면 8초 뒤 보관된 것으로 진행
  function actReady() { return A.got && Object.keys(A.docs).every(function (id) { return !A.docs[id] || A.docs[id].status === '보관' || A.mgot[id]; }); }
  function actChanged() { if (A.waiting.length && actReady()) { var w = A.waiting; A.waiting = []; w.forEach(function (f) { f(); }); } }
  function actRejected(what, e) {
    var code = String(e && (e.code || e.message) || e);
    try { note('활동판 저장이 거절됐어요 (' + what + '). 화면을 최신으로 바꿨어요. 계속되면 관리자에게 알려 주세요.'); } catch (x) {}
    report('reject', 'act ' + what + ' ' + code);
  }
  var ACT = window.makeActServer({
    acts: function () { return Object.keys(A.docs).filter(function (k) { return A.docs[k]; }).map(function (k) { var o = { id: k }, d = A.docs[k]; for (var x in d) o[x] = d[x]; return o; }); },
    marks: function (id) { return A.marks[id] || {}; },
    marksReady: function (id) { return !!A.mgot[id]; },
    usedId: function (id) { return !!A.gone[id]; },
    deleteAct: function (id, rooms) {
      if (!S.user || !S.admin) throw new Error('관리자 로그인이 필요해요.');
      delete A.docs[id]; A.gone[id] = 1;
      var st = S.store;
      st.set('sup_meta/acts_deleted', { ids: Object.keys(A.gone).slice(-500), at: st.SERVER_TIME, uid: S.user.uid }).then(null, function () {});
      Promise.all((rooms || []).map(function (r) { return st.del('acts/' + id + '/marks/' + r); }))   // 체크 문서 먼저 지우고
        .then(function () { return st.del('acts/' + id); })   // 활동 문서
        .then(null, function (e) { actRejected('활동 삭제 ' + id, e); });
      A.marks[id] = {};
    },
    isAdmin: function (t) { return S.admin && !!t && t === TOKEN; },
    workerOk: function (nm) { try { var st = SERVER.state_(); return (st.workers || []).some(function (w) { return w.name === nm; }) || (st.known || []).indexOf(nm) >= 0; } catch (e) { return false; } },
    printUrl: function (id) { return 'print.html?id=' + encodeURIComponent(id); },
    saveMark: function (id, r, x) {
      if (!S.user) throw new Error('아직 연결 중이에요. 잠시 뒤 다시 눌러 주세요.');
      var loc = { s: x.s, m: x.m, w: x.w, by: x.by, at: Date.now() }, doc = { s: x.s, m: x.m, w: x.w, by: x.by, at: S.store.SERVER_TIME, clientAt: new Date(), uid: S.user.uid };
      if (x.t && x.t.length) { loc.t = x.t.slice(); doc.t = x.t.slice(); }   // 점검 항목 번호 (2026-11-08)
      (A.marks[id] = A.marks[id] || {})[r] = loc;   // 화면에 바로 (서버 확인은 뒤에)
      S.store.set('acts/' + id + '/marks/' + r, doc)
        .then(null, function (e) { actRejected(r + '호', e); });
    },
    saveAct: function (id, d) {
      if (!S.user) throw new Error('아직 연결 중이에요. 잠시 뒤 다시 눌러 주세요.');
      var doc = {}, loc = {};
      Object.keys(d).forEach(function (k) { doc[k] = d[k]; loc[k] = d[k] instanceof Date ? d[k].getTime() : d[k]; });
      if (d.lockAt === '__now') { doc.lockAt = S.store.SERVER_TIME; loc.lockAt = Date.now(); }   // 관리자 잠금 시각 = 서버 시각 (11/8)
      doc.at = S.store.SERVER_TIME; doc.uid = S.user.uid;
      A.docs[id] = loc; if (d.status !== '보관') marksSub(id);
      S.store.set('acts/' + id, doc).then(null, function (e) { actRejected('활동 ' + (d.name || id), e); });
    }
  });

  // ---------- Firestore 줄 → 가짜 시트
  function planRows() {
    var out = [HEAD['배정'].slice()], p = S.plan && Array.isArray(S.plan.plan) ? S.plan.plan : [];
    p.forEach(function (x) { if (x && x.d) out.push([String(x.d), x.w || '', x.c || '', x.m || '', x.f || '', Number(x.n) || 0, x.r || '']); });
    var last = S.names && S.names.lastDate;
    if (last && last !== S.day && /^\d{4}-\d{2}-\d{2}$/.test(last)) out.push([last, '', '', '·', '', 0, '']);   // '마지막 배분 날짜' 안내용 한 줄 (오늘 계산엔 안 쓰임)
    return out;
  }
  function rebuild() {
    var seen = {}, all = [];
    (S.rows || []).forEach(function (d) {
      var x = d.data; if (!x || TABS.indexOf(x.tab) < 0 || !Array.isArray(x.row)) return;
      seen[d.id] = 1;
      all.push({ id: d.id, tab: x.tab, row: x.row, at: num(x.at) || num(x.clientAt), c: num(x.clientAt) });
    });
    S.local = S.local.filter(function (l) { return !l.dead && !seen[l.id]; });
    S.local.forEach(function (l) { all.push(l); });
    all.sort(function (a, b) { return (a.at - b.at) || (a.c - b.c) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0); });
    var sh = { '배정': planRows(), '체크': [HEAD['체크'].slice()], '변경': [HEAD['변경'].slice()], '근태': [HEAD['근태'].slice()] };
    // 최근 근무자 이름(중계가 하루 한 번) → '어제 출근' 줄로 넣어 knownNames_ 가 그대로 찾게 함 (오늘 계산엔 안 쓰임)
    var y = shift(S.day || today(), -1), yd = new Date(Date.now() - 864e5);
    rosterNames().forEach(function (n) { sh['근태'].push([yd, y, String(n), '출근', '', '', '본인', '']); });
    // 관리자 앱 '더티 배분 만들기'로 다시 만든 배정(src 'app')이면, 그 전에 생긴 담당 변경(넘겨받음·가져옴·인원추가·근무종료 …)은 새 배정부터 다시 시작
    var issued = S.plan && S.plan.src === 'app' ? num(S.plan.issued) : 0;
    if (issued) all = all.filter(function (x) { return x.tab !== '변경' || x.at >= issued; });
    all.forEach(function (x) {
      var r = x.row.map(function (v, i) { if (i === 0) return new Date(x.at || Date.now()); return typeof v === 'string' && v.charAt(0) === "'" ? v.slice(1) : v === null || v === undefined ? '' : v; });
      while (r.length < HEAD[x.tab].length) r.push('');
      sh[x.tab].push(r);
    });
    S.sheets = sh;
  }
  // appendRow → Firestore 문서
  function send(tab, raw) {
    if (TABS.indexOf(tab) < 0 || !(raw[0] instanceof Date)) return;
    var row = raw.map(function (v, i) { return i === 0 ? null : v instanceof Date ? v.toISOString() : v === undefined ? '' : v; });
    var date = String(row[1]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜가 이상해요: ' + date);
    if (!S.user) throw new Error('아직 연결 중이에요. 잠시 뒤 다시 눌러 주세요.');
    var by = S.admin ? '관리자' : '본인';
    var w = S.store.add('sup/' + date + '/rows', { tab: tab, row: row, at: S.store.SERVER_TIME, clientAt: raw[0], uid: S.user.uid, by: by });
    var t = raw[0].getTime();
    S.local.push({ id: w.id, tab: tab, row: row, at: t, c: t });
    w.done.then(function () {}, function (e) { rejected(w.id, tab, row, e); });
  }
  function rejected(id, tab, row, e) {
    S.local.forEach(function (l) { if (l.id === id) l.dead = true; });
    rebuild();
    var code = String(e && (e.code || e.message) || e);
    try { note('저장이 거절됐어요 (' + tab + ' ' + (row[2] || '') + '). 화면을 최신으로 바꿨어요. 계속되면 관리자에게 알려 주세요.'); } catch (x) {}
    report('reject', tab + ' ' + JSON.stringify(row).slice(0, 200) + ' ' + code);
    try { refresh(true); } catch (x) {}
  }

  // ---------- 정비보조 명단 (11/8): 최근 근무자(중계) + 관리자가 넣은 이름 − 관리자가 뺀 이름. sup_meta/roster {add:[], hide:[]} — 관리자만 씀
  function rosterNames() {
    var r = S.roster || {}, hide = {}, out = {};
    (Array.isArray(r.hide) ? r.hide : []).forEach(function (n) { hide[n] = 1; });
    ((S.names && S.names.names) || []).concat(Array.isArray(r.add) ? r.add : []).forEach(function (n) { n = String(n || '').trim(); if (n && !hide[n] && n !== '관리자') out[n] = 1; });
    return Object.keys(out).sort();
  }
  // ---------- 구독
  function unsubAll() { S.subs.forEach(function (u) { try { u(); } catch (e) {} }); S.subs = []; }
  function subscribe() {
    unsubAll();
    S.day = today(); S.planGot = S.rowsGot = S.namesGot = false; S.plan = null; S.rows = [];
    S.local = S.local.filter(function (l) { return l.row && l.row[1] === S.day; });
    var st = S.store;
    S.subs.push(st.listenDoc('sup/' + S.day, function (d) { S.plan = d; S.planGot = true; changed(); }, function (e) { subErr('배정', e); }));
    S.subs.push(st.listenQuery('sup/' + S.day + '/rows', [], function (docs, m) { S.rows = docs; S.rowsGot = true; S.fromCache = !!m.fromCache; S.pending = m.pending || 0; changed(); }, function (e) { subErr('기록', e); }));
    S.subs.push(st.listenDoc('sup_meta/names', function (d) { S.names = d; S.namesGot = true; changed(); }, function (e) { S.namesGot = true; subErr('명단', e); }));
    S.subs.push(st.listenDoc('sup_meta/relay', function (d) { S.relay = d; decorate(); }, function () {}));
    S.subs.push(st.listenDoc('sup_meta/roster', function (d) { S.roster = d || null; changed(); }, function () {}));
    S.subs.push(st.listenDoc('sup_meta/acts_deleted', function (d) { (d && Array.isArray(d.ids) ? d.ids : []).forEach(function (x) { A.gone[x] = 1; }); }, function () {}));   // 지운 활동 ID (같은 ID 다시 안 씀)
  }
  function subErr(what, e) {
    S.err = what + ' 받기 실패: ' + (e && (e.code || e.message) || e);
    report('listen', S.err);
    try { note('⚠ ' + S.err + ' — 앱을 닫았다가 다시 열어 주세요.'); } catch (x) {}
  }
  function changed() {
    rebuild();
    if (!S.ready) {
      if (S.planGot && S.rowsGot && S.namesGot) { S.ready = true; var w = S.waiting; S.waiting = []; w.forEach(function (f) { f(); }); }
      return;
    }
    try { refresh(); } catch (e) {}
    try { if (!busyChg && !(queue && queue.length)) stamp(); } catch (e) {}
  }

  // ---------- google.script.run 흉내
  function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }
  function failMsg(e) { return { message: String(e && e.message || e) }; }
  function invoke(fn, args, ok, fail) {
    var done = function (res) { if (ok) ok(res); };
    var bad = function (e) { if (fail) fail(failMsg(e)); else console.warn('[정비 지원] ' + fn + ' 실패', e); };
    if (fn === 'adminLogin') { setTimeout(function () { bad(new Error('관리자 로그인 방식이 바뀌었어요. 앱을 새로 고쳐 주세요.')); }, 0); return; }
    if (REMOTE.indexOf(fn) >= 0) { remote(fn, args).then(done, bad); return; }
    if (ACTS.indexOf(fn) >= 0) {
      actStart();
      var runA = function () { setTimeout(function () { var res; try { res = clone(ACT[fn].apply(null, args)); } catch (e) { bad(e); return; } done(res); }, 0); };
      var archOk = function () {   // 보관함·삭제: 보관한 활동 체크도 받은 뒤 (관리자만, 8초까지)
        if (fn !== 'actArchived' && !(fn === 'actStatus' && args[2] === '삭제')) return true;
        var ids = Object.keys(A.docs).filter(function (k) { return A.docs[k] && A.docs[k].status === '보관'; });
        ids.forEach(marksSub);
        return ids.every(function (k) { return A.mgot[k]; });
      };
      var goA = function () {
        if (!actReady()) { A.waiting.push(goA); return; }
        if (archOk()) { runA(); return; }
        var t0 = Date.now(), iv = setInterval(function () { if (archOk() || Date.now() - t0 > 8000) { clearInterval(iv); runA(); } }, 150);
      };
      if (S.ready) goA(); else S.waiting.push(goA);
      return;
    }
    var run = function () { setTimeout(function () { var res; try { res = clone(SERVER[fn].apply(null, args)); } catch (e) { bad(e); return; } done(res); }, 0); };
    if (S.ready) run(); else S.waiting.push(run);
  }
  function runner(ok, fail) {
    var r = {
      withSuccessHandler: function (f) { return runner(f, fail); },
      withFailureHandler: function (f) { return runner(ok, f); },
      withUserObject: function () { return r; }
    };
    LOCAL.concat(REMOTE, ACTS, ['adminLogin']).forEach(function (n) { r[n] = function () { invoke(n, Array.prototype.slice.call(arguments), ok, fail); }; });
    return r;
  }
  window.google = { script: { run: runner(null, null) } };

  // ---------- Apps Script 에 묻기 (SupFirebase.gs doPost) — 한 달 기록·출역표
  function timeoutFetch(url, opt, ms) {
    return new Promise(function (res, rej) {
      var t = setTimeout(function () { rej(new Error('응답이 늦어요. 인터넷 연결을 확인하고 다시 해 주세요.')); }, ms);
      fetch(url, opt).then(function (r) { clearTimeout(t); res(r); }, function (e) { clearTimeout(t); rej(e); });
    });
  }
  function remote(fn, args) {
    return S.store.idToken().then(function (tok) {
      return timeoutFetch(API_URL, { method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ fn: fn, idToken: tok, args: args, ver: APP_VER }) }, 40000);
    }).then(function (r) { return r.json(); }, function (e) {
      throw new Error(/응답이 늦/.test(String(e && e.message)) ? e.message : '서버에 닿지 못했어요. 인터넷 연결을 확인해 주세요.');
    }).then(function (j) {
      if (!j || !j.ok) throw new Error((j && j.error) || '처리하지 못했어요.');
      return fn === 'myMonth' ? mergeMonth(j.data, args) : j.data;
    });
  }
  // 오늘 기록은 휴대폰이 가장 최신 (시트에는 1~2분 늦게 들어감) → 서버 결과의 오늘 줄을 휴대폰 계산으로 바꿈
  function mergeMonth(res, args) {
    if (!res || res.ym !== S.day.slice(0, 7) || !S.ready) return res;
    var mineToday = null;
    try { mineToday = (SERVER.myMonth(args[0], res.ym).days || []).filter(function (d) { return d.date === S.day; })[0] || null; } catch (e) {}
    var days = (res.days || []).filter(function (d) { return d.date !== S.day; });
    if (mineToday) days.push(mineToday);
    days.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    res.days = days;
    res.workDays = days.filter(function (x) { return x.in; }).length;
    res.dirty = days.reduce(function (s, x) { return s + (x.dirty || 0); }, 0);
    return res;
  }

  // ---------- 로그인
  function isAdminUser(u) { return !!u && !u.anon && (ADMIN_UIDS.indexOf(u.uid) >= 0 || Object.keys(ADMINS).some(function (k) { return ADMINS[k] === u.email; })); }
  function syncAdmin() {
    try {
      if (S.admin && adminTok !== TOKEN) { adminTok = TOKEN; lsSet('dust_admin', TOKEN); if (plan) render(); }
      else if (!S.admin && adminTok) { adminTok = null; lsSet('dust_admin', null); if (plan) render(); }
    } catch (e) {}
  }
  var anonTry = 0;
  function onUser(u) {
    if (!u) {
      S.user = null; S.admin = false;
      S.store.signInAnon().catch(function (e) {
        S.err = '로그인 실패: ' + (e && (e.code || e.message));
        showWait('인터넷에 연결되면 자동으로 열려요. (' + (e && e.code || '연결 안 됨') + ')');
        setTimeout(function () { if (!S.user) onUser(null); }, Math.min(30000, 3000 * (++anonTry)));
      });
      return;
    }
    var changedUid = !S.user || S.user.uid !== u.uid;
    S.user = u; S.admin = isAdminUser(u); anonTry = 0;
    syncAdmin();
    if (changedUid) subscribe();
  }
  function showWait(msg) {
    if (S.ready) return;
    var m = document.getElementById('main');
    if (m) m.innerHTML = '<div class="notice"><strong>정비 지원을 여는 중이에요.</strong><br>' + String(msg).replace(/[<>&]/g, '') + '</div>';
  }

  // ---------- 화면 덧붙임 (Index·활동판 스크립트 다음에 post() 로 붙임)
  function status() {
    if (S.err) return '⚠ ' + S.err;
    if (S.pending) return '휴대폰에 보관 ' + S.pending + '건 — 인터넷이 연결되면 자동으로 저장돼요';
    if (S.fromCache || !navigator.onLine) return '⚠ 서버와 연결이 끊겼어요 — 누른 기록은 휴대폰에 보관돼요';
    return '실시간 연결됨 · ' + formatDate(new Date(), TZ, 'HH:mm');
  }
  function relayText() {
    var r = S.relay; if (!r || !r.at) return { t: '시트 중계 기록 없음', bad: true };
    var min = Math.max(0, Math.round((Date.now() - num(r.at)) / 60000));
    return { t: '시트 중계 ' + (min ? min + '분 전' : '방금') + ' · ' + (r.ok ? '정상' : '오류: ' + String(r.err || '').slice(0, 80)), bad: !r.ok || min > 12 };
  }
  function decorate() {
    try {
      var el = document.querySelector('#main .greet .relay');
      if (!el) return;
      var x = relayText();
      el.textContent = ' · ' + x.t; el.style.color = x.bad ? 'var(--warn)' : ''; el.style.fontWeight = x.bad ? '700' : '';
    } catch (e) {}
  }
  var armed = false;
  function arm() { if (!armed) { try { history.pushState({ sup: 1 }, ''); armed = true; } catch (e) {} } }
  function post() {
    // 동기화 줄: '마지막 동기화' 대신 실시간 연결 상태
    window.stamp = function () { if (Date.now() < holdMsg) return; var s = document.getElementById('sync'); if (s) s.textContent = status(); };
    setInterval(function () { try { if (!busyChg && !queue.length && !sending) stamp(); } catch (e) {} }, 2000);   // 연결 끊김·보관 건수는 2초마다 갱신
    var r0 = window.render;
    window.render = function () { r0.apply(this, arguments); decorate(); };
    // 휴대폰 뒤로가기: 앱 안에서 처리 (예전 시작 페이지가 하던 일)
    window.addEventListener('popstate', function () { armed = false; arm(); window.postMessage({ rm: 'back' }, '*'); });
    window.addEventListener('message', function (e) { if (e.data && e.data.rm === 'tap') arm(); });
    // 휴대폰 오류 자동 기록
    window.addEventListener('error', function (e) { report('error', (e && e.message || '') + ' @' + (e && e.lineno || '')); });
    window.addEventListener('unhandledrejection', function (e) { report('promise', String(e && e.reason && (e.reason.message || e.reason) || '')); });
    // 새 버전 확인 (5분마다, 화면 다시 볼 때)
    setInterval(checkVer, 300000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') { checkVer(); if (S.ready && today() !== S.day) subscribe(); } });
    // 날짜 바뀜 (서울 자정) → 새 날짜 구독
    setInterval(function () { if (S.store && S.user && today() !== S.day) subscribe(); }, 30000);
    if ('serviceWorker' in navigator && !/\/app\//.test(location.pathname)) navigator.serviceWorker.register('sw.js').catch(function () {});   // 홈 화면 앱(설치형)용
    setTimeout(function () { if (!S.ready) showWait(S.err || '연결이 느려요. 인터넷 연결을 확인해 주세요.'); }, 12000);
  }
  function checkVer() {
    fetch('version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.v || j.v === APP_VER || document.getElementById('sup-new')) return;
      var b = document.createElement('button');
      b.id = 'sup-new'; b.textContent = '새 버전이 있어요 — 눌러서 새로 고침';
      b.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:40;min-height:52px;border:0;border-radius:14px;background:#B8650A;color:#fff;font:800 16px var(--f-body);box-shadow:0 6px 20px rgba(0,0,0,.3)';
      b.onclick = function () { location.reload(); };
      document.body.appendChild(b);
    }).catch(function () {});
  }
  function report(where, msg) {
    try {
      if (!S.store || !S.user || S.reports >= 5) return;
      S.reports++;
      var nm = ''; try { nm = String(me || (S.admin ? '관리자' : '')).slice(0, 20); } catch (e) {}
      S.store.add('errors', { at: S.store.SERVER_TIME, day: S.day || today(), uid: S.user.uid, name: nm, ver: String(APP_VER).slice(0, 20),
        where: ('sup:' + where).slice(0, 40), msg: String(msg || '').slice(0, 500), ua: String(navigator.userAgent || '').slice(0, 200) }).done.catch(function () {});
    } catch (e) {}
  }

  window.SupShim = {
    ver: APP_VER,
    start: function (store) { S.store = store; store.onUser(onUser); },
    post: post,
    status: status,
    adminLogin: function (who, pw) {
      var email = ADMINS[who];
      if (!email) return Promise.reject(new Error('소장 / 부소장 중에서 골라 주세요.'));
      return S.store.signInEmail(email, pw).then(function () { lsSet('dust_who', who); return TOKEN; }, function (e) {
        var c = String(e && e.code || '');
        if (/network/.test(c)) throw new Error('인터넷 연결을 확인해 주세요.');
        if (/too-many/.test(c)) throw new Error('여러 번 틀려서 잠시 막혔어요. 몇 분 뒤 다시 해 주세요.');
        throw new Error('비밀번호가 맞지 않아요.');
      });
    },
    adminOff: function () { try { S.store.signOut(); } catch (e) {} },
    _S: S, _server: SERVER, _A: A, _act: ACT,
    // 관리자 '정비보조 명단' (11/8)
    roster: {
      recent: function () { return ((S.names && S.names.names) || []).slice(); },
      get: function () { var r = S.roster || {}; return { add: (r.add || []).slice(), hide: (r.hide || []).slice() }; },
      names: function () { return rosterNames(); },
      save: function (add, hide) {
        if (!S.admin || !S.user) return Promise.reject(new Error('관리자 로그인이 필요해요'));
        S.roster = { add: add.slice(), hide: hide.slice() }; changed();
        return S.store.set('sup_meta/roster', { add: add, hide: hide, at: S.store.SERVER_TIME, uid: S.user.uid });
      }
    },
    // 관리자 '더티 배분 만들기'(dist.js)용
    dist: {
      isAdmin: function () { return S.admin && !!S.user; },
      today: function () { return S.day || today(); },
      shift: shift,
      planDoc: function (d) {
        var x = d === S.day ? S.plan : other[d];
        return x && Array.isArray(x.plan) && x.plan.length ? x : null;
      },
      fetchPlan: function (d) { if (d === S.day) return Promise.resolve(S.plan); return S.store.get('sup/' + d).then(function (x) { other[d] = x; return x; }); },
      knownNames: function () { return rosterNames(); },
      getCfg: function () { return S.store.get('sup_meta/distcfg'); },
      setCfg: function (c) { return S.store.set('sup_meta/distcfg', { rule: c.rule, at: S.store.SERVER_TIME, uid: S.user ? S.user.uid : '' }); },
      savePlan: function (d, plan, meta) {
        if (!S.admin || !S.user) return Promise.reject(new Error('관리자 로그인이 필요해요'));
        if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return Promise.reject(new Error('날짜가 이상해요'));
        var sig = 'app:' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        var doc = { date: d, plan: plan, sig: sig, src: 'app', meta: meta, by: lsGetS('dust_who') || '관리자', uid: S.user.uid, issued: S.store.SERVER_TIME, at: S.store.SERVER_TIME };
        if (d !== S.day) other[d] = { date: d, plan: plan, sig: sig, src: 'app', meta: meta };
        return S.store.set('sup/' + d, doc);
      }
    }
  };
  var other = {};
  function lsGetS(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
})();

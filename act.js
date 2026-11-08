// act.js — 객실 활동판을 휴대폰 안에서 계산 (2026-11-06 ⑧ 2부). Activity.gs 와 같은 규칙·같은 오류 문구
// 활동 = Firestore acts/{활동ID} 문서 하나, 객실 체크 = acts/{활동ID}/marks/{객실} 문서 하나 (같은 객실을 다시 누르면 덮어씀, 취소도 '취소' 로 남김)
// 시트 '활동'·'활동체크' 탭은 중계(SupFirebase.gs)가 1~2분 안에 그대로 이어서 쌓음 → 시트 기록·예전 출력도 그대로
(function (G) {
  'use strict';
  var TZ = 'Asia/Seoul';
  var COLORS = { '하늘색': '#3BA7E0', '민트': '#1FB59A', '연두': '#7CB518', '주황': '#F08C00', '보라': '#8E5CD9', '분홍': '#E0559A' };
  // 점검 항목 색 (2026-11-08) — 활동 하나에 최대 5개 (예: 식탁 노후도 → ① 상판 노후 빨강 · ② 다리 물듬 파랑 · ③ 다리 흔들림 주황)
  //  객실 체크 t = 항목 번호 목록 ['1','3'] → 상태는 '이상'. 칸에는 번호 동그라미(색 + 번호, 흑백 출력에서도 읽힘)
  var ITEM_COLORS = { '빨강': '#D93636', '파랑': '#2F6FD6', '주황': '#EF8A00', '보라': '#7A4CC2', '갈색': '#8A5A2B', '검정': '#3A3A3A' };
  var ITEM_MAX = 5;
  // 실제 객실 417실 (Activity.gs ACT_ROOMS 와 같음)
  var ROOMS = '401 402 403 404 405 406 407 408 409 501 502 503 504 505 506 507 508 509 510 511 512 513 514 515 516 517 601 602 603 604 605 606 607 608 609 610 611 612 613 614 615 616 617 701 702 703 704 705 706 707 708 709 710 711 712 713 714 715 716 717 801 802 803 804 805 806 807 808 809 810 811 812 813 814 815 816 817 901 902 903 904 905 906 907 908 909 910 911 912 913 914 915 916 917 1001 1002 1003 1004 1005 1006 1007 1008 1009 1010 1011 1012 1013 1014 1015 1016 1017 1101 1102 1103 1104 1105 1106 1107 1108 1109 1110 1111 1112 1113 1114 1115 1116 1117 1201 1202 1203 1204 1205 1206 1207 1208 1209 1210 1211 1212 1213 1214 1215 1216 1217 1301 1302 1303 1304 1305 1306 1307 1308 1309 1310 1311 1312 1313 1314 1315 1316 1317 1401 1402 1403 1404 1405 1406 1407 1408 1409 1410 1411 1412 1413 1414 1415 1416 1417 1501 1502 1503 1504 1505 1506 1507 1508 1509 1510 1511 1512 1513 1514 1515 1516 1517 1601 1602 1603 1604 1605 1606 1607 1608 1609 1610 1611 1612 1613 1614 1615 1616 1617 1701 1702 1703 1704 1705 1706 1707 1708 1709 1710 1711 1712 1713 1714 1715 1716 1717 1801 1802 1803 1804 1805 1806 1807 1808 1809 1810 1811 1812 1813 1814 1815 1816 1817 1901 1902 1903 1904 1905 1906 1907 1908 1909 1910 1911 1912 1913 1914 1915 1916 1917 2001 2002 2003 2004 2005 2006 2007 2008 2009 2010 2011 2012 2013 2014 2015 2016 2017 2101 2102 2103 2104 2105 2106 2107 2108 2109 2110 2111 2112 2113 2114 2115 2116 2117 2201 2202 2203 2204 2205 2206 2207 2208 2209 2210 2211 2212 2213 2214 2215 2216 2217 2301 2302 2303 2304 2306 2307 2308 2309 2310 2312 2313 2314 2315 2316 2317 2401 2402 2403 2404 2406 2407 2408 2409 2410 2412 2413 2414 2415 2416 2417 2501 2502 2503 2504 2506 2507 2508 2509 2510 2512 2513 2514 2515 2516 2517 2601 2602 2603 2604 2606 2607 2608 2609 2610 2612 2613 2614 2615 2616 2617 2701 2702 2703 2704 2706 2707 2708 2709 2710 2711 2712 2801 2802 2803 2804 2806 2807 2808 2809 2810 2811 2812 2901 2907 2908 2909 2910 2911 3001 3002 3007 3008 3009 3010 3011 3101 3102 3107 3108 3109 3110 3111'.split(' ');
  var fmtC = null;
  function fmt(d, f) {
    fmtC = fmtC || new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    var p = {}; fmtC.formatToParts(d instanceof Date ? d : new Date(d)).forEach(function (x) { p[x.type] = x.value; });
    return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute);
  }
  function today() { return fmt(new Date(), 'yyyy-MM-dd'); }
  function iso(v) { if (v === null || v === undefined || v === '') return ''; var d = new Date(v); return isNaN(d) ? '' : d.toISOString(); }
  function day(v) { var m = String(v || '').trim().match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : ''; }
  function room(v) { var r = String(v || '').replace(/^'/, '').replace(/\.0$/, '').trim(); return ROOMS.indexOf(r) >= 0 ? r : ''; }
  function clean(v) { return String(v || '').replace(/\s+/g, ' ').trim().slice(0, 20); }
  // 제외 객실 글 → 낱말: '2901' · '29-31층' · (11/8~) 호수 라인 '1호' · '14-16호' (모든 층의 그 라인). '1,4,14~16호' · '29,30층' 처럼 묶어 써도 됨. '모든 층'·'전층'·'라인' 글자는 무시
  function words(s) {
    s = String(s || '').replace(/모든\s*층|전\s*층|각\s*층/g, ' ').replace(/호\s*라인|라인/g, '호');
    s = s.replace(/(\d{1,2}(?:\s*[-~]\s*\d{1,2})?(?:\s*[,·]\s*\d{1,2}(?:\s*[-~]\s*\d{1,2})?)*)\s*(호|층)/g, function (all, list, unit) {
      return ' ' + list.split(/\s*[,·]\s*/).map(function (x) { return x.replace(/\s+/g, '') + unit; }).join(' ') + ' ';
    });
    return s.split(/[,\s/·]+/).filter(Boolean);
  }
  function excl(s) {
    var out = {};
    words(s).forEach(function (t) {
      var f = t.match(/^(\d{1,2})(?:[-~](\d{1,2}))?(층|호)$/);
      if (f) { var a = Number(f[1]), b = Number(f[2] || f[1]), lo = Math.min(a, b), hi = Math.max(a, b);
        ROOMS.forEach(function (r) { var v = f[3] === '층' ? Math.floor(Number(r) / 100) : Number(r) % 100; if (v >= lo && v <= hi) out[r] = 1; }); return; }
      var r = room(t); if (r) out[r] = 1;
    });
    return ROOMS.filter(function (r) { return out[r]; });
  }
  function items(v) {   // 활동 문서의 items → [{k:'1', n:'상판 노후', c:'빨강', hex}] (번호는 한 번 붙으면 바뀌지 않음)
    var seen = {};
    return (Array.isArray(v) ? v : []).map(function (x) {
      x = x || {}; var k = String(x.k || '').trim(), n = String(x.n || '').replace(/\s+/g, ' ').trim().slice(0, 12), c = ITEM_COLORS[x.c] ? x.c : '빨강';
      if (!/^[1-9]$/.test(k) || !n || seen[k]) return null; seen[k] = 1;
      return { k: k, n: n, c: c, hex: ITEM_COLORS[c] };
    }).filter(Boolean).slice(0, ITEM_MAX);
  }
  function tags(v, its) {   // 체크의 t → 활동에 있는 번호만, 번호 순
    var ok = {}; (its || []).forEach(function (i) { ok[i.k] = 1; });
    var out = {}; (Array.isArray(v) ? v : []).forEach(function (k) { k = String(k); if (ok[k]) out[k] = 1; });
    return Object.keys(out).sort();
  }
  function badExcl(text) { return words(text).filter(function (t) { return !/^\d{1,2}(?:[-~]\d{1,2})?(층|호)$/.test(t) && !room(t); }); }

  /**
   * env = { acts(): [{id, …문서}], marks(id): {객실: 문서}, isAdmin(token), workerOk(이름), saveAct(id, 문서), saveMark(id, 객실, 문서), printUrl(id) }
   */
  G.makeActServer = function (env) {
    function all() {
      return env.acts().filter(function (d) { return String(d.id).indexOf('CHECK-') !== 0; }).map(function (d) {   // 규칙 점검용 시험 활동은 안 보임
        var st = ['진행', '끝남', '보관'].indexOf(d.status) >= 0 ? d.status : '진행';
        return { id: d.id, made: iso(d.made), status: st, name: String(d.name || ''), color: String(d.color || ''), start: day(d.start), due: day(d.due),
                 excl: excl(d.exclText), exclText: String(d.exclText || ''), memo: String(d.memo || ''), ended: st === '끝남' ? iso(d.ended) : '', items: items(d.items), doneName: String(d.doneName || '').replace(/\s+/g, ' ').trim().slice(0, 10), lockAt: iso(d.lockAt) };
      }).filter(function (a) { return a.name; }).sort(function (a, b) { return (a.made < b.made ? -1 : a.made > b.made ? 1 : 0) || (a.id < b.id ? -1 : 1); });
    }
    function marksOf(id, its) {
      var src = env.marks(id) || {}, out = {};
      if (!its) { var a0 = find(id); its = a0 ? a0.items : []; }
      Object.keys(src).forEach(function (k) {
        var r = room(k), x = src[k]; if (!r || !x) return;
        if (x.s === '완료' || x.s === '이상') out[r] = { s: x.s, memo: String(x.m || ''), w: String(x.w || ''), at: iso(x.at), by: String(x.by || ''), t: x.s === '이상' ? tags(x.t, its) : [] };
      });
      return out;
    }
    function stats(a, marks) {
      var ex = {}; (a.excl || []).forEach(function (r) { ex[r] = 1; });
      var done = 0, issue = 0, td = 0, t0 = today(), floors = {}, workers = {}, workersToday = {}, days = {}, byItem = {};
      (a.items || []).forEach(function (i) { byItem[i.k] = 0; });
      var target = ROOMS.filter(function (r) { return !ex[r]; });
      target.forEach(function (r) {
        var f = Math.floor(Number(r) / 100), fo = floors[f] = floors[f] || { t: 0, d: 0, i: 0 };
        fo.t++;
        var m = marks[r]; if (!m) return;
        fo.d++;
        if (m.s === '이상') { issue++; fo.i++; (m.t || []).forEach(function (k) { if (k in byItem) byItem[k]++; }); } else done++;
        var d = m.at ? fmt(new Date(m.at), 'yyyy-MM-dd') : '';
        if (d) days[d] = (days[d] || 0) + 1;
        if (d === t0) td++;
        if (m.w) { workers[m.w] = (workers[m.w] || 0) + 1; if (d === t0) workersToday[m.w] = (workersToday[m.w] || 0) + 1; }
      });
      var n = target.length, proc = done + issue;
      return { target: n, done: done, issue: issue, proc: proc, left: n - proc, pct: n ? Math.round(proc / n * 1000) / 10 : 0, today: td,
               floors: floors, workers: workers, workersToday: workersToday, days: days, items: byItem };
    }
    function pub(a, marks, admin) {
      var out = { id: a.id, name: a.name, color: a.color, hex: COLORS[a.color] || '#1FB59A', start: a.start, due: a.due, excl: a.excl, exclText: a.exclText, memo: a.memo, status: a.status, ended: a.ended || '', items: a.items || [], doneName: a.doneName || '', lockAt: a.lockAt || '', stats: stats(a, marks || {}) };
      if (admin) out.printUrl = env.printUrl(a.id);
      return out;
    }
    function find(id) { return all().filter(function (x) { return x.id === String(id); })[0]; }
    function needAdmin(token) { if (!env.isAdmin(token)) throw new Error('관리자 비밀번호가 필요해요. 관리자 모드로 다시 들어와 주세요.'); }
    function docOf(a, patch) {   // 활동 문서 전체 (수정할 때도 통째로 다시 씀)
      var d = { name: a.name, color: a.color, start: a.start, due: a.due || '', exclText: a.exclText || '', memo: a.memo || '', status: a.status, made: a.made ? new Date(a.made) : new Date(), ended: a.ended ? new Date(a.ended) : null,
                items: (a.items || []).map(function (i) { return { k: i.k, n: i.n, c: i.c }; }), doneName: a.doneName || '', lockAt: a.lockAt ? new Date(a.lockAt) : null };
      Object.keys(patch || {}).forEach(function (k) { d[k] = patch[k]; });
      return d;
    }

    function actList(token) {
      var admin = env.isAdmin(token);
      var list = all().filter(function (a) { return admin ? a.status !== '보관' : a.status === '진행'; });
      return { today: today(), admin: admin, rooms: ROOMS, colors: COLORS, itemColors: ITEM_COLORS, itemMax: ITEM_MAX, acts: list.map(function (a) { return pub(a, marksOf(a.id, a.items), admin); }) };
    }
    function actGet(id, token) {
      var admin = env.isAdmin(token), a = find(id);
      if (!a || (a.status === '보관' && !admin)) throw new Error('활동을 찾지 못했어요. 새로고침해 주세요.');
      if (a.status !== '진행' && !admin) throw new Error('끝난 활동이에요.');
      var marks = marksOf(a.id, a.items), out = pub(a, marks, admin);
      out.marks = marks; out.today = today();
      return out;
    }
    function actMark(id, rm, state, memo, worker, token, tg) {
      var admin = env.isAdmin(token), a = find(id);
      if (!a) throw new Error('활동을 찾지 못했어요. 새로고침해 주세요.');
      if (a.status !== '진행') throw new Error('끝난 활동이라 체크할 수 없어요.');
      var r = room(rm); if (!r) throw new Error('객실 번호를 확인해 주세요.');
      if ((a.excl || []).indexOf(r) >= 0) throw new Error(r + '호는 이 활동 대상이 아니에요.');
      if (['완료', '이상', '취소'].indexOf(state) < 0) throw new Error('체크 방법을 확인해 주세요.');
      var nm = admin ? '관리자' : clean(worker);
      if (!admin && (!nm || nm === '관리자' || !env.workerOk(nm))) throw new Error('NOTMINE:' + nm + ' 님은 정비보조 명단에 없어서 저장하지 않았어요.');
      var cur = marksOf(a.id, a.items)[r];
      // 지난 날짜에 체크된 객실은 근무자가 못 바꿈 (2026-11-08 — 오늘 근무자의 잘못 누름으로 어제 기록이 지워지는 것 막기). 관리자는 됨. 규칙 v9 도 같은 검사
      if (!admin && cur && cur.at && fmt(new Date(cur.at), 'yyyy-MM-dd') < today()) throw new Error('LOCK:' + r + '호는 ' + Number(fmt(new Date(cur.at), 'MM')) + '/' + Number(fmt(new Date(cur.at), 'dd')) + '에 체크된 객실이라 바꿀 수 없어요. 고칠 게 있으면 관리자에게 말씀해 주세요.');
      // 관리자가 '지금까지 체크 잠그기'를 누른 뒤에는 그 전에 체크된 객실도 근무자가 못 바꿈 (11/8, 규칙 v10 도 같은 검사). 빈 칸은 계속 체크 가능
      if (!admin && cur && cur.at && a.lockAt && new Date(cur.at).getTime() <= new Date(a.lockAt).getTime()) throw new Error('LOCK:' + r + '호는 관리자가 잠근 기록이라 바꿀 수 없어요. 고칠 게 있으면 관리자에게 말씀해 주세요.');
      var tt = state === '이상' ? tags(tg, a.items) : [];
      var mm = state === '이상' ? String(memo || '').replace(/\s+/g, ' ').trim().slice(0, 30) : '';
      if (state === '이상' && a.items.length && !tt.length && !mm) throw new Error('해당하는 항목을 하나 이상 골라 주세요.');
      var same = state === '취소' ? !cur : cur && cur.s === state && cur.memo === mm && cur.t.join(',') === tt.join(',');
      if (!same) { var doc = { s: state, m: mm, w: nm, by: admin ? '관리자 대신' : '본인' }; if (tt.length) doc.t = tt; env.saveMark(a.id, r, doc); }
      return actGet(a.id, token);
    }
    function actSave(token, x) {
      needAdmin(token);
      x = x || {};
      var name = String(x.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!name) throw new Error('활동 이름을 적어 주세요. (예: 이불장 얼룩 점검)');
      var color = COLORS[x.color] ? x.color : '민트';
      var start = day(x.start) || today(), due = day(x.due);
      if (due && due < start) throw new Error('목표일이 시작일보다 빨라요.');
      var exclText = String(x.excl || '').replace(/\s+/g, ' ').trim().slice(0, 500);
      var bad = badExcl(exclText);
      if (bad.length) throw new Error('제외 객실을 확인해 주세요: ' + bad.slice(0, 5).join(', ') + ' (예: 2901, 3001 · 29-31층 · 1,4,14-16호)');
      var memo = String(x.memo || '').replace(/\s+/g, ' ').trim().slice(0, 100);
      var doneName = String(x.doneName || '').replace(/\s+/g, ' ').trim().slice(0, 10);   // '완료' 이름 (예: 정비 완료, 제거 완료) — 비우면 기본
      var its = [], used = {}, names = {};
      (Array.isArray(x.items) ? x.items : []).forEach(function (i) {
        i = i || {}; var n = String(i.n || '').replace(/\s+/g, ' ').trim(); if (!n) return;
        if (n.length > 12) throw new Error("항목 이름은 12자까지예요: '" + n + "'");
        if (names[n]) throw new Error("같은 항목 이름이 두 번 있어요: '" + n + "'"); names[n] = 1;
        its.push({ k: /^[1-9]$/.test(String(i.k || '')) ? String(i.k) : '', n: n, c: ITEM_COLORS[i.c] ? i.c : '빨강' });
      });
      if (its.length > ITEM_MAX) throw new Error('점검 항목은 ' + ITEM_MAX + '개까지예요.');
      its.forEach(function (i) { if (i.k) { if (used[i.k]) i.k = ''; else used[i.k] = 1; } });
      var list = all(), raw = env.acts(), id = String(x.id || ''), a;
      if (id) { var old = list.filter(function (q) { return q.id === id; })[0]; (old ? old.items : []).forEach(function (i) { used[i.k] = 1; }); }   // 지운 항목 번호는 다시 안 씀 (예전 체크와 섞이지 않게)
      its.forEach(function (i) { if (!i.k) { for (var n2 = 1; n2 <= 9; n2++) if (!used[String(n2)]) { i.k = String(n2); used[i.k] = 1; break; } } });
      if (its.some(function (i) { return !i.k; })) throw new Error('항목을 너무 여러 번 바꿨어요. 새 활동으로 만들어 주세요.');
      if (id) {
        a = list.filter(function (q) { return q.id === id; })[0];
        if (!a) throw new Error('활동을 찾지 못했어요.');
        env.saveAct(id, docOf(a, { name: name, color: color, start: start, due: due, exclText: exclText, memo: memo, items: its, doneName: doneName }));
      } else {
        if (list.some(function (q) { return q.status === '진행' && q.name === name; })) throw new Error("'" + name + "' 활동이 이미 진행 중이에요.");
        var base = 'A' + today().slice(2).replace(/-/g, ''), k = 1;
        while (raw.some(function (q) { return q.id === base + '-' + k; })) k++;
        id = base + '-' + k;
        env.saveAct(id, { name: name, color: color, start: start, due: due, exclText: exclText, memo: memo, items: its, doneName: doneName, status: '진행', made: new Date(), ended: null });
      }
      var out = actList(token); out.saved = id; return out;
    }
    function actStatus(token, id, kind) {
      needAdmin(token);
      if (['끝내기', '다시 열기', '보관', '잠그기', '잠금 풀기'].indexOf(kind) < 0) throw new Error('처리 방법을 확인해 주세요.');
      var a = find(id);
      if (!a) throw new Error('활동을 찾지 못했어요.');
      if (kind === '끝내기' && a.status !== '진행') throw new Error('진행 중인 활동만 끝낼 수 있어요.');
      if (kind === '다시 열기' && a.status === '진행') throw new Error('이미 진행 중이에요.');
      if (kind === '잠그기' || kind === '잠금 풀기') { env.saveAct(a.id, docOf(a, { lockAt: kind === '잠그기' ? '__now' : null })); return actGet(a.id, token); }   // '__now' = 서버 시각
      env.saveAct(a.id, docOf(a, kind === '끝내기' ? { status: '끝남', ended: new Date() } : kind === '다시 열기' ? { status: '진행', ended: null } : { status: '보관' }));
      return actList(token);
    }
    /** 출력 페이지(print.html)에 넘길 숫자 — Activity.gs actPrintData_ 와 같은 모양 */
    function printData(id) {
      var a = find(id);
      if (!a) return { err: '활동을 찾지 못했어요. 앱에서 다시 열어 주세요.' };
      var marks = marksOf(a.id, a.items), d = pub(a, marks, false);
      d.marks = marks; d.rooms = ROOMS; d.today = today();
      d.asOf = fmt(new Date(), 'yyyy.MM.dd HH:mm');
      d.endedDay = a.ended ? fmt(new Date(a.ended), 'yyyy-MM-dd') : '';
      return { d: d };
    }
    return { actList: actList, actGet: actGet, actMark: actMark, actSave: actSave, actStatus: actStatus, printData: printData, rooms: ROOMS, colors: COLORS, itemColors: ITEM_COLORS, room: room };
  };
})(typeof window !== 'undefined' ? window : globalThis);

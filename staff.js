/* 직원 명단 (2026-11-12, 객실 통합 관리 1단계): 관리자 화면 '🧾 직원 명단'
 * staff/{id} 한 명당 문서 하나 — 이름·직종·등급·근무조·입사일·퇴사일·상태 + 출처(입퇴사 앱 / 직접)
 * 새 입사자는 입퇴사 앱(HrStaff.gs)이 보내 주고, 기존 직원·본사 입사일 자료는 여기서 '엑셀 붙여넣기'로 한 번에
 * 읽기는 메뉴를 열 때 한 번 (실시간 구독 안 함). 쓰기·읽기 모두 관리자만 (규칙 v11) */
(function () {
  'use strict';
  var JOBS = ['룸메이드', '정비보조', '하우스맨', '미화', '사우나', '오더테이커', '하우스키퍼', '기타'];
  var STATES = ['재직', '입사 진행', '퇴사'];
  var F = null;   // 열려 있는 화면 상태

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function api() { return window.SupShim && SupShim.staff; }
  function clean(v, n) { return String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n || 20); }
  function key(n) { return String(n || '').replace(/\s+/g, ''); }
  function today() { var x = new Date(Date.now() + 9 * 3600000); return x.toISOString().slice(0, 10); }
  function pad(n) { return ('0' + n).slice(-2); }
  function ymd(y, m, d) {
    y = Number(y); m = Number(m); d = Number(d);
    if (!(y >= 1950 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
    var t = new Date(Date.UTC(y, m - 1, d));
    if (t.getUTCMonth() !== m - 1) return null;
    return y + '-' + pad(m) + '-' + pad(d);
  }
  // 날짜 글자 → 'YYYY-MM-DD' / '' (빈칸) / null (못 읽음)
  function normDate(v) {
    var s = String(v == null ? '' : v).trim();
    if (!s || s === '-') return '';
    var m;
    if ((m = /^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*일?\.?$/.exec(s))) return ymd(m[1], m[2], m[3]);
    if ((m = /^(\d{2})\s*[-./]\s*(\d{1,2})\s*[-./]\s*(\d{1,2})\.?$/.exec(s))) return ymd((Number(m[1]) > 50 ? 1900 : 2000) + Number(m[1]), m[2], m[3]);
    if ((m = /^(\d{4})(\d{2})(\d{2})$/.exec(s))) return ymd(m[1], m[2], m[3]);
    if (/^\d{5}(\.\d+)?$/.test(s)) {   // 엑셀 날짜 숫자 (1900 날짜 체계)
      var t = new Date(Date.UTC(1899, 11, 30) + Math.floor(Number(s)) * 864e5);
      return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
    }
    return null;
  }
  function md(d) { return d ? d.slice(2).replace(/-/g, '.') : ''; }
  // 근속: 입사일 ~ (퇴사일 또는 오늘)
  function tenure(p) {
    if (!p.hired) return '';
    var end = p.left && p.left < today() ? p.left : today();
    var a = p.hired.split('-').map(Number), b = end.split('-').map(Number);
    var mo = (b[0] - a[0]) * 12 + (b[1] - a[1]) - (b[2] < a[2] ? 1 : 0);
    if (mo < 0) return '입사 전';
    var y = Math.floor(mo / 12), r = mo % 12;
    return (y ? y + '년 ' : '') + r + '개월';
  }
  function stateOf(p) { return p.status || '재직'; }

  // ---------- 관리자 화면 버튼
  function inject() {
    try {
      if (!window.adminTok || !api()) return;
      var am = document.querySelector('#main .amode');
      if (am && !am.querySelector('.sf-open')) am.insertAdjacentHTML('beforeend', '<button class="ghost sf-open" data-sf="open">🧾 직원 명단</button>');
    } catch (e) {}
  }
  var r0 = window.render;
  if (typeof r0 === 'function') window.render = function () { r0.apply(this, arguments); inject(); };

  // ---------- 열기 · 닫기
  function open() {
    if (!api()) return;
    F = { list: null, err: '', loading: true, tab: '재직', job: '', q: '', edit: null, paste: null, saving: false, msg: '' };
    var box = document.createElement('div'); box.className = 'dz'; box.id = 'sf'; document.body.appendChild(box);
    document.body.classList.add('dz-lock');
    draw(); load();
  }
  function close() { var b = document.getElementById('sf'); if (b) b.remove(); document.body.classList.remove('dz-lock'); F = null; }
  function load() {
    F.loading = true; draw();
    api().list().then(function (xs) {
      if (!F) return;
      F.loading = false; F.err = '';
      F.list = xs.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ko'); });
      draw();
    }, function (e) {
      if (!F) return;
      F.loading = false;
      F.err = /permission/i.test(String(e && (e.code || e.message))) ? '직원 명단을 읽을 권한이 없어요 — Firebase 보안 규칙 v11(직원 명단)을 게시했는지 확인해 주세요.' : '명단을 못 읽었어요: ' + (e && (e.code || e.message) || e);
      draw();
    });
  }

  // ---------- 그리기
  function draw() {
    var box = document.getElementById('sf'); if (!box || !F) return;
    var y = box.scrollTop;
    var h = '<div class="dz-in"><div class="dz-head"><h2>🧾 직원 명단</h2><button class="dz-x" data-sf="close" aria-label="닫기">✕</button></div>';
    if (F.edit) h += editHtml();
    else if (F.paste) h += pasteHtml();
    else h += listHtml();
    box.innerHTML = h + '</div>';
    box.scrollTop = y;
  }
  function listHtml() {
    var h = '';
    if (F.msg) h += '<p class="dz-ready">' + esc(F.msg) + '</p>';
    if (F.err) return h + '<section class="dz-sec"><p class="dz-err">' + esc(F.err) + '</p><button class="dz-link" data-sf="reload">다시 읽기</button></section>';
    if (F.loading && !F.list) return h + '<section class="dz-sec"><p class="dz-tip">명단을 읽는 중…</p></section>';
    var all = F.list || [], cnt = { '전체': all.length };
    STATES.forEach(function (s) { cnt[s] = 0; });
    all.forEach(function (p) { cnt[stateOf(p)] = (cnt[stateOf(p)] || 0) + 1; });
    var inTab = all.filter(function (p) { return F.tab === '전체' || stateOf(p) === F.tab; });
    var jobs = {}; inTab.forEach(function (p) { var j = p.job || '미정'; jobs[j] = (jobs[j] || 0) + 1; });
    var q = key(F.q);
    var rows = inTab.filter(function (p) { return (!F.job || (p.job || '미정') === F.job) && (!q || key(p.name).indexOf(q) >= 0); });
    var noHire = all.filter(function (p) { return stateOf(p) !== '퇴사' && !p.hired; }).length;
    h += '<section class="dz-sec"><div class="dz-seg">' + ['재직', '입사 진행', '퇴사', '전체'].map(function (s) {
      return '<button data-sf="tab" data-v="' + s + '" aria-pressed="' + (F.tab === s) + '">' + s + ' ' + (cnt[s] || 0) + '</button>';
    }).join('') + '</div>' +
      '<div class="dz-chips" style="margin-top:10px">' + ['<button data-sf="job" data-v="" class="' + (!F.job ? 'd' : '') + '">모두 ' + inTab.length + '</button>'].concat(
        Object.keys(jobs).sort(function (a, b) { return JOBS.indexOf(a) - JOBS.indexOf(b); }).map(function (j) {
          return '<button data-sf="job" data-v="' + esc(j) + '" class="' + (F.job === j ? 'd' : '') + '">' + esc(j) + ' ' + jobs[j] + '</button>';
        })).join('') + '</div>' +
      '<div class="dz-add"><input data-sf="q" placeholder="이름 찾기" value="' + esc(F.q) + '" inputmode="search"></div>' +
      (noHire ? '<p class="dz-warn">입사일이 빈 분이 ' + noHire + '명이에요. 본사 입사일 자료가 오면 아래 「엑셀 붙여넣기」로 한 번에 넣을 수 있어요.</p>' : '') +
      '</section>';
    h += '<section class="dz-sec sf-list">' + (rows.length ? rows.map(function (p) {
      var st = stateOf(p), t = tenure(p);
      return '<button class="sf-row' + (st === '퇴사' ? ' out' : '') + '" data-sf="edit" data-v="' + esc(p.id) + '">' +
        '<span class="sf-n"><b>' + esc(p.name) + '</b>' + (p.src === 'hr' ? '<em title="입퇴사 앱에서 옴">앱</em>' : '') + '</span>' +
        '<span class="sf-j">' + esc([p.job || '직종 미정', p.grade, p.shift].filter(Boolean).join(' · ')) + '</span>' +
        '<span class="sf-d">' + (p.hired ? md(p.hired) + ' 입사' + (t ? ' · ' + t : '') : '<i>입사일 없음</i>') + (p.left ? '<br>' + md(p.left) + ' 퇴사' : '') + (st === '입사 진행' ? '<br>입사 진행' : '') + '</span></button>';
    }).join('') : '<p class="dz-tip">' + (all.length ? '조건에 맞는 분이 없어요.' : '아직 명단이 비어 있어요. 「엑셀 붙여넣기」로 기존 직원을 한 번에 넣어 주세요.') + '</p>') + '</section>';
    h += '<div class="sf-acts"><button class="dz-go" data-sf="add">＋ 한 명 추가</button><button class="dz-go sf-2" data-sf="paste">📋 엑셀 붙여넣기</button></div>' +
      '<p class="dz-tip" style="text-align:center">새로 입사하는 분은 입퇴사 서류 앱에서 자동으로 들어와요 (1시간마다).<br>주민번호·주소·전화·서명은 여기 오지 않아요.</p>';
    return h;
  }
  function field(lbl, name, val, extra) { return '<label class="sf-f"><span>' + lbl + '</span><input data-sff="' + name + '" value="' + esc(val || '') + '" ' + (extra || '') + '></label>'; }
  function editHtml() {
    var e = F.edit, p = e.doc;
    var opts = JOBS.indexOf(p.job || '') < 0 && p.job ? JOBS.concat([p.job]) : JOBS;
    return '<section class="dz-sec"><h3>' + (e.isNew ? '＋ 한 명 추가' : esc(p.name) + ' 님') + (p.src === 'hr' ? ' <small>입퇴사 서류 앱에서 온 분</small>' : '') + '</h3>' +
      (p.src === 'hr' ? '<p class="dz-warn">입퇴사 앱 정보가 바뀌면(퇴사 접수 등) 그 내용으로 다시 맞춰져요. 계약 내용 자체는 입퇴사 앱에서 고쳐 주세요.</p>' : '') +
      field('이름', 'name', p.name, 'maxlength="20"') +
      '<label class="sf-f"><span>직종</span><select data-sff="job"><option value="">직종 고르기</option>' + opts.map(function (j) { return '<option' + (p.job === j ? ' selected' : '') + '>' + esc(j) + '</option>'; }).join('') + '</select></label>' +
      field('등급', 'grade', p.grade, 'maxlength="10" placeholder="예: S, A, 신규"') +
      field('근무조', 'shift', p.shift, 'maxlength="10" placeholder="예: A, AE"') +
      field('입사일', 'hired', p.hired, 'type="date"') +
      field('퇴사일', 'left', p.left, 'type="date"') +
      '<label class="sf-f"><span>상태</span><select data-sff="status">' + STATES.map(function (s) { return '<option' + (stateOf(p) === s ? ' selected' : '') + '>' + s + '</option>'; }).join('') + '</select></label>' +
      (e.err ? '<p class="dz-err">' + esc(e.err) + '</p>' : '') +
      '</section><div class="sf-acts"><button class="dz-go" data-sf="esave"' + (F.saving ? ' disabled' : '') + '>' + (F.saving ? '저장 중…' : '저장') + '</button>' +
      '<button class="dz-go sf-2" data-sf="back">취소</button></div>' +
      (e.isNew ? '' : '<p style="text-align:center"><button class="dz-link sf-del" data-sf="edel">명단에서 지우기</button></p><p class="dz-tip" style="text-align:center">그만두신 분은 지우지 말고 상태를 「퇴사」로 바꿔 두세요 (근속·결산 근거).</p>');
  }
  function pasteHtml() {
    var P = F.paste, h = '<section class="dz-sec"><h3>📋 엑셀 붙여넣기</h3>' +
      '<p class="dz-tip" style="margin:0 0 8px">엑셀에서 <b>제목 줄까지</b> 같이 복사해 붙여 넣으세요. 알아보는 제목: 이름(성명) · 직종 · 등급 · 근무조 · 입사일 · 퇴사일 · 상태<br>제목 줄이 없으면 「이름 · 직종 · 입사일」 순서로 읽어요. 이미 있는 분은 <b>이름으로 찾아서</b> 적힌 칸만 바꿔요 (빈칸은 그대로).</p>' +
      '<textarea class="sf-ta" data-sf="ta" rows="7" placeholder="이름	직종	입사일&#10;홍길순	룸메이드	2019-03-04">' + esc(P.text) + '</textarea>' +
      '<div class="sf-acts" style="margin-top:8px"><button class="dz-go" data-sf="pcheck">미리보기</button><button class="dz-go sf-2" data-sf="back">닫기</button></div></section>';
    var r = P.res;
    if (r) {
      h += '<section class="dz-sec"><h3>미리보기</h3>' +
        '<p class="dz-tot">새로 <b>' + r.add.length + '명</b> · 바뀜 <b>' + r.chg.length + '명</b> · 같음 ' + r.same + '명' + (r.bad.length ? ' · <span style="color:var(--warn,#B23A48)">확인 필요 ' + r.bad.length + '줄</span>' : '') + '</p>' +
        (r.cols ? '<p class="dz-tip" style="margin:0 0 8px">읽은 칸: ' + esc(r.cols) + '</p>' : '') +
        (r.bad.length ? '<div class="sf-pv bad">' + r.bad.map(function (b) { return '<div>' + esc(b) + '</div>'; }).join('') + '</div>' : '') +
        (r.add.length ? '<div class="sf-pv">' + r.add.map(function (x) { return '<div><b>＋ ' + esc(x.doc.name) + '</b> ' + esc([x.doc.job, x.doc.grade, x.doc.shift, x.doc.hired && md(x.doc.hired) + ' 입사', x.doc.left && md(x.doc.left) + ' 퇴사'].filter(Boolean).join(' · ')) + '</div>'; }).join('') + '</div>' : '') +
        (r.chg.length ? '<div class="sf-pv">' + r.chg.map(function (x) { return '<div><b>✎ ' + esc(x.doc.name) + '</b> ' + esc(x.diff.join(' / ')) + '</div>'; }).join('') + '</div>' : '') +
        (r.add.length + r.chg.length ? '<button class="dz-go" data-sf="psave"' + (F.saving ? ' disabled' : '') + '>' + (F.saving ? '저장 중… ' + (P.done || 0) + '/' + (r.add.length + r.chg.length) : (r.add.length + r.chg.length) + '명 저장') + '</button>' : '<p class="dz-tip">바꿀 내용이 없어요.</p>') +
        (P.err ? '<p class="dz-err">' + esc(P.err) + '</p>' : '') + '</section>';
    }
    return h;
  }

  // ---------- 엑셀 붙여넣기 읽기
  var HEAD = { name: /^(이름|성명|근로자명|직원명)$/, job: /^(직종|직무|파트|구분|부서)$/, grade: /^(등급|직급)$/, shift: /^(근무조|조)$/,
    hired: /^(입사일|입사일자|입사)$/, left: /^(퇴사일|퇴사일자|퇴사)$/, status: /^(상태|재직상태|재직여부)$/ };
  var LABEL = { name: '이름', job: '직종', grade: '등급', shift: '근무조', hired: '입사일', left: '퇴사일', status: '상태' };
  function parsePaste(text, list) {
    var lines = String(text || '').replace(/\r/g, '').split('\n').filter(function (l) { return l.trim(); });
    var out = { add: [], chg: [], same: 0, bad: [], cols: '' };
    if (!lines.length) { out.bad.push('붙여 넣은 내용이 없어요.'); return out; }
    var split = function (l) { return (l.indexOf('\t') >= 0 ? l.split('\t') : l.indexOf(',') >= 0 ? l.split(',') : l.trim().split(/\s{2,}|\s+/)).map(function (c) { return c.trim(); }); };
    var first = split(lines[0]).map(function (c) { return c.replace(/\s/g, ''); }), map = {}, hasHead = false;
    first.forEach(function (c, i) { Object.keys(HEAD).forEach(function (k) { if (map[k] === undefined && HEAD[k].test(c)) { map[k] = i; hasHead = true; } }); });
    if (hasHead && map.name === undefined) { out.bad.push("제목 줄에 '이름'(또는 '성명') 칸이 없어요."); return out; }
    if (!hasHead) map = { name: 0, job: 1, hired: 2 };
    out.cols = Object.keys(map).sort(function (a, b) { return map[a] - map[b]; }).map(function (k) { return LABEL[k]; }).join(' · ') + (hasHead ? '' : ' (제목 줄 없음 — 순서대로)');
    var byName = {}; (list || []).forEach(function (p) { (byName[key(p.name)] = byName[key(p.name)] || []).push(p); });
    var seen = {};
    lines.slice(hasHead ? 1 : 0).forEach(function (l, i) {
      var c = split(l), no = (hasHead ? i + 2 : i + 1) + '번째 줄';
      var get = function (k) { return map[k] === undefined ? undefined : clean(c[map[k]], k === 'name' ? 20 : 12); };
      var nm = get('name');
      if (!nm) return;
      var v = { name: nm }, okRow = true;
      ['job', 'grade', 'shift', 'status'].forEach(function (k) { var x = get(k); if (x) v[k] = x; });
      var sk = key(nm) + '|' + (v.job || '');   // 동명이인은 직종으로 구분
      if (seen[sk]) { out.bad.push(no + ': ' + nm + ' 님이 붙여 넣은 내용에 두 번 있어요 — 한 줄만 남겨 주세요'); return; }
      seen[sk] = 1;
      ['hired', 'left'].forEach(function (k) { var x = get(k); if (x === undefined || x === '') return; var d = normDate(x); if (d === null) { out.bad.push(no + ': ' + nm + ' — ' + LABEL[k] + " '" + x + "' 를 날짜로 못 읽었어요 (예: 2019-03-04)"); okRow = false; } else if (d) v[k] = d; });
      if (v.status && STATES.indexOf(v.status) < 0) { if (/퇴/.test(v.status)) v.status = '퇴사'; else if (/재|근무/.test(v.status)) v.status = '재직'; else { out.bad.push(no + ': ' + nm + " — 상태 '" + v.status + "' 는 재직·입사 진행·퇴사 중 하나여야 해요"); okRow = false; } }
      if (!okRow) return;
      var cand = byName[key(nm)] || [];
      if (cand.length > 1 && v.job) cand = cand.filter(function (p) { return p.job === v.job; });
      if (cand.length > 1) { out.bad.push(no + ': ' + nm + ' 님이 명단에 ' + cand.length + '명 있어요 — 직종 칸을 같이 붙여 넣거나 한 명씩 고쳐 주세요'); return; }
      if (!cand.length) {
        var d0 = { name: nm, job: v.job || '', grade: v.grade || '', shift: v.shift || '', hired: v.hired || '', left: v.left || '',
          status: v.status || (v.left && v.left <= today() ? '퇴사' : '재직'), src: '관리자', hrId: '' };
        out.add.push({ id: null, doc: d0 }); return;
      }
      var p = cand[0], diff = [], nd = {};
      Object.keys(p).forEach(function (k) { if (k !== 'id' && k !== 'at' && k !== 'uid') nd[k] = p[k]; });
      ['job', 'grade', 'shift', 'hired', 'left', 'status'].forEach(function (k) {
        if (v[k] === undefined || String(v[k]) === String(p[k] || '')) return;
        diff.push(LABEL[k] + ' ' + (p[k] ? (k === 'hired' || k === 'left' ? md(p[k]) : p[k]) : '빈칸') + ' → ' + (k === 'hired' || k === 'left' ? md(v[k]) : v[k]));
        nd[k] = v[k];
      });
      if (v.left && !v.status && v.left <= today() && stateOf(p) !== '퇴사') { nd.status = '퇴사'; diff.push('상태 ' + stateOf(p) + ' → 퇴사'); }
      if (diff.length) out.chg.push({ id: p.id, doc: nd, diff: diff }); else out.same++;
    });
    return out;
  }

  // ---------- 저장
  function readForm() {
    var d = Object.assign({}, F.edit.doc);
    Array.prototype.forEach.call(document.querySelectorAll('#sf [data-sff]'), function (el) { d[el.getAttribute('data-sff')] = el.value; });
    d.name = clean(d.name, 20); d.job = clean(d.job, 12); d.grade = clean(d.grade, 10); d.shift = clean(d.shift, 10);
    return d;
  }
  function editSave() {
    var d = readForm(), e = F.edit;
    e.doc = d; e.err = '';
    if (!d.name) { e.err = '이름을 적어 주세요.'; draw(); return; }
    if (d.name === '관리자') { e.err = "'관리자'는 이름으로 쓸 수 없어요."; draw(); return; }
    var hd = normDate(d.hired), ld = normDate(d.left);
    if (hd === null || ld === null) { e.err = '날짜를 다시 확인해 주세요.'; draw(); return; }
    d.hired = hd; d.left = ld;
    if (d.hired && d.left && d.left < d.hired) { e.err = '퇴사일이 입사일보다 빨라요.'; draw(); return; }
    var dup = (F.list || []).filter(function (p) { return p.id !== e.id && key(p.name) === key(d.name) && (p.job || '') === (d.job || ''); });
    if (dup.length && !confirm(d.name + ' 님(' + (d.job || '직종 없음') + ')이 이미 명단에 있어요. 그래도 따로 저장할까요?')) return;
    if (!d.src) d.src = '관리자';
    if (d.hrId === undefined) d.hrId = '';
    var id = e.id || api().newId();
    F.saving = true; draw();
    api().save(id, d).then(function () {
      if (!F) return;
      F.saving = false; F.edit = null; F.msg = d.name + ' 님을 저장했어요.';
      upsert(id, d); draw();
    }, function (x) { if (!F) return; F.saving = false; e.err = '저장하지 못했어요: ' + (x && (x.code || x.message) || x); draw(); });
  }
  function upsert(id, d) {
    var L = F.list || (F.list = []), i = L.findIndex(function (p) { return p.id === id; }), v = Object.assign({}, d, { id: id });
    if (i >= 0) L[i] = v; else L.push(v);
    L.sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'ko'); });
  }
  function editDel() {
    var e = F.edit, p = e.doc;
    if (!confirm(p.name + ' 님을 명단에서 완전히 지울까요?\n\n그만두신 분은 지우지 말고 상태를 「퇴사」로 두는 게 좋아요.' + (p.src === 'hr' ? '\n(입퇴사 앱에 있는 분은 앱 정보가 바뀌면 다시 들어올 수 있어요)' : ''))) return;
    F.saving = true; draw();
    api().del(e.id).then(function () {
      if (!F) return;
      F.saving = false; F.edit = null; F.msg = p.name + ' 님을 명단에서 지웠어요.';
      F.list = (F.list || []).filter(function (x) { return x.id !== e.id; }); draw();
    }, function (x) { if (!F) return; F.saving = false; e.err = '지우지 못했어요: ' + (x && (x.code || x.message) || x); draw(); });
  }
  function pasteSave() {
    var P = F.paste, r = P.res; if (!r || F.saving) return;
    var jobs = r.add.map(function (x) { return { id: api().newId(), doc: x.doc }; }).concat(r.chg.map(function (x) { return { id: x.id, doc: x.doc }; }));
    F.saving = true; P.done = 0; P.err = ''; draw();
    var i = 0, fails = [];
    function next() {
      if (!F) return;
      if (i >= jobs.length) {
        F.saving = false;
        if (fails.length) { P.err = fails.length + '명 저장 실패: ' + fails.slice(0, 3).join(', ') + (fails.length > 3 ? ' …' : '') + ' — 인터넷과 관리자 로그인을 확인하고 다시 눌러 주세요'; P.res = parsePaste(P.text, F.list); draw(); return; }
        F.msg = jobs.length + '명을 저장했어요 (새로 ' + r.add.length + ' · 바뀜 ' + r.chg.length + ').'; F.paste = null; draw(); return;
      }
      var part = jobs.slice(i, i + 20); i += part.length;
      Promise.all(part.map(function (j) {
        return api().save(j.id, j.doc).then(function () { upsert(j.id, j.doc); P.done++; }, function () { fails.push(j.doc.name); });
      })).then(function () { draw(); next(); });
    }
    next();
  }

  // ---------- 누르기 · 입력
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-sf]'); if (!t) return;
    var a = t.getAttribute('data-sf'), v = t.getAttribute('data-v');
    if (a === 'open') { e.preventDefault(); open(); return; }
    if (!F || a === 'ta' || a === 'q') return;
    F.msg = '';
    if (a === 'close') { close(); return; }
    if (a === 'reload') { load(); return; }
    if (a === 'tab') { F.tab = v; F.job = ''; draw(); return; }
    if (a === 'job') { F.job = v; draw(); return; }
    if (a === 'add') { F.edit = { id: null, isNew: true, doc: { name: '', job: '', grade: '', shift: '', hired: '', left: '', status: '재직', src: '관리자', hrId: '' }, err: '' }; draw(); return; }
    if (a === 'edit') { var p = (F.list || []).filter(function (x) { return x.id === v; })[0]; if (p) { F.edit = { id: p.id, isNew: false, doc: Object.assign({}, p), err: '' }; draw(); } return; }
    if (a === 'back') { F.edit = null; F.paste = null; draw(); return; }
    if (a === 'esave') { editSave(); return; }
    if (a === 'edel') { editDel(); return; }
    if (a === 'paste') { F.paste = { text: '', res: null, err: '' }; draw(); return; }
    if (a === 'pcheck') { F.paste.res = parsePaste(F.paste.text, F.list); F.paste.err = ''; draw(); return; }
    if (a === 'psave') { pasteSave(); return; }
  });
  document.addEventListener('input', function (e) {
    if (!F) return;
    var a = e.target.getAttribute && e.target.getAttribute('data-sf');
    if (a === 'q') { F.q = e.target.value; var pos = e.target.selectionStart; draw(); var el = document.querySelector('#sf [data-sf="q"]'); if (el) { el.focus(); try { el.setSelectionRange(pos, pos); } catch (x) {} } }
    if (a === 'ta') { F.paste.text = e.target.value; if (F.paste.res) { F.paste.res = null; } }
  });

  // ---------- 모양 (더티 배분 창 dz-* 모양을 같이 씀)
  var css = document.createElement('style');
  css.textContent = [
    '.sf-list{padding:6px 8px}',
    '.sf-row{display:grid;grid-template-columns:1fr auto;grid-template-areas:"n d" "j d";gap:2px 10px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--line);background:none;padding:10px 8px;font:inherit;color:var(--ink);cursor:pointer}',
    '.sf-row:last-child{border-bottom:0}.sf-row.out{opacity:.55}',
    '.sf-n{grid-area:n;font-size:16px}.sf-n em{font-style:normal;font-size:11px;font-weight:700;color:#1F3B63;background:#E7EEF7;border-radius:6px;padding:1px 5px;margin-left:6px;vertical-align:2px}',
    '.sf-j{grid-area:j;font-size:13px;color:var(--muted)}.sf-d{grid-area:d;font-size:12.5px;color:var(--muted);text-align:right;align-self:center;line-height:1.4}.sf-d i{font-style:normal;color:var(--warn,#B23A48);font-weight:700}',
    '.sf-acts{display:flex;gap:8px;margin:0 0 10px}.sf-acts .dz-go{flex:1;margin:0}.sf-acts .sf-2{background:var(--surface,#fff);color:var(--ink);border:1.5px solid var(--line)}',
    '.sf-f{display:grid;grid-template-columns:72px 1fr;gap:8px;align-items:center;margin:0 0 8px;font-weight:700;font-size:14px}',
    '.sf-f input,.sf-f select{min-height:44px;border:1.5px solid var(--line);border-radius:10px;padding:0 10px;font:16px inherit;font-family:inherit;background:var(--surface,#fff);color:var(--ink);width:100%;box-sizing:border-box}',
    '.sf-ta{width:100%;box-sizing:border-box;border:1.5px solid var(--line);border-radius:12px;padding:10px;font:14px/1.5 ui-monospace,monospace;background:var(--surface,#fff);color:var(--ink)}',
    '.sf-pv{max-height:40vh;overflow:auto;border:1px solid var(--line);border-radius:12px;padding:6px 10px;margin:0 0 10px;font-size:13.5px;line-height:1.7}.sf-pv.bad{border-color:#E9B6BE;background:#FDF1F3;color:#8C2333}',
    '.sf-del{color:var(--warn,#B23A48)}'
  ].join('\n');
  document.head.appendChild(css);
  inject();
  window.SupStaff = { _F: function () { return F; }, normDate: normDate, parsePaste: parsePaste, tenure: tenure };
})();

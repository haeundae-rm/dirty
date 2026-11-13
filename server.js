// 자동 생성 (tools/build.mjs) — 정비 지원 Apps Script Code.gs 원본을 휴대폰에서 그대로 실행하기 위한 포장. 직접 고치지 말 것
(function (G) {
G.makeSupServer = function (env) {
  var SpreadsheetApp = env.SpreadsheetApp, Utilities = env.Utilities, LockService = env.LockService, CacheService = env.CacheService,
      PropertiesService = env.PropertiesService, DriveApp = env.DriveApp, HtmlService = env.HtmlService, console = env.console;
/**
 * 정비보조 더티 체크 — 구글 시트 + 앱스 스크립트 웹앱 (최종판 2026-10-22)
 * 시트 구성
 *  - '배정' : 날짜 | 근무자 | 색상 | 메이드 | 정비층 | 더티지원 | 배정객실(쉼표 구분)
 *            근무자 칸이 빈 줄 = 더티 지원 없음 메이드 (웹앱 맨 아래 목록, 정비보조가 필요할 때 가져감)
 *  - '체크' : 시각 | 날짜 | 객실 | 메이드 | 근무자 | 상태(완료/취소) | 비고                ← 웹앱이 자동 기록
 *            근무자 = 실제로 체크한 사람 (실적은 체크한 사람에게). 관리자가 대신 체크하면 근무자 = 담당자, 비고 = '관리자 대신'
 *  - '변경' : 시각 | 날짜 | 종류 | 메이드 | 근무자 | 추가객실 | 더티지원 | 삭제객실 | 이전담당  ← 웹앱이 자동 기록
 *            종류: 가져옴(지원 없음 → 담당, 배정 객실 전체 + 지원 수량) / 수정(지원 수량·객실 추가/삭제)
 *                  되돌림(가져온 메이드를 다시 지원 없음으로) / 넘겨받음(다른 정비보조 담당을 가져옴)
 *                  인원추가(정비보조 추가, 메이드 칸 비움) / 근무종료(정비보조 빠짐, 메이드 칸 비움)
 *            더티지원 칸이 비어 있으면 수량은 그대로. 삭제객실 = 그 메이드 객실에서 뺌 (11/13~ 원래 배정 객실도 뺄 수 있음 — 정비보조가 이미 체크한 객실은 화면에서 못 뺌)
 *            인원추가·근무종료는 그날만 적용 (다음 날은 새 배정 기준)
 * 웹앱은 오늘 날짜 배정을 보여주고, 오늘 배정이 없으면 가장 최근 날짜를 보여줌
 * 자동 반영: 구글 드라이브 '더티 배분' 폴더에 check_rows_MMDD.csv 가 새로 올라오면 (1분마다 확인)
 *            '배정' 탭을 그 내용으로 바꿈 → 붙여넣기 불필요. 같은 파일은 한 번만 반영하므로 이후 '배정' 탭을 직접 고쳐도 유지됨
 *            처음 한 번: 편집기에서 함수 testSync 실행 → 구글 드라이브 접근 허용
 * 휴대폰 이름 고정: 근무자는 처음 한 번 본인 이름을 고르면 본인 화면만 보임. 서버도 '그 사람 담당 객실'만 체크를 받음
 * 관리자 모드: 첫 화면 '관리자로 보기' + ADMIN_PIN → 모든 근무자 화면·관리자 탭, 대신 체크, 인원 추가·근무 종료
 *            비밀번호를 바꾸려면 아래 ADMIN_PIN 만 고치고 새 버전 배포 (기존 관리자 기기는 다시 입력)
 * 시트를 직접 고칠 때: '배정' 탭은 자유롭게 고쳐도 됨. '체크'·'변경' 탭은 지우거나 고치지 말 것 (줄 단위 기록)
 * 출퇴근 (2026-10-24~, 공식 근태 기록)
 *  - '근태' : 시각 | 날짜 | 근무자 | 구분(출근/퇴근/퇴근취소/출근취소/업무) | 업무(더티/기타 업무) | 메모 | 입력(본인/관리자) | 지정시각
 *            시각 = 서버 시각(휴대폰 시계와 무관). 관리자가 대신 넣거나 고친 줄은 지정시각(HH:mm)을 씀. 줄을 지우지 않고 계속 쌓음 → 고친 이력이 남음
 *  - 명단: check_rows 의 '메이드' 칸이 빈 줄 = 기타 업무 인원 (근무자 이름만). 출근 기록이 있는 사람도 그날 명단에 들어감
 *  - 월 출역표: 관리자 화면 '월 출역표 만들기' → 같은 시트에 '출역 YYYY-MM' 탭 생성 (파일 → 다운로드 → 엑셀)
 * 객실 활동판 (2026-10-30): 서버 Activity.gs · 화면 HTML 'ActivityPage' · 출력 HTML 'ActivityPrint' (?p=actprint)
 */
const SHEET_PLAN = '배정';
const SHEET_LOG = '체크';
const SHEET_CHG = '변경';
const TZ = 'Asia/Seoul';
const DRIVE_FOLDER = '더티 배분';   // 구글 드라이브 '내 드라이브' 안의 폴더 이름
const PALETTE = ['#1F5FA8', '#B23A48', '#2E7D4F', '#7D3C98', '#C77C0E', '#117A75', '#5D6D7E', '#9A7D0A'];
const ADMIN_PIN = 'app-firebase';   // 휴대폰판은 4자리 비밀번호를 쓰지 않음 (Firebase 관리자 로그인)   // 관리자 비밀번호 (4자리)
const CHG_HEAD = ['시각', '날짜', '종류', '메이드', '근무자', '추가객실', '더티지원', '삭제객실', '이전담당'];
const SHEET_ATT = '근태';
const ATT_HEAD = ['시각', '날짜', '근무자', '구분', '업무', '메모', '입력', '지정시각'];
const TASKS = ['더티', '기타 업무'];

function doGet(e) {
  // 객실 활동판 출력 페이지(?p=actprint, Activity.gs 2026-10-30 2부) — 해당 없으면 정비 지원 화면 그대로
  try { if (typeof actRoute_ === 'function') { const page = actRoute_(e); if (page) return page; } } catch (err) { console.warn('활동판 페이지 건너뜀: ' + err); }
  const out = HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('정비 지원')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);   // 전용 시작 페이지(GitHub) 안에 넣어 열 수 있게 → 상단 경고 문구 없이
  // 객실 활동판(HTML 파일 이름 'ActivityPage', 2026-10-30 — 스크립트 'Activity'와 같은 이름 불가)은 Index 뒤에 덧붙임 — 파일이 없거나 문제가 있어도 정비 지원 화면은 그대로
  try { out.append(HtmlService.createHtmlOutputFromFile('ActivityPage').getContent()); } catch (e2) { console.warn('활동판 화면 건너뜀: ' + e2); }
  return out;
}

function fmtDate_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  return String(v).trim().replace(/\./g, '-').replace(/\s/g, '');
}
function rooms_(v) {
  return String(v || '').split(/[,\s/]+/).map(s => s.replace(/\.0$/, '').replace(/호$/, '')).filter(s => /^\d{3,4}$/.test(s));
}
function iso_(v) { const d = v instanceof Date ? v : new Date(v); return isNaN(d) ? '' : d.toISOString(); }
function sheet_(name, head) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); }
  return sh;
}
function chgSheet_() {
  const sh = sheet_(SHEET_CHG, CHG_HEAD);
  const head = sh.getRange(1, 1, 1, CHG_HEAD.length).getValues()[0];
  CHG_HEAD.forEach((h, i) => { if (!head[i]) sh.getRange(1, i + 1).setValue(h); });   // 예전 시트에 새 열 제목 추가
  return sh;
}
function cleanName_(v) { return String(v || '').replace(/\s+/g, ' ').trim().slice(0, 20); }

/** 오늘 배정 + 변경 기록을 합쳐 현재 상태를 만듦 */
function state_(wantDate) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_PLAN);
  if (!sh) throw new Error("'배정' 시트가 없습니다.");
  const rows = sh.getDataRange().getValues().slice(1).filter(r => r[0] && (r[3] || r[1]));   // 메이드 칸이 빈 줄 = 기타 업무 인원
  const dates = Array.from(new Set(rows.map(r => fmtDate_(r[0])))).sort();
  // 항상 오늘 날짜만. 오늘 배분이 아직 없으면 '준비 중' — 어제 배분을 오늘 것처럼 보여 주지 않음
  const date = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const att = attOf_(date);
  if (dates.indexOf(date) < 0) {   // 더티 배분 전이어도 출근 체크는 할 수 있게 명단(최근 근무자)과 근태를 같이 보냄
    const d0 = new Date(date + 'T00:00:00+09:00');
    return { date: date, label: (d0.getMonth() + 1) + '월 ' + d0.getDate() + '일 (' + '일월화수목금토'[d0.getDay()] + ')',
             workers: [], pool: [], checks: {}, changes: [], base: { dirty: 0, workers: 0 },
             noPlan: true, lastDate: dates.length ? dates[dates.length - 1] : '', att: att, known: knownNames_(rows) };
  }

  const workers = [], byW = {}, maids = {}, pool = [];
  function worker(name, color) {
    if (!byW[name]) {
      byW[name] = { name: name, color: color || PALETTE[workers.length % PALETTE.length], maids: [], ended: false, added: false };
      workers.push(byW[name]);
    }
    return byW[name];
  }
  function detach(m) {
    if (m.worker && byW[m.worker]) { const l = byW[m.worker].maids, i = l.indexOf(m); if (i >= 0) l.splice(i, 1); }
    else { const i = pool.indexOf(m); if (i >= 0) pool.splice(i, 1); }
  }
  let baseDirty = 0;
  rows.filter(r => fmtDate_(r[0]) === date).forEach(r => {
    if (!String(r[3]).trim()) { const en = cleanName_(r[1]); if (en) worker(en, String(r[2] || '').trim()).etc = true; return; }   // 기타 업무 인원
    const m = { name: String(r[3]).trim(), floors: String(r[4] || '').trim(), dirty: Number(r[5]) || 0,
                rooms: rooms_(r[6]), added: [], taken: false, worker: '', handoffs: [] };
    if (!m.name || maids[m.name]) return;   // 같은 날 같은 이름이 두 번이면 첫 줄만
    maids[m.name] = m;
    const wn = cleanName_(r[1]);
    if (wn) { m.worker = wn; worker(wn, String(r[2] || '').trim()).maids.push(m); baseDirty += m.dirty; }
    else pool.push(m);
  });
  const baseWorkers = workers.filter(w => w.maids.length).length;   // 아침 더티 담당 인원 (기타 업무 인원 제외)
  const planned = workers.length;

  const changes = [];
  const csh = SpreadsheetApp.getActive().getSheetByName(SHEET_CHG);
  if (csh && csh.getLastRow() > 1) {
    csh.getRange(2, 1, csh.getLastRow() - 1, CHG_HEAD.length).getValues().forEach(r => {
      if (fmtDate_(r[1]) !== date) return;
      const kind = String(r[2]).trim(), wn = cleanName_(r[4]), at = iso_(r[0]);
      if (kind === '인원추가') {
        if (!wn) return;
        const w = worker(wn); w.ended = false; if (workers.indexOf(w) >= planned) w.added = true;
        changes.push({ at: at, kind: kind, maid: '', worker: wn });
        return;
      }
      if (kind === '근무종료') {
        if (!wn || !byW[wn]) return;
        byW[wn].ended = true;
        changes.push({ at: at, kind: kind, maid: '', worker: wn });
        return;
      }
      const m = maids[String(r[3]).trim()];
      if (!m) return;
      const add = rooms_(r[5]), dirty = r[6] === '' ? null : (Number(r[6]) || 0);
      const del = rooms_(r[7]).filter(x => m.rooms.indexOf(x) >= 0);
      del.forEach(x => { if (m.added.indexOf(x) >= 0) m.added.splice(m.added.indexOf(x), 1); else (m.cut = m.cut || []).push(x); m.rooms.splice(m.rooms.indexOf(x), 1); });
      add.forEach(x => { if (m.rooms.indexOf(x) < 0) { m.rooms.push(x); m.added.push(x); } });
      let from = '';
      if (kind === '가져옴' && !m.worker) {
        detach(m);
        m.worker = wn; m.taken = true; m.dirty = dirty || 0;   // 배정 객실 전체가 들어오고, 지원 수량은 가져올 때 입력
        const w = worker(wn); w.ended = false; w.maids.push(m);
      } else if (kind === '수정') {
        if (m.worker && dirty !== null) m.dirty = dirty;
      } else if (kind === '되돌림' && m.taken && m.worker) {
        detach(m);
        m.worker = ''; m.taken = false; m.dirty = 0;
        pool.push(m);
      } else if (kind === '넘겨받음' && m.worker && wn && m.worker !== wn) {
        from = m.worker;
        detach(m);
        m.handoffs.push({ from: from, to: wn, at: at });
        m.worker = wn;
        const w = worker(wn); w.ended = false; w.maids.push(m);
      }
      changes.push({ at: at, kind: kind, maid: m.name, worker: wn, from: from || String(r[8] || ''), rooms: add, removed: del, dirty: dirty });
    });
  }
  Object.keys(att).forEach(n => { if (!byW[n] && att[n].in) { const w = worker(n); w.added = true; w.walkin = true; } });   // 명단에 없어도 출근한 사람은 오늘 근무자
  const floorKey = m => Math.min.apply(null, m.rooms.map(Number).concat([99999]));
  pool.sort((a, b) => floorKey(a) - floorKey(b));
  workers.forEach(w => w.maids.sort((a, b) => floorKey(a) - floorKey(b)));
  const d = new Date(date + 'T00:00:00+09:00');
  const label = (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + '일월화수목금토'[d.getDay()] + ')';
  return { date: date, label: label, workers: workers, pool: pool, checks: checksFor_(date), changes: changes,
           base: { dirty: baseDirty, workers: baseWorkers }, att: att, known: knownNames_(rows) };
}

function checksFor_(date) {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_LOG);
  const st = {};
  if (!sh || sh.getLastRow() < 2) return st;
  sh.getRange(2, 1, sh.getLastRow() - 1, 6).getValues().forEach(r => {
    if (fmtDate_(r[1]) !== date) return;
    const room = String(r[2]).replace(/^'/, '').replace(/\.0$/, '');
    if (r[5] === '완료') st[room] = { room: room, maid: String(r[3]), worker: String(r[4]), at: iso_(r[0]) };
    else delete st[room];
  });
  return st;
}

function getData() { trySync_(); return state_(); }
function getState(date) { trySync_(); return state_(date); }
function trySync_() { try { syncPlan_(false); } catch (e) { console.warn('배정 자동 반영 실패: ' + e); } }

/** 처음 설치할 때 편집기에서 한 번 실행 (구글 드라이브 접근 허용 + 지금 바로 반영) */
function testSync() { console.log(syncPlan_(true)); }

/** 드라이브 '더티 배분' 폴더의 가장 최근 check_rows_MMDD.csv 를 '배정' 탭에 반영 */
function syncPlan_(force) {
  const cache = CacheService.getScriptCache();
  if (!force && cache.get('planSync')) return '확인한 지 1분 안 됨';
  cache.put('planSync', '1', 60);
  const it = DriveApp.getFoldersByName(DRIVE_FOLDER);
  if (!it.hasNext()) return "드라이브에 '" + DRIVE_FOLDER + "' 폴더가 없습니다";
  const files = it.next().getFiles();
  let best = null;
  while (files.hasNext()) {
    const f = files.next();
    if (/^check_rows_\d{4}.*\.csv$/i.test(f.getName()) && (!best || f.getLastUpdated() > best.getLastUpdated())) best = f;
  }
  if (!best) return 'check_rows csv 파일이 없습니다';
  const sig = best.getId() + '@' + best.getLastUpdated().getTime();
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('planSig') === sig) return best.getName() + ' 이미 반영됨';
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(15000)) return '다른 저장 중이라 다음에 반영';
  try {
    if (props.getProperty('planSig') === sig) return best.getName() + ' 이미 반영됨';
    const rows = Utilities.parseCsv(best.getBlob().getDataAsString('UTF-8').replace(/^﻿/, ''));
    if (!rows.length || String(rows[0][0]).trim() !== '날짜') throw new Error(best.getName() + ' 첫 줄이 제목(날짜, 근무자 …)이 아닙니다');
    const data = rows.slice(1).filter(r => r[0] && (r[3] || r[1]))   // 메이드 빈 줄 = 기타 업무 인원
      .map(r => [String(r[0]).trim(), r[1] || '', r[2] || '', r[3], r[4] || '', Number(r[5]) || 0, r[6] || '']);
    if (!data.length) throw new Error(best.getName() + ' 에 배정 줄이 없습니다');
    const sh = sheet_(SHEET_PLAN, ['날짜', '근무자', '색상', '메이드', '정비층', '더티지원', '배정객실']);
    if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(7, sh.getLastColumn())).clearContent();
    sh.getRange(2, 1, data.length, 1).setNumberFormat('@');
    sh.getRange(2, 7, data.length, 1).setNumberFormat('@');
    sh.getRange(2, 1, data.length, 7).setValues(data);
    SpreadsheetApp.flush();
    props.setProperty('planSig', sig);
    return best.getName() + ' 반영 완료 (' + data.length + '줄)';
  } finally {
    lock.releaseLock();
  }
}

/** 관리자 비밀번호 확인 → 기기에 저장할 확인값(token) 반환. 비밀번호를 바꾸면 예전 확인값은 자동으로 무효 */
function adminToken_() {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'dust-admin:' + ADMIN_PIN + ':haeundae')
    .map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}
function isAdmin_(token) { return !!token && String(token) === adminToken_(); }
function adminLogin(pin) {
  if (String(pin || '').trim() !== ADMIN_PIN) throw new Error('비밀번호가 맞지 않아요.');
  return adminToken_();
}
function needAdmin_(token) { if (!isAdmin_(token)) throw new Error('관리자 비밀번호가 필요해요. 관리자 모드로 다시 들어와 주세요.'); }

function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function findMaid_(st, name) {
  let m = null;
  st.workers.forEach(w => w.maids.forEach(x => { if (x.name === name) m = x; }));
  st.pool.forEach(x => { if (x.name === name) m = x; });
  return m;
}
function activeWorker_(st, name) { return st.workers.filter(w => w.name === name && !w.ended)[0] || null; }

/**
 * 객실 체크/취소. want: true=완료, false=취소. worker = 체크한 사람
 * 근무자: 지금 본인 담당 메이드의 객실만 가능 (실수로 남의 객실 체크 방지)
 * 관리자(token): 어떤 객실이든 가능, worker = 대신 체크해 준 담당자, 비고 '관리자 대신'
 */
function setCheck(date, room, maid, worker, want, token) {
  return locked_(() => {
    const st = state_(date), r = String(room), admin = isAdmin_(token);
    if (st.date !== date) throw new Error('날짜가 바뀌었어요. 화면을 새로고침해 주세요.');
    if (!admin) {
      const w = activeWorker_(st, cleanName_(worker));
      if (!w) throw new Error('NOTMINE:' + worker + ' 님은 오늘 근무 중인 정비보조가 아니라서 저장하지 않았어요.');
      if (!w.maids.some(m => m.rooms.indexOf(r) >= 0)) throw new Error('NOTMINE:' + r + '호는 지금 ' + w.name + ' 님 담당이 아니라서 저장하지 않았어요. 화면을 최신으로 바꿨어요.');
    }
    if (!!st.checks[r] !== !!want) {
      const sh = sheet_(SHEET_LOG, ['시각', '날짜', '객실', '메이드', '근무자', '상태', '비고']);
      if (admin && !sh.getRange(1, 7).getValue()) sh.getRange(1, 7).setValue('비고');   // 예전 시트에 열 제목 추가
      sh.appendRow([new Date(), date, "'" + r, maid, worker, want ? '완료' : '취소', admin ? '관리자 대신' : '']);
      SpreadsheetApp.flush();
      return state_(date);
    }
    return st;
  });
}
/** 예전 화면 호환용 (같은 객실을 다시 누르면 취소) */
function toggle(date, room, maid, worker) {
  return setCheck(date, room, maid, worker, !checksFor_(date)[String(room)], '');
}

/**
 * 메이드 한 명의 담당 변경. kind: '가져옴' | '수정' | '되돌림'
 * rooms: 추가할 객실(쉼표 구분 문자열), dirty: 더티 지원 수 (되돌림은 무시, 수정에서 비우면 그대로)
 */
function change(date, kind, maid, worker, rooms, dirty, removeRooms) {
  return locked_(() => {
    const st = state_(date);
    if (st.date !== date) throw new Error('날짜가 바뀌었어요. 화면을 새로고침해 주세요.');
    const m = findMaid_(st, maid);
    if (!m) throw new Error(maid + ' 님을 오늘 배정에서 찾지 못했어요.');
    if (['가져옴', '수정', '되돌림'].indexOf(kind) < 0) throw new Error('알 수 없는 변경입니다: ' + kind);
    if (kind === '가져옴' && m.worker) throw new Error(maid + ' 님은 이미 ' + m.worker + ' 님이 담당하고 있어요.');
    if (kind === '가져옴' && !activeWorker_(st, worker)) throw new Error(worker + ' 님은 오늘 근무 중인 정비보조가 아니에요.');
    if (kind === '수정' && !m.worker) throw new Error(maid + ' 님은 아직 담당자가 없어요. 먼저 내 담당으로 가져와 주세요.');
    if (kind === '되돌림' && !m.taken) throw new Error(maid + ' 님은 원래 배정된 담당이라 되돌릴 수 없어요.');
    const add = rooms_(rooms).filter(x => m.rooms.indexOf(x) < 0);
    const del = kind === '수정' ? rooms_(removeRooms).filter(x => m.rooms.indexOf(x) >= 0) : [];
    const ck = checksFor_(date), hit = del.filter(x => ck[x]);
    if (hit.length) throw new Error(hit.join(', ') + '호는 이미 체크한 객실이라 뺄 수 없어요. 먼저 체크를 취소해 주세요.');
    let n = (kind !== '되돌림' && dirty !== null && dirty !== undefined && dirty !== '') ? Math.max(0, Math.min(99, Number(dirty) || 0)) : '';
    if (kind === '수정' && n === m.dirty) n = '';
    if (kind === '가져옴' && !(n >= 1)) throw new Error('지원 수량을 1실 이상 입력해 주세요.');
    if (kind === '수정' && !add.length && !del.length && n === '') throw new Error('바뀐 내용이 없어요.');
    chgSheet_().appendRow([new Date(), date, kind, maid, worker, add.join(', '), n, del.join(', '), kind === '되돌림' ? m.worker : '']);
    SpreadsheetApp.flush();
    return state_(date);
  });
}

/** 정비보조 인원 추가 (그날만) */
function addWorker(date, name, token) {
  needAdmin_(token);
  return locked_(() => {
    const nm = cleanName_(name);
    if (!nm) throw new Error('성함을 입력해 주세요.');
    if (nm === '관리자') throw new Error("'관리자'는 이름으로 쓸 수 없어요.");
    const st = state_(date);
    if (st.date !== date) throw new Error('날짜가 바뀌었어요. 화면을 새로고침해 주세요.');
    if (activeWorker_(st, nm)) throw new Error(nm + ' 님은 이미 근무 중이에요.');
    if (st.workers.filter(w => !w.ended).length >= 12) throw new Error('정비보조는 최대 12명까지 추가할 수 있어요.');
    chgSheet_().appendRow([new Date(), date, '인원추가', '', nm, '', '', '', '']);
    SpreadsheetApp.flush();
    return state_(date);
  });
}

/**
 * 담당 넘기기. moves = [{maid, from, to}]  (근무자 넘겨받기는 1명, 관리자는 여러 명·근무 종료 가능)
 * from 이 지금 담당과 다르면 (그 사이 누가 바꿨으면) 그 줄은 건너뜀 → 결과의 skipped 에 담김
 * endWorker 를 주면: 넘긴 뒤 그 사람 담당이 0명이어야 근무 종료 처리 (아니면 아무것도 안 바꾸고 오류)
 */
function moveMaids(date, moves, endWorker, token) {
  if (endWorker || (moves || []).length > 1) needAdmin_(token);   // 근무 종료·여러 명 나누기는 관리자만 (넘겨받기 1명은 근무자도 가능)
  return locked_(() => {
    const st = state_(date);
    if (st.date !== date) throw new Error('날짜가 바뀌었어요. 화면을 새로고침해 주세요.');
    const ok = [], skipped = [];
    (moves || []).forEach(mv => {
      const m = findMaid_(st, String(mv && mv.maid || ''));
      const to = cleanName_(mv && mv.to);
      if (!m || !m.worker || m.worker !== String(mv.from || '') || !to || to === m.worker || !activeWorker_(st, to)) {
        skipped.push(String(mv && mv.maid || '')); return;
      }
      ok.push({ m: m, from: m.worker, to: to });
    });
    let endW = null;
    if (endWorker) {
      endW = activeWorker_(st, cleanName_(endWorker));
      if (!endW) throw new Error(endWorker + ' 님은 이미 근무 종료되었어요.');
      if (st.workers.filter(w => !w.ended).length <= 1) throw new Error('마지막 한 명은 근무 종료할 수 없어요.');
      const left = endW.maids.filter(m => !ok.some(o => o.m === m));
      if (skipped.length || left.length) throw new Error('그 사이 담당이 바뀌었어요. 화면을 새로고침한 뒤 다시 해 주세요.');
    }
    if (!ok.length && !endW) throw new Error(skipped.length ? '그 사이 담당이 바뀌었어요. 다시 확인해 주세요.' : '넘길 담당이 없어요.');
    const sh = chgSheet_(), now = new Date();
    ok.forEach(o => sh.appendRow([now, date, '넘겨받음', o.m.name, o.to, '', '', '', o.from]));
    if (endW) sh.appendRow([now, date, '근무종료', '', endW.name, '', '', '', '']);
    SpreadsheetApp.flush();
    const res = state_(date);
    res.skipped = skipped;
    return res;
  });
}

// ---------- 출퇴근 · 업무 (2026-10-24, 공식 근태 기록)
function hhmm_(d) { return d instanceof Date ? Utilities.formatDate(d, TZ, 'HH:mm') : ''; }
function attRows_() {
  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET_ATT);
  return sh && sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, ATT_HEAD.length).getValues() : [];
}
/** 근태 줄들 → { 이름: {in, out, task, memo, inBy, outBy, timeline:[{at, task, memo, by}], fixed} }  (아래 줄이 위 줄을 덮음) */
function attReduce_(rows) {
  const out = {};
  rows.forEach(r => {
    const nm = cleanName_(r[2]), kind = String(r[3]).trim(), by = String(r[6] || '').trim();
    if (!nm) return;
    const at = String(r[7] || '').replace(/^'/, '').trim() || hhmm_(r[0]);
    const a = out[nm] = out[nm] || { name: nm, in: '', out: '', task: '', memo: '', inBy: '', outBy: '', timeline: [], fixed: 0 };
    if (by === '관리자') a.fixed++;
    if (kind === '출근') { a.in = at; a.inBy = by; if (String(r[4] || '')) { a.task = String(r[4]); a.memo = String(r[5] || ''); a.timeline.push({ at: at, task: a.task, memo: a.memo, by: by }); } }
    else if (kind === '퇴근') { a.out = at; a.outBy = by; }
    else if (kind === '퇴근취소') { a.out = ''; a.outBy = ''; }
    else if (kind === '출근취소') { a.in = ''; a.out = ''; a.inBy = ''; a.outBy = ''; a.task = ''; a.memo = ''; a.timeline = []; }
    else if (kind === '업무' && String(r[4] || '')) { a.task = String(r[4]); a.memo = String(r[5] || ''); a.timeline.push({ at: at, task: a.task, memo: a.memo, by: by }); }
  });
  return out;
}
function attOf_(date) { return attReduce_(attRows_().filter(r => fmtDate_(r[1]) === date)); }
/** 출근할 때 고를 이름 목록: '배정' 탭(오늘·어제 파일)에 있는 정비보조 + 최근 45일 출근 기록 */
function knownNames_(planRows) {
  const set = {}, since = Utilities.formatDate(new Date(Date.now() - 45 * 864e5), TZ, 'yyyy-MM-dd');
  (planRows || []).forEach(r => { const n = cleanName_(r[1]); if (n) set[n] = 1; });
  attRows_().forEach(r => { const n = cleanName_(r[2]); if (n && fmtDate_(r[1]) >= since && String(r[3]) === '출근') set[n] = 1; });
  return Object.keys(set).filter(n => n !== '관리자').sort();
}
function attSheet_() { return sheet_(SHEET_ATT, ATT_HEAD); }
function okTime_(t) { return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || '')); }
/**
 * 본인 출퇴근·업무. kind: '출근'(task 필수) | '퇴근' | '퇴근취소' | '업무'(task, memo)
 * 이름은 오늘 명단 또는 최근 근무자만 (오타로 공식 기록이 갈라지지 않게). 시각은 서버 시각
 */
function attend(date, name, kind, task, memo) {
  return locked_(() => {
    const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), nm = cleanName_(name);
    if (date !== today) throw new Error('날짜가 바뀌었어요. 화면을 새로고침해 주세요.');
    if (['출근', '퇴근', '퇴근취소', '업무'].indexOf(kind) < 0) throw new Error('알 수 없는 요청이에요: ' + kind);
    const st = state_(date);
    const ok = st.workers.some(w => w.name === nm) || (st.known || []).indexOf(nm) >= 0;
    if (!nm || !ok) throw new Error(nm + ' 님은 정비보조 명단에 없어요. 관리자에게 말씀해 주세요.');
    const a = (st.att || {})[nm] || {};
    const tk = TASKS.indexOf(String(task || '')) >= 0 ? String(task) : '', mm = String(memo || '').replace(/\s+/g, ' ').trim().slice(0, 60);
    if (kind === '출근') { if (a.in) throw new Error('이미 ' + a.in + '에 출근 체크했어요.'); if (!tk) throw new Error('오늘 하는 일을 골라 주세요.'); }
    if (kind !== '출근' && !a.in) throw new Error('먼저 출근 체크를 해 주세요.');
    if (kind === '퇴근' && a.out) throw new Error('이미 ' + a.out + '에 퇴근 체크했어요.');
    if (kind === '퇴근취소' && !a.out) throw new Error('퇴근 기록이 없어요.');
    if (kind === '업무' && !tk) throw new Error('하는 일을 골라 주세요.');
    if (kind === '업무' && a.out) throw new Error('이미 퇴근했어요. 먼저 퇴근을 취소해 주세요.');
    attSheet_().appendRow([new Date(), date, nm, kind, kind === '출근' || kind === '업무' ? tk : '', kind === '출근' || kind === '업무' ? mm : '', '본인', '']);
    SpreadsheetApp.flush();
    return state_(date);
  });
}
/** 관리자: 출근·퇴근 시각 대신 입력/고치기 (HH:mm). outT 를 비우면 퇴근 기록 취소, clear=true 면 그날 출근 기록 취소. 기존 줄은 그대로 두고 새 줄로 덮음 */
function attEdit(date, name, inT, outT, clear, token) {
  needAdmin_(token);
  return locked_(() => {
    const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'), nm = cleanName_(name);
    if (date !== today) throw new Error('날짜가 바뀌었어요. 화면을 새로고침해 주세요.');
    if (!nm || nm === '관리자') throw new Error('이름을 확인해 주세요.');
    const a = attOf_(date)[nm] || {}, sh = attSheet_(), now = new Date(), rows = [];
    if (clear) {
      if (!a.in) throw new Error(nm + ' 님은 오늘 출근 기록이 없어요.');
      rows.push([now, date, nm, '출근취소', '', '', '관리자', '']);
    } else {
      inT = String(inT || '').trim(); outT = String(outT || '').trim();
      if (!okTime_(inT)) throw new Error('출근 시각을 확인해 주세요. (예: 09:00)');
      if (outT && !okTime_(outT)) throw new Error('퇴근 시각을 확인해 주세요. (예: 18:00)');
      if (outT && outT <= inT) throw new Error('퇴근 시각이 출근 시각보다 빨라요.');
      if (inT !== a.in) rows.push([now, date, nm, '출근', '', '', '관리자', "'" + inT]);
      if (outT && outT !== a.out) rows.push([now, date, nm, '퇴근', '', '', '관리자', "'" + outT]);
      if (!outT && a.out) rows.push([now, date, nm, '퇴근취소', '', '', '관리자', '']);
    }
    if (!rows.length) throw new Error('바뀐 내용이 없어요.');
    rows.forEach(r => sh.appendRow(r));
    SpreadsheetApp.flush();
    return state_(date);
  });
}
/** 내 근무: 그 달 날짜별 출근·퇴근·업무 + 더티 실적 (체크 탭에서 내가 완료로 남긴 객실) */
function myMonth(name, ym) {
  const nm = cleanName_(name);
  if (!/^\d{4}-\d{2}$/.test(String(ym || ''))) ym = Utilities.formatDate(new Date(), TZ, 'yyyy-MM');
  const byDate = {};
  attRows_().forEach(r => { const d = fmtDate_(r[1]); if (d.slice(0, 7) === ym && cleanName_(r[2]) === nm) (byDate[d] = byDate[d] || []).push(r); });
  const dirty = {}, lsh = SpreadsheetApp.getActive().getSheetByName(SHEET_LOG);
  if (lsh && lsh.getLastRow() > 1) {
    const last = {};
    lsh.getRange(2, 1, lsh.getLastRow() - 1, 6).getValues().forEach(r => {
      const d = fmtDate_(r[1]); if (d.slice(0, 7) !== ym) return;
      last[d + '|' + String(r[2]).replace(/^'/, '')] = { ok: String(r[5]) === '완료', w: cleanName_(r[4]), d: d };
    });
    Object.keys(last).forEach(k => { const x = last[k]; if (x.ok && x.w === nm) dirty[x.d] = (dirty[x.d] || 0) + 1; });
  }
  const dates = Array.from(new Set(Object.keys(byDate).concat(Object.keys(dirty)))).sort();
  const days = dates.map(d => {
    const a = attReduce_(byDate[d] || [])[nm] || {};
    const tasks = []; (a.timeline || []).forEach(t => { const lab = t.task + (t.memo ? '(' + t.memo + ')' : ''); if (tasks.indexOf(lab) < 0) tasks.push(lab); });
    return { date: d, in: a.in || '', out: a.out || '', tasks: tasks, dirty: dirty[d] || 0, fixed: a.fixed || 0 };
  });
  return { name: nm, ym: ym, days: days, workDays: days.filter(x => x.in).length, dirty: days.reduce((s, x) => s + x.dirty, 0) };
}
/** 관리자: 월 출역표 탭 만들기 ('출역 YYYY-MM'). 칸 = "출근~퇴근", 마지막 열 = 출근일수 */
function monthSheet(ym, token) {
  needAdmin_(token);
  if (!/^\d{4}-\d{2}$/.test(String(ym || ''))) throw new Error('달을 확인해 주세요. (예: 2026-10)');
  const y = Number(ym.slice(0, 4)), mo = Number(ym.slice(5, 7)), nd = new Date(y, mo, 0).getDate();
  const by = {};
  attRows_().forEach(r => { const d = fmtDate_(r[1]); if (d.slice(0, 7) === ym) (by[d] = by[d] || []).push(r); });
  const table = {};
  Object.keys(by).forEach(d => { const a = attReduce_(by[d]); Object.keys(a).forEach(n => { if (a[n].in) (table[n] = table[n] || {})[Number(d.slice(8, 10))] = a[n].in + '~' + (a[n].out || '') + (a[n].fixed ? '*' : ''); }); });
  const names = Object.keys(table).sort();
  const head = ['이름'].concat(Array.from({ length: nd }, (_, i) => (i + 1) + '일')).concat(['출근일수']);
  const out = [head].concat(names.map(n => [n].concat(Array.from({ length: nd }, (_, i) => table[n][i + 1] || '')).concat([Object.keys(table[n]).length])));
  const ss = SpreadsheetApp.getActive(), tn = '출역 ' + ym;
  let sh = ss.getSheetByName(tn);
  if (sh) sh.clear(); else sh = ss.insertSheet(tn);
  sh.getRange(1, 1, out.length, head.length).setValues(out);
  sh.getRange(out.length + 2, 1).setValue('칸 = 출근~퇴근 시각 (퇴근 칸이 비면 퇴근 미기록) · * = 관리자가 입력·수정한 날 · 원본 기록은 \'근태\' 탭');
  SpreadsheetApp.flush();
  return { tab: tn, people: names.length };
}

  return { getData: getData, getState: getState, setCheck: setCheck, toggle: toggle, change: change, addWorker: addWorker, moveMaids: moveMaids, attend: attend, attEdit: attEdit, myMonth: myMonth, state_: state_, adminToken_: adminToken_, isAdmin_: isAdmin_, knownNames_: knownNames_ };
};
})(typeof window !== "undefined" ? window : globalThis);

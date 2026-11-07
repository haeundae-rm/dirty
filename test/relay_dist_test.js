// ⑦ 앱 더티 배분 → 시트 '배정' 탭 중계 시험 (Apps Script 흉내: 배정 시트 · 속성 · Firestore 문서)
const fs = require('fs'), vm = require('vm'), crypto = require('crypto');
let pass = 0, fail = 0; const ok = (c, l) => { if (c) { pass++; console.log('  ✅ ' + l); } else { fail++; console.log('  ❌ ' + l); } };
const TZ = 'Asia/Seoul';
const fmt = (d, f) => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {}); return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second); };
const DAY = fmt(new Date(), 'yyyy-MM-dd'), TOM = fmt(new Date(Date.now() + 864e5), 'yyyy-MM-dd'), YDAY = fmt(new Date(Date.now() - 864e5), 'yyyy-MM-dd');
// 시트: 글자 형식(@)이 아니면 날짜 글자는 Date 로 바뀜 (실제 시트처럼)
function Sheet(name, rows) { this.name = name; this.rows = rows; this.fmt = {}; }
Sheet.prototype.getLastRow = function () { let n = this.rows.length; while (n > 0 && this.rows[n - 1].every(v => v === '' || v == null)) n--; return n; };
Sheet.prototype.getLastColumn = function () { return Math.max(...this.rows.map(r => r.length)); };
Sheet.prototype.getDataRange = function () { const rows = this.rows.slice(0, this.getLastRow()); return { getValues: () => rows.map(r => r.slice()) }; };
Sheet.prototype.getRange = function (r, c, nr, nc) {
  const sh = this; nr = nr || 1; nc = nc || 1;
  return {
    getValues: () => { const o = []; for (let i = 0; i < nr; i++) { const row = sh.rows[r - 1 + i] || []; const x = []; for (let j = 0; j < nc; j++) x.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]); o.push(x); } return o; },
    getValue: function () { return this.getValues()[0][0]; },
    setValue: v => { (sh.rows[r - 1] = sh.rows[r - 1] || [])[c - 1] = v; },
    setValues: vs => { vs.forEach((row, i) => { const R = sh.rows[r - 1 + i] = sh.rows[r - 1 + i] || []; row.forEach((v, j) => { const col = c + j, txt = sh.fmt[(r + i) + ':' + col] === '@'; R[col - 1] = !txt && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(v + 'T00:00:00+09:00') : v; }); }); },
    clearContent: () => { for (let i = 0; i < nr; i++) { const row = sh.rows[r - 1 + i]; if (row) for (let j = 0; j < nc; j++) row[c - 1 + j] = ''; } },
    setNumberFormat: f => { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) sh.fmt[(r + i) + ':' + (c + j)] = f; }
  };
};
const plan = new Sheet('배정', [['날짜', '근무자', '색상', '메이드', '정비층', '더티지원', '배정객실'],
  [new Date(YDAY + 'T00:00:00+09:00'), '호세인', '#1F5FA8', '어제메이드', '4층', 3, '401, 402'],
  [new Date(DAY + 'T00:00:00+09:00'), '옛정비', '#1F5FA8', '옛메이드', '5층', 4, '501, 502']]);
const props = {}, docs = {}, commits = [];
const ctx = {
  console, Date, JSON, Math, Number, String, Array, Object, Set, Error, isNaN, encodeURIComponent, decodeURIComponent,
  SpreadsheetApp: { getActive: () => ({ getSheetByName: n => n === '배정' ? plan : null }), flush: () => {} },
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in props ? props[k] : null), setProperty: (k, v) => { props[k] = String(v); }, deleteProperty: k => { delete props[k]; }, getKeys: () => Object.keys(props) }) },
  CacheService: { getScriptCache: () => ({ get: () => null, put: () => {}, remove: () => {} }) },
  Utilities: { formatDate: (d, tz, f) => fmt(d, f), computeDigest: (a, s) => [...crypto.createHash('md5').update(s, 'utf8').digest()].map(b => b > 127 ? b - 256 : b), DigestAlgorithm: { MD5: 'md5' }, Charset: { UTF_8: 'utf8' } }
};
vm.createContext(ctx);
// Code.gs 에서 쓰는 것만
vm.runInContext(`const TZ='Asia/Seoul'; const SHEET_PLAN='배정';
function fmtDate_(v){ if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd'); return String(v||'').trim().replace(/^'/,''); }
function sheet_(n){ return SpreadsheetApp.getActive().getSheetByName(n); }
function locked_(fn){ return fn(); }`, ctx);
vm.runInContext(fs.readFileSync(__dirname + '/SupFirebase.gs', 'utf8'), ctx);
vm.runInContext(`srGetMany_ = function (paths) { const o = {}; paths.forEach(p => { o[p] = __docs[p] || null; }); return o; };
srCommit_ = function (ws) { __commits.push(...ws); return ws.length; };`, Object.assign(ctx, { __docs: docs, __commits: commits }));
const run = s => vm.runInContext(s, ctx);
const PL = [{ d: DAY, w: '호세인', c: '#1F5FA8', m: '김영희', f: '4층', n: 4, r: '401, 402, 403' }, { d: DAY, w: '', c: '', m: '이순자', f: '5층', n: 0, r: '501' }, { d: DAY, w: '사롤', c: '', m: '', f: '', n: 0, r: '' }];

console.log('⑦ 앱 배정 → 시트');
ok(run('srPlanFromApp_()') === 0, '앱 배정 없으면 아무것도 안 함');
docs['sup/' + DAY] = { date: DAY, plan: PL, sig: 'app:1', src: 'app' };
ok(run('srPlanFromApp_()') === 1, '앱 배정 1건 → 시트');
const rowsOf = d => plan.rows.slice(1).filter(r => r[0] && run('fmtDate_')(r[0]) === d);
ok(rowsOf(DAY).length === 3 && rowsOf(DAY)[0][3] === '김영희' && rowsOf(DAY)[2][1] === '사롤' && rowsOf(DAY)[2][3] === '', '오늘 줄 = 앱 배정 3줄 (기타 업무 줄 포함), 옛 오늘 줄은 지움');
ok(rowsOf(YDAY).length === 1, '다른 날짜(어제) 줄은 그대로');
ok(typeof rowsOf(DAY)[0][0] === 'string' && rowsOf(DAY)[0][6] === '401, 402, 403', '날짜·배정객실은 글자로 (형식 @)');
ok(run('srPlanFromApp_()') === 0, '같은 배정은 한 번만');
commits.length = 0;
ok(run('srPushPlan_(false)') === 0 && run('srPushPlan_(true)') === 0 && !commits.length, '② 시트→앱: 앱에서 온 줄은 다시 덮지 않음 (supCheck 강제 때도)');
console.log('시트에서 직접 고치면 → 그때는 시트가 앱으로');
rowsOf(DAY)[0][5] = 6;
ok(run('srPushPlan_(false)') === 1 && commits.length === 1 && JSON.stringify(commits[0]).includes('"integerValue":"6"') && !JSON.stringify(commits[0]).includes('"src"'), '시트 수정 → 앱 문서로 (src 없는 보통 배정)');
console.log('다시 배분 · 내일 배정');
docs['sup/' + DAY] = { date: DAY, plan: PL.slice(0, 2), sig: 'app:2', src: 'app' };
docs['sup/' + TOM] = { date: TOM, plan: [{ d: TOM, w: '니라기', c: '#1F5FA8', m: '박정숙', f: '6층', n: 8, r: '601, 602' }], sig: 'app:t', src: 'app' };
ok(run('srPlanFromApp_()') === 2, '오늘(다시 배분) + 내일 2건');
ok(rowsOf(DAY).length === 2 && rowsOf(TOM).length === 1 && rowsOf(YDAY).length === 1, '오늘 2줄 · 내일 1줄 · 어제 1줄');
ok(plan.getLastRow() === 1 + 4, '남은 줄 없이 딱 맞게 (옛 줄 지움)');
commits.length = 0;
ok(run('srPushPlan_(true)') === 0, '바로 뒤 ② 강제도 덮지 않음');
console.log('정리');
props['sr_app_2020-01-01'] = 'x'; props['sr_appsig_2020-01-01'] = 'x';
run('srBeat_({ errors: [], pulled: 0, plans: 0, appPlans: 0, mirrored: 0, acts: 0, marks: 0, actIn: 0 }, 10, true, 0)');
ok(!('sr_app_2020-01-01' in props) && !('sr_appsig_2020-01-01' in props) && ('sr_app_' + DAY) in props, '오래된 ⑦ 위치표는 지움, 오늘 것은 남김');
ok(JSON.stringify(commits).includes('appPlans'), '중계 상태에 ⑦ 건수');
console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
process.exit(fail ? 1 : 0);

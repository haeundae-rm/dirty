// 레포트 방 변경 → 정비 지원 자동 반영 시험 (autosup.js + server.js state_) — node test/run_auto.js
const path = require('path');
global.window = undefined;
require(path.join(__dirname, '..', 'server.js'));   // globalThis.makeSupServer
const A = require(path.join(__dirname, '..', 'autosup.js'));
const TZ = 'Asia/Seoul';
const fmt = (d, f) => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {}); return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute).replace('ss', p.second); };
const DAY = fmt(new Date(), 'yyyy-MM-dd');
let pass = 0, fail = 0;
const ok = (c, l) => { if (c) { pass++; console.log('  ✅ ' + l); } else { fail++; console.log('  ❌ ' + l); } };

function world(planRows, meta) {
  const W = { sheets: null, plan: { date: DAY, plan: planRows, meta: meta || { rule: A.DEF_RULE } }, rows: [], rm: [], t0: Date.now() - 3600e3 };
  function Range(rows, r, c, nr, nc) { this.rows = rows; this.r = r; this.c = c; this.nr = nr || 1; this.nc = nc || 1; }
  Range.prototype.getValues = function () { const o = []; for (let i = 0; i < this.nr; i++) { const s = this.rows[this.r - 1 + i] || [], x = []; for (let j = 0; j < this.nc; j++) { const v = s[this.c - 1 + j]; x.push(v == null ? '' : v); } o.push(x); } return o; };
  Range.prototype.getValue = function () { return this.getValues()[0][0]; };
  function Sheet(n) { this.n = n; }
  Sheet.prototype.rows = function () { return W.sheets[this.n]; };
  Sheet.prototype.getLastRow = function () { return this.rows().length; };
  Sheet.prototype.getRange = function (r, c, nr, nc) { return new Range(this.rows(), r, c, nr, nc); };
  Sheet.prototype.getDataRange = function () { const rows = this.rows(); return { getValues: () => rows.map(x => x.slice()) }; };
  const env = {
    SpreadsheetApp: { getActive: () => ({ getSheetByName: n => W.sheets && W.sheets[n] ? new Sheet(n) : null }), flush() {} },
    Utilities: { formatDate: (d, tz, f) => fmt(d instanceof Date ? d : new Date(d), f) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: () => '1', put() {}, remove() {} }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
    DriveApp: {}, HtmlService: {}, console
  };
  const SERVER = globalThis.makeSupServer(env);
  W.state = function (now) {
    const all = W.rows.map(x => ({ id: x.id, tab: x.tab, row: x.row, at: x.at, c: x.at }));
    const ck = {}; all.forEach(x => { if (x.tab === '체크') { if (x.row[5] === '완료') ck[x.row[2]] = 1; else delete ck[x.row[2]]; } });
    const rr = A.rmRows(W.rm, DAY, ck);
    rr.rows.forEach(x => all.push({ id: 'rm:' + x.id, tab: '변경', row: x.row, at: x.at, c: x.at }));
    all.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
    const H = { '배정': [['날짜', '근무자', '색상', '메이드', '정비층', '더티지원', '배정객실']].concat(planRows.map(x => [x.d, x.w, x.c, x.m, x.f, x.n, x.r])),
      '체크': [['h']], '변경': [['h']], '근태': [['h']] };
    all.forEach(x => { const r = x.row.slice(); r[0] = new Date(x.at); while (r.length < 9 && x.tab === '변경') r.push(''); H[x.tab].push(r); });
    W.sheets = H;
    const st = SERVER.state_();
    const res = A.decide(st, { date: DAY, plan: W.plan, touched: rr.touched, now: now || Date.now() });
    return { st, res };
  };
  W.tick = function (now) { const x = W.state(now); x.res.actions.forEach(a => { if (!W.rows.some(r => r.id === a.id)) W.rows.push({ id: a.id, tab: '변경', row: a.row, at: Date.now() - 1000 }); }); return x; };
  let seq = 0;
  W.rmAdd = (kind, maid, room, o, ago) => W.rm.push({ id: 'c' + (++seq), data: Object.assign({ kind, maid, room, at: Date.now() - (ago === undefined ? 60e3 : ago) }, o || {}) });
  W.att = (name, kind, task, ago) => W.rows.push({ id: 'att' + (++seq), tab: '근태', row: [null, DAY, name, kind, task || '', '', '본인', ''], at: Date.now() - (ago || 3000e3) });
  W.check = (room, maid, worker) => W.rows.push({ id: 'ck' + (++seq), tab: '체크', row: [null, DAY, room, maid, worker, '완료', ''], at: Date.now() - 500e3 });
  W.manual = (row, ago) => W.rows.push({ id: 'm' + (++seq), tab: '변경', row: [null, DAY].concat(row), at: Date.now() - (ago === undefined ? 200e3 : ago) });
  W.maid = (st, n) => { let m = null; st.workers.forEach(w => w.maids.forEach(x => { if (x.name === n) m = x; })); st.pool.forEach(x => { if (x.name === n) m = x; }); return m; };
  return W;
}
const R = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => String(a + i)).join(', ');
const PLAN = () => [
  { d: DAY, w: '김정비', c: '#1', m: '메이드A', f: '12F', n: 4, r: R(1201, 1210) },          // 10유닛 → 4
  { d: DAY, w: '박보조', c: '#2', m: '메이드B', f: '14F', n: 6, r: R(1401, 1411) },          // 11 → 6
  { d: DAY, w: '', c: '', m: '메이드D', f: '16F', n: 0, r: R(1601, 1609) },                  // 9 → 0
  { d: DAY, w: '', c: '', m: '메이드E', f: '20F', n: 0, r: R(2001, 2008) },                  // 8 → 0
  { d: DAY, w: '이기타', c: '', m: '', f: '', n: 0, r: '' }
];

console.log('① 방 붙이고 빼기');
{
  const W = world(PLAN());
  W.rmAdd('추가', '메이드A', '1301'); W.rmAdd('제외', '메이드A', '1201');
  W.rmAdd('교환', '메이드A', '1202', { to: '메이드B', toRoom: '1401' });
  const { st } = W.state();
  const a = W.maid(st, '메이드A'), b = W.maid(st, '메이드B');
  ok(a.rooms.includes('1301') && a.added.includes('1301'), '추가한 1301 이 메이드A 에 붙음 (추가 표시)');
  ok(!a.rooms.includes('1201'), '제외한 1201 이 빠짐');
  ok(!a.rooms.includes('1202') && b.rooms.includes('1202'), '교환: 1202 가 메이드B 로');
  ok(a.rooms.includes('1401') && !b.rooms.includes('1401'), '교환: 1401 이 메이드A 로');
  ok(st.changes.some(c => c.from === '레포트'), '변경 목록에 레포트 표시');
}
{
  const W = world(PLAN());
  W.check('1205', '메이드A', '김정비'); W.rmAdd('제외', '메이드A', '1205');
  const { st } = W.state();
  ok(W.maid(st, '메이드A').rooms.includes('1205'), '이미 체크한 객실은 빼지 않음');
}
console.log('② 지원 없음 → 10유닛 → 적은 사람 자동 배정');
{
  const W = world(PLAN());
  W.att('김정비', '출근', '더티'); W.att('박보조', '출근', '더티');
  W.rmAdd('추가', '메이드D', '1610');
  let x = W.state(Date.now() - 50e3);   // 변경 10초 뒤
  ok(!x.res.actions.length && x.res.retry > 0, '30초 기다림');
  x = W.tick();
  ok(x.res.actions.length === 1 && x.res.actions[0].kind === '가져옴' && x.res.actions[0].worker === '김정비' && x.res.actions[0].n === 4, '김정비(4) < 박보조(6) → 김정비에게 4실');
  const y = W.tick(); const d = W.maid(y.st, '메이드D');
  ok(d.worker === '김정비' && d.dirty === 4 && d.rooms.includes('1610'), '정비 지원 화면: 메이드D → 김정비, 더티 4, 1610 포함');
  ok(!y.res.actions.length, '두 번 쓰지 않음');
  ok(y.res.alerts.some(a => a.maid === '메이드D' && a.st === 'auto' && a.w === '김정비'), '관리자 알림: 자동 배정');
  // 방 하나 더 → 11유닛 → 6실
  W.rmAdd('추가', '메이드D', '1611'); const z = W.tick();
  ok(z.res.actions.length === 1 && z.res.actions[0].kind === '수정' && z.res.actions[0].n === 6, '11유닛 → 더티 6실로 수정');
  // 다시 둘 다 빼면 9유닛 → 체크 0 → 풀림
  W.rmAdd('제외', '메이드D', '1611'); W.rmAdd('제외', '메이드D', '1610'); const q = W.tick();
  ok(q.res.actions.length === 1 && q.res.actions[0].kind === '되돌림', '9유닛으로 줄고 체크 0 → 자동 배정 풀기');
  const q2 = W.tick();
  ok(!W.maid(q2.st, '메이드D').worker, '메이드D 다시 지원 없음');
  ok(!q2.res.actions.length, '풀린 뒤 더 안 씀');
}
console.log('③ 동점 · 근무자 없음 · 기타 업무 · 퇴근');
{
  const p = PLAN(); p[1].n = 4; p[1].r = R(1401, 1410);   // 둘 다 4
  const W = world(p); W.att('김정비', '출근', '더티'); W.att('박보조', '출근', '더티');
  W.check('1201', '메이드A', '김정비'); W.check('1202', '메이드A', '김정비');   // 김정비 남은 2, 박보조 남은 4
  W.rmAdd('추가', '메이드E', '2009'); W.rmAdd('추가', '메이드E', '2010');
  const x = W.tick();
  ok(x.res.actions[0] && x.res.actions[0].worker === '김정비', '더티 같으면 남은 더티 적은 김정비');
}
{
  const p = PLAN(); p[1].n = 4; p[1].r = R(1401, 1410);
  const W = world(p); W.att('김정비', '출근', '더티'); W.att('박보조', '출근', '더티');
  W.rmAdd('추가', '메이드D', '1610');   // 16층: 박보조(14층)가 김정비(12층)보다 가까움
  const x = W.tick();
  ok(x.res.actions[0] && x.res.actions[0].worker === '박보조', '남은 것도 같으면 층 가까운 박보조');
}
{
  const W = world(PLAN());   // 출근 기록 없음
  W.rmAdd('추가', '메이드D', '1610');
  const x = W.tick();
  ok(!x.res.actions.length && x.res.alerts.some(a => a.st === 'need' && a.maid === '메이드D' && a.n === 4), '출근한 더티 근무자 없음 → 배정 안 하고 지원 필요 알림');
  W.att('박보조', '출근', '더티', 10e3);
  const y = W.tick();
  ok(y.res.actions[0] && y.res.actions[0].worker === '박보조', '나중에 박보조 출근 → 그때 자동 배정');
}
{
  const W = world(PLAN());
  W.att('김정비', '출근', '기타 업무'); W.att('박보조', '출근', '더티'); W.att('박보조', '퇴근', '', 100e3);
  W.rmAdd('추가', '메이드D', '1610');
  const x = W.tick();
  ok(!x.res.actions.length && x.res.alerts.some(a => a.st === 'need'), '기타 업무 중·퇴근한 분은 대상 아님 → 지원 필요');
}
console.log('④ 사람이 정한 것은 그대로');
{
  const W = world(PLAN()); W.att('김정비', '출근', '더티');
  W.manual(['수정', '메이드A', '김정비', '', 5, '', '']);   // 손으로 5실
  W.rmAdd('추가', '메이드A', '1211'); W.rmAdd('추가', '메이드A', '1212');   // 12유닛 → 기준 8
  const x = W.tick();
  ok(!x.res.actions.length, '손으로 수량 고친 메이드는 수량 그대로');
  ok(W.maid(x.st, '메이드A').rooms.includes('1212'), '방은 붙음');
}
{
  const W = world(PLAN()); W.att('김정비', '출근', '더티');
  W.rmAdd('추가', '메이드A', '1211');   // 원래 지원 중 11유닛 → 6
  const x = W.tick();
  ok(x.res.actions[0] && x.res.actions[0].kind === '수정' && x.res.actions[0].n === 6, '원래 지원 중 메이드: 11유닛 → 6실로 자동 수정');
  W.rmAdd('제외', '메이드A', '1211'); W.rmAdd('제외', '메이드A', '1210');   // 9유닛
  const y = W.tick();
  ok(!y.res.actions.some(a => a.kind === '되돌림') && y.res.alerts.some(a => a.st === 'under' && a.maid === '메이드A'), '원래 배정 메이드가 9유닛 → 풀지 않고 확인 알림');
}
{
  const W = world(PLAN(), { rule: A.DEF_RULE, over: { '메이드D': 0 } }); W.att('김정비', '출근', '더티');
  W.rmAdd('추가', '메이드D', '1610');
  ok(!W.tick().res.actions.length, '아침 배분에서 예외 수량 둔 메이드는 건드리지 않음');
}
{
  const W = world(PLAN()); W.att('김정비', '출근', '더티');
  W.rmAdd('추가', '메이드D', '1610'); W.tick();
  W.manual(['되돌림', '메이드D', '김정비', '', '', '', '김정비'], 500);   // 사람이 되돌림
  W.rmAdd('추가', '메이드D', '1611'); const x = W.tick();
  ok(!x.res.actions.length, '사람이 되돌린 메이드는 다시 자동 배정 안 함');
}
{
  const W = world(PLAN()); W.att('김정비', '출근', '더티');
  W.rmAdd('추가', '메이드E', '3001');   // 8 + 로얄 2 = 10
  const x = W.tick();
  ok(x.res.actions[0] && x.res.actions[0].n === 4, '로얄은 2유닛 (8+2=10 → 4실)');
}
{
  const W = world(PLAN(), { rule: A.DEF_RULE, units: { '메이드D': 9.5 } }); W.att('김정비', '출근', '더티');
  W.rmAdd('추가', '메이드D', '1610');   // 9.5 + 1 = 10.5
  const x = W.tick();
  ok(x.res.actions[0] && x.res.actions[0].n === 4 && x.res.alerts[0].unit === 10.5, '아침 유닛(meta.units) 기준으로 더함');
}
{
  const W = world(PLAN()); W.att('김정비', '출근', '더티');
  const x = W.tick();
  ok(!x.res.actions.length && !x.res.alerts.length, '레포트 변경 없으면 아무것도 안 함');
}
console.log(`\n${pass} 통과 / ${fail} 실패`);
process.exit(fail ? 1 : 0);

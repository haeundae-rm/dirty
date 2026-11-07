// 정비 지원 Firebase 판 화면 시험 — 휴대폰 여러 대(Playwright) + 메모리 Firestore(규칙 v5 정비 지원 부분)
// 1부(더티 체크·출퇴근) 시험 그대로 + ⑬ 객실 활동판(2부: 휴대폰 안 계산 · acts 문서)
// NODE_PATH=/opt/node22/lib/node_modules node test/run.js [앱 폴더]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { make } = require('./fakedb');
const APP = process.argv[2] || path.join(__dirname, '..', 'out', 'app');
const ROOT = '/home/claude/dirty';
const BASE = 'https://haeundae-rm.github.io/dirty/app/';
const API = 'https://script.google.com/macros/s/AKfycbyPvhvScAcDfGqyxdK9pvr8vtewfjAkHsbRBiN04GCNbzE4HL_zZHODWPPb4xUHQb0LCw/exec';
const fmt = (d, f) => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {}); return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute); };
const DAY = fmt(new Date(), 'yyyy-MM-dd'), YDAY = fmt(new Date(Date.now() - 864e5), 'yyyy-MM-dd');
let pass = 0, fail = 0;
function ok(c, label) { if (c) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ ' + label); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms, label) { const t = Date.now(); while (Date.now() - t < (ms || 4000)) { try { if (await fn()) return true; } catch (e) {} await sleep(100); } if (label) console.log('     (기다림 끝: ' + label + ')'); return false; }

const PLAN = [
  { d: DAY, w: '김정비', c: '#1F5FA8', m: '메이드A', f: '12-13F', n: 3, r: '1201, 1202, 1203, 1301' },
  { d: DAY, w: '김정비', c: '#1F5FA8', m: '메이드B', f: '14F', n: 2, r: '1401, 1402, 1403' },
  { d: DAY, w: '박보조', c: '#B23A48', m: '메이드C', f: '15F', n: 2, r: '1501, 1502, 1503' },
  { d: DAY, w: '', c: '', m: '메이드D', f: '16F', n: 0, r: '1601, 1602' },
  { d: DAY, w: '이기타', c: '#2E7D4F', m: '', f: '', n: 0, r: '' }
];
const apiCalls = [];

async function phone(browser, db, name, opts) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  await ctx.exposeBinding('__db', (src, op, a) => db.handle(src.page, op, a));
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(API)) {
      const q = JSON.parse(route.request().postData() || '{}'); apiCalls.push(q);
      let data;
      if (q.fn === 'myMonth') data = { name: q.args[0], ym: DAY.slice(0, 7), days: [{ date: YDAY, in: '09:00', out: '18:00', tasks: ['더티'], dirty: 3, fixed: 0 }, { date: DAY, in: '', out: '', tasks: [], dirty: 0, fixed: 0 }], workDays: 1, dirty: 3 };
      else data = null;
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(data ? { ok: true, data } : { ok: false, error: '시험에 없는 요청' }) });
    }
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (u.startsWith('https://haeundae-rm.github.io/dirty/')) {
      let rel = u.slice('https://haeundae-rm.github.io/dirty/'.length).split('?')[0];
      let file;
      if (rel.startsWith('app/')) { rel = rel.slice(4) || 'index.html'; file = rel === 'store.js' ? path.join(__dirname, 'fake_store.js') : path.join(APP, rel); if (rel === 'version.json' && opts && opts.ver) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ v: opts.ver }) }); }
      else file = path.join(ROOT, rel || 'index.html');
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
      const ct = /\.js$/.test(file) ? 'application/javascript' : /\.html$/.test(file) ? 'text/html' : /\.json$/.test(file) ? 'application/json' : /\.png$/.test(file) ? 'image/png' : /\.css$/.test(file) ? 'text/css' : 'text/plain';
      return route.fulfill({ status: 200, contentType: ct + (ct.startsWith('image') ? '' : '; charset=utf-8'), body: fs.readFileSync(file) });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  watch(page);
  await page.goto(BASE);
  page.label = name; page.ctx = ctx;
  return page;
}
function watch(page) {
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load/.test(m.text())) page.errors.push('console: ' + m.text()); });
}
const rows = (db, f) => [...db.docs.entries()].filter(([p]) => p.startsWith('sup/' + DAY + '/rows/')).map(([p, d]) => Object.assign({ id: p.split('/').pop() }, d)).filter(f || (() => true));
const mark = (db, id, r) => db.docs.get('acts/' + id + '/marks/' + r);
const txt = (page, sel) => page.locator(sel).first().innerText().catch(() => '');
const openSec = async (p, sec, sel) => until(async () => { await p.evaluate(s => { const d = document.querySelector('details[data-sec="' + s + '"]'); if (d) d.open = true; }, sec); await p.click(sel, { timeout: 700 }); return true; }, 8000);

(async () => {
  const browser = await chromium.launch();
  const db = make();
  await db.serverWrite('sup/' + DAY, { date: DAY, plan: PLAN, sig: 'x' });
  await db.serverWrite('sup_meta/names', { names: ['김정비', '박보조', '이기타', '최예전'], lastDate: DAY, day: DAY });
  await db.serverWrite('sup_meta/relay', { ok: true, err: '', ver: 't', at: { __ts: Date.now() } });
  await db.serverWrite('acts/A1', { name: '이불장 점검', color: '민트', start: YDAY, due: '', exclText: '29-31층', memo: '안쪽까지', status: '진행', made: { __ts: Date.now() - 864e5 }, ended: null, uid: db.BOT, at: { __ts: Date.now() - 864e5 } });
  await db.serverWrite('acts/A1/marks/1201', { s: '완료', m: '', w: '박보조', by: '본인', at: { __ts: Date.now() - 864e5 }, clientAt: { __ts: Date.now() - 864e5 }, uid: db.BOT });

  console.log('① 근무자 휴대폰 열기 · 이름 고르기 · 출근');
  const pA = await phone(browser, db, 'A');
  ok(await until(async () => (await pA.locator('[data-pick]').count()) >= 4), '이름 고르기 화면 (오늘 명단 + 최근 근무자)');
  ok(await pA.locator('[data-pick="최예전"]').count() === 1, '최근 근무자(오늘 명단 밖)도 이름 목록에 있음');
  await pA.click('[data-pick="김정비"]');
  ok(await until(async () => /남은 더티/.test(await txt(pA, '.sum'))), '김정비 화면: 남은 더티 요약');
  ok((await txt(pA, '.sum')).includes('5'), '남은 더티 5실 (메이드A 3 + 메이드B 2)');
  await pA.click('[data-att="in"]');
  await pA.click('.panel [data-do]');
  ok(await until(async () => /출근/.test(await txt(pA, '.att'))  && (await pA.locator('.att.on').count()) === 1), '출근 카드가 바로 바뀜');
  ok(await until(() => rows(db, r => r.tab === '근태').length === 1), 'Firestore 에 근태 줄 1개');
  const a1 = rows(db, r => r.tab === '근태')[0];
  ok(a1 && a1.row[2] === '김정비' && a1.row[3] === '출근' && a1.row[4] === '더티' && a1.by === '본인' && a1.row[0] === null && '__ts' in a1.at, '근태 줄 내용 (이름·출근·더티·본인·서버 시각)');

  console.log('② 더티 체크: 누르면 바로 표시 → 서버');
  await pA.click('.room[data-r="1201"]');
  ok(await pA.locator('.room.on[data-r="1201"]').count() === 1, '1201 바로 체크 표시');
  ok(await until(() => rows(db, r => r.tab === '체크').length === 1), 'Firestore 에 체크 줄');
  const c1 = rows(db, r => r.tab === '체크')[0];
  ok(c1 && c1.row[2] === "'1201" && c1.row[3] === '메이드A' && c1.row[4] === '김정비' && c1.row[5] === '완료' && c1.row[6] === '', '체크 줄 = 시트 한 줄 그대로');
  ok(/실시간 연결됨/.test(await txt(pA, '#sync')) || /저장/.test(await txt(pA, '#sync')), '동기화 줄: 실시간 연결 상태');
  await pA.click('.room[data-r="1201"]');
  ok(await until(async () => (await pA.locator('.room.on[data-r="1201"]').count()) === 0), '다시 누르면 취소');
  ok(await until(() => rows(db, r => r.tab === '체크' && r.row[5] === '취소').length === 1), '취소 줄도 쌓임');
  await pA.click('.room[data-r="1201"]');
  await until(() => rows(db, r => r.tab === '체크').length === 3);

  console.log('③ 관리자 로그인 (소장 계정)');
  const pM = await phone(browser, db, '관리자');
  await until(async () => (await pM.locator('[data-admin-in]').count()) === 1);
  await pM.click('[data-admin-in]');
  await pM.click('[data-who="소장"]');
  await pM.fill('#pin', 'wrong');
  await pM.click('.panel [data-do]');
  ok(await until(async () => /비밀번호가 맞지 않아요/.test(await txt(pM, '.panel'))), '틀린 비밀번호 → 안내');
  await pM.fill('#pin', db.PW);
  await pM.click('.panel [data-do]');
  ok(await until(async () => /진행 현황/.test(await txt(pM, '#main'))), '관리자 화면');
  ok(/남은 더티 6실/.test(await txt(pM, '.kpi')), 'KPI 남은 더티 6실 (7 - 1201)');
  ok(await until(async () => /시트 중계 (방금|\d+분 전) · 정상/.test(await txt(pM, '.greet'))), '관리자 화면에 시트 중계 상태');
  ok(/1201/.test(await txt(pM, '#main')), '최근 체크에 1201');
  ok(await pM.locator('[data-dist]').count() === 1, '관리자 화면에 더티 배분 버튼 (새)');

  console.log('④ 실시간: 근무자 체크가 관리자 화면에 바로');
  await pA.click('.room[data-r="1202"]');
  ok(await until(async () => /남은 더티 5실/.test(await txt(pM, '.kpi')), 4000), '관리자 KPI 가 새로고침 없이 5실로');

  console.log('⑤ 다른 근무자: 넘겨받기');
  const pB = await phone(browser, db, 'B');
  await until(async () => (await pB.locator('[data-pick="박보조"]').count()) === 1);
  await pB.click('[data-pick="박보조"]');
  await until(async () => (await pB.locator('[data-hand="메이드B"]').count()) === 1);
  await openSec(pB, 'others', '[data-hand="메이드B"]');
  await pB.click('.panel [data-do]');
  ok(await until(async () => (await pB.locator('.maid .nm', { hasText: '메이드B' }).count()) === 1), '박보조 화면에 메이드B 카드');
  ok(await until(() => rows(db, r => r.tab === '변경' && r.row[2] === '넘겨받음').length === 1), 'Firestore 넘겨받음 줄 (근무자 1명 넘겨받기 허용)');
  ok(await until(async () => (await pA.locator('.maid .nm', { hasText: '메이드B' }).count()) === 0 && /넘겨준 담당/.test(await txt(pA, '#main'))), '김정비 화면에서 메이드B 가 빠지고 인계 안내');

  console.log('⑥ 지원 없음 메이드 가져오기');
  await openSec(pA, 'pool', '[data-take="메이드D"]');
  await pA.fill('#qty', '1');
  await pA.click('.panel [data-do]');
  ok(await until(async () => (await pA.locator('.maid .nm', { hasText: '메이드D' }).count()) === 1), '메이드D 카드');
  const g = rows(db, r => r.tab === '변경' && r.row[2] === '가져옴')[0];
  ok(g && g.row[6] === 1 && g.row[3] === '메이드D', '가져옴 줄: 지원 수량 1 (숫자)');

  console.log('⑦ 오프라인: 휴대폰에 보관 → 연결되면 저장');
  await pA.evaluate(() => window.__fake.down(true));
  await pA.click('.room[data-r="1203"]');
  ok(await pA.evaluate(() => !!checks['1203']), '끊겨도 바로 체크');
  ok(await until(async () => /휴대폰에 보관|연결이 끊겼/.test(await txt(pA, '#sync')), 10000), '동기화 줄: 휴대폰에 보관 안내');
  ok(!rows(db, r => r.tab === '체크' && r.row[2] === "'1203").length, '서버에는 아직 없음');
  await pA.evaluate(() => window.__fake.down(false));
  ok(await until(() => rows(db, r => r.tab === '체크' && r.row[2] === "'1203").length === 1), '다시 연결되자 서버에 저장');
  ok(await until(async () => /실시간 연결됨/.test(await txt(pA, '#sync')), 9000), '동기화 줄 정상으로');

  console.log('⑧ 앱을 닫았다 열기 (보관 중 기록 포함)');
  await pA.evaluate(() => window.__fake.down(true));
  await pA.click('[data-fold="메이드A"]');
  await pA.click('.room[data-r="1301"]');
  await sleep(300);
  await pA.reload();
  ok(await until(async () => /남은 더티/.test(await txt(pA, '.sum'))), '다시 열면 이름 다시 안 고르고 내 화면');
  ok(await until(() => rows(db, r => r.tab === '체크' && r.row[2] === "'1301").length === 1, 5000), '닫기 전 보관된 1301 이 다시 열 때 저장됨');

  console.log('⑨ 위조 막기: 근무자 휴대폰에서 관리자 일');
  await pA.evaluate(() => { adminTok = SupShim._server.adminToken_(); google.script.run.withFailureHandler(function(){}).addWorker(plan.date, '가짜인원', adminTok); });
  ok(await until(() => db.log.rejects.some(r => r.data && r.data.row && r.data.row[2] === '인원추가'), 4000), '근무자의 인원추가 줄 → 규칙이 거절');
  ok(await until(async () => /저장이 거절됐어요/.test(await txt(pA, '#sync'))), '거절되면 안내 띠');
  ok(!rows(db, r => r.row[4] === '가짜인원').length, '서버에 가짜 인원 없음');
  await pA.evaluate(() => { adminTok = null; });
  const forged = await pA.evaluate(async (day) => {
    const S = SupShim._S, st = S.store;
    const w = st.add('sup/' + day + '/rows', { tab: '체크', row: [null, day, "'1501", '메이드C', '박보조', '완료', '관리자 대신'], at: st.SERVER_TIME, clientAt: new Date(), uid: S.user.uid, by: '본인' });
    try { await w.done; return 'ok'; } catch (e) { return 'rejected'; }
  }, DAY);
  ok(forged === 'rejected', "'관리자 대신' 줄을 근무자가 직접 쓰면 거절");

  console.log('⑩ 관리자: 대신 체크 · 인원 추가 · 출퇴근 대신 입력');
  await pM.click('.tab[data-t="박보조"]');
  await pM.click('.room[data-r="1501"]');
  await pM.click('.panel [data-do]');
  ok(await until(() => rows(db, r => r.tab === '체크' && r.row[2] === "'1501").length === 1), '대신 체크 줄 저장');
  const px = rows(db, r => r.tab === '체크' && r.row[2] === "'1501")[0];
  ok(px && px.row[6] === '관리자 대신' && px.by === '관리자' && px.row[4] === '박보조', "비고 '관리자 대신', 실적은 박보조");
  ok(await until(async () => (await pB.locator('.room.on[data-r="1501"]').count()) === 1), '박보조 화면에도 바로 표시');
  await pM.click('.tab[data-t="관리자"]');
  await pM.click('[data-addw]');
  await pM.fill('#wname', '정새로');
  await pM.click('.panel [data-do]');
  ok(await until(() => rows(db, r => r.tab === '변경' && r.row[2] === '인원추가' && r.row[4] === '정새로').length === 1), '관리자 인원추가 저장');
  ok(await until(async () => (await pM.locator('.tab[data-t="정새로"]').count()) === 1), '관리자 탭에 정새로');
  if (await pM.locator('.panel').count()) await pM.click('.panel [data-x="1"]');
  await until(async () => (await pM.locator('[data-attedit="박보조"]').count()) === 1);
  await pM.click('[data-attedit="박보조"]');
  await pM.fill('#tin', '09:05');
  await pM.click('.panel [data-do]');
  ok(await until(() => rows(db, r => r.tab === '근태' && r.row[2] === '박보조' && r.row[6] === '관리자' && r.row[7] === "'09:05").length === 1), "관리자 출근 대신 입력 (지정시각 '09:05)");
  ok(await until(async () => /09:05/.test(await txt(pB, '.att'))), '박보조 화면 출근 09:05');

  console.log('⑪ 퇴근 · 내 근무 (서버 한 달 + 오늘은 휴대폰 계산)');
  await pA.evaluate(() => window.__fake.down(false));
  await pA.click('[data-att="out"]');
  await pA.click('.panel [data-do]');
  ok(await until(async () => (await pA.locator('.att.off').count()) === 1), '퇴근 카드');
  ok(await until(() => rows(db, r => r.tab === '근태' && r.row[2] === '김정비' && r.row[3] === '퇴근').length === 1), '퇴근 줄');
  await pA.click('[data-mywork]');
  ok(await until(async () => /출근일/.test(await txt(pA, '.panel'))), '내 근무 창');
  const mw = await txt(pA, '.panel');
  ok(/2\s*출근일/.test(mw.replace(/\n/g, ' ')), '출근일 2 (어제 서버 + 오늘 휴대폰)');
  const call0 = apiCalls.filter(c => c.fn === 'myMonth')[0];
  ok(call0 && /^fake-token-anon-/.test(call0.idToken) && call0.args[0] === '김정비', 'Apps Script 에 로그인 표와 함께 물어봄');
  await pA.click('.panel [data-x="1"]');

  console.log('⑫ 중계가 옮긴 시트 기록(봇)도 화면에');
  await db.serverWrite('sup/' + DAY + '/rows/gs_체크_99', { tab: '체크', row: [null, DAY, "'1503", '메이드C', '박보조', '완료', ''], at: { __ts: Date.now() - 60000 }, clientAt: { __ts: Date.now() - 60000 }, uid: db.BOT, by: '관리자' });
  ok(await until(() => pB.evaluate(() => !!checks['1503'] && checks['1503'].worker === '박보조')), '시트에서 온 1503 체크가 박보조 화면에');

  console.log('⑫-2 시트에서 온 배정(src 없음)이면 그 전 담당 변경도 그대로 (예전 방식)');
  await db.serverWrite('sup/' + DAY, { date: DAY, plan: PLAN, sig: 'y' });
  ok(await until(() => pB.evaluate(() => { const m = findMaid('메이드B'); return m && m.worker === '박보조'; })), '중계가 같은 배정을 다시 써도 넘겨받음 유지');

  console.log('⑬ 객실 활동판 (2부: 휴대폰 안 계산 · acts 문서)');
  const apiBefore = apiCalls.length;
  await pA.click('[data-ac="open"]');
  ok(await until(async () => /이불장 점검/.test(await txt(pA, '.ac'))), '활동판 열림 (진행 중 1개 → 바로 도면)');
  ok(/처리 1/.test((await txt(pA, '.ac-sum')).replace(/\s+/g, ' ')) && /397/.test(await txt(pA, '.ac-sum')), '어제 체크 1 · 대상 397실 (29-31층 20실 제외)');
  await pA.click('.ac-row[data-v="12"]');
  ok(await until(async () => /12층/.test(await txt(pA, '.ac-fh'))), '전체 도면 줄을 누르면 12층');
  ok(await pA.locator('.ac-t.d[data-r="1201"]').count() === 1, '1201 은 이미 완료 (박보조)');
  await pA.click('.ac-t[data-r="1202"]');
  ok(await pA.locator('.ac-t.d[data-r="1202"]').count() === 1, '1202 누르자마자 완료 표시');
  ok(await until(() => { const m = mark(db, 'A1', '1202'); return m && m.s === '완료' && m.w === '김정비' && m.by === '본인' && m.m === '' && '__ts' in m.at; }), 'Firestore acts/A1/marks/1202 = 완료 · 김정비 · 본인 · 서버 시각');
  ok(apiCalls.length === apiBefore, '활동판은 Apps Script 에 묻지 않음 (휴대폰 안 계산)');
  await pM.click('.tab[data-t="관리자"]');
  await pM.click('.amode [data-ac="open"]');
  ok(await until(async () => /처리 2 \/ 397실/.test((await txt(pM, '.ac')).replace(/\s+/g, ' '))), '관리자 목록: 처리 2 / 397실');
  await pM.click('[data-ac="act"][data-id="A1"]');
  ok(await until(async () => /현황 상세/.test(await txt(pM, '.ac'))), '관리자 도면 + 현황 상세');
  ok(await pM.locator('a.ac-print[href="print.html?id=A1"]').count() === 1, "'도면 출력' 링크 = print.html?id=A1");
  await pA.click('.ac-t[data-r="1203"]');
  ok(await until(async () => /처리 3/.test((await txt(pM, '.ac-sum')).replace(/\s+/g, ' ')), 6000), '근무자 체크가 관리자 도면 숫자에 몇 초 안에 (처리 3)');
  await pA.click('[data-ac="mode"][data-v="issue"]');
  await pA.click('.ac-t[data-r="1204"]');
  await pA.click('[data-ac="memo"][data-v="얼룩"]');
  await pA.click('[data-ac="issave"]');
  ok(await pA.locator('.ac-t.i[data-r="1204"]').count() === 1, '1204 이상 표시 (바로)');
  ok(await until(() => { const m = mark(db, 'A1', '1204'); return m && m.s === '이상' && m.m === '얼룩'; }), 'Firestore 1204 = 이상 · 얼룩');
  await pA.click('[data-ac="mode"][data-v="done"]');
  await pA.click('.ac-t[data-r="1202"]');
  ok(await pA.locator('.ac-t.d[data-r="1202"]').count() === 0, '1202 다시 누르면 취소 (바로)');
  ok(await until(() => { const m = mark(db, 'A1', '1202'); return m && m.s === '취소'; }), "Firestore 1202 = '취소' (지우지 않고 남김 → 시트에 취소 줄)");
  await pA.evaluate(() => window.__fake.down(true));
  await pA.click('.ac-t[data-r="1205"]');
  ok(await pA.locator('.ac-t.d[data-r="1205"]').count() === 1, '끊겨도 1205 바로 완료');
  await sleep(300);
  ok(!mark(db, 'A1', '1205'), '서버에는 아직 없음');
  await pA.evaluate(() => window.__fake.down(false));
  ok(await until(() => { const m = mark(db, 'A1', '1205'); return m && m.s === '완료'; }), '다시 연결되자 1205 저장');
  await pM.click('.ac-row[data-v="4"]');
  await pM.click('.ac-t[data-r="401"]');
  ok(await until(() => { const m = mark(db, 'A1', '401'); return m && m.s === '완료' && m.w === '관리자' && m.by === '관리자 대신'; }), "관리자 체크 = 근무자 '관리자' · '관리자 대신'");
  const fz = await pA.evaluate(async () => {
    const S = SupShim._S, st = S.store, out = {};
    const tryW = async (p, d) => { try { await st.set(p, d); return 'ok'; } catch (e) { return 'rejected'; } };
    out.act = await tryW('acts/A1', { name: '가짜', status: '보관' });
    out.proxy = await tryW('acts/A1/marks/1206', { s: '완료', m: '', w: '김정비', by: '관리자 대신', at: st.SERVER_TIME, clientAt: new Date(), uid: S.user.uid });
    out.adminName = await tryW('acts/A1/marks/1206', { s: '완료', m: '', w: '관리자', by: '본인', at: st.SERVER_TIME, clientAt: new Date(), uid: S.user.uid });
    out.memo = await tryW('acts/A1/marks/1206', { s: '완료', m: '메모', w: '김정비', by: '본인', at: st.SERVER_TIME, clientAt: new Date(), uid: S.user.uid });
    out.good = await tryW('acts/A1/marks/1206', { s: '완료', m: '', w: '김정비', by: '본인', at: st.SERVER_TIME, clientAt: new Date(), uid: S.user.uid });
    return out;
  });
  ok(fz.act === 'rejected' && fz.proxy === 'rejected' && fz.adminName === 'rejected' && fz.memo === 'rejected' && fz.good === 'ok', '근무자: 활동 문서·관리자 대신·관리자 이름·완료 메모 → 거절, 정상 체크만 됨 ' + JSON.stringify(fz));
  await pM.click('.ac-top [data-ac="list"]');
  await until(async () => (await pM.locator('[data-ac="new"]').count()) === 1);
  await pM.click('[data-ac="new"]');
  await pM.fill('#ac-name', '난간 쿠션');
  await pM.click('[data-ac="color"][data-v="주황"]');
  await pM.fill('#ac-excl', '9999');
  await pM.click('[data-ac="save"]');
  ok(await until(async () => /제외 객실을 확인해 주세요: 9999/.test(await txt(pM, '.ac'))), '잘못된 제외 객실 → 같은 안내 문구');
  await pM.fill('#ac-excl', '4층');
  await pM.click('[data-ac="save"]');
  const NEWID = 'A' + DAY.slice(2).replace(/-/g, '') + '-1';
  ok(await until(() => { const d = db.docs.get('acts/' + NEWID); return d && d.name === '난간 쿠션' && d.color === '주황' && d.status === '진행' && d.exclText === '4층' && d.start === DAY; }), '새 활동 문서 ' + NEWID + ' (주황 · 4층 제외 · 오늘 시작)');
  ok(await until(async () => /난간 쿠션/.test(await txt(pM, '.ac')) && /처리 0 \/ 408실/.test((await txt(pM, '.ac')).replace(/\s+/g, ' '))), '관리자 목록에 난간 쿠션 (대상 408실)');
  await pA.click('.ac-top [data-x="1"]');
  await pA.click('[data-ac="open"]');
  ok(await until(async () => (await pA.locator('[data-ac="act"]').count()) === 2), '근무자: 진행 중 2개 → 목록에서 고르기');
  await pM.click('[data-ac="st"][data-k="끝내기"][data-id="' + NEWID + '"]');
  await pM.click('[data-ac="st"][data-k="끝내기"][data-id="' + NEWID + '"]');
  ok(await until(() => { const d = db.docs.get('acts/' + NEWID); return d && d.status === '끝남' && d.ended && '__ts' in d.ended; }), '두 번 눌러 끝내기 → 문서 상태 끝남');
  ok(await until(async () => (await pA.locator('[data-ac="act"]').count()) === 1 || /이불장/.test(await txt(pA, '.ac'))), '근무자 목록에서 끝난 활동은 빠짐 (다시 열 때)');
  const late = await pA.evaluate(async (id) => { const S = SupShim._S, st = S.store; try { await st.set('acts/' + id + '/marks/1201', { s: '완료', m: '', w: '김정비', by: '본인', at: st.SERVER_TIME, clientAt: new Date(), uid: S.user.uid }); return 'ok'; } catch (e) { return 'rejected'; } }, NEWID);
  ok(late === 'rejected', '끝난 활동에 체크 쓰기 → 규칙이 거절');
  const pr = await pM.ctx.newPage(); watch(pr); pr.label = '출력';
  await pr.goto(BASE + 'print.html?id=A1');
  ok(await until(() => pr.evaluate(() => !!window.__printed), 15000), '출력 페이지: A4 도면 그림 완성');
  const pd = await pr.evaluate(() => D && { name: D.name, proc: D.stats.proc, issue: D.stats.issue, target: D.stats.target, m1204: D.marks['1204'] && D.marks['1204'].memo });
  ok(pd && pd.name === '이불장 점검' && pd.proc === 6 && pd.issue === 1 && pd.target === 397 && pd.m1204 === '얼룩', '출력 숫자 = 앱과 같음 (처리 6 · 이상 1 · 대상 397) ' + JSON.stringify(pd));
  ok((await pr.locator('#bprint:not([disabled])').count()) === 1 && (await pr.locator('#bpng:not([disabled])').count()) === 1, '인쇄 · PNG 버튼 켜짐');
  const pr2 = await pM.ctx.newPage(); watch(pr2); pr2.label = '출력2';
  await pr2.goto(BASE + 'print.html?id=A999');
  ok(await until(async () => /활동을 찾지 못했어요/.test(await txt(pr2, '#wrap'))), '없는 활동 → 안내');
  await pA.click('.ac-top [data-x="1"]');
  await pM.click('.ac-top [data-x="1"]');

  console.log('⑭ 배분 전(오늘 배정 없음)에도 출근 가능');
  const db2 = make();
  await db2.serverWrite('sup_meta/names', { names: ['김정비', '박보조'], lastDate: YDAY, day: DAY });
  const pN = await phone(browser, db2, 'N');
  ok(await until(async () => /준비 중/.test(await txt(pN, '#main'))), '준비 중 안내');
  await pN.click('[data-pick="박보조"]');
  await pN.click('[data-att="in"]');
  await pN.click('.taskb[data-task="기타 업무"]');
  await pN.click('.panel [data-do]');
  ok(await until(() => [...db2.docs.keys()].some(p => p.startsWith('sup/' + DAY + '/rows/'))), '배분 전 출근 줄 저장');
  await pN.click('[data-ac="open"]');
  ok(await until(async () => /진행 중인 활동이 없어요/.test(await txt(pN, '.ac'))), '활동이 하나도 없으면 안내');
  await pN.click('.ac-top [data-x="1"]');
  const pN2 = await phone(browser, db2, 'N관리자');
  await pN2.click('[data-admin-in]'); await pN2.click('[data-who="부소장"]'); await pN2.fill('#pin', db2.PW); await pN2.click('.panel [data-do]');
  ok(await until(async () => /마지막 배분: \d\d\/\d\d/.test(await txt(pN2, '#main'))), "관리자: '마지막 배분' 날짜 안내 (부소장 로그인)");
  ok(await until(async () => /더티 배분 만들기/.test(await txt(pN2, '#main'))), '배분 전 관리자 화면에 더티 배분 만들기 버튼·안내');
  ok(await until(async () => /박보조/.test(await txt(pN2, '#main')) && /🧰 기타 업무/.test(await txt(pN2, '#main'))), '관리자 출퇴근 표에 박보조 기타 업무');

  console.log('⑮ 관리자 모드 끄기 → 근무자 화면');
  await pM.click('[data-admin-off]');
  ok(await until(async () => (await pM.locator('[data-pick]').count()) > 0 || /본인 이름/.test(await txt(pM, '#main'))), '관리자 끄면 이름 고르기 (로그아웃)');
  const mUser = await pM.evaluate(() => SupShim._S.user && SupShim._S.user.anon);
  ok(mUser === true, '익명으로 다시 로그인');
  ok(await pM.locator('[data-dist]').count() === 0, '관리자 끄면 더티 배분 버튼 없음');

  console.log('⑯ 화면 오류');
  const errs = [pA, pB, pM, pN, pN2, pr, pr2].flatMap(p => p.errors.map(e => p.label + ': ' + e));
  ok(!errs.length, '화면 오류 0' + (errs.length ? ' → ' + errs.slice(0, 5).join(' | ') : ''));
  const expected = r => r.data && ((r.data.row && (r.data.row[2] === '인원추가' || r.data.row[6] === '관리자 대신')) || /^acts\//.test(r.path));
  const badRejects = db.log.rejects.filter(r => !expected(r));
  ok(!badRejects.length, '정상 흐름에서 규칙 거절 0' + (badRejects.length ? ' → ' + JSON.stringify(badRejects.slice(0, 3)) : ''));
  ok(db.log.rejects.filter(r => /^acts\//.test(r.path)).length === 5, '활동판 거절은 일부러 넣은 위조 5건뿐');
  ok(!db2.log.rejects.length, '배분 전 흐름 규칙 거절 0' + (db2.log.rejects.length ? ' → ' + JSON.stringify(db2.log.rejects[0]) : ''));

  await browser.close();
  console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

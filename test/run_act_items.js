// 객실 활동판 보강 시험 (2026-11-08): 지난 날짜 잠금 · 다른 분 체크 지우기 확인 · 점검 항목(번호 동그라미) · 출력
// NODE_PATH=/opt/node22/lib/node_modules node test/run_act_items.js [앱 폴더]
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
  const Y = Date.now() - 864e5;
  await db.serverWrite('sup/' + DAY, { date: DAY, plan: PLAN, sig: 'x' });
  await db.serverWrite('sup_meta/names', { names: ['김정비', '박보조', '이기타'], lastDate: DAY, day: DAY });
  await db.serverWrite('sup_meta/relay', { ok: true, err: '', ver: 't', at: { __ts: Date.now() } });
  await db.serverWrite('acts/A1', { name: '이불장 점검', color: '민트', start: YDAY, due: '', exclText: '', memo: '', status: '진행', made: { __ts: Y }, ended: null, uid: db.BOT, at: { __ts: Y } });
  await db.serverWrite('acts/A1/marks/1201', { s: '완료', m: '', w: '박보조', by: '본인', at: { __ts: Y }, clientAt: { __ts: Y }, uid: db.BOT });
  await db.serverWrite('acts/A1/marks/1202', { s: '취소', m: '', w: '박보조', by: '본인', at: { __ts: Y }, clientAt: { __ts: Y }, uid: db.BOT });
  await db.serverWrite('acts/A1/marks/1203', { s: '이상', m: '얼룩', w: '박보조', by: '본인', at: { __ts: Y }, clientAt: { __ts: Y }, uid: db.BOT });

  console.log('① 지난 날짜 잠금');
  const pA = await phone(browser, db, 'A');
  await until(async () => (await pA.locator('[data-pick="김정비"]').count()) === 1);
  await pA.click('[data-pick="김정비"]');
  await until(async () => (await pA.locator('[data-ac="open"]').count()) === 1, 8000);
  await pA.click('[data-ac="open"]');
  ok(await until(async () => /이불장 점검/.test(await txt(pA, '.ac'))), '활동판 열림');
  await pA.click('.ac-row[data-v="12"]');
  await until(async () => /12층/.test(await txt(pA, '.ac-fh')));
  ok(await pA.locator('.ac-t.d.l[data-r="1201"]').count() === 1 && await pA.locator('.ac-t.i.l[data-r="1203"]').count() === 1, '어제 체크한 1201(완료)·1203(이상)에 자물쇠');
  ok(await pA.locator('.ac-t.l[data-r="1202"]').count() === 0, '어제 취소된 1202 는 잠금 없음');
  await pA.click('.ac-t[data-r="1201"]');
  ok(await until(async () => /11\/|바꿀 수 없어요/.test(await txt(pA, '.ac-pop'))) && /바꿀 수 없어요/.test(await txt(pA, '.ac-pop')), '1201 누르면 잠금 안내 창');
  await pA.click('[data-ac="askx"]');
  ok(await pA.locator('.ac-t.d[data-r="1201"]').count() === 1 && mark(db, 'A1', '1201').s === '완료', '1201 그대로 완료');
  await pA.click('[data-ac="mode"][data-v="issue"]');
  await pA.click('.ac-t[data-r="1203"]');
  ok(/바꿀 수 없어요/.test(await txt(pA, '.ac-pop')), '이상 표시 모드에서도 1203 잠금');
  await pA.click('[data-ac="askx"]');
  await pA.click('[data-ac="mode"][data-v="done"]');
  await pA.click('.ac-t[data-r="1202"]');
  ok(await until(() => { const m = mark(db, 'A1', '1202'); return m && m.s === '완료' && m.w === '김정비'; }), '어제 취소된 1202 는 오늘 체크 가능');
  const fz = await pA.evaluate(async () => {
    const S = SupShim._S, st = S.store, tryW = async (p, d) => { try { await st.set(p, d); return 'ok'; } catch (e) { return 'rejected'; } };
    return {
      lockDone: await tryW('acts/A1/marks/1201', { s: '취소', m: '', w: '김정비', by: '본인', at: st.SERVER_TIME, clientAt: new Date(), uid: S.user.uid }),
      lockIss: await tryW('acts/A1/marks/1203', { s: '완료', m: '', w: '김정비', by: '본인', at: st.SERVER_TIME, clientAt: new Date(), uid: S.user.uid }),
      tagDone: await tryW('acts/A1/marks/1204', { s: '완료', m: '', t: ['1'], w: '김정비', by: '본인', at: st.SERVER_TIME, clientAt: new Date(), uid: S.user.uid }),
      tagBad: await tryW('acts/A1/marks/1204', { s: '이상', m: '', t: ['x'], w: '김정비', by: '본인', at: st.SERVER_TIME, clientAt: new Date(), uid: S.user.uid })
    };
  });
  ok(fz.lockDone === 'rejected' && fz.lockIss === 'rejected', '규칙: 지난 날짜 체크를 근무자가 바꾸면 거절 ' + JSON.stringify(fz));
  ok(fz.tagDone === 'rejected' && fz.tagBad === 'rejected', '규칙: 완료에 항목 · 이상한 항목 번호 거절');

  console.log('② 오늘 다른 분 체크 지우기 → 확인');
  const pB = await phone(browser, db, 'B');
  await until(async () => (await pB.locator('[data-pick="박보조"]').count()) === 1);
  await pB.click('[data-pick="박보조"]');
  await until(async () => (await pB.locator('[data-ac="open"]').count()) === 1, 8000);
  await pB.click('[data-ac="open"]');
  await until(async () => /이불장 점검/.test(await txt(pB, '.ac')));
  await pB.click('.ac-row[data-v="12"]');
  ok(await until(async () => (await pB.locator('.ac-t.d[data-r="1202"]').count()) === 1), '박보조 화면에 김정비가 체크한 1202');
  await pB.click('.ac-t[data-r="1202"]');
  ok(await until(async () => /김정비 님이 체크함/.test(await txt(pB, '.ac-pop'))), '다른 분 체크 → 확인 창');
  await pB.click('[data-ac="askx"]');
  ok(mark(db, 'A1', '1202').s === '완료', '닫으면 그대로');
  await pB.click('.ac-t[data-r="1202"]');
  await pB.click('[data-ac="unmark"]');
  ok(await until(() => mark(db, 'A1', '1202').s === '취소'), '체크 지우기 누르면 취소');
  await pB.click('.ac-t[data-r="1204"]');
  ok(await until(() => { const m = mark(db, 'A1', '1204'); return m && m.s === '완료' && m.w === '박보조'; }), '1204 박보조 완료');
  await pB.click('.ac-t[data-r="1204"]');
  ok(await until(() => mark(db, 'A1', '1204').s === '취소'), '본인 체크는 한 번에 취소 (확인 없음)');

  console.log('③ 관리자: 점검 항목 있는 활동 만들기');
  const pM = await phone(browser, db, '관리자');
  await until(async () => (await pM.locator('[data-admin-in]').count()) === 1);
  await pM.click('[data-admin-in]'); await pM.click('[data-who="소장"]').catch(() => {}); await pM.fill('#pin', db.PW); await pM.click('.panel [data-do]');
  await until(async () => (await pM.locator('.amode [data-ac="open"]').count()) === 1, 10000);
  await pM.click('.amode [data-ac="open"]');
  await until(async () => (await pM.locator('[data-ac="new"]').count()) === 1);
  await pM.click('[data-ac="new"]');
  await pM.fill('#ac-name', '식탁 노후도 조사');
  await pM.fill('#ac-excl', '모든 층 6,8,13~15호');
  await pM.click('[data-ac="itadd"]'); await pM.fill('#ac-it-n-0', '상판 노후');
  await pM.click('[data-ac="itadd"]'); await pM.fill('#ac-it-n-1', '다리 물듬');
  await pM.click('[data-ac="itadd"]'); await pM.fill('#ac-it-n-2', '다리 흔들림');
  await pM.click('[data-ac="itadd"]'); await pM.fill('#ac-it-n-3', '지울 항목');
  await pM.selectOption('#ac-it-c-2', '주황');
  await pM.fill('#ac-done', '정비 완료');
  ok(await pM.locator('#ac-it-c-0').inputValue() === '빨강' && await pM.locator('#ac-it-c-1').inputValue() === '파랑', '항목 색 자동: 빨강 · 파랑');
  await pM.click('[data-ac="itdel"][data-v="3"]');
  ok(await pM.locator('#ac-it-n-3').count() === 0 && await pM.locator('#ac-it-n-2').inputValue() === '다리 흔들림', '항목 지우기 (입력한 글자 유지)');
  await pM.click('[data-ac="save"]');
  const NID = 'A' + DAY.slice(2).replace(/-/g, '') + '-1';
  ok(await until(() => { const d = db.docs.get('acts/' + NID); return d && d.items && d.items.length === 3 && d.items.map(i => i.k + i.n + i.c).join('|') === '1상판 노후빨강|2다리 물듬파랑|3다리 흔들림주황'; }), '문서 items = ①상판 빨강 · ②다리 물듬 파랑 · ③흔들림 주황 ' + JSON.stringify((db.docs.get('acts/' + NID) || {}).items));
  ok(await until(async () => /식탁 노후도 조사/.test(await txt(pM, '.ac')) && /상판 노후/.test(await txt(pM, '.ac'))), '관리자 목록에 항목 범례');
  ok(/처리 0 \/ 298실/.test((await txt(pM, '.ac')).replace(/\s+/g, ' ')), "제외 '모든 층 6,8,13~15호' → 대상 298실 (호수 라인 제외)");

  console.log('④ 정비보조: 항목 여러 개 체크');
  await pA.click('.ac-top [data-x="1"], .ac-top [data-ac="list"]');
  await pA.click('.ac-top [data-x="1"]').catch(() => {});
  await pA.click('[data-ac="open"]');
  ok(await until(async () => (await pA.locator('[data-ac="act"]').count()) === 2), '진행 중 2개 → 목록');
  await pA.click('[data-ac="act"][data-id="' + NID + '"]');
  ok(await until(async () => /정비 완료/.test(await txt(pA, '.ac-seg')) && /항목 체크/.test(await txt(pA, '.ac-seg'))), "버튼 이름 = 관리자가 정한 '정비 완료' / 항목 체크");
  ok(db.docs.get('acts/' + NID).doneName === '정비 완료', "문서 doneName = '정비 완료'");
  await pA.click('.ac-row[data-v="21"]');
  await until(async () => /21층/.test(await txt(pA, '.ac-fh')));
  await pA.click('.ac-t[data-r="2101"]');
  ok(await until(() => { const m = mark(db, NID, '2101'); return m && m.s === '완료' && !m.t; }), '2101 한 번 톡 = 이상 없음');
  await pA.click('[data-ac="mode"][data-v="issue"]');
  await pA.click('.ac-t[data-r="2103"]');
  ok(await until(async () => /해당하는 것 모두/.test(await txt(pA, '.ac-pop'))), '항목 고르기 창');
  await pA.click('[data-ac="issave"]');
  ok(/하나 이상 골라/.test(await txt(pA, '.ac-pop')), '아무것도 안 고르면 안내');
  await pA.click('[data-ac="tg"][data-v="1"]'); await pA.click('[data-ac="tg"][data-v="2"]');
  ok(/2개 저장/.test(await txt(pA, '[data-ac="issave"]')), "두 개 고르면 '2개 저장'");
  await pA.click('[data-ac="issave"]');
  ok(await pA.locator('.ac-t.k[data-r="2103"] .ac-dots b').count() === 2, '2103 칸에 번호 동그라미 2개 (바로)');
  ok(/gradient/.test(await pA.locator('.ac-t[data-r="2103"]').getAttribute('style')), '2103 칸 바탕 = 두 결과 색으로 나눠 칠함');
  ok(await until(() => { const m = mark(db, NID, '2103'); return m && m.s === '이상' && JSON.stringify(m.t) === '["1","2"]' && m.m === ''; }), 'Firestore 2103 = 이상 · t [1,2]');
  await pA.click('.ac-t[data-r="2104"]');
  await pA.click('[data-ac="tg"][data-v="3"]'); await pA.click('[data-ac="tg"][data-v="1"]'); await pA.click('[data-ac="tg"][data-v="2"]');
  await pA.fill('#ac-memo', '의자 4개 중 1개');
  await pA.click('[data-ac="issave"]');
  ok(await until(() => { const m = mark(db, NID, '2104'); return m && JSON.stringify(m.t) === '["1","2","3"]' && m.m === '의자 4개 중 1개'; }), '2104 = 세 항목(번호 순) + 메모');
  await pA.click('.ac-t[data-r="2104"]');
  ok(await pA.locator('[data-ac="tg"][aria-pressed="true"]').count() === 3, '다시 열면 고른 항목 그대로');
  await pA.click('[data-ac="tg"][data-v="2"]'); await pA.click('[data-ac="issave"]');
  ok(await until(() => JSON.stringify(mark(db, NID, '2104').t) === '["1","3"]'), '항목 하나 빼기 → [1,3]');
  ok(/정비 완료/.test(await txt(pA, '.ac-t[data-r="2101"]')), "이상 없는 칸 글자 = '정비 완료'");
  ok(await until(async () => /상판 노후\s*2/.test(await txt(pA, '.ac-legend')) && /다리 물듬\s*1/.test(await txt(pA, '.ac-legend')) && /다리 흔들림\s*1/.test(await txt(pA, '.ac-legend'))), '범례 숫자: 상판 2 · 물듬 1 · 흔들림 1');
  ok(/2103 · 2104/.test(await txt(pA, '.ac-grp')), '항목별 객실 목록 (상판: 2103 · 2104)');
  ok(await pA.locator('.ac-row[data-v="21"] .c[style*="gradient"]').count() === 2, '전체 도면 작은 칸도 항목 색');
  await pA.click('.ac-t[data-r="2105"]');
  await pA.click('[data-ac="tg"][data-v="3"]'); await pA.click('[data-ac="issave"]');
  await pA.click('.ac-t[data-r="2105"]');
  await pA.click('[data-ac="todone"]');
  ok(await until(() => { const m = mark(db, NID, '2105'); return m && m.s === '완료' && !m.t; }), "항목 → '이상 없음으로' 바꾸기");

  console.log('⑤-1 관리자 도면 잠금');
  await pM.click('[data-ac="act"][data-id="' + NID + '"]');
  await until(async () => (await pM.locator('[data-ac="lock"][data-k="잠그기"]').count()) === 1);
  await pM.click('[data-ac="lock"][data-k="잠그기"]');
  ok(/한 번 더/.test(await txt(pM, '[data-ac="lock"][data-k="잠그기"]')), '잠그기는 두 번 눌러야');
  await pM.click('[data-ac="lock"][data-k="잠그기"]');
  ok(await until(() => { const d = db.docs.get('acts/' + NID); return d && d.lockAt && '__ts' in d.lockAt && d.items.length === 3; }), '문서 lockAt = 서버 시각 (항목 그대로)');
  ok(await until(async () => /까지 체크된 칸은 정비보조가 못 바꿔요/.test(await txt(pM, '.ac'))), '관리자 화면: 잠금 시각 안내');
  ok(await until(async () => (await pA.locator('.ac-t.l[data-r="2101"]').count()) === 1, 6000), '정비보조 화면: 2101 에 자물쇠');
  await pA.click('.ac-t[data-r="2101"]');
  ok(await until(async () => /관리자가 잠근 기록/.test(await txt(pA, '.ac-pop'))), '누르면 \'관리자가 잠근 기록\' 안내');
  await pA.click('[data-ac="askx"]');
  await pA.click('[data-ac="mode"][data-v="done"]');
  await pA.click('.ac-t[data-r="2107"]');
  ok(await until(() => { const m = mark(db, NID, '2107'); return m && m.s === '완료'; }), '잠근 뒤에도 빈 칸(2107)은 체크됨');
  await pA.click('.ac-t[data-r="2107"]');
  ok(await until(() => mark(db, NID, '2107').s === '취소'), '잠근 뒤 새로 체크한 칸은 취소 가능');
  const fz2 = await pA.evaluate(async (id) => { const S = SupShim._S, st = S.store; try { await st.set('acts/' + id + '/marks/2103', { s: '취소', m: '', w: '김정비', by: '본인', at: st.SERVER_TIME, clientAt: new Date(), uid: S.user.uid }); return 'ok'; } catch (e) { return 'rejected'; } }, NID);
  ok(fz2 === 'rejected', '규칙: 잠근 칸을 정비보조가 바꾸면 거절');
  await pM.click('[data-ac="lock"][data-k="잠금 풀기"]');
  ok(await until(() => { const d = db.docs.get('acts/' + NID); return d && d.lockAt === null; }), '잠금 풀기 → lockAt 비움');
  ok(await until(async () => (await pA.locator('.ac-t.l[data-r="2101"]').count()) === 0, 6000), '풀면 자물쇠 사라짐');
  await pM.click('.ac-top [data-ac="list"]');
  await until(async () => (await pM.locator('[data-ac="act"][data-id="' + NID + '"]').count()) === 1);
  console.log('⑤ 관리자 화면·수정·출력');
  await pM.click('[data-ac="act"][data-id="' + NID + '"]');
  ok(await until(async () => /상판 노후\s*2/.test(await txt(pM, '.ac-legend'))), '관리자 도면 범례 같은 숫자');
  await pM.click('.ac-top [data-ac="list"]');
  await until(async () => (await pM.locator('[data-ac="edit"][data-id="' + NID + '"]').count()) === 1);
  await pM.click('[data-ac="edit"][data-id="' + NID + '"]');
  ok(/대상 298실 · 제외 119실/.test(await txt(pM, '#ac-exsum')), '수정 화면: 제외 글 요약 (대상 298 · 제외 119)');
  await pM.click('[data-ac="pick"]');
  ok(await until(async () => /대상 298실 · 제외 119실/.test((await txt(pM, '#pk-sum')).replace(/\s+/g, ' '))), '도면 고르기: 같은 숫자로 열림');
  ok(await until(async () => (await pM.locator('#pk .pc.m').count()) >= 3), '이미 체크된 객실에 점 (•)');
  await pM.click('[data-ac="pkline"][data-v="6"]');
  ok(/대상 323실/.test((await txt(pM, '#pk-sum')).replace(/\s+/g, ' ')), '라인 6 누르면 모든 층 06호가 대상으로 (+25)');
  await pM.click('[data-ac="pkfloor"][data-v="31"]');
  ok(/대상 317실/.test((await txt(pM, '#pk-sum')).replace(/\s+/g, ' ')), '31F 누르면 31층 전체 제외 (−6)');
  const b1 = await pM.locator('#pk .pc[data-r="2101"]').boundingBox(), b3 = await pM.locator('#pk .pc[data-r="2103"]').boundingBox();
  await pM.mouse.move(b1.x + b1.width / 2, b1.y + b1.height / 2); await pM.mouse.down();
  await pM.mouse.move(b1.x + b1.width * 1.6, b1.y + b1.height / 2, { steps: 4 });
  await pM.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2, { steps: 6 }); await pM.mouse.up();
  ok(/대상 314실/.test((await txt(pM, '#pk-sum')).replace(/\s+/g, ' ')) && await pM.locator('#pk .pc.x[data-r="2102"]').count() === 1, '칸에서 시작한 네모로 2101~2103 한 번에 제외 (−3)');
  // 네모 끌기: 도면 바깥 여백(왼쪽 위)에서 시작해 19~18층 01~03호를 덮기 → 6실 빠짐, 같은 네모를 ⊕ 넣기로 → 다시 들어옴
  const area = await pM.locator('#pk-area').boundingBox(), c1 = await pM.locator('#pk .pc[data-r="1903"]').boundingBox(), c2 = await pM.locator('#pk .pc[data-r="1801"]').boundingBox();
  const sx = area.x + 4, sy = c1.y + 2, qx = c1.x + c1.width - 3, qy = c2.y + c2.height - 3;
  await pM.mouse.move(sx, sy); await pM.mouse.down(); await pM.mouse.move((sx + qx) / 2, (sy + qy) / 2, { steps: 4 });
  ok(await until(async () => (await pM.locator('#pk-rect').isVisible()) && (await pM.locator('#pk .pc.sel').count()) > 0), '끄는 동안 네모 + 걸친 칸 미리 표시');
  await pM.mouse.move(qx, qy, { steps: 4 }); await pM.mouse.up();
  ok(/대상 308실/.test((await txt(pM, '#pk-sum')).replace(/\s+/g, ' ')) && await pM.locator('#pk .pc.x[data-r="1802"]').count() === 1, '바깥 여백부터 네모 끌기 → 6실 한꺼번에 제외 (314 → 308)');
  await pM.click('[data-ac="pkmode"][data-v="in"]');
  const c1b = await pM.locator('#pk .pc[data-r="1903"]').boundingBox(), c2b = await pM.locator('#pk .pc[data-r="1801"]').boundingBox(), areab = await pM.locator('#pk-area').boundingBox();
  await pM.mouse.move(areab.x + 4, c1b.y + 2); await pM.mouse.down(); await pM.mouse.move(c1b.x + c1b.width - 3, c2b.y + c2b.height - 3, { steps: 6 }); await pM.mouse.up();
  ok(/대상 314실/.test((await txt(pM, '#pk-sum')).replace(/\s+/g, ' ')), "⊕ 넣기 네모 → 다시 대상 (314)");
  await pM.click('[data-ac="pkmode"][data-v="out"]');
  await pM.click('#pk .pc[data-r="1705"]');
  ok(/대상 313실/.test((await txt(pM, '#pk-sum')).replace(/\s+/g, ' ')), '칸 하나 누르기 → 그 칸만 바뀜');
  await pM.click('#pk .pc[data-r="1705"]');
  if (process.env.SHOT) await pM.screenshot({ path: process.env.SHOT.replace(/[^/]+$/, 'pick.png'), fullPage: true });
  await pM.click('[data-ac="pkdone"]');
  ok(await until(async () => /이미 체크된 2실\(2101·2103\)/.test(await txt(pM, '.pk-warn'))), '체크된 객실을 빼면 경고 (기록은 남음)');
  await pM.click('[data-ac="pkdone"]');
  ok(await until(async () => (await pM.locator('#ac-excl').count()) === 1), '폼으로 돌아옴');
  const ex = await pM.locator('#ac-excl').inputValue();
  ok(ex === '8,13-15호, 31층, 2101, 2102, 2103', '제외 글 자동 = ' + ex);
  await pM.click('[data-ac="pick"]'); await pM.click('[data-ac="pkreset"]');
  ok(/대상 314실/.test((await txt(pM, '#pk-sum')).replace(/\s+/g, ' ')), '처음대로 = 열 때 상태');
  await pM.click('[data-ac="pkall"]');
  ok(/대상 417실/.test((await txt(pM, '#pk-sum')).replace(/\s+/g, ' ')), '전체 대상');
  await pM.click('[data-ac="pickx"]');
  ok(await pM.locator('#ac-excl').inputValue() === ex, '← 돌아가기는 바꾸지 않음');
  await pM.fill('#ac-excl', '모든 층 6,8,13~15호');
  await pM.click('[data-ac="itdel"][data-v="1"]');
  await pM.click('[data-ac="itadd"]'); await pM.fill('#ac-it-n-2', '의자 찢김');
  await pM.click('[data-ac="save"]');
  ok(await until(() => { const d = db.docs.get('acts/' + NID); return d && d.items.map(i => i.k + i.n).join('|') === '1상판 노후|3다리 흔들림|4의자 찢김'; }), '항목 수정: 지운 ②번은 다시 안 씀 → 새 항목 ④ ' + JSON.stringify((db.docs.get('acts/' + NID) || {}).items));
  const pr = await pM.ctx.newPage(); watch(pr); pr.label = '출력';
  await pr.goto(BASE + 'print.html?id=' + NID);
  ok(await until(() => pr.evaluate(() => !!window.__printed), 15000), '출력 페이지 그림 완성');
  const pd = await pr.evaluate(() => D && { items: D.items.map(i => i.k).join(','), st: D.stats.items, t2104: D.marks['2104'] && D.marks['2104'].t });
  ok(pd && pd.items === '1,3,4' && pd.st['1'] === 2 && pd.st['3'] === 1 && pd.st['4'] === 0 && JSON.stringify(pd.t2104) === '["1","3"]', '출력 숫자: ①2 · ③1 · ④0 ' + JSON.stringify(pd));
  const durl = await pr.evaluate(() => { return typeof png === 'string' ? png : ''; });
  if (durl) fs.writeFileSync(process.env.SHOT || '/tmp/act_print.png', Buffer.from(durl.split(',')[1], 'base64'));
  await pA.screenshot({ path: (process.env.SHOT || '/tmp/act_print.png').replace('print', 'phone'), fullPage: false });

  console.log('⑧ 대상 구간 확대 (IBK 와인 세팅처럼 12~17호 × 5~26층)');
  await pM.click('.ac-top [data-ac="list"]').catch(() => {});
  await until(async () => (await pM.locator('[data-ac="new"]').count()) === 1);
  await pM.click('[data-ac="new"]');
  await pM.fill('#ac-name', 'IBK 와인 세팅');
  await pM.fill('#ac-excl', '1-11호, 4층, 27-31층');
  await pM.fill('#ac-done', '세팅 완료');
  await pM.click('[data-ac="save"]');
  const WID = 'A' + DAY.slice(2).replace(/-/g, '') + '-2';
  ok(await until(() => { const d = db.docs.get('acts/' + WID); return d && d.name === 'IBK 와인 세팅'; }), '활동 ' + WID + ' 만듦');
  await until(async () => (await pM.locator('[data-ac="act"][data-id="' + WID + '"]').count()) === 1);
  ok(/처리 0 \/ 132실/.test((await txt(pM, '.ac')).replace(/\s+/g, ' ')), '대상 132실 (22층 × 6호)');
  await pM.click('[data-ac="act"][data-id="' + WID + '"]');
  ok(await until(async () => /대상 구간만 · 5~26층 · 12~17호/.test(await txt(pM, '.ac'))), "전체 도면 제목 '대상 구간만 · 5~26층 · 12~17호'");
  ok(await pM.locator('.ac-map button.ac-row').count() === 22, '도면 줄 22개 (5~26층만)');
  ok(await pM.locator('.ac-map button.ac-row').first().locator('.c').count() === 6, '줄마다 칸 6개 (12~17호)');
  ok(await pM.locator('.ac-tiles .ac-t').count() === 6, '층 카드도 12~17호 6칸');
  ok(/26층/.test(await txt(pM, '.ac-fh')), '처음 층 = 대상이 있는 가장 위층 26층');
  await pM.click('[data-ac="full"]');
  ok(await pM.locator('.ac-map button.ac-row').count() === 28 && await pM.locator('.ac-map button.ac-row').first().locator('.c').count() === 17, "'전체 도면 보기' → 28줄 × 17칸");
  await pM.click('[data-ac="full"]');
  ok(await pM.locator('.ac-map button.ac-row').count() === 22, "'대상 구간만 보기'로 다시");
  const pw = await pM.ctx.newPage(); watch(pw); pw.label = '출력W';
  await pw.goto(BASE + 'print.html?id=' + WID);
  ok(await until(() => pw.evaluate(() => !!window.__printed), 15000), '출력: 그림 완성');
  const cr = await pw.evaluate(() => window.__crop);
  ok(cr && cr.crop && cr.f0 === 5 && cr.f1 === 26 && cr.c0 === 12 && cr.c1 === 17, '출력도 대상 구간만 ' + JSON.stringify(cr));
  if (process.env.SHOT) { const u = await pw.evaluate(() => png); fs.writeFileSync(process.env.SHOT.replace(/[^/]+$/, 'print_zoom.png'), Buffer.from(u.split(',')[1], 'base64')); await pM.screenshot({ path: process.env.SHOT.replace(/[^/]+$/, 'app_zoom.png'), fullPage: false }); }
  await pw.goto(BASE + 'print.html?id=' + WID + '&full=1');
  ok(await until(() => pw.evaluate(() => !!window.__printed && window.__crop && !window.__crop.crop), 15000), '출력 ?full=1 → 전체 도면');
  const cr2 = await pr.evaluate(() => window.__crop).catch(() => null);
  ok(!cr2 || !cr2.crop, '대상이 넓은 활동(식탁)은 확대 안 함');
  await pM.click('.ac-top [data-ac="list"]').catch(() => {});

  console.log('⑨ 보관함 · 다시 꺼내기 · 완전 삭제');
  await until(async () => (await pM.locator('[data-ac="st"][data-k="끝내기"][data-id="' + WID + '"]').count()) === 1);
  for (const [id, k] of [[WID, '끝내기'], [WID, '보관'], [NID, '끝내기'], [NID, '보관']]) {
    await until(async () => (await pM.locator('[data-ac="st"][data-k="' + k + '"][data-id="' + id + '"]').count()) === 1);
    await pM.click('[data-ac="st"][data-k="' + k + '"][data-id="' + id + '"]'); await pM.click('[data-ac="st"][data-k="' + k + '"][data-id="' + id + '"]');
    await until(() => { const d = db.docs.get('acts/' + id); return d && d.status === (k === '끝내기' ? '끝남' : '보관'); });
  }
  ok(db.docs.get('acts/' + WID).status === '보관' && db.docs.get('acts/' + NID).status === '보관', '두 활동 보관');
  ok(await until(async () => /보관함 보기 \(2\)/.test(await txt(pM, '[data-ac="arch"]'))), "목록 아래 '보관함 보기 (2)'");
  await pM.click('[data-ac="arch"]');
  ok(await until(async () => /IBK 와인 세팅/.test(await txt(pM, '.ac')) && /식탁 노후도 조사/.test(await txt(pM, '.ac')) && /체크 기록 0건/.test(await txt(pM, '.ac'))), '보관함: 두 활동 + 체크 건수');
  ok(await pM.locator('[data-ac="st"][data-k="삭제"][data-id="' + WID + '"]').count() === 1, '체크 0건(IBK)은 완전 삭제 버튼');
  ok(/완전 삭제 \(체크 \d+건 포함\)/.test(await txt(pM, '[data-ac="st"][data-k="삭제"][data-id="' + NID + '"]')), "체크 있는 활동(식탁)은 '완전 삭제 (체크 n건 포함)'");
  await pM.click('[data-ac="act"][data-id="' + WID + '"]');
  ok(await until(async () => /IBK 와인 세팅/.test(await txt(pM, '.ac-top'))), '보관 활동도 도면 보기');
  await pM.click('.ac-top [data-ac="list"]'); await pM.click('[data-ac="arch"]');
  await until(async () => (await pM.locator('[data-ac="st"][data-k="꺼내기"][data-id="' + NID + '"]').count()) === 1);
  await pM.click('[data-ac="st"][data-k="꺼내기"][data-id="' + NID + '"]');
  ok(await until(() => db.docs.get('acts/' + NID).status === '끝남'), '다시 꺼내기 → 끝난 활동으로 목록 복귀');
  await until(async () => (await pM.locator('[data-ac="st"][data-k="삭제"][data-id="' + WID + '"]').count()) === 1);
  await pM.click('[data-ac="st"][data-k="삭제"][data-id="' + WID + '"]');
  ok(/완전히 지워요/.test(await txt(pM, '[data-ac="st"][data-k="삭제"][data-id="' + WID + '"]')), '삭제는 두 번 눌러야');
  await pM.click('[data-ac="st"][data-k="삭제"][data-id="' + WID + '"]');
  ok(await until(() => !db.docs.has('acts/' + WID)), 'Firestore 에서 IBK 활동 문서 지워짐');
  ok(await until(async () => /보관한 활동이 없어요/.test(await txt(pM, '.ac'))), '보관함 비었음');
  await pM.click('.ac-top [data-ac="list"]');
  ok(await until(async () => /식탁 노후도 조사/.test(await txt(pM, '.ac')) && !/IBK/.test(await txt(pM, '.ac'))), '목록: 식탁(끝남) 있음 · IBK 없음');
  // 체크 기록이 있는 활동도 삭제 (12:38)
  const nMarks = [...db.docs.keys()].filter(k => k.startsWith('acts/' + NID + '/marks/')).length;
  await pM.click('[data-ac="st"][data-k="보관"][data-id="' + NID + '"]'); await pM.click('[data-ac="st"][data-k="보관"][data-id="' + NID + '"]');
  await until(() => db.docs.get('acts/' + NID).status === '보관');
  await pM.click('[data-ac="arch"]');
  await until(async () => (await pM.locator('[data-ac="st"][data-k="삭제"][data-id="' + NID + '"]').count()) === 1);
  await pM.click('[data-ac="st"][data-k="삭제"][data-id="' + NID + '"]');
  ok(new RegExp('체크 ' + nMarks + '건까지 모두 지워요').test(await txt(pM, '[data-ac="st"][data-k="삭제"][data-id="' + NID + '"]')) && /되돌릴 수 없어요/.test(await txt(pM, '.ac')), '체크 ' + nMarks + '건 경고 + 되돌릴 수 없음 안내');
  await pM.click('[data-ac="st"][data-k="삭제"][data-id="' + NID + '"]');
  ok(await until(() => !db.docs.has('acts/' + NID) && ![...db.docs.keys()].some(k => k.startsWith('acts/' + NID + '/')), 8000), '활동 문서 + 체크 ' + nMarks + '건 모두 지워짐');
  const okE = await until(async () => /보관한 활동이 없어요/.test(await txt(pM, '.ac')));
  if (!okE) console.log('DEBUG', JSON.stringify(await pM.evaluate(() => ({ html: (document.querySelector('#sheet') || {}).innerHTML.slice(0, 600), errs: window.__errs }))), pM.errors.slice(-3));
  ok(okE, '보관함 비었음 (체크 있던 활동 삭제 뒤)');
  ok(await until(() => { const d = db.docs.get('sup_meta/acts_deleted'); return d && d.ids.includes(NID) && d.ids.includes(WID); }), '지운 활동 번호 기록 (sup_meta/acts_deleted)');
  await pM.click('.ac-top [data-ac="list"]');
  await until(async () => (await pM.locator('[data-ac="new"]').count()) === 1);
  await pM.click('[data-ac="new"]'); await pM.fill('#ac-name', '새 시험'); await pM.click('[data-ac="save"]');
  const N3 = 'A' + DAY.slice(2).replace(/-/g, '') + '-3';
  ok(await until(() => { const d = db.docs.get('acts/' + N3); return d && d.name === '새 시험'; }), '새 활동 번호는 지운 번호(-1·-2)를 건너뛰고 ' + N3);

  console.log('⑦ 정비보조 명단');
  await pM.click('.ac-top [data-x="1"], .ac-top [data-ac="list"]').catch(() => {});
  await pM.click('.ac-top [data-x="1"]').catch(() => {});
  ok(await until(async () => (await pM.locator('.amode [data-rs="open"]').count()) === 1, 6000), "관리자 화면에 '👥 정비보조 명단' 버튼");
  await pM.click('.amode [data-rs="open"]');
  ok(await until(async () => /정비보조 명단 3명/.test(await txt(pM, '#rs-pop'))), '명단 창: 최근 근무자 3명');
  await pM.fill('#rs-new', '신입보조'); await pM.click('[data-rs="add"]');
  ok(await until(() => { const d = db.docs.get('sup_meta/roster'); return d && JSON.stringify(d.add) === '["신입보조"]'; }), "sup_meta/roster.add = ['신입보조']");
  await pM.fill('#rs-new', '김정비'); await pM.click('[data-rs="add"]');
  ok(/이미 명단에 있어요/.test(await txt(pM, '#rs-pop')), '같은 이름은 안내');
  const pR = await phone(browser, db, 'R');
  ok(await until(async () => (await pR.locator('[data-pick="신입보조"]').count()) === 1, 10000), '근무자 이름 고르기에 신입보조');
  await pR.click('[data-pick="신입보조"]');
  await pR.click('[data-att="in"]'); await pR.click('.taskb[data-task="기타 업무"]'); await pR.click('.panel [data-do]');
  ok(await until(() => rows(db, r => r.tab === '근태' && r.row[2] === '신입보조' && r.row[3] === '출근').length === 1), '신입보조 출근 기록 저장');
  await pM.click('[data-rs="hide"][data-n="신입보조"]');
  ok(await until(() => { const d = db.docs.get('sup_meta/roster'); return d && JSON.stringify(d.hide) === '["신입보조"]' && d.add.length === 0; }), "빼기 → hide = ['신입보조']");
  ok(/뺀 이름/.test(await txt(pM, '#rs-pop')), "창에 '뺀 이름' 목록");
  await pM.click('[data-rs="unhide"][data-n="신입보조"]');
  ok(await until(() => { const d = db.docs.get('sup_meta/roster'); return d && d.hide.length === 0 && JSON.stringify(d.add) === '["신입보조"]'; }), '되살리기');
  await pM.click('[data-rs="close"]');
  const fz3 = await pR.evaluate(async () => { const S = SupShim._S; try { await S.store.set('sup_meta/roster', { add: ['가짜'], hide: [] }); return 'ok'; } catch (e) { return 'rejected'; } });
  ok(fz3 === 'rejected', '근무자는 명단을 못 바꿈 (규칙 그대로)');

  console.log('⑥ 오류');
  const errs = [pA, pB, pM, pr, pR].flatMap(p => p.errors.map(e => p.label + ': ' + e));
  ok(!errs.length, '화면 오류 0' + (errs.length ? ' → ' + errs.slice(0, 5).join(' | ') : ''));
  ok(db.log.rejects.filter(r => /^(acts|sup_meta)\//.test(r.path)).length === 6, '일부러 넣은 위조 거절 6건뿐 ' + JSON.stringify(db.log.rejects.map(r => r.path + ':' + r.why)));

  await browser.close();
  console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

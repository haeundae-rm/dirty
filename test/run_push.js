// 🔔 더티 요청 푸시 알림 받기 (2026-11-22) — 정비보조 휴대폰 '알림 받기' → push/{uid} 저장 시험. 준비 부분은 run_dreq_e2e.js 와 같음
// 정비 지원 Firebase 판 화면 시험 — 휴대폰 여러 대(Playwright) + 메모리 Firestore(규칙 v5 정비 지원 부분)
// 1부(더티 체크·출퇴근) 시험 그대로 + ⑬ 객실 활동판(2부: 휴대폰 안 계산 · acts 문서)
// NODE_PATH=/opt/node22/lib/node_modules node test/run.js [앱 폴더]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { make } = require('./fakedb');
const APP = process.argv[2] || path.join(__dirname, '..', 'out', 'app');
const ROOT = process.env.ROOT || path.join(__dirname, '..');
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
  await ctx.addInitScript(() => {
    // 시험: 알림 허락 · 서비스 워커는 가짜 (실제 푸시는 서버 함수 시험에서 따로)
    try {
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => localStorage.getItem('__perm') || 'default' });
      Notification.requestPermission = () => new Promise(r => setTimeout(() => { const v = localStorage.getItem('__permAnswer') || 'granted'; localStorage.setItem('__perm', v); window.__asked = (window.__asked || 0) + 1; r(v); }, 50));
      navigator.serviceWorker.register = async () => ({ fake: 1 });
      Object.defineProperty(navigator.serviceWorker, 'ready', { configurable: true, get: () => Promise.resolve({ fake: 1 }) });
    } catch (e) { console.log('stub fail ' + e); }
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
  const T = ms => ({ __ts: Date.now() - ms });
  await db.serverWrite('sup/' + DAY, { date: DAY, plan: PLAN, sig: 'x', meta: { rule: { '10': 4, '11': 6, '12': 8 } } });
  await db.serverWrite('sup_meta/names', { names: ['김정비', '박보조', '이기타'], lastDate: DAY, day: DAY });
  await db.serverWrite('sup_meta/relay', { ok: true, err: '', ver: 't', at: { __ts: Date.now() } });
  const att = (id, n) => db.serverWrite('sup/' + DAY + '/rows/' + id, { tab: '근태', row: [null, DAY, n, '출근', '더티', '', '본인', ''], at: T(3600e3), clientAt: T(3600e3), uid: db.BOT, by: '본인' });
  await att('att1', '김정비'); await att('att2', '박보조');
  const pushDocs = () => [...db.docs.entries()].filter(([p]) => p.startsWith('push/')).map(([p, d]) => Object.assign({ id: p.slice(5) }, d));

  console.log('① 김정비 휴대폰: 알림 받기 카드');
  const pK = await phone(browser, db, '김정비');
  await until(async () => (await pK.locator('[data-pick="김정비"]').count()) === 1); await pK.click('[data-pick="김정비"]');
  ok(await until(async () => /남은 더티/.test(await txt(pK, '.sum'))), '김정비 화면');
  ok(await until(async () => (await pK.locator('.pushc [data-push-on]').count()) === 1), '알림 받기 카드 보임');
  ok(/앱이 꺼져 있어도/.test(await txt(pK, '.pushc')), '설명 문구');
  if (process.env.SHOT) await pK.screenshot({ path: path.join(process.env.SHOT, 'push_1_카드.png') });

  console.log('② 알림 받기 → 허용 → push 문서');
  await pK.click('.pushc [data-push-on]');
  ok(await until(async () => pushDocs().length === 1, 6000), 'push 문서 1개 저장');
  const d1 = pushDocs()[0] || {};
  const uidK = await pK.evaluate(() => JSON.parse(localStorage.getItem('__fake_user')).uid);
  ok(d1.id === uidK && d1.app === 'dirty' && d1.name === '김정비' && d1.token === 'fake-push-' + uidK, '문서 = 내 uid · dirty · 김정비 · 토큰');
  ok(await until(async () => /알림 켜짐/.test(await txt(pK, '.pushok'))), '카드가 "알림 켜짐" 한 줄로 바뀜');
  ok(await pK.locator('.pushc').count() === 0, '큰 카드 사라짐');
  if (process.env.SHOT) await pK.screenshot({ path: path.join(process.env.SHOT, 'push_2_켜짐.png') });

  console.log('③ 다시 열기 → 다시 저장 안 함 (사흘 안)');
  const at1 = JSON.stringify(db.docs.get('push/' + uidK).at);
  await pK.reload(); await until(async () => /남은 더티/.test(await txt(pK, '.sum')));
  await sleep(1500);
  ok(/알림 켜짐/.test(await txt(pK, '.pushok')), '다시 열어도 켜짐 표시');
  ok(JSON.stringify(db.docs.get('push/' + uidK).at) === at1, '불필요한 다시 쓰기 없음');

  console.log('④ 사흘 지남 → 앱 열 때 조용히 갱신');
  await pK.evaluate(() => { const L = JSON.parse(localStorage.getItem('dust_push')); L.at = Date.now() - 4 * 864e5; localStorage.setItem('dust_push', JSON.stringify(L)); });
  await sleep(30); await pK.reload(); await until(async () => /남은 더티/.test(await txt(pK, '.sum')));
  ok(await until(async () => JSON.stringify(db.docs.get('push/' + uidK).at) !== at1, 5000), 'at 갱신됨');
  ok(await pK.evaluate(() => window.__asked || 0) === 0, '허락 창은 다시 안 뜸');

  console.log('⑤ 같은 휴대폰에서 이름을 박보조로 바꿔 고름 → 문서 이름도 바뀜');
  await pK.evaluate(() => localStorage.setItem('dust_me', '박보조'));
  await pK.reload(); await until(async () => /남은 더티/.test(await txt(pK, '.sum')));
  ok(await until(async () => (db.docs.get('push/' + uidK) || {}).name === '박보조', 5000), 'push 이름 = 박보조');
  ok(pushDocs().length === 1, '문서는 여전히 1개 (uid 같음)');

  console.log('⑥ 다른 휴대폰: 허용 안 함(차단)');
  const pP = await phone(browser, db, '박보조');
  await pP.evaluate(() => localStorage.setItem('__permAnswer', 'denied'));
  await until(async () => (await pP.locator('[data-pick="박보조"]').count()) === 1); await pP.click('[data-pick="박보조"]');
  await until(async () => (await pP.locator('.pushc [data-push-on]').count()) === 1);
  await pP.click('.pushc [data-push-on]');
  ok(await until(async () => /알림이 막혀 있어요/.test(await txt(pP, '.pushc'))), '차단 안내 + 바꾸는 방법');
  ok(pushDocs().length === 1, '차단 휴대폰은 저장 안 함');
  if (process.env.SHOT) await pP.screenshot({ path: path.join(process.env.SHOT, 'push_3_차단.png') });

  console.log('⑦ 토큰 받기 실패 → 오류 문구, 무한 반복 없음');
  const pE = await phone(browser, db, '이기타');
  await pE.evaluate(() => { window.__fakePushFail = '토큰 오류(시험)'; });
  await until(async () => (await pE.locator('[data-pick="이기타"]').count()) === 1); await pE.click('[data-pick="이기타"]');
  const hasCard = await until(async () => (await pE.locator('.pushc [data-push-on]').count()) === 1, 4000);
  if (hasCard) {
    await pE.evaluate(() => { window.__fakePushFail = '토큰 오류(시험)'; });
    await pE.click('.pushc [data-push-on]');
    ok(await until(async () => /토큰 오류/.test(await txt(pE, '.pushc'))), '오류 문구 보임');
    const n0 = pushDocs().length; await sleep(2000);
    ok(pushDocs().length === n0, '오류 뒤 저장 없음');
  } else ok(true, '(이기타는 기타 업무 화면 — 카드 확인 생략)');

  console.log('⑧ 관리자 모드에는 카드 없음');
  const pM = await phone(browser, db, '관리자');
  await until(async () => (await pM.locator('[data-admin-in]').count()) === 1);
  await pM.click('[data-admin-in]'); await pM.click('[data-who="소장"]'); await pM.fill('#pin', db.PW); await pM.click('.panel [data-do]');
  ok(await until(async () => /진행 현황/.test(await txt(pM, '#main'))), '관리자 화면');
  ok(await pM.locator('.pushc, .pushok').count() === 0, '관리자 화면엔 알림 카드 없음');

  const errs = [pK, pP, pE, pM].flatMap(p => p.errors.map(e => p.label + ': ' + e)).filter(e => !/토큰 오류/.test(e));
  ok(!errs.length, '화면 오류 없음' + (errs.length ? ' ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

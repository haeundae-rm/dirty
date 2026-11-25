// 🔔 메이드 더티 요청 → 정비보조 화면 시험 (휴대폰 3대). 아래 준비 부분은 run.js 와 같음
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
  await db.serverWrite('sup/' + DAY + '/rows/ck1', { tab: '체크', row: [null, DAY, '1201', '메이드A', '김정비', '완료', ''], at: T(1800e3), clientAt: T(1800e3), uid: db.BOT, by: '본인' });

  console.log('① 휴대폰 열기');
  const pK = await phone(browser, db, '김정비'), pP = await phone(browser, db, '박보조');
  for (const [p, n] of [[pK, '김정비'], [pP, '박보조']]) { await until(async () => (await p.locator('[data-pick="' + n + '"]').count()) === 1); await p.click('[data-pick="' + n + '"]'); }
  ok(await until(async () => /남은 더티/.test(await txt(pK, '.sum'))), '김정비 화면');
  const pM = await phone(browser, db, '관리자');
  await until(async () => (await pM.locator('[data-admin-in]').count()) === 1);
  await pM.click('[data-admin-in]'); await pM.click('[data-who="소장"]'); await pM.fill('#pin', db.PW); await pM.click('.panel [data-do]');
  ok(await until(async () => /진행 현황/.test(await txt(pM, '#main'))), '관리자 화면');
  const order0 = await pK.locator('section.maid .nm').allInnerTexts();
  ok(order0[0] === '메이드A', '요청 전: 메이드A 가 위 (' + order0.join(',') + ')');

  console.log('② 메이드B 더티 요청 (12분 전, 먼저 1402)');
  await db.serverWrite('sup/' + DAY + '/req/메이드B', { maid: '메이드B', names: ['메이드B'], ws: ['김정비'], rooms: ['1402', '1403'], at: T(12 * 60e3), n: 1, hist: [], why: 'left', left: 2, R: 2, dc: 0, uid: 'm2', ver: 't' });
  ok(await until(async () => (await pK.locator('section.maid.asked').count()) === 1, 6000), '김정비: 메이드B 카드에 요청 표시');
  const order1 = await pK.locator('section.maid .nm').allInnerTexts();
  ok(order1[0] === '메이드B', '요청한 메이드B 가 맨 위로 (' + order1.join(',') + ')');
  ok(/12분째/.test(await txt(pK, 'section.maid.asked .dreq')) && /1402/.test(await txt(pK, 'section.maid.asked .dreq')), '12분째 · 먼저 할 방 1402');
  ok(await pK.locator('.room.want[data-r="1402"]').count() === 1, '1402 칸 깜빡임');
  ok(await until(async () => /메이드B 님 더티 요청/.test(await pK.evaluate(() => (document.querySelector('.dqpop') || {}).textContent || '')), 17000), '김정비 휴대폰에 알림 띠');
  if (process.env.SHOT) { await pK.waitForTimeout(600); await pK.screenshot({ path: path.join(process.env.SHOT, '4_정비보조_알림띠.png') }); }
  const seenK = await pK.evaluate(d => localStorage.getItem('dust_dq_' + d), DAY);
  ok(seenK && /메이드B_1/.test(seenK), '같은 요청은 한 번만 울리게 기억');
  ok(!/더티 요청/.test(await pP.evaluate(() => (document.querySelector('.dqpop') || {}).textContent || '')), '박보조(담당 아님)는 안 울림');
  ok(await pP.locator('section.maid.asked').count() === 0, '박보조 화면엔 요청 카드 없음');
  ok(await until(async () => /지금 더티 요청 1명/.test(await txt(pM, '#main'))), '관리자: 지금 더티 요청 1명');
  if (process.env.SHOT) {
    await pK.evaluate(() => { const t = document.querySelector('.dqpop'); if (t) t.click(); window.scrollTo(0, 0); });
    await pK.waitForTimeout(300);
    await pK.screenshot({ path: path.join(process.env.SHOT, '3_정비보조_요청카드.png') });
    await pM.evaluate(() => { const e = [...document.querySelectorAll('p.sec')].find(x => /더티 요청/.test(x.textContent)); if (e) { e.id = 'dqsec'; e.nextElementSibling.id = 'dqcard'; } });
    const bx = await pM.evaluate(() => { const a = document.getElementById('dqsec').getBoundingClientRect(), b = document.getElementById('dqcard').getBoundingClientRect(); return { x: 0, y: a.top + scrollY - 4, width: 390, height: b.bottom - a.top + 10 }; });
    await pM.screenshot({ path: path.join(process.env.SHOT, '5_정비보조앱_관리자_요청목록.png'), clip: bx, fullPage: true });
  }

  console.log('③ 11/25: 긴급 요청한 방(1402·1403) — 다른 방 1401 → 그대로 · 1402 → 1개 남음 · 1403 → 꺼짐');
  await pK.click('.room[data-r="1401"]');
  await sleep(1500);
  ok((await pK.locator('section.maid.asked').count()) === 1 && /분째 기다림/.test(await txt(pK, 'section.maid.asked .dreq')), '긴급 요청한 방이 아닌 방만 하면 요청 그대로');
  await pK.click('.room[data-r="1402"]');
  ok(await until(async () => /긴급 요청한 방이 1개 남았어요/.test(await txt(pK, 'section.maid.asked .dreq')), 6000), '1402 하면 "긴급 요청한 방이 1개 남았어요"');
  ok(await until(async () => /긴급 요청한 방이 1개 남았어요/.test(await txt(pM, '#main')), 8000), '관리자 목록에도 같은 말');
  if (process.env.SHOT) { const c = pK.locator('section.maid.asked').first(); await c.scrollIntoViewIfNeeded(); await pK.waitForTimeout(400); await pK.screenshot({ path: path.join(process.env.SHOT, '6_긴급요청_1개남음.png') }); }
  await pK.click('.room[data-r="1403"]');
  ok(await until(async () => (await pK.locator('section.maid.asked').count()) === 0, 6000), '긴급 요청한 방을 다 하면 요청 표시 꺼짐');
  ok(await until(async () => !/지금 더티 요청/.test(await txt(pM, '#main')), 8000), '관리자 목록에서도 빠짐');

  const errs = [pK, pP, pM].flatMap(p => p.errors.map(e => p.label + ': ' + e));
  ok(!errs.length, '화면 오류 없음' + (errs.length ? ' ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

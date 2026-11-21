// 관리자 허브에서 정비보조별 진행 보기·수정(?hub=sup) 시험 (2026-11-21) — 휴대폰(Playwright) + 메모리 Firestore(규칙 v5)
// NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node run_hubact.js /home/claude/dirty
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { make } = require('./fakedb');
const APP = process.argv[2] || '/home/claude/dirty';
const BASE = 'https://haeundae-rm.github.io/dirty/';
const Calc = require(path.join(APP, 'distcalc.js'));
const fmt = (d, f) => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {}); return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute); };
const DAY = fmt(new Date(), 'yyyy-MM-dd'), TOM = fmt(new Date(Date.now() + 864e5), 'yyyy-MM-dd');
let pass = 0, fail = 0;
function ok(c, label) { if (c) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ ' + label); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, ms) { const t = Date.now(); while (Date.now() - t < (ms || 4000)) { try { if (await fn()) return true; } catch (e) {} await sleep(100); } return false; }
const txt = (page, sel) => page.locator(sel).first().innerText().catch(() => '');

async function phone(browser, db, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  await ctx.exposeBinding('__db', (src, op, a) => db.handle(src.page, op, a));
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (u.startsWith(BASE)) {
      const rel = u.slice(BASE.length).split('?')[0] || 'index.html';
      const file = rel === 'store.js' ? path.join(__dirname, 'fake_store.js') : path.join(APP, rel);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
      const ct = /\.js$/.test(file) ? 'application/javascript' : /\.html$/.test(file) ? 'text/html' : /\.json$/.test(file) ? 'application/json' : /\.css$/.test(file) ? 'text/css' : 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: ct + '; charset=utf-8', body: fs.readFileSync(file) });
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load/.test(m.text())) page.errors.push('console: ' + m.text()); });
  page.on('dialog', d => { page.lastDialog = d.message(); d.accept(); });
  await page.goto(BASE);
  page.label = name;
  return page;
}
async function adminIn(p, db) {
  await until(async () => (await p.locator('[data-admin-in]').count()) === 1);
  await p.click('[data-admin-in]'); await p.click('[data-who="소장"]'); await p.fill('#pin', db.PW); await p.click('.panel [data-do]');
  return until(async () => (await p.locator('[data-dist]').count()) === 1, 6000);
}

const PLAN = [
  { d: DAY, w: '김정비', c: '#1F5FA8', m: '메이드A', f: '12-13F', n: 3, r: '1201, 1202, 1203, 1301' },
  { d: DAY, w: '박보조', c: '#B03A2E', m: '메이드B', f: '14F', n: 2, r: '1401, 1402, 1403' }
];
(async () => {
  const browser = await chromium.launch();
  const db = make();
  await db.serverWrite('sup/' + DAY, { date: DAY, plan: PLAN, sig: 'x' });
  await db.serverWrite('sup_meta/names', { names: ['김정비', '박보조'], lastDate: DAY, day: DAY });
  await db.serverWrite('sup_meta/relay', { ok: true, err: '', ver: 't', at: { __ts: Date.now() } });

  console.log('① 주소에 hub 없으면 그대로 (정비보조 휴대폰)');
  const p0 = await phone(browser, db, '보통');
  await sleep(1500);
  ok(!(await p0.evaluate(() => document.documentElement.classList.contains('hubsup'))), 'hubsup 아님');

  console.log('② 관리자: 마지막으로 본 탭이 정비보조 탭이어도 ?hub=sup 은 관리자 탭으로');
  const pM = await phone(browser, db, '관리자');
  await until(async () => (await pM.locator('[data-admin-in]').count()) === 1);
  await pM.click('[data-admin-in]'); await pM.click('[data-who="소장"]'); await pM.fill('#pin', db.PW); await pM.click('.panel [data-do]');
  await until(async () => (await pM.locator('.amode').count()) === 1, 6000);
  await pM.click('.tab[data-t="김정비"]');
  ok(await pM.evaluate(() => localStorage.getItem('dust_tab')) === '김정비', '(준비) 저장된 탭 = 김정비');
  await pM.goto(BASE + '?hub=sup');
  await pM.evaluate(() => { window.__msgs = []; window.addEventListener('message', e => window.__msgs.push(e.data)); });
  ok(await until(async () => /진행 현황/.test(await txt(pM, '#main')), 10000), '관리자 탭(진행 현황)으로 열림');
  ok(await until(() => pM.evaluate(() => !document.documentElement.classList.contains('hubwait'))), '화면 보임');
  const m = await txt(pM, '#main');
  ok(/김정비/.test(m) && /박보조/.test(m) && /실 남음/.test(m), '정비보조별 남은 더티 카드');
  ok(await pM.locator('[data-addw]').count() === 1, '+ 정비보조 추가 버튼');
  ok(await pM.locator('[data-endw]').count() === 2, '근무 종료 버튼 (정비보조마다)');
  ok(await pM.evaluate(() => [...document.querySelectorAll('[data-admin-off]')].every(b => b.offsetParent === null)), '관리자 모드 끄기 숨김');
  ok(await pM.evaluate(() => localStorage.getItem('dust_tab')) === '김정비', '저장된 탭은 그대로');
  await pM.click('.tab[data-t="박보조"]');
  ok(await until(async () => (await pM.locator('#main .room').count()) >= 1), '정비보조 탭 → 객실 (대신 체크)');
  await pM.locator('#main .room').first().click();
  ok(await until(async () => /대신/.test(await txt(pM, '#sheet'))), '객실 누르면 대신 체크 창');
  await pM.evaluate(() => { const x = document.querySelector('#sheet [data-x="1"], #sheet [data-do="no"], #sheet .ghost'); if (x) x.click(); });
  await pM.goto('about:blank'); await pM.goto(BASE);
  ok(await until(async () => (await pM.locator('.tab[data-t="김정비"][aria-selected="true"]').count()) === 1, 8000), '허브 창 닫은 뒤 이 기기는 원래 탭(김정비)');
  if (process.env.SHOT) { await pM.goto(BASE + '?hub=sup'); await until(async () => /진행 현황/.test(await txt(pM, '#main')), 10000); await sleep(600); await pM.screenshot({ path: process.env.SHOT }); }

  console.log('③ 관리자가 아니면 화면 가리고 noadmin 알림');
  const pW = await phone(browser, db, '근무자');
  await pW.goto(BASE + '?hub=sup');
  await pW.evaluate(() => { window.__msgs = []; window.addEventListener('message', e => window.__msgs.push(e.data)); });
  ok(await pW.evaluate(() => getComputedStyle(document.querySelector('#main')).visibility === 'hidden'), '근무자 고르기 화면은 가림');
  ok(await until(() => pW.evaluate(() => (window.__msgs || []).some(m => m && m.hub === 'noadmin')), 25000), '20초 안에 관리자 확인 안 되면 noadmin');
  const errs = [p0, pM, pW].flatMap(p => p.errors.map(e => p.label + ': ' + e));
  ok(!errs.length, '화면 오류 0' + (errs.length ? ' → ' + errs.slice(0, 4).join(' | ') : ''));
  await browser.close();
  console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

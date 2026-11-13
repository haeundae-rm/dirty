// 관리자 허브에서 활동판 열기(?hub=act) 시험 (2026-11-13) — 휴대폰(Playwright) + 메모리 Firestore(규칙 v5)
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

(async () => {
  const browser = await chromium.launch();
  const db = make();
  await db.serverWrite('sup_meta/names', { names: ['호세인'], lastDate: '2026-11-06', day: DAY });
  await db.serverWrite('sup_meta/relay', { ok: true, err: '', ver: 't', at: { __ts: Date.now() } });
  await db.serverWrite('acts/A1', { name: '이불장 얼룩 제거', color: '보라', start: DAY, due: '', exclText: '', memo: '', status: '진행', made: { __ts: Date.now() } });

  console.log('① 주소에 hub 없으면 그대로');
  const p0 = await phone(browser, db, '보통');
  await sleep(1500);
  ok(!(await p0.evaluate(() => document.documentElement.classList.contains('hubmode'))), 'hubmode 아님');

  console.log('② 관리자 로그인 뒤 ?hub=act → 활동판 바로 열림');
  const pM = await phone(browser, db, '관리자');
  await until(async () => (await pM.locator('[data-admin-in]').count()) === 1);
  await pM.click('[data-admin-in]'); await pM.click('[data-who="소장"]'); await pM.fill('#pin', db.PW); await pM.click('.panel [data-do]');
  await until(async () => (await pM.locator('.amode').count()) === 1, 6000);
  await pM.evaluate(() => { window.__msgs = []; });
  await pM.goto(BASE + '?hub=act');
  await pM.evaluate(() => { window.__msgs = []; window.addEventListener('message', e => window.__msgs.push(e.data)); });
  ok(await until(async () => /이불장 얼룩 제거/.test(await txt(pM, '#sheet')), 10000), '활동판 목록이 바로 열림');
  ok(await pM.evaluate(() => getComputedStyle(document.querySelector('#main')).visibility === 'hidden'), '뒤 화면은 가림');
  await pM.click('#sheet [data-x="1"]');
  ok(await until(() => pM.evaluate(() => (window.__msgs || []).some(m => m && m.hub === 'close'))), '닫으면 허브에 close 알림');

  console.log('③ 관리자가 아니면 noadmin 알림');
  const pW = await phone(browser, db, '근무자');
  await pW.goto(BASE + '?hub=act');
  await pW.evaluate(() => { window.__msgs = []; window.addEventListener('message', e => window.__msgs.push(e.data)); });
  ok(await until(() => pW.evaluate(() => (window.__msgs || []).some(m => m && m.hub === 'noadmin')), 25000), '20초 안에 관리자 확인 안 되면 noadmin');
  const errs = [p0, pM, pW].flatMap(p => p.errors.map(e => p.label + ': ' + e));
  ok(!errs.length, '화면 오류 0' + (errs.length ? ' → ' + errs.slice(0, 4).join(' | ') : ''));
  await browser.close();
  console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

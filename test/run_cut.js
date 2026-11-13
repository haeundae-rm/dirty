// 정비보조: 원래 배정 객실을 더티 대상에서 빼기 시험 (2026-11-13) — 휴대폰(Playwright) + 메모리 Firestore(규칙 v5)
// NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node run_cut.js /home/claude/dirty
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
  { d: DAY, w: '김정비', c: '#1F5FA8', m: '메이드B', f: '14F', n: 2, r: '1401, 1402, 1403' }
];
const rowsOf = db => [...db.docs.entries()].filter(([k]) => k.startsWith('sup/' + DAY + '/rows/')).map(([, v]) => v);
(async () => {
  const browser = await chromium.launch();
  const db = make();
  await db.serverWrite('sup/' + DAY, { date: DAY, plan: PLAN, sig: 'x' });
  await db.serverWrite('sup_meta/names', { names: ['김정비'], lastDate: DAY, day: DAY });
  await db.serverWrite('sup_meta/relay', { ok: true, err: '', ver: 't', at: { __ts: Date.now() } });
  await db.serverWrite('sup/' + DAY + '/rows/gs_체크_1', { tab: '체크', row: [null, DAY, "'1201", '메이드A', '김정비', '완료', ''], at: { __ts: Date.now() - 60000 }, clientAt: { __ts: Date.now() - 60000 }, uid: db.BOT, by: '관리자' });
  const p = await phone(browser, db, '김정비');
  await until(async () => (await p.locator('[data-pick="김정비"]').count()) === 1);
  await p.click('[data-pick="김정비"]');
  ok(await until(async () => (await p.locator('[data-edit="메이드A"]').count()) >= 1, 8000), '메이드A 수정 버튼');
  await p.locator('[data-edit="메이드A"]').first().click();
  ok(await until(async () => /배정 객실에서 빼기/.test(await txt(p, '#sheet'))), '수정 창에 "배정 객실에서 빼기"');
  ok(await p.locator('#sheet [data-del="1201"]').count() === 0 && /1201 ✓/.test(await txt(p, '#sheet')), '체크한 1201 은 못 뺌 (✓)');
  await p.click('#sheet [data-del="1203"]');
  ok(/뺄 객실: 1203/.test(await txt(p, '#sheet')), '뺄 객실 표시');
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  await p.click('#sheet [data-undel]');
  ok(!/뺄 객실/.test(await txt(p, '#sheet')), '되돌리기');
  await p.click('#sheet [data-del="1203"]'); await p.click('#sheet [data-del="1301"]');
  await p.click('#sheet [data-do="ok"]');
  ok(await until(() => rowsOf(db).some(r => r.tab === '변경' && r.row[2] === '수정' && r.row[3] === '메이드A' && r.row[7] === '1203, 1301')), "변경 줄: 수정 · 삭제객실 '1203, 1301'");
  ok(await until(() => p.evaluate(() => { const m = findMaid('메이드A'); return m && m.rooms.join() === '1201,1202'; })), '메이드A 객실 = 1201, 1202 (1203·1301 빠짐)');
  ok(await until(async () => (await p.locator('.room[data-r="1203"]').count()) === 0), '화면에서 1203 사라짐');
  await p.locator('[data-edit="메이드A"]').first().click();
  await until(async () => /수량·객실 수정/.test(await txt(p, '#sheet')));
  await p.fill('#addr', '1203'); await p.click('#sheet [data-do="ok"]');
  ok(await until(() => p.evaluate(() => { const m = findMaid('메이드A'); return m && m.rooms.indexOf('1203') >= 0; })), '뺀 객실 다시 추가 가능');
  const err = await p.evaluate(() => { try { SupShim._server.change(plan.date, '수정', '메이드A', '김정비', '', '', '1201'); return 'ok'; } catch (e) { return String(e.message); } });
  ok(/이미 체크한 객실/.test(err), '체크한 객실 빼기는 서버 계산에서도 거절');
  const errs = p.errors; ok(!errs.length, '화면 오류 0' + (errs.length ? ' → ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

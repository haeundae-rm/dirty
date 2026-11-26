// 정비 지원 자동 새로고침 시험 (2026-11-26) — 정비보조 휴대폰(Playwright) + 메모리 Firestore. 가짜 시계로 '2분 쉼'을 바로 넘김
// NODE_PATH=/opt/node22/lib/node_modules node test/run_autoreload.js [/home/claude/dirty]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const { make } = require('./fakedb');
const APP = process.argv[2] || path.resolve(__dirname, '..');
const BASE = 'https://haeundae-rm.github.io/dirty/';
const VER = { v: '' };
const fmt = (d, f) => { const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d).reduce((o, x) => (o[x.type] = x.value, o), {}); return f.replace('yyyy', p.year).replace('MM', p.month).replace('dd', p.day).replace('HH', p.hour).replace('mm', p.minute); };
const DAY = fmt(new Date(), 'yyyy-MM-dd');
let pass = 0, fail = 0;
function ok(c, label) { if (c) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ ' + label); } }
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function phone(browser, db, name) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
  await ctx.exposeBinding('__db', (src, op, a) => db.handle(src.page, op, a));
  await ctx.route('**/*', async route => {
    const u = route.request().url();
    if (/fonts\.(googleapis|gstatic)\.com/.test(u)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (u.startsWith(BASE)) {
      const rel = u.slice(BASE.length).split('?')[0] || 'index.html';
      if (rel === 'version.json' && VER.v) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ v: VER.v }) });
      const file = rel === 'store.js' ? path.join(__dirname, 'fake_store.js') : path.join(APP, rel);
      if (!fs.existsSync(file)) return route.fulfill({ status: 404, body: 'nf' });
      const ct = /\.js$/.test(file) ? 'application/javascript' : /\.html$/.test(file) ? 'text/html' : /\.json$/.test(file) ? 'application/json' : /\.css$/.test(file) ? 'text/css' : 'application/octet-stream';
      return route.fulfill({ status: 200, contentType: ct + '; charset=utf-8', body: fs.readFileSync(file) });
    }
    return route.abort();
  });
  const page = await ctx.newPage(); page.navs = [];
  page.on('framenavigated', f => { if (f === page.mainFrame() && /[?&]r=/.test(f.url())) page.navs.push(f.url()); });
  await page.clock.install({ time: new Date() });
  page.errors = [];
  page.on('pageerror', e => page.errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/fonts|ERR_|Failed to load/.test(m.text())) page.errors.push('console: ' + m.text()); });
  page.on('dialog', d => { page.lastDialog = d.message(); d.accept(); });
  await page.goto(BASE);
  page.label = name;
  return page;
}

const PLAN = [{ d: DAY, w: '김정비', c: '#1F5FA8', m: '메이드A', f: '12-13F', n: 3, r: '1201, 1202, 1203, 1301' }];
const why = p => p.evaluate(() => window.AutoReload ? window.AutoReload.state().why : 'off');
async function idle(p) { for (let i = 0; i < 4; i++) { await sleep(250); await p.clock.fastForward(1000); } await p.clock.fastForward('05:30'); await sleep(400); await p.clock.fastForward('03:00'); await sleep(800); }
(async () => {
  const browser = await chromium.launch();
  const db = make();
  await db.serverWrite('sup/' + DAY, { date: DAY, plan: PLAN, sig: 'x' });
  await db.serverWrite('sup_meta/names', { names: ['김정비'], lastDate: DAY, day: DAY });
  await db.serverWrite('sup_meta/relay', { ok: true, err: '', ver: 't', at: { __ts: Date.now() } });

  console.log('① 같은 버전');
  { VER.v = ''; const p = await phone(browser, db, 'a'); await sleep(1500); await idle(p);
    ok(!p.navs.length && (await why(p)) === 'none', '그대로'); ok(!p.errors.length, '화면 오류 없음 ' + p.errors.slice(0, 1)); await p.context().close(); }

  console.log('② 쓰는 중 새 버전 → 쉬면 바뀜');
  { VER.v = ''; const p = await phone(browser, db, 'b'); await sleep(1500); await p.mouse.click(5, 400);
    VER.v = '2099.01.01-1'; await p.clock.fastForward('01:00'); await p.evaluate(() => window.AutoReload.check()); await sleep(600);
    ok(!p.navs.length, '방금 만졌으면 안 바뀜 · 띠 ' + (await p.locator('#sup-new').count()));
    await idle(p); ok(/[?&]r=2099/.test(p.navs[0] || ''), '2분 쉬니까 바뀜'); await p.context().close(); }

  console.log('③ 보내지 못한 체크가 남아 있으면 안 바뀜');
  { VER.v = ''; const p = await phone(browser, db, 'c'); await sleep(1500); await p.mouse.click(5, 400);
    await p.evaluate(() => { window.queue.push({ fake: 1 }); window.sending = true; });
    VER.v = '2099.01.01-1'; await idle(p);
    ok(!p.navs.length && (await why(p)) === 'busy', '보관 중인 입력 있음 → 안 바뀜');
    await p.evaluate(() => { window.queue.length = 0; window.sending = false; }); await idle(p);
    ok(/[?&]r=2099/.test(p.navs[0] || ''), '다 보내고 나니 바뀜'); await p.context().close(); }

  console.log('④ 창(sheet) 열림');
  { VER.v = ''; const p = await phone(browser, db, 'd'); await sleep(1500); await p.mouse.click(5, 400);
    await p.evaluate(() => { window.dlg = { kind: 'x' }; document.getElementById('sheet').innerHTML = '<div>창</div>'; });
    VER.v = '2099.01.01-1'; await idle(p); ok(!p.navs.length && (await why(p)) === 'busy', '창 열려 있으면 안 바뀜'); await p.context().close(); }

  await browser.close();
  console.log('결과: ' + pass + ' 통과 / ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})();

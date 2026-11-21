// 레포트 방 변경 → 정비 지원 자동 반영 화면 시험 (휴대폰 3대). 아래 준비 부분은 run.js 와 같음
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
  const T = ms => ({ __ts: Date.now() - ms });
  await db.serverWrite('sup/' + DAY, { date: DAY, plan: PLAN, sig: 'x', meta: { rule: { '10': 4, '11': 6, '12': 8 }, units: { '메이드D': 9 } } });
  await db.serverWrite('sup_meta/names', { names: ['김정비', '박보조', '이기타'], lastDate: DAY, day: DAY });
  await db.serverWrite('sup_meta/relay', { ok: true, err: '', ver: 't', at: { __ts: Date.now() } });
  const att = (id, n) => db.serverWrite('sup/' + DAY + '/rows/' + id, { tab: '근태', row: [null, DAY, n, '출근', '더티', '', '본인', ''], at: T(3600e3), clientAt: T(3600e3), uid: db.BOT, by: '본인' });
  await att('att1', '김정비'); await att('att2', '박보조');

  console.log('① 휴대폰 열기');
  const pK = await phone(browser, db, '김정비'), pP = await phone(browser, db, '박보조');
  for (const [p, n] of [[pK, '김정비'], [pP, '박보조']]) { await until(async () => (await p.locator('[data-pick="' + n + '"]').count()) === 1); await p.click('[data-pick="' + n + '"]'); }
  ok(await until(async () => /남은 더티/.test(await txt(pP, '.sum'))), '박보조 화면');
  const pM = await phone(browser, db, '관리자');
  await until(async () => (await pM.locator('[data-admin-in]').count()) === 1);
  await pM.click('[data-admin-in]'); await pM.click('[data-who="소장"]'); await pM.fill('#pin', db.PW); await pM.click('.panel [data-do]');
  ok(await until(async () => /진행 현황/.test(await txt(pM, '#main'))), '관리자 화면');

  console.log('② 레포트 앱: 메이드A 객실 추가 1302 · 제외 1203 (지원 중, 유닛 기준 아래)');
  await db.serverWrite('sup/' + DAY + '/rm/c1', { kind: '추가', maid: '메이드A', room: '1302', by: '본인', at: T(5000), clientAt: T(5000), uid: 'm1', parties: ['메이드A'] });
  await db.serverWrite('sup/' + DAY + '/rm/c2', { kind: '제외', maid: '메이드A', room: '1203', by: '관리자', at: T(4000), clientAt: T(4000), uid: 'm1', parties: ['메이드A'] });
  ok(await until(async () => (await pK.locator('.room[data-r="1302"]').count()) === 1, 6000), '김정비 화면에 1302 바로 붙음');
  ok(await pK.locator('.room.new[data-r="1302"]').count() === 1, '1302 에 추가 표시');
  ok(await until(async () => (await pK.locator('.room[data-r="1203"]').count()) === 0), '1203 빠짐');
  ok(await until(async () => /레포트 앱 · 메이드A 님 객실 추가 1302/.test(await txt(pM, '#main'))), '관리자 변경 목록: 📋 레포트 앱 표시');

  console.log('③ 메이드D(아침 9유닛, 지원 없음) 객실 추가 → 10유닛 → 더티 적은 박보조(2실)에게 자동');
  await db.serverWrite('sup/' + DAY + '/rm/c3', { kind: '추가', maid: '메이드D', room: '1603', by: '본인', at: T(60e3), clientAt: T(60e3), uid: 'm4', parties: ['메이드D'] });
  ok(await until(() => rows(db, r => r.id.indexOf('auto-') === 0 && r.row[2] === '가져옴').length >= 1, 8000), '자동 가져옴 줄 저장');
  const tk = rows(db, r => r.id.indexOf('auto-') === 0 && r.row[2] === '가져옴');
  ok(tk.length === 1, '휴대폰 3대가 같이 계산해도 한 줄 (' + tk.length + ')');
  ok(tk[0] && tk[0].row[3] === '메이드D' && tk[0].row[4] === '박보조' && tk[0].row[6] === 4 && tk[0].row[8] === '자동', '메이드D → 박보조, 더티 4, 자동');
  ok(await until(async () => /메이드D/.test(await txt(pP, '#main')) && (await pP.locator('.room[data-r="1603"]').count()) === 1, 6000), '박보조 화면에 메이드D 카드 (1603 포함)');
  ok(/자동/.test(await txt(pP, '.maid-head')) || /자동/.test(await pP.locator('#main').innerText()), '카드에 자동 표시');
  ok(await until(async () => /자동 배정/.test(await txt(pM, '#main'))), '관리자 화면: 자동 배정 알림');
  ok(await until(() => [...db.docs.keys()].some(k => k.startsWith('sup/' + DAY + '/auto/a-'))), '허브용 알림 문서');
  if (process.env.SHOT) {   // 안내용 그림
    const sh = async (pg, f, sel) => { const el = pg.locator(sel).first(); await el.scrollIntoViewIfNeeded().catch(() => {}); await el.screenshot({ path: path.join(process.env.SHOT, f) }); };
    await sh(pP, '1_정비보조_자동배정카드.png', 'section.maid:has-text("메이드D")');
    await pM.evaluate(() => { const e = [...document.querySelectorAll('p.sec')].find(x => /자동 배정/.test(x.textContent)); if (e) { e.id = 'autosec'; e.nextElementSibling.id = 'autocard'; } });
    await pM.setViewportSize({ width: 390, height: 1400 });
    const bx = await pM.evaluate(() => { const a = document.getElementById('autosec').getBoundingClientRect(), b = document.getElementById('autocard').getBoundingClientRect(); return { x: 0, y: a.top + scrollY, width: 390, height: b.bottom - a.top + 4 }; });
    await pM.screenshot({ path: path.join(process.env.SHOT, '2_관리자_알림.png'), clip: bx, fullPage: true });
    await pM.setViewportSize({ width: 390, height: 844 });
  }
  const al = [...db.docs.entries()].filter(([k]) => k.startsWith('sup/' + DAY + '/auto/')).map(([, d]) => d).filter(d => d.maid === '메이드D')[0];
  ok(al && al.st === 'auto' && al.w === '박보조' && al.n === 4 && al.unit === 10, '알림 내용 (auto · 박보조 · 4실 · 10유닛)');

  ok(![...db.docs.entries()].some(([k, d]) => k.startsWith('sup/' + DAY + '/auto/') && d.maid === '메이드A'), '유닛 기준 아래(4유닛) 메이드A 는 알림 없음');

  console.log('④ 다시 빼면 → 체크 0 → 자동 배정 풀림');
  await db.serverWrite('sup/' + DAY + '/rm/c4', { kind: '제외', maid: '메이드D', room: '1603', by: '본인', at: T(45e3), clientAt: T(45e3), uid: 'm4', parties: ['메이드D'] });
  ok(await until(() => rows(db, r => r.id.indexOf('auto-') === 0 && r.row[2] === '되돌림').length === 1, 8000), '자동 되돌림 줄');
  ok(await until(async () => (await pP.locator('.room[data-r="1603"]').count()) === 0), '박보조 화면에서 메이드D 빠짐');

  const errs = [pK, pP, pM].flatMap(p => p.errors.map(e => p.label + ': ' + e));
  ok(!errs.length, '화면 오류 없음' + (errs.length ? ' ' + errs.slice(0, 3).join(' | ') : ''));
  await browser.close();
  console.log(`\n결과: ${pass} 통과 / ${fail} 실패`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });

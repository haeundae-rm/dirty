// 관리자 '직원 명단' 화면 시험 (2026-11-12) — 휴대폰(Playwright) + 메모리 Firestore(규칙 v5)
// NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node run_staff.js /home/claude/dirty
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
  // 입퇴사 앱에서 온 사람 1명 + 직접 넣은 사람 2명 (동명이인 1쌍)
  await db.serverWrite('staff/W261101090000', { name: '홍길순', job: '룸메이드', grade: '신규', shift: '', hired: '2026-11-03', left: '', status: '재직', src: 'hr', hrId: 'W261101090000' });
  await db.serverWrite('staff/m1', { name: '김영희', job: '룸메이드', grade: 'S', shift: '', hired: '', left: '', status: '재직', src: '관리자', hrId: '' });
  await db.serverWrite('staff/m2', { name: '김영희', job: '미화', grade: '', shift: '', hired: '2015-05-01', left: '', status: '재직', src: '관리자', hrId: '' });

  console.log('① 날짜 읽기 · 근속');
  const pM = await phone(browser, db, '관리자');
  const nd = await pM.evaluate(() => ['2019-03-04', '2019.3.4', '19.03.04', '20190304', '43528', '2019년 3월 4일', '', '2019-02-30', '어제'].map(x => SupStaff.normDate(x)));
  ok(JSON.stringify(nd) === JSON.stringify(['2019-03-04', '2019-03-04', '2019-03-04', '2019-03-04', '2019-03-04', '2019-03-04', '', null, null]), '날짜 여러 모양 → 2019-03-04 · 빈칸 · 이상한 날짜 거름 (' + JSON.stringify(nd) + ')');
  const tn = await pM.evaluate(() => [SupStaff.tenure({ hired: '2015-05-01', left: '2020-04-30' }), SupStaff.tenure({ hired: '2020-01-15', left: '2020-03-14' })]);
  ok(tn[0] === '4년 11개월' && tn[1] === '1개월', '근속 계산 (' + tn.join(', ') + ')');

  console.log('② 근무자는 버튼 없음 · 명단 못 읽음');
  const pW = await phone(browser, db, '근무자');
  await until(async () => (await pW.locator('[data-pick="호세인"]').count()) === 1);
  await pW.click('[data-pick="호세인"]');
  await sleep(500);
  ok(await pW.locator('[data-sf="open"]').count() === 0, '근무자 화면에 직원 명단 버튼 없음');
  const wr = await pW.evaluate(async () => { try { await SupShim._S.store.getQuery('staff', []); return 'ok'; } catch (e) { return 'rejected'; } });
  ok(wr === 'rejected', '근무자는 staff 못 읽음');
  const ww = await pW.evaluate(async () => { try { await SupShim._S.store.set('staff/x', { name: 'x' }); return 'ok'; } catch (e) { return 'rejected'; } });
  ok(ww === 'rejected', '근무자는 staff 못 씀');

  console.log('③ 관리자: 직원 명단 열기');
  await until(async () => (await pM.locator('[data-admin-in]').count()) === 1);
  await pM.click('[data-admin-in]'); await pM.click('[data-who="소장"]'); await pM.fill('#pin', db.PW); await pM.click('.panel [data-do]');
  ok(await until(async () => (await pM.locator('[data-sf="open"]').count()) === 1, 6000), '관리자 화면에 🧾 직원 명단 버튼');
  await pM.click('[data-sf="open"]');
  ok(await until(async () => /재직 3/.test(await txt(pM, '#sf'))), '재직 3명');
  ok(/입사일이 빈 분이 1명/.test(await txt(pM, '#sf')), '입사일 빈 사람 안내');
  ok(/홍길순/.test(await txt(pM, '#sf')) && (await pM.locator('#sf .sf-n em').count()) === 1, '입퇴사 앱에서 온 분 표시(앱)');
  await pM.click('#sf [data-sf="job"][data-v="미화"]');
  ok(await until(async () => (await pM.locator('#sf .sf-row').count()) === 1), '직종 거르기 (미화 1명)');
  await pM.click('#sf [data-sf="job"][data-v=""]');
  await pM.fill('#sf [data-sf="q"]', '길순');
  ok(await until(async () => (await pM.locator('#sf .sf-row').count()) === 1), '이름 찾기');
  await pM.fill('#sf [data-sf="q"]', '');

  console.log('④ 한 명 추가 · 고치기');
  await pM.click('#sf [data-sf="add"]');
  await pM.fill('#sf [data-sff="name"]', '박정숙');
  await pM.selectOption('#sf [data-sff="job"]', '사우나');
  await pM.fill('#sf [data-sff="hired"]', '2021-07-01');
  await pM.click('#sf [data-sf="esave"]');
  ok(await until(() => [...db.docs.keys()].some(k => k.startsWith('staff/m') && db.docs.get(k).name === '박정숙')), '박정숙 저장됨');
  const pj = [...db.docs.entries()].filter(([k, v]) => v.name === '박정숙')[0][1];
  ok(pj.job === '사우나' && pj.hired === '2021-07-01' && pj.status === '재직' && pj.src === '관리자' && pj.uid, '저장 내용 (직종·입사일·상태·출처·누가)');
  await pM.locator('#sf .sf-row', { hasText: '박정숙' }).click();
  await pM.selectOption('#sf [data-sff="status"]', '퇴사');
  await pM.fill('#sf [data-sff="left"]', '2026-11-10');
  await pM.click('#sf [data-sf="esave"]');
  ok(await until(() => [...db.docs.values()].some(v => v.name === '박정숙' && v.status === '퇴사' && v.left === '2026-11-10')), '고치기: 퇴사 처리');
  ok(await until(async () => (await pM.locator('#sf .sf-row', { hasText: '박정숙' }).count()) === 0), '재직 탭에서 빠짐');

  console.log('⑤ 엑셀 붙여넣기 (본사 입사일 자료 모양)');
  await pM.click('#sf [data-sf="paste"]');
  const text = ['성명\t직종\t입사일\t비고', '홍길순\t룸메이드\t2026.11.03\t', '김영희\t룸메이드\t2008-04-01\t', '이순자\t미화\t43528\t', '최미경\t하우스맨\t2019년 3월 4일\t', '정은주\t룸메이드\t3월쯤\t', '김영희\t미화\t2015-05-01\t'].join('\n');
  await pM.fill('#sf [data-sf="ta"]', text);
  await pM.click('#sf [data-sf="pcheck"]');
  ok(await until(async () => /새로 2명/.test(await txt(pM, '#sf'))), '새로 2명 (이순자·최미경)');
  const pv = await txt(pM, '#sf');
  ok(/바뀜 1명/.test(pv) && /입사일 빈칸 → 08\.04\.01/.test(pv), '바뀜 1명: 김영희(룸메이드) 입사일 빈칸 → 08.04.01');
  ok(/같음 2명/.test(pv), '같음 2명 (홍길순 · 김영희 미화)');
  ok(/확인 필요 1줄/.test(pv) && /정은주/.test(pv), '날짜 못 읽은 줄은 저장 안 하고 알려 줌');
  ok(/이름 · 직종 · 입사일/.test(pv), '읽은 칸 표시');
  await pM.click('#sf [data-sf="psave"]');
  ok(await until(async () => /3명을 저장했어요/.test(await txt(pM, '#sf'))), '3명 저장');
  ok(db.docs.get('staff/m1').hired === '2008-04-01' && db.docs.get('staff/m2').hired === '2015-05-01', '김영희 두 분이 직종으로 구분돼 각자 맞게');
  const lee = [...db.docs.values()].filter(v => v.name === '이순자')[0];
  ok(lee && lee.hired === '2019-03-04' && lee.job === '미화' && lee.status === '재직', '엑셀 날짜 숫자 → 2019-03-04');
  ok(db.docs.get('staff/W261101090000').src === 'hr', '앱에서 온 분은 그대로');

  console.log('⑥ 동명이인인데 직종 없이 붙여 넣으면 저장 안 함');
  await pM.click('#sf [data-sf="paste"]');
  await pM.fill('#sf [data-sf="ta"]', '김영희\t\t2001-01-01');
  await pM.click('#sf [data-sf="pcheck"]');
  ok(await until(async () => /명단에 2명 있어요/.test(await txt(pM, '#sf'))), '동명이인 → 확인 필요');
  await pM.click('#sf [data-sf="back"]');

  console.log('⑦ 지우기');
  await pM.locator('#sf .sf-row', { hasText: '최미경' }).click();
  await pM.click('#sf [data-sf="edel"]');
  ok(await until(() => ![...db.docs.values()].some(v => v.name === '최미경')), '최미경 지움 (확인 창 → 예)');
  ok(/완전히 지울까요/.test(pM.lastDialog || ''), '지우기 확인 창');
  await pM.click('#sf [data-sf="close"]');
  ok(await pM.locator('#sf').count() === 0, '닫기');

  console.log('⑧ 오류');
  const errs = [pW, pM].flatMap(p => p.errors.map(e => p.label + ': ' + e));
  ok(!errs.length, '화면 오류 0' + (errs.length ? ' → ' + errs.slice(0, 4).join(' | ') : ''));
  const bad = db.log.rejects.filter(r => !/^staff\/x$/.test(r.path));
  ok(!bad.length, '정상 흐름 규칙 거절 0' + (bad.length ? ' → ' + JSON.stringify(bad.slice(0, 2)) : ''));
  if (process.env.SHOT) { await pM.click('[data-sf="open"]'); await sleep(800); await pM.screenshot({ path: process.env.SHOT, fullPage: false }); }
  await browser.close();
  console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

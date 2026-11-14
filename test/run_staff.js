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
  await db.serverWrite('sup_meta/names', { names: ['호세인', '니라기'], lastDate: '2026-11-06', day: DAY });
  await db.serverWrite('sup_meta/relay', { ok: true, err: '', ver: 't', at: { __ts: Date.now() } });
  await db.serverWrite('sup_meta/roster', { add: ['예전추가'], hide: [] });
  // 입퇴사 앱에서 온 정비보조 1명 + 직접 넣은 정비보조 1명 + 다른 직종(룸메이드·미화) — 정비 지원 화면엔 정비보조만
  await db.serverWrite('staff/W261101090000', { name: '홍길순', job: '정비보조', grade: '', shift: '', hired: '2026-11-03', left: '', status: '재직', src: 'hr', hrId: 'W261101090000' });
  await db.serverWrite('staff/m1', { name: '호세인', job: '정비보조', grade: '', shift: '', hired: '', left: '', status: '재직', src: '관리자', hrId: '' });
  await db.serverWrite('staff/m2', { name: '김영희', job: '룸메이드', grade: 'S', shift: '', hired: '2008-04-01', left: '', status: '재직', src: '관리자', hrId: '' });
  await db.serverWrite('staff/m3', { name: '이미화', job: '미화', grade: '', shift: '', hired: '2015-05-01', left: '', status: '재직', src: '관리자', hrId: '' });

  console.log('① 날짜 읽기 · 근속');
  const pM = await phone(browser, db, '관리자');
  const nd = await pM.evaluate(() => ['2019-03-04', '2019.3.4', '19.03.04', '20190304', '43528', '2019년 3월 4일', '', '2019-02-30', '어제'].map(x => StaffBook.normDate(x)));
  ok(JSON.stringify(nd) === JSON.stringify(['2019-03-04', '2019-03-04', '2019-03-04', '2019-03-04', '2019-03-04', '2019-03-04', '', null, null]), '날짜 여러 모양 → 2019-03-04 · 빈칸 · 이상한 날짜 거름');
  const tn = await pM.evaluate(() => [StaffBook.tenure({ hired: '2015-05-01', left: '2020-04-30' }), StaffBook.tenure({ hired: '2020-01-15', left: '2020-03-14' })]);
  ok(tn[0] === '4년 11개월' && tn[1] === '1개월', '근속 계산 (' + tn.join(', ') + ')');

  console.log('② 근무자는 버튼 없음 · 명단 못 읽음');
  const pW = await phone(browser, db, '근무자');
  await until(async () => (await pW.locator('[data-pick="호세인"]').count()) === 1);
  await pW.click('[data-pick="호세인"]');
  await sleep(500);
  ok(await pW.locator('[data-sbopen]').count() === 0 && await pW.locator('[data-rs="open"]').count() === 0, '근무자 화면에 명단 버튼 없음');
  const wr = await pW.evaluate(async () => { try { await SupShim._S.store.getQuery('staff', []); return 'ok'; } catch (e) { return 'rejected'; } });
  ok(wr === 'rejected', '근무자는 staff 못 읽음');
  const ww = await pW.evaluate(async () => { try { await SupShim._S.store.set('staff/x', { name: 'x' }); return 'ok'; } catch (e) { return 'rejected'; } });
  ok(ww === 'rejected', '근무자는 staff 못 씀');

  console.log('③ 관리자: 정비보조 명단 (정비보조만)');
  await until(async () => (await pM.locator('[data-admin-in]').count()) === 1);
  await pM.click('[data-admin-in]'); await pM.click('[data-who="소장"]'); await pM.fill('#pin', db.PW); await pM.click('.panel [data-do]');
  ok(await until(async () => (await pM.locator('[data-sbopen]').count()) === 1, 6000), "관리자 화면에 '👥 정비보조 명단' 버튼 하나");
  ok(await pM.locator('.amode [data-rs="open"]').count() === 0, '예전 명단 버튼은 없어짐');
  await pM.click('[data-sbopen]');
  ok(await until(async () => /재직\s*2/.test(await txt(pM, '#sb'))), '재직 2명 (정비보조만)');
  const t1 = await txt(pM, '#sb');
  ok(!/김영희|이미화/.test(t1), '룸메이드·미화는 안 보임');
  ok(/입사일이 빈 분이 1명/.test(t1), '입사일 빈 사람 안내 (호세인)');
  ok(/명단에 아직 없는 이름 2명/.test(t1) && /니라기/.test(t1) && /예전추가/.test(t1), '최근 근무·예전 목록에만 있는 이름 2명 (니라기·예전추가)');
  ok((await pM.locator('#sb .sb-n em').count()) === 1, '입퇴사 앱에서 온 분 표시(앱)');

  console.log('④ 없는 이름 눌러서 추가 · 고치기 · 이름 목록 맞추기');
  await pM.click('#sb [data-sb="prefill"][data-v="니라기"]');
  ok((await pM.inputValue('#sb [data-sbf="name"]')) === '니라기', '이름이 채워진 추가 화면');
  await pM.fill('#sb [data-sbf="hired"]', '2025-04-01');
  await pM.click('#sb [data-sb="esave"]');
  ok(await until(() => [...db.docs.entries()].some(([k, v]) => k.startsWith('staff/m') && v.name === '니라기' && v.job === '정비보조' && v.hired === '2025-04-01' && v.status === '재직' && v.src === '관리자')), '니라기 저장 (직종 정비보조 자동)');
  ok(await until(() => { const r = db.docs.get('sup_meta/roster'); return r && r.add.indexOf('니라기') >= 0 && r.add.indexOf('홍길순') >= 0 && r.add.indexOf('예전추가') >= 0; }), '이름 고르기 목록(roster)에 재직자 넣음 · 예전 것 유지');
  await pM.locator('#sb .sb-row', { hasText: '호세인' }).click();
  await pM.fill('#sb [data-sbf="left"]', '2026-11-01');
  await pM.click('#sb [data-sb="esave"]');
  ok(await until(() => db.docs.get('staff/m1').status === '퇴사' && db.docs.get('staff/m1').left === '2026-11-01'), '퇴사일 지났으면 상태도 퇴사로 (확인 창)');
  ok(await until(() => { const r = db.docs.get('sup_meta/roster'); return r && r.hide.indexOf('호세인') >= 0 && r.add.indexOf('호세인') < 0; }), '퇴사 → 이름 고르기 목록에서 뺌');
  const pR = await phone(browser, db, 'R');
  ok(await until(async () => (await pR.locator('[data-pick="니라기"]').count()) === 1 && (await pR.locator('[data-pick="호세인"]').count()) === 0, 10000), '근무자 이름 고르기: 니라기 있음 · 호세인 없음');

  console.log('⑤ 엑셀 붙여넣기 (다른 직종 섞인 본사 자료)');
  await pM.click('#sb [data-sb="paste"]');
  const text = ['성명\t직종\t입사일\t비고', '홍길순\t정비보조\t2026.11.03\t', '김영희\t룸메이드\t2008-04-01\t', '박보조\t정비보조\t43528\t', '최보조\t정비보조\t2019년 3월 4일\t', '정보조\t정비보조\t3월쯤\t', '니라기\t정비보조\t2025-03-01\t'].join('\n');
  await pM.fill('#sb [data-sb="ta"]', text);
  await pM.click('#sb [data-sb="pcheck"]');
  ok(await until(async () => /새로 2명/.test(await txt(pM, '#sb'))), '새로 2명 (박보조·최보조)');
  const pv = await txt(pM, '#sb');
  ok(/바뀜 1명/.test(pv) && /입사일 25\.04\.01 → 25\.03\.01/.test(pv), '바뀜 1명: 니라기 입사일');
  ok(/같음 1명/.test(pv) && /다른 직종 1줄 건너뜀/.test(pv), '같음 1명 (홍길순) · 룸메이드 줄은 건너뜀');
  ok(/확인 필요 1줄/.test(pv) && /정보조/.test(pv), '날짜 못 읽은 줄은 저장 안 하고 알려 줌');
  await pM.click('#sb [data-sb="psave"]');
  ok(await until(async () => /3명을 저장했어요/.test(await txt(pM, '#sb'))), '3명 저장');
  const park = [...db.docs.values()].filter(v => v.name === '박보조')[0];
  ok(park && park.hired === '2019-03-04' && park.job === '정비보조', '엑셀 날짜 숫자 → 2019-03-04');
  ok(db.docs.get('staff/m2').hired === '2008-04-01' && db.docs.get('staff/m2').job === '룸메이드', '룸메이드 김영희는 그대로');
  ok(await until(() => { const r = db.docs.get('sup_meta/roster'); return r && r.add.indexOf('박보조') >= 0; }), '붙여넣은 분도 이름 목록에');

  console.log('⑤-2 이름 고치기 (박보조 → 박보죠)');
  await pM.locator('#sb .sb-row', { hasText: '박보조' }).click();
  await pM.fill('#sb [data-sbf="name"]', '박보죠');
  await pM.click('#sb [data-sb="esave"]');
  ok(await until(() => { const r = db.docs.get('sup_meta/roster'); return r && r.add.indexOf('박보죠') >= 0 && r.add.indexOf('박보조') < 0 && r.hide.indexOf('박보조') >= 0; }), '고친 이름은 목록에 · 예전 이름은 빠짐');
  await pM.locator('#sb .sb-row', { hasText: '박보죠' }).click();
  await pM.fill('#sb [data-sbf="name"]', '박보조');
  await pM.click('#sb [data-sb="esave"]');
  ok(await until(() => { const r = db.docs.get('sup_meta/roster'); return r && r.add.indexOf('박보조') >= 0 && r.hide.indexOf('박보조') < 0 && r.add.indexOf('박보죠') < 0; }), '되돌리면 원래대로');

  console.log('⑥ 지우기 · 닫기');
  await pM.locator('#sb .sb-row', { hasText: '최보조' }).click();
  await pM.click('#sb [data-sb="edel"]');
  ok(await until(() => ![...db.docs.values()].some(v => v.name === '최보조')), '최보조 지움 (확인 창 → 예)');
  ok(await until(() => { const r = db.docs.get('sup_meta/roster'); return r && r.add.indexOf('최보조') < 0 && r.add.indexOf('박보조') >= 0; }), '지운 분은 이름 목록에서도 빠짐');
  await pM.click('#sb [data-sb="close"]');
  ok(await pM.locator('#sb').count() === 0, '닫기');

  console.log('⑦ 규칙 게시 전 (staff 거절) → 예전 이름 목록으로');
  db.denyStaff = true;
  await pM.click('[data-sbopen]');
  ok(await until(async () => /규칙 v11/.test(await txt(pM, '#sb'))), '권한 없음 안내');
  await pM.click('[data-rsold]');
  ok(await until(async () => /정비보조 명단/.test(await txt(pM, '#rs-pop')) && (await pM.locator('#sb').count()) === 0), '예전 이름 목록 창 열림');
  await pM.click('[data-rs="close"]');
  db.denyStaff = false;

  console.log('⑧ 오류');
  const errs = [pW, pM, pR].flatMap(p => p.errors.map(e => p.label + ': ' + e));
  ok(!errs.length, '화면 오류 0' + (errs.length ? ' → ' + errs.slice(0, 4).join(' | ') : ''));
  const bad = db.log.rejects.filter(r => !/^staff\/x$/.test(r.path));
  ok(!bad.length, '정상 흐름 규칙 거절 0' + (bad.length ? ' → ' + JSON.stringify(bad.slice(0, 2)) : ''));
  if (process.env.SHOT) { await pM.click('[data-sbopen]'); await sleep(800); await pM.screenshot({ path: process.env.SHOT, fullPage: false }); }
  await browser.close();
  console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

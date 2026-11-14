// 관리자 '더티 배분 만들기' 화면 시험 — 휴대폰(Playwright) + 메모리 Firestore(규칙 v5)
// NODE_PATH=/opt/node22/lib/node_modules PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node run_dist.js /home/claude/dirty
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

// ---- 가짜 정비보고서: 오늘 22명(휴무 1) + 내일 10명
const MAIDS = '김영희 이순자 박정숙 최미경 정은주 강순옥 조혜진 윤말순 장경자 임숙희 한미라 오정란 서영자 신옥순 권미숙 황정희 안순덕 송미애 류경순 홍길자 문정임 배순남'.split(' ');
const UNITS = [14, 13, 12, 12, 11, 10, 9, 14, 13, 12, 11, 10, '휴무', 12, 13, 14, 8, 11, 12, 10, 13, 12];
function roomsFor(cards) {
  const rooms = []; let fl = 4, k = 1;
  cards.forEach(([n, u]) => { if (typeof u !== 'number') return; for (let i = 0; i < Math.round(u); i++) { rooms.push([String(fl * 100 + k), n]); if (++k > 30) { k = 1; fl++; } } });
  return rooms;
}
const cardsT = MAIDS.map((n, i) => [n, UNITS[i]]), roomsT = roomsFor(cardsT);
roomsT.push([String(3001), '외부메이드']);   // 카드에 없는 이름 → 경고
const cardsM = MAIDS.slice(0, 10).map((n, i) => [n, 12]), roomsM = roomsFor(cardsM);
const spec = { days: {} };
spec.days[String(+DAY.slice(8))] = { cards: cardsT, rooms: roomsT };
spec.days[String(+TOM.slice(8))] = { cards: cardsM, rooms: roomsM };
const XLSX = path.join(__dirname, 'report_test.xlsx');
fs.writeFileSync(path.join(__dirname, 'spec.json'), JSON.stringify(spec));
execFileSync('python3', [path.join(__dirname, 'make_report.py'), path.join(__dirname, 'spec.json'), XLSX]);
const dataOf = (cards, rooms) => ({ cards: cards.map(([name, unit]) => ({ name, unit: String(unit) })), rooms: rooms.map(([room, name]) => ({ room, name })) });

async function phone(browser, db, name) {
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, locale: 'ko-KR', timezoneId: 'Asia/Seoul' });
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
const chip = (p, n) => p.locator('.dz [data-dz="who"][data-v="' + n + '"]');

(async () => {
  const browser = await chromium.launch();
  const db = make();
  await db.serverWrite('sup_meta/names', { names: ['호세인', '니라기', '이나현', '사롤'], lastDate: '2026-11-06', day: DAY });
  await db.serverWrite('sup_meta/relay', { ok: true, err: '', ver: 't', at: { __ts: Date.now() } });
  const att = (n, task) => db.serverWrite('sup/' + DAY + '/rows/gs_근태_' + n, { tab: '근태', row: [null, DAY, n, '출근', task, '', '본인', ''], at: { __ts: Date.now() - 3600e3 }, clientAt: { __ts: Date.now() - 3600e3 }, uid: db.BOT, by: '관리자' });
  await att('호세인', '더티'); await att('니라기', '더티'); await att('사롤', '기타 업무');

  console.log('① 근무자 휴대폰에는 버튼 없음 · 배정 준비 중');
  const pW = await phone(browser, db, '근무자');
  await until(async () => (await pW.locator('[data-pick="니라기"]').count()) === 1);
  await pW.click('[data-pick="니라기"]');
  ok(await until(async () => /준비 중/.test(await txt(pW, '#main'))), '배정 전 안내');
  ok(await pW.locator('[data-dist]').count() === 0, '근무자 화면에는 더티 배분 버튼 없음');

  console.log('② 관리자: 더티 배분 만들기 열기');
  const pM = await phone(browser, db, '관리자');
  ok(await adminIn(pM, db), '관리자 화면에 📋 더티 배분 만들기 버튼');
  await pM.click('[data-dist]');
  ok(await until(async () => (await pM.locator('#dz').count()) === 1), '배분 창 열림');
  ok(await until(async () => (await chip(pM, '호세인').getAttribute('class')) === 'd' && (await chip(pM, '니라기').getAttribute('class')) === 'd' && (await chip(pM, '사롤').getAttribute('class')) === 'e'), '오늘 출근 기록으로 미리 고름 (호세인·니라기 더티, 사롤 기타)');
  ok(/정비수 14개 이상 11실 \/ 13개 10실 \/ 12개 8실 \/ 11개 6실 \/ 10개 4실/.test(await txt(pM, '.dz-rule')), '기본 기준 = 11/6 기준');
  ok(await pM.locator('.dz-go[disabled]').count() === 1, '파일 전에는 확정 버튼 꺼짐');

  console.log('③ 정비보고서 고르기 → 미리보기');
  await pM.setInputFiles('.dz input[type=file]', XLSX);
  ok(await until(async () => /출근 메이드 21명/.test(await txt(pM, '.dz')), 8000), '오늘 시트 읽음 · 출근 메이드 21명 (휴무 빠짐)');
  await chip(pM, '이나현').click();   // 3번째 더티
  ok(await until(async () => (await pM.locator('.dz-b:not(.dz-pool)').count()) === 3), '정비보조 3명 블록');
  const W1 = await pM.evaluate(() => SupDist._K().order.filter(n => SupDist._K().pick[n] === 'd'));
  ok(W1.length === 3 && W1[2] === '이나현', '더티 순서 = 출근 순 + 새로 누른 사람 끝 (' + W1.join(',') + ')');
  const opt1 = { date: DAY, workers: W1, etc: ['사롤'], rule: { '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 4, '11': 6, '12': 8, '13': 10, top: 14, topVal: 11 }, over: {}, move: {} };
  const exp1 = Calc.compute(dataOf(cardsT, roomsT), opt1);
  const ui1 = await pM.evaluate(() => SupDist._K().res.plan);
  ok(JSON.stringify(ui1) === JSON.stringify(exp1.plan), '화면 계산 = distcalc (Node) 같은 결과');
  // 파이썬(run_dusting 계산)과도 대조
  const ref = JSON.parse(execFileSync('python3', ['-I', (fs.existsSync(path.join(APP, 'test', 'dist_ref.py')) ? path.join(APP, 'test', 'dist_ref.py') : '/home/claude/dirty/test/dist_ref.py')], { input: JSON.stringify(Object.assign({}, dataOf(cardsT, roomsT), { rule: { 10: 4, 11: 6, 12: 8, 13: 10, 14: 11, 15: 11, 16: 11, 17: 11, 18: 11, 19: 11 }, workers: opt1.workers, etc: opt1.etc, over: {}, date: DAY })) }).toString());
  ok(JSON.stringify(ref.plan) === JSON.stringify(ui1), '파이썬 run_dusting 계산과도 같음 (인당 ' + ref.per + '실)');
  ok(/외부메이드/.test(await txt(pM, '.dz-warns')), '카드에 없는 메이드 경고');
  ok(/총원 4명 = 더티 3명 \+ 기타 업무 1명/.test(await txt(pM, '.dz')), '총원 표시');

  console.log('④ 예외 수량 · 옮기기');
  const firstMaid = exp1.blocks[0].maids[0].name, mvMaid = exp1.blocks[0].maids[1].name;
  await pM.fill('.dz input[data-dz="over"][data-v="' + firstMaid + '"]', '3');
  await pM.locator('.dz input[data-dz="over"][data-v="' + firstMaid + '"]').dispatchEvent('change');
  ok(await until(() => pM.evaluate(n => SupDist._K().over[n] === 3, firstMaid)), firstMaid + ' 예외 3실');
  await pM.selectOption('.dz select[data-dz="move"][data-v="' + mvMaid + '"]', '이나현');
  ok(await until(() => pM.evaluate(n => SupDist._K().res.plan.some(x => x.m === n && x.w === '이나현'), mvMaid)), mvMaid + ' → 이나현 으로 옮김');
  const exp2 = Calc.compute(dataOf(cardsT, roomsT), Object.assign({}, opt1, { over: { [firstMaid]: 3 }, move: { [mvMaid]: '이나현' } }));
  ok(JSON.stringify(await pM.evaluate(() => SupDist._K().res.plan)) === JSON.stringify(exp2.plan), '예외·옮김 반영 결과 = distcalc');

  if (process.env.SHOT) { await pM.screenshot({ path: process.env.SHOT + '/dist1.png' }); await pM.evaluate(() => { document.getElementById('dz').scrollTop = 99999; }); await pM.screenshot({ path: process.env.SHOT + '/dist2.png' }); await pM.evaluate(() => { document.getElementById('dz').scrollTop = 0; }); }
  console.log('⑤ 기준 바꾸기 → 저장 (다음에도)');
  await pM.click('.dz [data-dz="ruletoggle"]');
  await pM.fill('.dz input[data-dz="rule"][data-v="9"]', '2');
  await pM.locator('.dz input[data-dz="rule"][data-v="9"]').dispatchEvent('change');
  ok(await until(() => { const d = db.docs.get('sup_meta/distcfg'); return d && d.rule && d.rule['9'] === 2; }), 'sup_meta/distcfg 에 기준 저장 (9개 → 2실)');
  ok(/9개 2실/.test(await txt(pM, '.dz-rule')), '기준 문구 갱신');
  ok(await pM.locator('.dz input[data-dz="rule"]').count() === 16, '기준표 4~19개 16칸 (엑셀 정비 지원 안내와 같은 모양)');
  await pM.fill('.dz input[data-dz="rule"][data-v="15"]', '12');
  await pM.locator('.dz input[data-dz="rule"][data-v="15"]').dispatchEvent('change');
  if (process.env.SHOT) await pM.locator('.dz-sec').nth(3).screenshot({ path: process.env.SHOT + '/rule.png' });
  ok(await until(async () => /16개 이상 11실 \/ 15개 12실 \/ 14개 11실/.test(await txt(pM, '.dz-rule'))), '칸별 기준 문구 (15개=12실)');
  await pM.fill('.dz input[data-dz="rule"][data-v="15"]', '11');
  await pM.locator('.dz input[data-dz="rule"][data-v="15"]').dispatchEvent('change');
  await pM.fill('.dz input[data-dz="memo"][data-v="사롤"]', '단체 침구');
  await pM.locator('.dz input[data-dz="memo"][data-v="사롤"]').dispatchEvent('change');
  if (process.env.SHOT) await pM.locator('.dz-sec').nth(2).screenshot({ path: process.env.SHOT + '/memo.png' });
  ok(await until(() => pM.evaluate(() => SupDist._K().res.plan.some(x => x.w === '사롤' && !x.m && x.f === '단체 침구'))), '기타 업무 비고 → 사롤 줄에 단체 침구');

  console.log('⑥ 확정 → 근무자 휴대폰에 바로');
  const want = await pM.evaluate(() => SupDist._K().res.plan);
  await pM.click('.dz [data-dz="save"]');
  ok(await until(async () => /더티 배분을 올렸어요/.test(await txt(pM, '.dz'))), '완료 화면');
  const doc = db.docs.get('sup/' + DAY);
  ok(doc && doc.src === 'app' && /^app:/.test(doc.sig) && '__ts' in doc.issued && JSON.stringify(doc.plan) === JSON.stringify(want), 'sup/' + DAY + ' = 화면 배정 그대로 (src app · issued 서버 시각)');
  ok(doc && doc.meta && doc.meta.memo && doc.meta.memo['사롤'] === '단체 침구', '비고도 같이 저장');
  ok(doc && doc.meta && doc.meta.workers.join() === W1.join() && doc.meta.etc.join() === '사롤' && doc.meta.over[firstMaid] === 3, '고른 명단·예외도 같이 저장 (다시 만들 때 불러옴)');
  if (process.env.SHOT) await pM.screenshot({ path: process.env.SHOT + '/dist3.png' });
  ok(/^더티 지원 업무 기준: 정비수 14개 이상 11실/.test(await pM.inputValue('.dz textarea')), '룸메이드 공지방용 기준 문구 (정규 A 글자 없음)');
  ok(await until(async () => (await pM.evaluate(() => { const i = document.getElementById('dzimg'); return i && i.complete && i.naturalWidth; })) === 720), '전파 이미지 (2배 해상도 720px)');
  const ih = await pM.evaluate(() => document.getElementById('dzimg').naturalHeight);
  await pM.locator('#dzimg').screenshot({ path: '/tmp/dz_card.png' }).catch(() => {});
  fs.writeFileSync('/tmp/dz_card_full.png', Buffer.from((await pM.evaluate(() => document.getElementById('dzimg').src)).split(',')[1], 'base64'));
  ok(ih > 600, '이미지 높이 ' + ih + 'px (기준표 + 담당 ' + (await pM.evaluate(() => SupDist._K().done.blocks.length)) + '명)');
  ok(await pM.locator('.dz [data-dz="imgcopy"]').count() === 1 && await pM.locator('.dz [data-dz="imgsave"]').count() === 1, '이미지 복사 · 저장 버튼');
  const [dl] = await Promise.all([pM.waitForEvent('download'), pM.click('.dz [data-dz="imgsave"]')]);
  ok(/^dirty_\d{4}\.png$/.test(dl.suggestedFilename()), '이미지 저장 → ' + dl.suggestedFilename());
  const niraMaids = want.filter(x => x.w === '니라기').map(x => x.m);
  ok(await until(async () => (await pW.locator('.maid .nm').count()) === niraMaids.length && /남은 더티/.test(await txt(pW, '.sum')), 6000), '니라기 휴대폰에 담당 메이드 ' + niraMaids.length + '명 바로');
  await pM.click('.dz [data-dz="close"]');
  ok(await until(async () => /진행 현황/.test(await txt(pM, '#main')) && /다시 만들기/.test(await txt(pM, '.dz-open'))), '관리자 진행 현황 + "다시 만들기" 버튼');

  console.log('⑦ 근무 중 체크·넘겨받기 → 다시 배분 (체크 실적 유지, 변경은 새로)');
  const r0 = want.filter(x => x.w === '니라기')[0];
  const room0 = r0.r.split(', ')[0];
  await pW.click('.room[data-r="' + room0 + '"]');
  ok(await until(() => [...db.docs.keys()].some(k => k.startsWith('sup/' + DAY + '/rows/') && db.docs.get(k).tab === '체크')), '니라기 ' + room0 + ' 체크 저장');
  const hoMaid = want.filter(x => x.w === '호세인')[0].m;
  await until(async () => { await pW.evaluate(() => { const d = document.querySelector('details[data-sec="others"]'); if (d) d.open = true; }); await pW.click('[data-hand="' + hoMaid + '"]', { timeout: 700 }); return true; }, 8000);
  await pW.click('.panel [data-do]');
  ok(await until(async () => (await pW.locator('.maid .nm', { hasText: hoMaid }).count()) === 1), '니라기가 ' + hoMaid + ' 넘겨받음');
  await sleep(50);
  await pM.click('[data-dist]');
  ok(await until(async () => (await chip(pM, '이나현').getAttribute('class')) === 'd'), '다시 열면 지난 확정 명단 그대로 (이나현 더티)');
  ok(/이미 배정이 있어요/.test(await txt(pM, '.dz')), '이미 배정 있음 안내');
  // 11/14 확정한 안내 카드 다시 보기
  ok(await pM.locator('.dz [data-dz="reshow"]').count() === 1, '다시 만들기 화면에 "확정한 안내 카드 다시 보기" 버튼');
  await pM.click('.dz [data-dz="reshow"]');
  ok(await until(async () => /확정한 더티 배분/.test(await txt(pM, '.dz')) && (await pM.evaluate(() => { const i = document.getElementById('dzimg'); return i && i.complete && i.naturalWidth; })) === 720), '다시 보기 → 확정 카드 이미지');
  ok(await pM.evaluate(w => JSON.stringify(SupDist._K().done.blocks.map(b => [b.name, b.maids.length, b.dirty])) === JSON.stringify(w), want.reduce((a, x) => { if (!x.w || !x.m || !(x.n > 0)) return a; let b = a.find(y => y[0] === x.w); if (!b) a.push(b = [x.w, 0, 0]); b[1]++; b[2] += x.n; return a; }, [])), '다시 보기 카드 = 저장된 배정 (담당·메이드 수·실)');
  await pM.click('.dz [data-dz="back"]');
  ok(await until(async () => (await pM.locator('.dz [data-dz="save"]').count()) === 1), '← 배분 화면으로 돌아감');
  // 11/14 이름 오타 고치기 (한 글자 다름 → 확인 창 → 순서 그대로 이름만)
  const ord0 = await pM.evaluate(() => SupDist._K().order.slice());
  await pM.fill('.dz [data-dz="newname"]', '이나연'); await pM.click('.dz [data-dz="addname"]');
  const ord1 = await pM.evaluate(() => SupDist._K().order.slice());
  ok(JSON.stringify(ord1) === JSON.stringify(ord0.map(n => n === '이나현' ? '이나연' : n)) && /이름을 이나연/.test(pM.lastDialog || ''), '이나현 → 이나연 고치기: 순서 그대로 (' + ord1.join(',') + ')');
  await pM.fill('.dz [data-dz="newname"]', '이나현'); await pM.click('.dz [data-dz="addname"]');
  ok(await pM.evaluate(o => JSON.stringify(SupDist._K().order) === JSON.stringify(o), ord0), '다시 이나현 으로 되돌림');
  await pM.evaluate(() => { SupDist._K().renamed = {}; });
  // 11/14 이름 빼기
  await pM.evaluate(() => { const g = SupShim.roster.get(); return SupShim.roster.save(g.add.concat(['임시분']), g.hide); });   // 명단에 넣어 둔 이름
  await pM.click('.dz [data-dz="ruletoggle"]'); await pM.click('.dz [data-dz="ruletoggle"]');   // 다시 그리기
  await pM.click('.dz [data-dz="delmode"]');
  ok(await pM.locator('.dz [data-dz="drop"][data-v="임시분"]').count() === 1 && await pM.locator('.dz [data-dz="drop"][data-v="니라기"]').count() === 0, '이름 빼기: 안 고른 이름만 ✕ (고른 분은 그대로)');
  await pM.click('.dz [data-dz="drop"][data-v="임시분"]');
  ok(await until(() => { const r = db.docs.get('sup_meta/roster'); return r && r.hide.indexOf('임시분') >= 0; }) && await pM.locator('.dz [data-v="임시분"]').count() === 0, '임시분 → 이름 목록에서 빠짐 (roster hide)');
  await pM.click('.dz [data-dz="delmode"]');
  await pM.fill('.dz [data-dz="newname"]', '임시분'); await pM.click('.dz [data-dz="addname"]');
  ok(await until(() => { const r = db.docs.get('sup_meta/roster'); return r && r.hide.indexOf('임시분') < 0; }) && (await chip(pM, '임시분').getAttribute('class')) === 'd', '다시 + 추가하면 되살아남');
  await chip(pM, '임시분').click(); await chip(pM, '임시분').click();
  await chip(pM, '이나현').click();   // 더티 → 기타
  await pM.setInputFiles('.dz input[type=file]', XLSX);
  await until(async () => (await pM.locator('.dz-b:not(.dz-pool)').count()) === 2, 8000);
  await pM.click('.dz [data-dz="save"]');
  ok(await until(async () => /더티 배분을 올렸어요/.test(await txt(pM, '.dz'))), '다시 확정 (확인 창 → 예)');
  ok(/이미 있어요/.test(pM.lastDialog || ''), '확인 창: 체크 실적 유지 안내');
  const doc2 = db.docs.get('sup/' + DAY);
  ok(doc2.meta.workers.join() === W1.slice(0, 2).join() && doc2.meta.etc.slice().sort().join() === ['사롤', '이나현'].sort().join(), '새 배정: 더티 2명 + 기타 2명');
  ok(await until(() => pW.evaluate(r => !!checks[r], room0)), '이미 체크한 ' + room0 + ' 는 그대로 완료');
  const hoNow = doc2.plan.filter(x => x.m === hoMaid)[0];
  ok(await until(() => pW.evaluate((a) => { const m = findMaid(a.m); return m && m.worker === a.w; }, { m: hoMaid, w: hoNow.w })), '넘겨받기는 새 배정 기준으로 다시 시작 (' + hoMaid + ' → ' + hoNow.w + ')');
  await pM.click('.dz [data-dz="close"]');

  console.log('⑧ 내일 배정 미리 만들기');
  await pM.click('[data-dist]');
  await pM.click('.dz [data-dz="date"][data-v="' + TOM + '"]');
  await pM.setInputFiles('.dz input[type=file]', XLSX);
  ok(await until(async () => /출근 메이드 10명/.test(await txt(pM, '.dz')), 8000), '내일 시트(다른 날짜)를 읽음');
  for (const n of ['호세인', '니라기', '사롤', '이나현']) { const c = await chip(pM, n).getAttribute('class'); if (c) { await chip(pM, n).click(); if ((await chip(pM, n).getAttribute('class'))) await chip(pM, n).click(); } }
  await chip(pM, '사롤').click();
  await pM.click('.dz [data-dz="save"]');
  ok(await until(() => { const d = db.docs.get('sup/' + TOM); return d && d.src === 'app' && d.plan.filter(x => x.w === '사롤').length > 0; }), 'sup/' + TOM + ' 에 내일 배정 (사롤 1명)');
  ok(db.docs.get('sup/' + DAY).meta.workers.join() === W1.slice(0, 2).join(), '오늘 배정은 그대로');
  await pM.click('.dz [data-dz="close"]');

  console.log('⑧-2 기타 업무 정비보조 화면에 비고');
  const pS = await phone(browser, db, '사롤');
  await until(async () => (await pS.locator('[data-pick="사롤"]').count()) === 1);
  await pS.click('[data-pick="사롤"]');
  ok(await until(async () => /오늘은 기타 업무예요/.test(await txt(pS, '#main')) && /📝 단체 침구/.test(await txt(pS, '#main')), 6000), '사롤 화면: 오늘은 기타 업무 + 📝 단체 침구');
  console.log('⑧-3 레포트 앱에서 올린 정비보고서 불러오기 (파일 없이)');
  await pM.click('[data-dist]');
  ok(await until(async () => /레포트 앱에 아직 안 올라왔어요/.test(await txt(pM, '.dz'))), '오늘 올린 것이 없으면 안내 + 파일 고르기 그대로');
  const rep = dataOf(cardsM, roomsM);
  db.docs.set('uploads/rep_' + TOM, { date: TOM, csv: '', kind: 'report', sheet: String(+TOM.slice(8)), file: '정비보고서_test.xlsx', at: { __ts: Date.now() }, who: '소장',
    cards: rep.cards.map(c => Object.assign({ label: '1] ' + c.name, actual: '' }, c)).concat([{ label: '99] 휴무자', name: '휴무자', unit: '휴무', actual: '' }]), rooms: rep.rooms.concat([{ room: '3101', st: 'VC' }]) });
  await pM.click('.dz [data-dz="date"][data-v="' + TOM + '"]');
  ok(await until(async () => /레포트 앱에서 올린 정비보고서를 불러왔어요/.test(await txt(pM, '.dz')) && /출근 메이드 10명/.test(await txt(pM, '.dz')), 6000), '내일: 파일 없이 레포트 앱 올림 불러옴 · 출근 메이드 10명');
  ok(/정비보고서_test\.xlsx/.test(await txt(pM, '.dz')) && /소장/.test(await txt(pM, '.dz')), '불러온 파일 이름·올린 사람 표시');
  const expR = Calc.compute(dataOf(cardsM, roomsM), { date: TOM, workers: ['사롤'], etc: [], rule: { '4': 0, '5': 0, '6': 0, '7': 0, '8': 0, '9': 0, '10': 4, '11': 6, '12': 8, '13': 10, top: 14, topVal: 11 }, over: {}, move: {} });
  ok(await until(() => pM.evaluate(() => { const K = SupDist._K(); return !!(K.res && K.res.plan && K.res.plan.length); })), '미리보기 계산됨');
  const uiR = await pM.evaluate(() => SupDist._K().res.plan.map(x => x.m + ':' + x.w + ':' + x.d).sort().join('|'));
  ok(uiR === expR.plan.map(x => x.m + ':' + x.w + ':' + x.d).sort().join('|'), '불러온 데이터 계산 = 파일 계산과 같음');
  await pM.setInputFiles('.dz input[type=file]', XLSX);
  ok(await until(async () => !/레포트 앱에서 올린/.test(await txt(pM, '.dz')) && /report_test\.xlsx/.test(await txt(pM, '.dz')), 8000), '엑셀 파일을 고르면 파일이 우선');
  await pM.click('.dz [data-dz="date"][data-v="' + DAY + '"]');
  ok(await until(async () => /출근 메이드 21명/.test(await txt(pM, '.dz')), 8000), '파일을 고른 뒤 날짜 바꾸면 그 파일의 해당 날짜 시트');
  await pM.click('.dz [data-dz="close"]');
  ok((await db.handle(null, 'get', { uid: 'worker-x', path: 'uploads/rep_' + TOM })).error === 'permission-denied', '근무자는 uploads 못 읽음');
  console.log('⑧-4 배분안 자동 준비 (오늘: 레포트 앱 올림 + 출근 체크 → 바로 확정 가능)');
  const repT = dataOf(cardsT, roomsT);
  db.docs.set('uploads/rep_' + DAY, { date: DAY, csv: '', kind: 'report', sheet: String(+DAY.slice(8)), file: '오늘_정비보고서.xlsx', at: { __ts: Date.now() - 3 * 3600000 }, who: '부소장', cards: repT.cards, rooms: repT.rooms });
  await pM.click('[data-dist]');
  ok(await until(async () => /배분안이 준비됐어요/.test(await txt(pM, '.dz')), 8000), '창을 열자마자 배분안 준비됨 안내');
  ok(/올린 내용이에요/.test(await txt(pM, '.dz-warn')) || /엑셀을 고쳤다면/.test(await txt(pM, '.dz')), '올린 시각 + 그 뒤 고쳤다면 안내 띠');
  ok(await pM.locator('.dz-go[disabled]').count() === 0 && (await pM.locator('.dz-b:not(.dz-pool)').count()) >= 1, '파일 없이 확정 버튼 켜짐 · 미리보기 블록 있음');
  await pM.click('.dz [data-dz="save"]');
  ok(await until(async () => /더티 배분을 올렸어요/.test(await txt(pM, '.dz'))), '파일 없이 확정');
  ok(db.docs.get('sup/' + DAY).meta.file === '오늘_정비보고서.xlsx', '확정 기록에 불러온 파일 이름');
  await pM.click('.dz [data-dz="close"]');
  ok(/자동 불러오기/.test(await txt(pM, '[data-dist]')), '관리자 버튼 설명 바뀜');


  console.log('⑨ 위조 막기');
  const forged = await pW.evaluate(async (d) => { try { await SupShim._S.store.set('sup/' + d, { date: d, plan: [] }); return 'ok'; } catch (e) { return 'rejected'; } }, DAY);
  ok(forged === 'rejected', '근무자가 배정 문서를 쓰면 규칙이 거절');
  const viaApi = await pW.evaluate(async (d) => { try { await SupShim.dist.savePlan(d, [], {}); return 'ok'; } catch (e) { return 'rejected'; } }, DAY);
  ok(viaApi === 'rejected', '근무자 휴대폰에서 savePlan 거절');

  console.log('⑩ 오류');
  const errs = [pW, pM, pS].flatMap(p => p.errors.map(e => p.label + ': ' + e));
  ok(!errs.length, '화면 오류 0' + (errs.length ? ' → ' + errs.slice(0, 4).join(' | ') : ''));
  const bad = db.log.rejects.filter(r => !(r.path === 'sup/' + DAY));
  ok(!bad.length, '정상 흐름 규칙 거절 0' + (bad.length ? ' → ' + JSON.stringify(bad.slice(0, 2)) : ''));
  await browser.close();
  console.log('\n결과: ' + pass + ' 통과 / ' + fail + ' 실패');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });

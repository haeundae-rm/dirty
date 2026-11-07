// distcalc.js ↔ dist_ref.py (run_dusting 계산) 무작위 대조
import { createRequire } from 'module'; import { execFileSync } from 'child_process';
const require = createRequire(import.meta.url); const fs = require('fs'); const C = require(fs.existsSync(new URL('../distcalc.js', import.meta.url)) ? '../distcalc.js' : '../next/distcalc.js');
const NAMES = '김영희 이순자 박정숙 최미경 정은주 강순옥 조혜진 윤말순 장경자 임숙희 한미라 오정란 서영자 신옥순 권미숙 황정희 안순덕 송미애 류경순 홍길자'.split(' ');
const W = '호세인 니라기 이나현 우즈벡 다바 사롤 나디라 굴노자'.split(' ');
let seed = 7; const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648; const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
let bad = 0, runs = Number(process.argv[2] || 400);
for (let t = 0; t < runs; t++) {
  const nm = NAMES.slice().sort(() => rnd() - .5).slice(0, ri(3, 20));
  const cards = nm.map(n => ({ name: n, unit: rnd() < .1 ? '휴무' : String(ri(0, 1) ? ri(4, 19) : ri(4, 19) + '.5') }));
  const rooms = []; let room = 401;
  nm.forEach(n => { const k = rnd() < .08 ? 0 : ri(3, 16); for (let i = 0; i < k; i++) { rooms.push({ room: String(room), name: rnd() < .03 ? n + ', ' + nm[0] : n }); room += ri(1, 7); if (room % 100 > 40) room = (Math.floor(room / 100) + 1) * 100 + 1; } });
  if (rnd() < .2) rooms.push({ room: String(room + 1), name: '외부인' });
  const rule = {}; for (let u = 4; u <= 19; u++) if (rnd() < .8) rule[u] = rnd() < .9 ? Math.max(0, u - ri(2, 6)) : 0;
  const nw = ri(1, Math.min(8, 6)), workers = W.slice(0, nw), etc = rnd() < .5 ? W.slice(nw, nw + ri(0, 2)) : [];
  const over = {}; nm.forEach(n => { if (rnd() < .1) over[n] = ri(0, 5); });
  const date = '2026-11-0' + ri(1, 9);
  const inp = { rooms, cards, rule, workers, etc, over, date };
  const py = JSON.parse(execFileSync('python3', ['-I', new URL('./dist_ref.py', import.meta.url).pathname], { input: JSON.stringify(inp) }).toString());
  let js; try { js = C.compute({ rooms, cards }, { date, workers, etc, rule, over }); } catch (e) { console.log('JS 오류', e.message); bad++; continue; }
  const jp = js.plan.filter(x => !(x.m === '' && !etc.includes(x.w)));   // 맡을 메이드 없는 근무자 → 기타 줄은 JS 만의 보탬
  const a = JSON.stringify(py.plan), b = JSON.stringify(jp);
  if (a !== b || py.per !== js.per) { bad++; if (bad < 3) { console.log('다름', t, '\nPY', a, '\nJS', b, py.per, js.per); } }
}
console.log(bad ? `❌ ${bad}/${runs} 다름` : `✅ ${runs}번 모두 같음`);

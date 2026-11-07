# run_dusting.py --auto 의 계산 부분만 (배분표 셀 없이) — distcalc.js 대조용
# stdin: {"rooms":[...], "cards":[...], "rule":{int:val}, "workers":[], "etc":[], "over":{}, "date":""}
import sys, json, re, math, collections
a = json.load(sys.stdin)
by = collections.defaultdict(list)
for x in a['rooms']:
    if x['name']:
        for n in str(x['name']).replace(' ', '').split(','):
            if n: by[n].append(x['room'])
by = {n: sorted(v, key=int) for n, v in by.items()}
rule = {int(k): float(v) for k, v in a['rule'].items()}
cards = []
for c in a['cards']:
    u = str(c.get('unit') or '').strip()
    if re.fullmatch(r'\d+(\.\d+)?', u) and float(u) > 0: cards.append((c['name'], float(u)))
C, D, E = {}, {}, {}
for i, (n, u) in enumerate(cards):
    r = 4 + i; dv = rule.get(int(u), 0)
    C[r] = n; D[r] = u; E[r] = dv
for i, (n, u) in enumerate(cards):
    if n in a['over']: E[4 + i] = float(a['over'][n])
ws_ = a['workers']
workers = ws_ + [''] * (8 - len(ws_))
Ev = {r: E.get(r, 0) for r in range(4, 54)}
total = sum(Ev.values()); N = len(ws_) or 1
J6 = round(total / N) if N else 0
cum = 0; G = {}
for r in range(4, 54):
    cum += Ev[r]
    c, d = C.get(r), D.get(r)
    if not c or d in (None, ''): continue
    F = min(N, math.ceil(cum / J6)) if J6 else 0
    G[r] = workers[F - 1] if 1 <= F <= 8 and workers[F - 1] else ''
def floors(rooms):
    fl = []
    for x in sorted(rooms, key=int):
        f = int(x) // 100
        if f not in fl: fl.append(f)
    return ' / '.join(f'{f}층' for f in fl)
maids = []
for r in range(4, 54):
    name = str(C.get(r) or '').strip()
    if not name: continue
    rooms = sorted(by.get(name, []), key=int)
    maids.append(dict(name=name, dirty=Ev[r], worker=G.get(r, ''), rooms=rooms))
wk = [w for w in ws_ if w and any(m['worker'] == w and m['dirty'] > 0 for m in maids)]
others = [m for m in maids if m['dirty'] <= 0]
PALETTE = ['#1F5FA8', '#B23A48', '#2E7D4F', '#7D3C98', '#C77C0E', '#117A75', '#5D6D7E', '#9A7D0A']
out = []
nice = lambda v: int(v) if v == int(v) else v
for i, w in enumerate(wk):
    for m in maids:
        if m['worker'] == w and m['dirty'] > 0 and m['rooms']:
            out.append(dict(d=a['date'], w=w, c=PALETTE[i % 8], m=m['name'], f=floors(m['rooms']), n=nice(m['dirty']), r=', '.join(m['rooms'])))
for m in others:
    if m['rooms']: out.append(dict(d=a['date'], w='', c='', m=m['name'], f=floors(m['rooms']), n=0, r=', '.join(m['rooms'])))
for w in a['etc']: out.append(dict(d=a['date'], w=w, c='', m='', f='', n=0, r=''))
print(json.dumps(dict(plan=out, per=J6), ensure_ascii=False))

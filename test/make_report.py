# 시험용 가짜 정비보고서 xlsx (engine.js extractDay 가 읽는 자리만): 상단 메이드 카드 + 하단 매핑표(B 객실 · D 수식 → 이름 칸 · E 유닛)
import sys, json, zipfile, html
spec = json.load(open(sys.argv[1])); out = sys.argv[2]
def col(i):
    s = ''
    while i: i, r = divmod(i - 1, 26); s = chr(65 + r) + s
    return s
def sheet(day):
    cells = {}
    cards, rooms = spec['days'][day]['cards'], spec['days'][day]['rooms']
    for k, (nm, unit) in enumerate(cards):
        nr = [2, 5, 8, 11][k // 17]; L = col(2 + 2 * (k % 17))
        cells[f'{L}{nr}'] = ('s', f'{k+1}] {nm}'); cells[f'{L}{nr+1}'] = ('s' if not isinstance(unit, (int, float)) else 'n', unit)
    for i, (room, nm) in enumerate(rooms):
        L = col(2 + i % 20); base = 60 + 7 * (i // 20); sr = base + 1; nr = base + 2
        cells[f'{L}{sr}'] = ('n', 1); cells[f'{L}{nr}'] = ('s', nm)
        r = 240 + i
        cells[f'B{r}'] = ('n', int(room)); cells[f'D{r}'] = ('f', f'${L}${nr}'); cells[f'E{r}'] = ('n', 1)
    rows = {}
    for ref, v in cells.items():
        n = int(''.join(c for c in ref if c.isdigit())); rows.setdefault(n, []).append((ref, v))
    def key(ref): L = ''.join(c for c in ref if c.isalpha()); return (len(L), L)
    x = []
    for n in sorted(rows):
        cs = []
        for ref, (t, v) in sorted(rows[n], key=lambda z: key(z[0])):
            if t == 's': cs.append(f'<c r="{ref}" t="inlineStr"><is><t>{html.escape(str(v))}</t></is></c>')
            elif t == 'n': cs.append(f'<c r="{ref}"><v>{v}</v></c>')
            else: cs.append(f'<c r="{ref}"><f>{v}</f><v>0</v></c>')
        x.append(f'<row r="{n}">' + ''.join(cs) + '</row>')
    pad = '<!--' + 'x' * 210000 + '-->'   # run_dusting 의 '정비보고서 판별'(200KB 넘음)과 비슷하게
    return ('<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + pad +
            '<sheetData>' + ''.join(x) + '</sheetData></worksheet>')
days = list(spec['days'])
with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    z.writestr('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>')
    z.writestr('xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
               ''.join(f'<sheet name="{d}" sheetId="{i+1}" r:id="rId{i+1}"/>' for i, d in enumerate(days)) + '</sheets></workbook>')
    z.writestr('xl/_rels/workbook.xml.rels', '<?xml version="1.0"?><Relationships>' +
               ''.join(f'<Relationship Id="rId{i+1}" Type="ws" Target="worksheets/sheet{i+1}.xml"/>' for i, d in enumerate(days)) + '</Relationships>')
    z.writestr('xl/styles.xml', '<?xml version="1.0"?><styleSheet><fills count="1"><fill><patternFill patternType="none"/></fill></fills><cellXfs count="1"><xf fillId="0"/></cellXfs></styleSheet>')
    for i, d in enumerate(days): z.writestr(f'xl/worksheets/sheet{i+1}.xml', sheet(d))
print(out)

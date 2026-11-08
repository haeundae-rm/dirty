// 시험용 메모리 Firestore (Node) + 규칙 v5 의 정비 지원 부분(sup · sup_meta · acts)을 그대로 옮긴 검사
const ADMIN = { 'unieshaeundae+admin@gmail.com': 'iw2orXgIgPgTbLUQa0b41XJ9Dvd2', 'unieshaeundae+sub@gmail.com': 'Fz4T5ZzIxShOdVkNpF9gzMmOLED2' };
const BOT = 'wytSL9o4vvN4U2G3z6R64hafC9t2';
const ADMIN_UIDS = Object.values(ADMIN).concat([BOT]);
const PW = 'pw1234';

function make() {
  const docs = new Map();   // path → data(인코딩된 값: {__ts})
  const subs = new Map();   // id → { page, type, path, coll }
  const log = { rejects: [], writes: [] };
  const isAdmin = uid => ADMIN_UIDS.includes(uid);
  const isName = n => typeof n === 'string' && n.length > 0 && n.length <= 20;
  const str = (v, n) => typeof v === 'string' && v.length <= n;
  const isTs = v => v && typeof v === 'object' && '__ts' in v;
  const isServer = v => v && typeof v === 'object' && v.__server === 1;
  function validSupRow(uid, date, d) {
    const r = d.row, keys = Object.keys(d);
    if (!keys.every(k => ['tab', 'row', 'at', 'clientAt', 'uid', 'by'].includes(k))) return 'keys';
    if (!isServer(d.at) || !isTs(d.clientAt) || d.uid !== uid || d.by !== '본인') return 'meta';
    if (!Array.isArray(r) || r.length < 7 || r.length > 9 || r[0] !== null || r[1] !== date) return 'row';
    if (d.tab === '체크') return r.length === 7 && typeof r[2] === 'string' && /^'?[0-9]{3,4}$/.test(r[2]) && isName(r[3]) && isName(r[4]) && ['완료', '취소'].includes(r[5]) && r[6] === '' ? '' : '체크';
    if (d.tab === '변경') return r.length === 9 && ['가져옴', '수정', '되돌림', '넘겨받음'].includes(r[2]) && isName(r[3]) && isName(r[4])
      && str(r[5], 300) && (r[6] === '' || Number.isInteger(r[6])) && str(r[7], 300) && str(r[8], 20) ? '' : '변경';
    if (d.tab === '근태') return r.length === 8 && isName(r[2]) && ['출근', '퇴근', '퇴근취소', '업무'].includes(r[3]) && ['', '더티', '기타 업무'].includes(r[4])
      && str(r[5], 60) && r[6] === '본인' && r[7] === '' ? '' : '근태';
    return 'tab';
  }
  function validMark(uid, id, room, d) {
    if (!Object.keys(d).every(k => ['s', 'm', 'w', 'by', 'at', 'clientAt', 'uid', 't'].includes(k))) return 'mark-keys';
    // v9 (2026-11-08): 점검 항목 t = 번호 목록(5개까지, 이상일 때만) · 지난 날짜(서울)에 체크된 객실은 근무자가 못 바꿈
    if ('t' in d && !(Array.isArray(d.t) && d.t.length <= 5 && d.t.every(x => typeof x === 'string' && /^[1-9]$/.test(x)) && (d.t.length === 0 || d.s === '이상'))) return 'mark-t';
    const old = docs.get('acts/' + id + '/marks/' + room), kday = ms => new Date(ms + 9 * 36e5).toISOString().slice(0, 10);
    if (old && old.s !== '취소' && old.at && kday(old.at.__ts) < kday(Date.now())) return 'mark-locked';
    const act0 = docs.get('acts/' + id);   // v10: 관리자 잠금 lockAt 이전에 체크된 객실
    if (old && old.s !== '취소' && old.at && act0 && act0.lockAt && act0.lockAt.__ts && old.at.__ts <= act0.lockAt.__ts) return 'mark-admin-locked';
    if (!/^[0-9]{3,4}$/.test(room)) return 'mark-room';
    if (!['완료', '이상', '취소'].includes(d.s) || !str(d.m, 30) || !(d.s === '이상' || d.m === '')) return 'mark-s';
    if (!isName(d.w) || d.w === '관리자' || d.by !== '본인') return 'mark-who';
    if (!isServer(d.at) || !isTs(d.clientAt) || d.uid !== uid) return 'mark-meta';
    const a = docs.get('acts/' + id);
    return a && a.status === '진행' ? '' : 'mark-ended';
  }
  function canWrite(uid, op, path, data) {
    if (!uid) return 'no-auth';
    const p = path.split('/');
    if (p[0] === 'sup' && p.length === 2) return isAdmin(uid) ? '' : 'admin-only';
    if (p[0] === 'sup' && p[2] === 'rows' && p.length === 4) {
      if (op !== 'create' || docs.has(path)) return isAdmin(uid) ? '' : 'no-update';
      return isAdmin(uid) ? '' : validSupRow(uid, p[1], data);
    }
    if (p[0] === 'sup_meta') return isAdmin(uid) ? '' : 'admin-only';
    if (p[0] === 'acts' && p.length === 2) return isAdmin(uid) ? '' : 'admin-only';
    if (p[0] === 'acts' && p[2] === 'marks' && p.length === 4) return isAdmin(uid) ? '' : validMark(uid, p[1], p[3], data);
    if (p[0] === 'errors' && p.length === 2) return data && data.uid === uid && str(data.where, 40) && str(data.msg, 500) && str(data.name, 20) ? '' : 'errors';
    return isAdmin(uid) ? '' : 'denied';
  }
  function canRead(uid, path) {
    if (!uid) return false;
    const p = path.split('/');
    if (p[0] === 'sup' || p[0] === 'sup_meta' || p[0] === 'acts') return true;
    return isAdmin(uid);
  }
  function stamp(v, now) {
    if (isServer(v)) return { __ts: now };
    if (Array.isArray(v)) return v.map(x => stamp(x, now));
    if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = stamp(v[k], now); }); return o; }
    return v;
  }
  function collOf(coll) {
    const n = coll.split('/').length, out = [];
    docs.forEach((d, p) => { if (p.startsWith(coll + '/') && p.split('/').length === n + 1) out.push({ id: p.split('/').pop(), data: d }); });
    return out;
  }
  function viewOf(s) { return s.type === 'doc' ? (docs.has(s.path) ? docs.get(s.path) : null) : collOf(s.coll); }
  async function push(touched) {
    const jobs = [];
    subs.forEach((s, id) => {
      const hit = s.type === 'doc' ? touched.includes(s.path) : touched.some(t => t.startsWith(s.coll + '/') && t.split('/').length === s.coll.split('/').length + 1);
      if (hit) jobs.push(s.page.evaluate(([i, d]) => window.__fsPush && window.__fsPush(i, { data: d }), [id, viewOf(s)]).catch(() => {}));
    });
    await Promise.all(jobs);
  }
  function serverWrite(path, data, uid) {
    docs.set(path, stamp(data, Date.now())); log.writes.push({ path, uid: uid || BOT }); return push([path]);
  }
  async function handle(page, op, a) {
    if (op === 'login') { const uid = ADMIN[a.email]; return uid && a.pw === PW ? { uid } : { error: 'auth/invalid-credential' }; }
    if (op === 'sub') {
      const path = a.type === 'doc' ? a.path : a.coll;
      if (!canRead(a.uid, path)) return { error: 'permission-denied' };
      subs.set(a.id, { page, type: a.type, path: a.path, coll: a.coll });
      return { data: viewOf({ type: a.type, path: a.path, coll: a.coll }) };
    }
    if (op === 'unsub') { subs.delete(a.id); return {}; }
    if (op === 'get') { if (!canRead(a.uid, a.path)) return { error: 'permission-denied' }; return { data: docs.has(a.path) ? docs.get(a.path) : null }; }
    if (op === 'write') {
      const why = canWrite(a.uid, a.op, a.path, a.data);
      if (why) { log.rejects.push({ path: a.path, why, uid: a.uid, data: a.data }); return { error: 'permission-denied' }; }
      if (a.op === 'delete') docs.delete(a.path); else docs.set(a.path, stamp(a.data, Date.now())); log.writes.push({ path: a.path, uid: a.uid, op: a.op });
      await push([a.path]);
      return {};
    }
    return { error: 'unknown-op' };
  }
  return { docs, subs, log, handle, serverWrite, PW, BOT, ADMIN };
}
module.exports = { make };

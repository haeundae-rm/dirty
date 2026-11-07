// 시험용 가짜 store.js — 실제 store.js 와 같은 함수들. 데이터는 Node 쪽 메모리 DB(window.__db), 휴대폰 보관(대기 쓰기)은 localStorage
export const SERVER_TIME = { __server: 1 };
export const kind = 'fake';
const LS = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } };
const LSset = (k, v) => localStorage.setItem(k, JSON.stringify(v));
let user = LS('__fake_user'), userCbs = [], subs = {}, sid = 0, wid = Date.now();
let pending = LS('__fake_pending') || [], waiters = {}, flushing = false;
const online = () => navigator.onLine && !window.__fakeDown;
function enc(v) {
  if (v === SERVER_TIME) return { __server: 1 };
  if (v instanceof Date) return { __ts: v.getTime() };
  if (Array.isArray(v)) return v.map(enc);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { if (v[k] !== undefined) o[k] = enc(v[k]); }); return o; }
  return v;
}
function dec(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) { if ('__ts' in v) return v.__ts; if ('__server' in v) return Date.now(); const o = {}; Object.keys(v).forEach(k => { o[k] = dec(v[k]); }); return o; }
  if (Array.isArray(v)) return v.map(dec);
  return v;
}
const call = (op, a) => window.__db(op, Object.assign({ uid: user && user.uid }, a));
const parentOf = p => p.split('/').slice(0, -1).join('/');
const idOf = p => p.split('/').pop();
function setUser(u) { user = u; LSset('__fake_user', u); Object.values(subs).forEach(s => { s.dead = true; call('unsub', { id: s.id }); }); subs = {}; userCbs.forEach(cb => cb(u)); }
export function onUser(cb) { userCbs.push(cb); setTimeout(() => cb(user), 0); return () => {}; }
export async function signInAnon() { if (!online()) throw Object.assign(new Error('offline'), { code: 'auth/network-request-failed' }); setUser({ uid: 'anon-' + Math.random().toString(36).slice(2, 10), anon: true, email: '' }); }
export async function signInEmail(email, pw) { const r = await call('login', { email, pw }); if (r.error) throw Object.assign(new Error(r.error), { code: r.error }); setUser({ uid: r.uid, anon: false, email }); }
export async function signOut() { setUser(null); }
export async function idToken() { if (!user) throw new Error('no user'); return 'fake-token-' + user.uid + '-padpadpadpad'; }
function view(s) {
  if (s.type === 'doc') {
    let d = s.server, p = false;
    pending.filter(w => w.path === s.path).forEach(w => { p = true; d = w.data; });
    return { data: d == null ? null : dec(d), meta: { pending: p, fromCache: !online() || !s.got } };
  }
  const m = new Map((s.server || []).map(x => [x.id, { id: x.id, data: x.data, pending: false }]));
  pending.filter(w => parentOf(w.path) === s.coll).forEach(w => m.set(idOf(w.path), { id: idOf(w.path), data: w.data, pending: true }));
  const docs = [...m.values()].map(x => ({ id: x.id, data: dec(x.data), pending: x.pending }));
  return { docs, meta: { fromCache: !online() || !s.got, pending: docs.filter(d => d.pending).length } };
}
function emit(s) { if (s.dead) return; const v = view(s); if (s.type === 'doc') s.cb(v.data, v.meta); else s.cb(v.docs, v.meta); }
function emitAll() { Object.values(subs).forEach(emit); }
async function connect(s) {
  if (!online() || s.dead) return;
  const r = await call('sub', { id: s.id, type: s.type, path: s.path, coll: s.coll });
  if (s.dead) return;
  if (r.error) { s.dead = true; delete subs[s.id]; s.onErr && s.onErr(Object.assign(new Error(r.error), { code: r.error })); return; }
  s.server = r.data; s.got = true; emit(s);
}
window.__fsPush = (id, payload) => { const s = subs[id]; if (!s || s.dead || !online()) return; s.server = payload.data; s.got = true; emit(s); };
function listen(s) { s.id = 's' + (++sid) + '-' + Math.random().toString(36).slice(2, 6); subs[s.id] = s; setTimeout(() => { emit(s); connect(s); }, 0); return () => { s.dead = true; delete subs[s.id]; call('unsub', { id: s.id }); }; }
export function listenDoc(path, cb, onErr) { return listen({ type: 'doc', path, cb, onErr }); }
export function listenQuery(coll, where, cb, onErr) { return listen({ type: 'query', coll, cb, onErr }); }
export async function get(path) { const r = await call('get', { path }); return r.data == null ? null : dec(r.data); }
function savePending() { LSset('__fake_pending', pending); }
function write(op, path, data) {
  const w = { wid: 'w' + (++wid), op, path, data: data ? enc(data) : null, uid: user && user.uid };
  pending.push(w); savePending(); emitAll();
  const p = new Promise((res, rej) => { waiters[w.wid] = { res, rej }; });
  flush();
  return p;
}
async function flush() {
  if (flushing) return; flushing = true;
  try {
    while (online() && pending.length) {
      const w = pending[0];
      if (window.__fakeDelay) await new Promise(r => setTimeout(r, window.__fakeDelay));
      if (!online()) break;
      const r = await call('write', { uid: w.uid, op: w.op, path: w.path, data: w.data });
      pending.shift(); savePending();
      const k = waiters[w.wid]; delete waiters[w.wid];
      if (r.error) { if (k) k.rej(Object.assign(new Error(r.error), { code: r.error })); } else if (k) k.res();
      emitAll();
    }
  } finally { flushing = false; }
}
export function set(path, data) { return write('set', path, data); }
export function add(coll, data) { const id = 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); return { id, done: write('create', coll + '/' + id, data) }; }
function reconnect() { Object.values(subs).forEach(s => { s.got = false; }); emitAll(); flush(); Object.values(subs).forEach(connect); }
window.addEventListener('online', reconnect);
window.__fake = { pending: () => pending.length, down: v => { window.__fakeDown = v; if (v) emitAll(); else reconnect(); } };
setTimeout(flush, 50);

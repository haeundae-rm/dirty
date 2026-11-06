// store.js — 정비 지원(Firebase 판)의 Firestore 읽기·쓰기는 전부 여기 한 곳 (레포트 앱 store.js 와 같은 모양)
// 시험 때는 이 파일만 메모리 가짜로 바꿔 끼움. 2026-11-05 ⑧ 1부
// 레포트 앱과 같은 주소(haeundae-rm.github.io)라서, 로그인·휴대폰 보관이 섞이지 않게 Firebase 앱 이름을 'sup' 으로 따로 둠
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInAnonymously, signInWithEmailAndPassword, signOut as fbSignOut } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, collection, onSnapshot, getDoc, getDocs, setDoc, query, where, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';

const app = initializeApp({
  apiKey: 'AIzaSyCyESLB9lGONuwXQUWBz6hPw09u9Zq9yFQ',
  authDomain: 'haeundae-rm.firebaseapp.com',
  projectId: 'haeundae-rm',
  storageBucket: 'haeundae-rm.firebasestorage.app',
  messagingSenderId: '468580994597',
  appId: '1:468580994597:web:b2c841463ec39b577679cc'
}, 'sup');
const auth = getAuth(app);
// 오프라인 보관: 누른 기록은 휴대폰에 먼저 남고, 연결되면 자동으로 보냄. 앱을 껐다 켜도 남아 있음
let db;
try { db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) }); }
catch (e) { console.warn('오프라인 보관을 켜지 못했어요 (사생활 보호 모드 등)', e); db = initializeFirestore(app, {}); }

export const SERVER_TIME = { __server: 1 };
export const kind = 'firebase';

function enc(v) {
  if (v === SERVER_TIME) return serverTimestamp();
  if (v instanceof Date) return Timestamp.fromDate(v);
  if (Array.isArray(v)) return v.map(enc);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { if (v[k] !== undefined) o[k] = enc(v[k]); }); return o; }
  return v;
}
function dec(v) {
  if (v instanceof Timestamp) return v.toMillis();
  if (Array.isArray(v)) return v.map(dec);
  if (v && typeof v === 'object') { const o = {}; Object.keys(v).forEach(k => { o[k] = dec(v[k]); }); return o; }
  return v;
}
const ref = p => doc(db, ...p.split('/'));
const col = p => collection(db, ...p.split('/'));
const q = (c, w) => (w && w.length ? query(col(c), ...w.map(x => where(x[0], x[1], x[2]))) : col(c));
const snapData = s => dec(s.data({ serverTimestamps: 'estimate' }));

export function onUser(cb) {
  return onAuthStateChanged(auth, u => cb(u ? { uid: u.uid, anon: u.isAnonymous, email: u.email || '' } : null));
}
export function signInAnon() { return signInAnonymously(auth); }
export function signInEmail(email, pw) { return signInWithEmailAndPassword(auth, email, pw); }
export function signOut() { return fbSignOut(auth); }
export async function idToken() { const u = auth.currentUser; if (!u) throw new Error('로그인 안 됨'); return u.getIdToken(); }

export function listenDoc(path, cb, onErr) {
  return onSnapshot(ref(path), { includeMetadataChanges: true },
    s => cb(s.exists() ? snapData(s) : null, { pending: s.metadata.hasPendingWrites, fromCache: s.metadata.fromCache }),
    e => onErr && onErr(e));
}
export function listenQuery(c, w, cb, onErr) {
  return onSnapshot(q(c, w), { includeMetadataChanges: true }, s => {
    const docs = s.docs.map(d => ({ id: d.id, data: snapData(d), pending: d.metadata.hasPendingWrites }));
    cb(docs, { fromCache: s.metadata.fromCache, pending: docs.filter(d => d.pending).length });
  }, e => onErr && onErr(e));
}
export async function get(path) { const s = await getDoc(ref(path)); return s.exists() ? snapData(s) : null; }
export async function getQuery(c, w) { const s = await getDocs(q(c, w)); return s.docs.map(d => ({ id: d.id, data: snapData(d) })); }
export function set(path, data) { return setDoc(ref(path), enc(data)); }
export function add(c, data) { const r = doc(col(c)); return { id: r.id, done: setDoc(r, enc(data)) }; }

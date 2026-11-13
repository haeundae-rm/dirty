// 정비 지원 Firebase 판 시작: Firestore 연결(store.js)을 shim 에 넘김
import * as store from './store.js?v=2026.11.13-1';
window.SupShim.start(store);

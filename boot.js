// 정비 지원 Firebase 판 시작: Firestore 연결(store.js)을 shim 에 넘김
import * as store from './store.js?v=2026.11.25-4';
import { initPush } from './push.js?v=2026.11.25-4';
initPush(store);   // 🔔 더티 요청 푸시 알림 (2026-11-22)
window.SupShim.start(store);

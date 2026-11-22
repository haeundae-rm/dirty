// 정비 지원 서비스 워커 — 바탕화면 앱(설치형)으로 인식 + 🔔 더티 요청 푸시 알림 (2026-11-22)
// 화면 파일은 저장하지 않고 그대로 통과. 서버 함수(dreqPush)가 데이터만 보내면 여기서 알림을 띄움
self.addEventListener('install', function(){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function(){});
self.addEventListener('push', function(e){
  var d = {};
  try { var j = e.data ? e.data.json() : {}; d = j.data || j.notification || j || {}; } catch (_) { try { d = { body: e.data ? e.data.text() : '' }; } catch (__) {} }
  e.waitUntil(self.registration.showNotification(d.title || '🔔 더티 요청', {
    body: d.body || '정비 지원 앱을 열어 확인해 주세요', tag: d.tag || 'dreq', renotify: true, requireInteraction: true,
    icon: 'icon-192.png', badge: 'icon-192.png', vibrate: [300, 150, 300, 150, 300], data: { url: d.url || './' }
  }));
});
self.addEventListener('notificationclick', function(e){
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(L){
    for (var i = 0; i < L.length; i++) if (L[i].url.indexOf('/dirty/') >= 0 && 'focus' in L[i]) return L[i].focus();
    return self.clients.openWindow(url);
  }));
});

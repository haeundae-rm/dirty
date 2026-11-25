// 🔔 앱이 꺼져 있어도 더티 요청 알림 받기 (2026-11-22)
// 정비보조가 [알림 받기]를 한 번 누르면: 휴대폰 알림 허락 → sw.js 등록 → FCM 토큰 → push/{uid} {app:'dirty', name, token}
// 서버 함수 dreqPush 가 메이드 더티 요청(sup/{날짜}/req/{메이드})이 새로 오면 담당 정비보조(ws) 이름과 같은 휴대폰에 보냄
// 이름을 바꿔 고르거나 사흘이 지나면 앱을 열 때 저절로 다시 등록 (토큰 · 이름 · 3주 기준 '최근 사용' 갱신)
const VER = '2026.11.25-4';
const KEY = 'dust_push', AGAIN = 3 * 24 * 3600e3;

export function initPush(store) {
  let uid = '', busy = false, err = '', tried = 0;
  const ls = () => { try { return JSON.parse(localStorage.getItem(KEY) || 'null') || {}; } catch (e) { return {}; } };
  const save = v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch (e) {} };
  const ua = navigator.userAgent || '';
  const ios = /iPhone|iPad|iPod/.test(ua);
  const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
  const can = () => 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
  const perm = () => (can() ? Notification.permission : 'none');
  const redraw = () => { try { if (typeof window.render === 'function') window.render(); } catch (e) {} };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function register(name) {
    const reg = await navigator.serviceWorker.register('sw.js');
    await navigator.serviceWorker.ready;
    const tok = await store.pushToken(reg);
    if (!tok) throw new Error('이 휴대폰 브라우저는 알림을 지원하지 않아요');
    await Promise.race([
      store.set('push/' + uid, { app: 'dirty', name, token: tok, at: store.SERVER_TIME, ua: ua.slice(0, 200), ver: VER }),
      new Promise((_, no) => setTimeout(() => no(new Error('저장이 늦어요. 인터넷 연결을 확인해 주세요')), 15000))
    ]);
    save({ uid, name, at: Date.now(), tok: tok.slice(-12) });
  }

  const P = {
    // 근무자 화면 맨 위(출근 카드 아래)에 넣을 한 줄. 켜져 있으면 작은 표시만
    view(name) {
      if (!name) return '';
      if (!can()) {
        return ios && !standalone()
          ? '<div class="pushc off"><b>🔔 앱이 꺼져 있을 때도 더티 요청 알림을 받으려면</b><span>아이폰은 사파리 공유(⬆️) → \'홈 화면에 추가\'로 연 앱에서만 알림이 돼요.</span></div>'
          : '';
      }
      const L = ls(), p = perm();
      if (p === 'granted' && L.uid === uid && L.name === name) { P.sync(name); return '<p class="pushok">🔔 더티 요청 알림 켜짐 (앱이 꺼져 있어도 울려요)</p>'; }
      if (p === 'granted' && uid) P.sync(name);
      if (p === 'denied') return '<div class="pushc off"><b>🔕 이 휴대폰은 알림이 막혀 있어요</b><span>크롬 주소창 왼쪽 아이콘(또는 ⋮ → 설정 → 사이트 설정 → 알림)에서 이 사이트 알림을 \'허용\'으로 바꾼 뒤 다시 눌러 주세요.</span><button data-push-on="1">다시 확인</button></div>';
      return '<div class="pushc"><b>🔔 더티 요청 알림 받기</b><span>메이드가 더티를 요청하면 앱이 꺼져 있어도 휴대폰이 울려요. 한 번만 누르고 \'허용\'을 눌러 주세요.</span>' +
        (err ? '<em>' + esc(err) + '</em>' : '') +
        '<button data-push-on="1"' + (busy ? ' disabled' : '') + '>' + (busy ? '켜는 중…' : '알림 받기') + '</button></div>';
    },
    // 버튼 누름 (허락 창은 누른 순간에 바로 열어야 해서 await 전에 부름)
    enable(name) {
      if (busy || !name || !can()) return;
      busy = true; err = ''; redraw();
      const ask = Notification.permission === 'granted' ? Promise.resolve('granted') : Notification.requestPermission();
      return Promise.resolve(ask).then(async p => {
        if (p !== 'granted') { err = p === 'denied' ? '' : '\'허용\'을 눌러야 알림을 받을 수 있어요'; return; }
        if (!uid) throw new Error('잠시 후 다시 눌러 주세요 (로그인 중)');
        await register(name);
      }).catch(e => { err = (e && e.message) || '알림을 켜지 못했어요'; }).then(() => { busy = false; redraw(); });
    },
    // 허락된 휴대폰: 이름 · 로그인이 바뀌었거나 사흘 지났으면 조용히 다시 등록
    sync(name) {
      if (busy || !uid || !name || perm() !== 'granted') return;
      const L = ls();
      if (L.uid === uid && L.name === name && Date.now() - (L.at || 0) < AGAIN) return;
      if (Date.now() - tried < 60e3) return;   // 실패했으면 1분 뒤에 다시 (화면 그릴 때마다 되풀이 안 하게)
      tried = Date.now(); busy = true;
      register(name).then(() => { err = ''; }, e => { err = (e && e.message) || ''; }).then(() => { busy = false; redraw(); });
    },
    _state: () => ({ uid, busy, err, perm: perm(), local: ls() })
  };
  store.onUser(u => { uid = u ? u.uid : ''; });
  window.SupPush = P;
  return P;
}

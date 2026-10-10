// obs-websocket v5 の最小クライアント。BroadcastCustomEvent で表示イベントを OBS 内のブラウザソースへ届ける。
// OBS: ツール → WebSocketサーバー設定 で有効化（既定ポート 4455）。
async function sha256b64(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  let bin = '';
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin);
}

export const BG_KEEP = '=keep';

export function connectObs({ url, password = '', onMessage, onStatus }) {
  let ws = null, ready = false, closed = false, timer = null, req = 0;

  const open = () => {
    onStatus && onStatus('connecting');
    try { ws = new WebSocket(url, 'obswebsocket.json'); } catch { schedule(); return; }
    ws.onmessage = async (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.op === 0) { // Hello
        const d = { rpcVersion: 1, eventSubscriptions: 1 }; // General（CustomEvent を含む）
        const auth = m.d && m.d.authentication;
        if (auth) {
          const secret = await sha256b64(password + auth.salt);
          d.authentication = await sha256b64(secret + auth.challenge);
        }
        ws.send(JSON.stringify({ op: 1, d }));
      } else if (m.op === 2) { // Identified
        ready = true; lastBg = ''; onStatus && onStatus('connected');
      } else if (m.op === 5 && m.d && m.d.eventType === 'CustomEvent') {
        const data = m.d.eventData;
        if (data && data.__kanpe && onMessage) onMessage(data.msg);
      }
    };
    ws.onclose = (e) => {
      ready = false;
      onStatus && onStatus(e.code === 4009 ? 'auth-failed' : 'disconnected');
      if (!closed && e.code !== 4009) schedule();
    };
    ws.onerror = () => {};
  };
  const schedule = () => { clearTimeout(timer); timer = setTimeout(open, 2500); };
  open();

  // 背景画像（数百KB）は変わった時だけ送る。同じなら目印だけ送り、受け手は手元の画像を使い続ける
  let lastBg = '';
  return {
    send(msg) {
      if (!ready) return;
      if (msg && msg.t === 'settings' && msg.s && msg.s.bgImage) {
        if (msg.s.bgImage === lastBg) msg = { ...msg, s: { ...msg.s, bgImage: BG_KEEP } };
        else lastBg = msg.s.bgImage;
      }
      ws.send(JSON.stringify({ op: 6, d: { requestType: 'BroadcastCustomEvent', requestId: String(++req),
        requestData: { eventData: { __kanpe: 1, msg } } } }));
    },
    resetBg() { lastBg = ''; },
    close() { closed = true; clearTimeout(timer); try { ws && ws.close(); } catch { /* noop */ } },
  };
}

// 画面間の同期。サーバー不要。
// - 同じブラウザ内（操作コンソール ⇄ カンペ窓・プレビュー）: BroadcastChannel
// - OBS のブラウザソースへ: obs-websocket（OBS 28 以降に標準搭載）経由
const CHANNEL = 'kanpe-v1';
const ID = Math.random().toString(36).slice(2);

export function createBus(onMessage) {
  let bc = null;
  const links = new Set();
  // to があるメッセージは、その窓だけが受け取る（新しく開いた窓への追いつき用など）
  const receive = (m) => { if (m && m.from !== ID && (!m.to || m.to === ID)) onMessage(m); };
  try {
    bc = new BroadcastChannel(CHANNEL);
    bc.onmessage = (e) => receive(e.data);
  } catch { /* 非対応環境 */ }
  return {
    id: ID,
    send(msg) {
      const m = { ...msg, from: ID };
      try { bc && bc.postMessage(m); } catch { /* noop */ }
      for (const l of links) l.send(m);
    },
    link(l) { links.add(l); return () => links.delete(l); },
    receive,
  };
}

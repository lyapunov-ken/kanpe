// アクセス解析（Google アナリティクス 4）。紹介ページ（LP・規約・404）だけで読み込む。
// アプリの画面（コンソール・表示ビュー）には入れない：話した内容や設定がここを通ることはない。
// ・GA_ID が空のあいだは何もしない（測定 ID をもらったらここに入れる）
// ・本番のドメインだけで計測する。テスト URL で確かめるときは ?ga=debug を付ける（GA の DebugView に出る）
// ・ブラウザで「トラッキングしない（GPC / Do Not Track）」が有効なら読み込まない
// ・広告の機能（Google シグナル・広告のパーソナライズ）は使わない。EU・英国・スイスからの訪問は Cookie なしの計測にする
const GA_ID = 'G-YK9R5RH3V8'; // GA4 の測定 ID（KANPE のプロパティ）
const HOST = 'kanpe.yoneken.xyz';

// EEA（EU＋アイスランド・リヒテンシュタイン・ノルウェー）、英国、スイス
const CONSENT_REGIONS = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'LV', 'LI', 'LT', 'LU',
  'MT', 'NL', 'NO', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'GB', 'CH'];

function debugMode() {
  try {
    if (new URLSearchParams(location.search).get('ga') === 'debug') sessionStorage.setItem('kanpe.ga.debug', '1');
    return sessionStorage.getItem('kanpe.ga.debug') === '1';
  } catch { return false; }
}
const optedOut = () => navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';

// 送る URL からは、utm_ 以外のパラメータと # 以降を外す（決済の戻り先などの値を送らない）
function cleanUrl() {
  const u = new URL(location.href);
  const keep = new URLSearchParams();
  for (const [k, v] of u.searchParams) if (/^utm_/.test(k)) keep.set(k, v);
  const q = keep.toString();
  return u.origin + u.pathname + (q ? '?' + q : '');
}

function start() {
  const debug = debugMode();
  if (!GA_ID || optedOut() || (location.hostname !== HOST && !debug)) return;
  window.dataLayer = window.dataLayer || [];
  window.gtag = function gtag() { window.dataLayer.push(arguments); }; // eslint-disable-line prefer-rest-params
  const gtag = window.gtag;
  gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
  gtag('consent', 'default', { analytics_storage: 'denied', region: CONSENT_REGIONS });
  gtag('set', 'ads_data_redaction', true);
  gtag('js', new Date());
  gtag('config', GA_ID, {
    page_location: cleanUrl(),
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ...(debug ? { debug_mode: true } : {}),
  });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`;
  document.head.appendChild(s);

  // ボタンのクリック：「無料ではじめる」などアプリへのリンクと、有料プランの申し込み
  const where = (el) => {
    const sec = el.closest('section[id]');
    if (sec) return sec.id;
    if (el.closest('.dock')) return 'dock';
    if (el.closest('footer')) return 'footer';
    if (el.closest('header')) return 'header';
    return 'page';
  };
  document.addEventListener('click', (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const buy = t.closest('[data-checkout]');
    if (buy) {
      const year = buy.dataset.interval === 'year';
      const price = year ? 4800 : 480;
      gtag('event', 'begin_checkout', { currency: 'JPY', value: price,
        items: [{ item_id: `kanpe_${buy.dataset.checkout}_${year ? 'year' : 'month'}`, item_name: `KANPE ${buy.dataset.checkout}`, price, quantity: 1 }] });
      return;
    }
    const a = t.closest('a[href]');
    if (a && /(^|\/)(app(\.html)?)([?#]|$)/.test(a.getAttribute('href'))) {
      gtag('event', 'cta_click', { link_location: where(a), link_text: (a.textContent || '').trim().slice(0, 60) });
    }
  }, { capture: true });
}

start();

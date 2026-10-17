// 更新情報（バージョンの更新履歴）。ヘッダーの「更新情報」とスマホのメニューから開く。
// 新しいバージョンをこのブラウザで初めて見てから 1 時間は、ボタンに「NEW」を付けて目立たせる（開いて読んだら消す）。
// 初めて KANPE を使う人には目立たせない（初回のガイドと重ならないように）。記録はこの端末の localStorage だけ。
import { L } from '../core/i18n.js?v=202610171959';
import { CHANGELOG, APP_VERSION } from '../core/changelog.js?v=202610171959';

const KEY = 'kanpe.version.v1';
const HOT_MS = 60 * 60 * 1000; // 目立たせる時間（1時間）
const TYPES = {
  new: { ja: '新機能', en: 'New' },
  improve: { ja: '改善', en: 'Improved' },
  fix: { ja: '修正', en: 'Fixed' },
};

function read() { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
function write(v) { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* noop */ } }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = (d) => { const [y, m, dd] = d.split('-').map(Number); return L(`${y}年${m}月${dd}日`, new Date(y, m - 1, dd).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })); };

// fresh：この端末で初めて KANPE を開いた人か。onUpdated：新しいバージョンを初めて見たときに1回だけ呼ぶ
export function initNews({ fresh = false, onUpdated } = {}) {
  const now = Date.now();
  let st = read();
  let updated = false;
  if (!st) { st = { v: APP_VERSION, at: now, read: !!fresh }; updated = !fresh; write(st); } // 更新情報ができる前から使っていた人には知らせる
  else if (st.v !== APP_VERSION) { st = { v: APP_VERSION, at: now, read: false, from: st.v }; updated = true; write(st); }
  const isHot = () => !st.read && Date.now() - st.at < HOT_MS;

  const buttons = [...document.querySelectorAll('[data-news-open]')];
  const menuBtn = document.querySelector('[data-menu-btn]');
  let timer = 0;
  function paint() {
    const hot = isHot();
    document.documentElement.classList.toggle('news-hot', hot);
    for (const b of buttons) b.setAttribute('data-hot', String(hot));
    if (menuBtn) menuBtn.classList.toggle('has-news', hot);
    clearTimeout(timer);
    if (hot) timer = setTimeout(paint, Math.max(1000, st.at + HOT_MS - Date.now())); // 1時間たったら静かに戻す
  }

  let dlg = null;
  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'news-dialog';
    dlg.setAttribute('aria-labelledby', 'newsTitle');
    const ver = CHANGELOG.map((r, i) => `
      <section class="nw-ver${i === 0 ? ' latest' : ''}">
        <header><b class="nw-v">v${esc(r.v)}</b>${i === 0 ? `<span class="nw-now">${L('いまのバージョン', 'Current')}</span>` : ''}<time>${esc(fmtDate(r.date))}</time></header>
        <ul>${r.items.map((x) => `<li><span class="nw-tag t-${x.type}">${esc(L(TYPES[x.type].ja, TYPES[x.type].en))}</span><span>${esc(L(x.ja, x.en))}</span></li>`).join('')}</ul>
      </section>`).join('');
    dlg.innerHTML = `
      <div class="nw-shell">
        <header class="nw-head">
          <div><p class="nw-eyebrow">WHAT’S NEW</p><h2 id="newsTitle">${L('更新情報', 'What’s new')}</h2></div>
          <button class="hp-close" type="button" data-news-close>${L('閉じる', 'Close')} <kbd>Esc</kbd></button>
        </header>
        <div class="nw-body">${ver}</div>
      </div>`;
    document.body.appendChild(dlg);
    dlg.querySelector('[data-news-close]').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  }
  function open() {
    if (!dlg) build();
    if (typeof dlg.showModal === 'function' && !dlg.open) dlg.showModal();
    dlg.querySelector('.nw-body').scrollTop = 0;
    if (!st.read) { st.read = true; write(st); paint(); }
  }
  for (const b of buttons) b.addEventListener('click', open);
  paint();
  if (updated && onUpdated) onUpdated(APP_VERSION, open);
  return { open, version: APP_VERSION, isOpen: () => !!(dlg && dlg.open) };
}

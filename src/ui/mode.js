// ライト／ダークの切り替え（トップページとコンソールで共通）。
// 選ばなければ OS の設定に従う。ボタンで選ぶと、その選択をこのブラウザに保存して優先する。
// <html data-theme> = 明示的な選択、<html data-mode> = いま実際に表示しているモード。
(() => {
  const KEY = 'kanpe.ui';
  const root = document.documentElement;
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false, addEventListener() {} };
  const saved = () => { try { const v = localStorage.getItem(KEY); return v === 'light' || v === 'dark' ? v : null; } catch { return null; } };
  const effective = () => saved() || (mq.matches ? 'dark' : 'light');

  function apply() {
    const s = saved();
    if (s) root.dataset.theme = s; else delete root.dataset.theme;
    const mode = effective();
    root.dataset.mode = mode;
    for (const b of document.querySelectorAll('[data-mode-toggle]')) {
      const label = mode === 'dark' ? 'ライトモードにする' : 'ダークモードにする';
      b.setAttribute('aria-label', label);
      b.title = label;
    }
    // ブラウザの上部バーの色も合わせる
    const cs = getComputedStyle(root);
    const bg = (cs.getPropertyValue('--paper') || cs.getPropertyValue('--bg')).trim();
    if (bg) for (const m of document.querySelectorAll('meta[name="theme-color"]')) m.setAttribute('content', bg);
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-mode-toggle]');
    if (!b) return;
    const next = effective() === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(KEY, next); } catch { /* 保存できなくても、この画面では切り替える */ root.dataset.theme = next; }
    root.classList.add('mode-anim');
    apply();
    setTimeout(() => root.classList.remove('mode-anim'), 400);
  });
  mq.addEventListener && mq.addEventListener('change', apply);
  window.addEventListener('storage', (e) => { if (e.key === KEY) apply(); }); // 別のタブで切り替えたとき
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply); else apply();
})();

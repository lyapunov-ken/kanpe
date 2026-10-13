// スマホ・タブレットのヘッダーメニュー（トップページ・コンソール・規約ページで共通）。
// 画面が狭いときだけ出る ☰ ボタンで、横に並びきらない項目（ページ内リンク、ヘルプ、言語、表示モード）を開閉する。
// 中の言語リンク（data-lang-switch）と表示モード（data-mode-toggle）は、lang.js / mode.js がそのまま扱う。
(() => {
  for (const btn of document.querySelectorAll('[data-menu-btn]')) {
    const panel = document.getElementById(btn.getAttribute('aria-controls'));
    if (!panel) continue;
    const isOpen = () => btn.getAttribute('aria-expanded') === 'true';
    const set = (open) => {
      btn.setAttribute('aria-expanded', String(open));
      panel.classList.toggle('open', open);
      document.documentElement.classList.toggle('menu-open', open);
    };
    btn.addEventListener('click', (e) => { e.stopPropagation(); set(!isOpen()); });
    // 移動する項目（リンク・ヘルプ）を選んだら閉じる。表示モードは切り替わりが見えるよう開いたまま
    panel.addEventListener('click', (e) => { if (e.target.closest('a, [data-menu-close]')) set(false); });
    document.addEventListener('click', (e) => { if (isOpen() && !panel.contains(e.target)) set(false); });
    // プレビューなどの iframe を押したときは、親のページにクリックが届かないので、フォーカスが外れたことで閉じる
    window.addEventListener('blur', () => { if (isOpen()) set(false); });
    // Esc はメニューを閉じるだけにする（コンソールの「全消去」まで届かないように止める）
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !isOpen()) return;
      e.stopPropagation();
      set(false);
      btn.focus();
    });
    // 画面を広げてボタンが消えたら、開きっぱなしにしない
    window.addEventListener('resize', () => { if (isOpen() && !btn.offsetParent) set(false); });
  }
})();

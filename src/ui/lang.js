// 日本語版 ⇄ 英語版の切り替え。いきなり移動せず、確認の窓を出してから切り替える。
// 操作コンソールでは、切り替える前に聞き取りとデモを止め、設定と文字起こしを保存して、切り替え先に引き継ぐ。
(() => {
  const EN = (document.documentElement.lang || '').toLowerCase().startsWith('en');
  const T = EN ? {
    title: '日本語版に切り替えますか？', sub: 'Switch to Japanese?',
    body: 'This page will reopen in Japanese. Your settings stay in this browser and carry over.',
    bodyConsole: 'Listening and the demo will stop first. Your settings and transcript carry over to the Japanese page.',
    cancel: 'Cancel', ok: '日本語版へ切り替える', busy: 'Switching…',
  } : {
    title: '英語版に切り替えますか？', sub: 'Switch to English?',
    body: 'ページを英語版で開き直します。設定はこのブラウザに残るので、そのまま引き継がれます。',
    bodyConsole: '聞き取り中やデモ中の場合は、先に止めてから切り替えます。設定と文字起こしは英語版に引き継がれます。',
    cancel: 'キャンセル', ok: 'Switch to English', busy: '切り替えています…',
  };
  let dlg = null, target = '';

  function build() {
    dlg = document.createElement('dialog');
    dlg.className = 'lang-dialog';
    dlg.setAttribute('aria-labelledby', 'langDlgTitle');
    dlg.innerHTML = `
      <form method="dialog" class="lang-box">
        <p class="lang-icon" aria-hidden="true">${EN ? 'あ' : 'A'}</p>
        <h2 id="langDlgTitle"></h2>
        <p class="lang-sub"></p>
        <p class="lang-body"></p>
        <div class="lang-actions">
          <button type="submit" value="cancel" class="lang-cancel"></button>
          <button type="button" class="lang-ok"></button>
        </div>
      </form>`;
    dlg.querySelector('h2').textContent = T.title;
    dlg.querySelector('.lang-sub').textContent = T.sub;
    dlg.querySelector('.lang-body').textContent = window.__kanpeBeforeLeave ? T.bodyConsole : T.body;
    dlg.querySelector('.lang-cancel').textContent = T.cancel;
    const ok = dlg.querySelector('.lang-ok');
    ok.textContent = T.ok;
    ok.addEventListener('click', go);
    dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); }); // 窓の外を押したら閉じる
    document.body.appendChild(dlg);
  }

  function go() {
    const ok = dlg.querySelector('.lang-ok');
    if (ok.disabled) return; // 二度押し防止
    ok.disabled = true;
    dlg.querySelector('.lang-cancel').disabled = true;
    ok.textContent = T.busy;
    try { if (window.__kanpeBeforeLeave) { window.__kanpeBeforeLeave(); sessionStorage.setItem('kanpe.carry', '1'); } } catch { /* 止められなくても移動はする */ }
    // 少し待ってから移動（マイクの停止と保存を確実にする）
    setTimeout(() => { location.assign(target); }, 180);
  }

  function open(href) {
    target = href;
    if (!dlg) build();
    const ok = dlg.querySelector('.lang-ok');
    ok.disabled = false; ok.textContent = T.ok;
    dlg.querySelector('.lang-cancel').disabled = false;
    if (typeof dlg.showModal === 'function') {
      if (!dlg.open) dlg.showModal();
      ok.focus();
    } else if (window.confirm(`${T.title}\n${T.sub}`)) { // dialog 非対応の古いブラウザ
      go();
    }
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[data-lang-switch]');
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return; // 新しいタブで開くときはそのまま
    e.preventDefault();
    open(a.href);
  });
})();

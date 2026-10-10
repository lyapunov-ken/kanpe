// ランディングページ：モニターのタイムコードと、デモの見た目切り替え。
(() => {
  const tc = document.getElementById('tc');
  const t0 = performance.now();
  const pad = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const s = (performance.now() - t0) / 1000;
    const f = Math.floor((s % 1) * 30);
    tc.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(Math.floor(s) % 60)};${pad(f)}`;
    requestAnimationFrame(tick);
  };
  if (tc) requestAnimationFrame(tick);

  const frame = document.getElementById('demo');
  const label = document.getElementById('monLabel');
  const names = { sumi: '墨', yoru: '夜', pop: 'ポップ', yawaraka: 'やわらか', compose: '組版', kanpe: 'カンペ', ticker: 'テロップ' };
  const state = { theme: 'yoru', layout: 'compose' };
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const load = () => {
    frame.src = `display.html?demo=1&theme=${state.theme}&layout=${state.layout}${calm ? '&calm=1' : ''}`;
    label.textContent = `${names[state.layout]} · ${names[state.theme]}`;
  };
  if (calm) load();
  const bind = (id, key, attr) => {
    const box = document.getElementById(id);
    if (!box) return;
    box.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      state[key] = b.getAttribute(attr);
      for (const x of box.querySelectorAll('button')) x.setAttribute('aria-pressed', String(x === b));
      load();
    });
  };
  bind('themeChips', 'theme', 'data-theme-id');
  bind('layoutChips', 'layout', 'data-layout-id');

  const y = document.getElementById('year');
  if (y) y.textContent = String(new Date().getFullYear());
})();

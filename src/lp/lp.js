// ランディングページ：モニターのタイムコード、デモの見た目切り替え、出現アニメーション、スマホの固定ボタン。
(() => {
  const $ = (id) => document.getElementById(id);
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- タイムコード
  const tc = $('tc');
  const t0 = performance.now();
  const pad = (n) => String(n).padStart(2, '0');
  const tick = () => {
    const s = (performance.now() - t0) / 1000;
    const f = Math.floor((s % 1) * 30);
    tc.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(Math.floor(s) % 60)};${pad(f)}`;
    requestAnimationFrame(tick);
  };
  if (tc) requestAnimationFrame(tick);

  // ---- デモの見た目切り替え
  const frame = $('demo');
  const label = $('monLabel');
  const EN = (document.documentElement.lang || '').startsWith('en');
  const names = EN
    ? { sumi: 'Sumi', yoru: 'Night', pop: 'Pop', yawaraka: 'Soft', compose: 'Compose', kanpe: 'Cue', ticker: 'Ticker' }
    : { sumi: '墨', yoru: '夜', pop: 'ポップ', yawaraka: 'やわらか', compose: '組版', kanpe: 'カンペ', ticker: 'テロップ' };
  const demoBase = frame ? frame.getAttribute('src').split('?')[0] : 'display.html'; // 英語版は ../display.html
  const state = { theme: 'yoru', layout: 'compose' };
  const load = () => {
    frame.src = `${demoBase}?demo=1&ui=0&theme=${state.theme}&layout=${state.layout}${calm ? '&calm=1' : ''}${EN ? '&hl=en' : ''}`;
    label.textContent = `${names[state.layout]} · ${names[state.theme]}`;
  };
  if (calm && frame) load();
  const bind = (id, key, attr) => {
    const box = $(id);
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

  // ---- 出現アニメーション
  const items = document.querySelectorAll('.reveal');
  if (!('IntersectionObserver' in window) || calm) {
    items.forEach((el) => el.classList.add('in'));
  } else {
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const el = en.target;
        // 同じ行に並ぶ要素は少しずつ遅らせる
        const sibs = [...el.parentElement.children].filter((c) => c.classList.contains('reveal'));
        el.style.transitionDelay = `${Math.min(sibs.indexOf(el), 5) * 70}ms`;
        el.classList.add('in');
        io.unobserve(el);
      }
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach((el) => io.observe(el));
  }

  // ---- ロゴ：ページの先頭へ戻る（固定ヘッダー自身へのリンクだと動かないため、明示的に先頭へ）
  for (const a of document.querySelectorAll('a[href="#top"]')) {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' });
      if (location.hash) history.replaceState(null, '', location.pathname + location.search);
    });
  }

  // ---- ナビの下線（スクロールしたら）
  const nav = document.querySelector('.nav');
  const onScroll = () => nav && nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // ---- スマホの固定ボタン：最初のボタンが画面から外れたら出し、締めのセクションでは隠す
  const dock = $('dock');
  const heroCta = $('heroCta');
  const closer = $('closer');
  if (dock && heroCta && 'IntersectionObserver' in window) {
    const seen = { hero: true, closer: false };
    const sync = () => {
      const show = !seen.hero && !seen.closer;
      dock.classList.toggle('show', show);
      dock.setAttribute('aria-hidden', String(!show));
      const a = dock.querySelector('a');
      if (a) a.tabIndex = show ? 0 : -1;
    };
    const watch = (el, key) => new IntersectionObserver(([en]) => { seen[key] = en.isIntersecting; sync(); }).observe(el);
    watch(heroCta, 'hero');
    if (closer) watch(closer, 'closer');
  }

  // ---- 特徴カード（スマホの横スワイプ）の何枚目か
  const specs = $('specimens');
  const count = $('specCount');
  if (specs && count) {
    const total = specs.children.length;
    let raf = 0;
    specs.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const w = specs.children[0].getBoundingClientRect().width + 12;
        const i = Math.min(total, Math.round(specs.scrollLeft / w) + 1);
        count.textContent = `${pad(i)} / ${pad(total)}`;
      });
    }, { passive: true });
  }

  // ---- 料金のタブ（スマホ）
  const tabs = $('planTabs');
  const plans = $('plans');
  if (tabs && plans) {
    const btns = [...tabs.querySelectorAll('button')];
    const select = (i, focus) => {
      plans.dataset.show = String(i);
      btns.forEach((b, j) => { b.setAttribute('aria-selected', String(j === i)); b.tabIndex = j === i ? 0 : -1; });
      if (focus) btns[i].focus();
    };
    tabs.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) select(+b.dataset.plan); });
    tabs.addEventListener('keydown', (e) => {
      const i = btns.indexOf(document.activeElement);
      if (i < 0) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); select((i + 1) % btns.length, true); }
      if (e.key === 'ArrowLeft') { e.preventDefault(); select((i + btns.length - 1) % btns.length, true); }
    });
    select(0);
  }

  // ---- 演出のデモ：見えている間だけ動かす（スマホの電池と描画負荷のため）
  const shows = document.querySelectorAll('iframe[data-src]');
  if ('IntersectionObserver' in window) {
    const io2 = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const f = en.target;
        const want = en.isIntersecting ? f.dataset.src + (calm ? '&calm=1' : '') : 'about:blank';
        if (f.getAttribute('src') !== want && (en.isIntersecting || f.getAttribute('src'))) f.setAttribute('src', want);
      }
    }, { rootMargin: '200px 0px' });
    shows.forEach((f) => io2.observe(f));
  } else {
    shows.forEach((f) => f.setAttribute('src', f.dataset.src));
  }

  // ---- 申し込み（Stripe の支払いページへ）
  const owned = (() => { // すでに有料プランを使っているブラウザなら、申し込みボタンをコンソールへの案内に変える
    try { const l = JSON.parse(localStorage.getItem('kanpe.license.v1') || 'null'); return l && l.plan !== 'free' && l.expires * 1000 > Date.now() ? l.plan : null; } catch { return null; }
  })();
  for (const b of document.querySelectorAll('[data-checkout]')) {
    if (owned) {
      if (b.dataset.interval === 'year') { b.hidden = true; continue; }
      b.textContent = EN ? 'You’re subscribed — open the console' : 'ご利用中です（コンソールへ）';
      b.addEventListener('click', () => location.assign('app.html'));
      continue;
    }
    b.addEventListener('click', async () => {
      if (b.getAttribute('aria-busy') === 'true') return;
      const msg = b.parentElement.querySelector('.buy-msg');
      const label = b.textContent;
      b.setAttribute('aria-busy', 'true');
      b.textContent = EN ? 'Opening checkout…' : 'お支払いページへ移動しています…';
      if (msg) msg.textContent = '';
      try {
        const res = await fetch('/api/checkout', { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ plan: b.dataset.checkout, interval: b.dataset.interval, lang: EN ? 'en' : 'ja' }) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) throw Object.assign(new Error('checkout'), { code: (data.error && data.error.code) || res.status });
        location.assign(data.url);
        return;
      } catch (e) {
        const notReady = ['not_configured', 'price_missing', 404, 405].includes(e.code);
        if (msg) msg.textContent = notReady
          ? (EN ? 'Sign-ups are being prepared. Please check back soon.' : 'お申し込みの受付を準備しています。もうしばらくお待ちください')
          : (EN ? 'Couldn’t connect. Please try again in a moment.' : '通信できませんでした。少し待ってからもう一度お試しください');
      }
      b.removeAttribute('aria-busy');
      b.textContent = label;
    });
  }

  const y = $('year');
  if (y) y.textContent = String(new Date().getFullYear());
})();

// はじめての人向けの 3 ステップのガイド。画面の実物を枠で囲み、順番に案内する。
// 「無料ではじめる」から初めて開いたときに一度だけ自動で出る。右上の「使い方」からいつでも見直せる。
import { L } from '../core/i18n.js?v=202610150959';

const KEY = 'kanpe.guide.v1';
export function guideSeen() { try { return localStorage.getItem(KEY) === '1'; } catch { return true; } }
function markSeen() { try { localStorage.setItem(KEY, '1'); } catch { /* noop */ } }

// steps: [{ target: () => Element | Element[], title, body, enter?(), leave?() }]
export function createGuide({ steps, onEnd }) {
  let root = null, hole = null, card = null, i = 0, raf = 0, lastFocus = null;
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

  function build() {
    root = h('div', 'guide');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'guideTitle');
    const block = h('div', 'g-block'); // 後ろの画面を押せないようにする
    hole = h('div', 'g-hole');
    hole.append(h('i', 'g-c tl'), h('i', 'g-c tr'), h('i', 'g-c bl'), h('i', 'g-c br'));
    card = h('div', 'g-card');
    root.append(block, hole, card);
    block.addEventListener('click', () => card.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'translateX(0)' }], { duration: 240 }));
    document.body.appendChild(root);
    window.addEventListener('resize', schedule);
    window.addEventListener('scroll', schedule, true);
    root.addEventListener('keydown', onKey);
  }

  function rectOf(step) {
    let els = step.target();
    els = (Array.isArray(els) ? els : [els]).filter((e) => e && e.getClientRects().length);
    if (!els.length) return null;
    const rs = els.map((e) => e.getBoundingClientRect());
    const x0 = Math.min(...rs.map((r) => r.left)), y0 = Math.min(...rs.map((r) => r.top));
    const x1 = Math.max(...rs.map((r) => r.right)), y1 = Math.max(...rs.map((r) => r.bottom));
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0, els };
  }

  function position() {
    raf = 0;
    if (!root) return;
    const r = rectOf(steps[i]);
    const pad = 8, vw = window.innerWidth, vh = window.innerHeight;
    if (!r) { hole.style.opacity = '0'; card.classList.add('center'); return; }
    hole.style.opacity = '1';
    const x = Math.max(4, r.x - pad), y = Math.max(4, r.y - pad);
    const w = Math.min(vw - 8, r.w + pad * 2), hh = Math.min(vh - 8, r.h + pad * 2);
    Object.assign(hole.style, { transform: `translate(${x}px, ${y}px)`, width: w + 'px', height: hh + 'px' });
    // カードは枠の右 → 下 → 上 → 左の順に、入る場所へ
    card.classList.remove('center');
    const cw = card.offsetWidth, ch = card.offsetHeight, gap = 16;
    if (vw <= 640) { card.style.transform = ''; card.classList.add('dock'); return; }
    card.classList.remove('dock');
    let cx, cy;
    if (x + w + gap + cw <= vw - 12) { cx = x + w + gap; cy = Math.min(Math.max(12, y), vh - ch - 12); }
    else if (y + hh + gap + ch <= vh - 12) { cx = Math.min(Math.max(12, x), vw - cw - 12); cy = y + hh + gap; }
    else if (y - gap - ch >= 12) { cx = Math.min(Math.max(12, x), vw - cw - 12); cy = y - gap - ch; }
    else if (x - gap - cw >= 12) { cx = x - gap - cw; cy = Math.min(Math.max(12, y), vh - ch - 12); }
    else { cx = (vw - cw) / 2; cy = vh - ch - 16; }
    card.style.transform = `translate(${Math.round(cx)}px, ${Math.round(cy)}px)`;
  }
  const schedule = () => { if (!raf) raf = requestAnimationFrame(position); };

  function render() {
    const st = steps[i];
    const last = i === steps.length - 1;
    card.replaceChildren();
    const top = h('div', 'g-top');
    top.append(h('span', 'g-step', `STEP ${i + 1} / ${steps.length}`));
    const bar = h('span', 'g-bar');
    steps.forEach((_, k) => { const s = h('i'); if (k <= i) s.className = 'on'; bar.appendChild(s); });
    top.appendChild(bar);
    const title = h('h3', null, st.title); title.id = 'guideTitle';
    const body = h('p', null, st.body);
    const actions = h('div', 'g-actions');
    const skip = h('button', 'g-skip', last ? L('閉じる', 'Close') : L('スキップ', 'Skip')); skip.type = 'button';
    skip.addEventListener('click', () => end());
    actions.appendChild(skip);
    if (i > 0) { const back = h('button', 'g-back', L('戻る', 'Back')); back.type = 'button'; back.addEventListener('click', () => go(i - 1)); actions.appendChild(back); }
    const next = h('button', 'g-next', last ? L('さっそく使う', 'Let’s go') : L('次へ', 'Next')); next.type = 'button';
    next.addEventListener('click', () => (last ? end() : go(i + 1)));
    actions.appendChild(next);
    card.append(top, title, body, actions);
    if (st.note) card.insertBefore(h('p', 'g-note', st.note), actions);
    next.focus({ preventScroll: true });
  }

  function go(n) {
    const prev = steps[i];
    if (prev && prev.leave && n !== i) prev.leave();
    i = Math.max(0, Math.min(steps.length - 1, n));
    const st = steps[i];
    const r = rectOf(st);
    if (r) r.els[0].scrollIntoView({ block: 'center' });
    render();
    if (st.enter) st.enter();
    position();
    setTimeout(schedule, 60);
    hole.animate([{ boxShadow: '0 0 0 0 color-mix(in srgb, var(--accent) 60%, transparent), 0 0 0 200vmax var(--g-shade)' },
      { boxShadow: '0 0 0 10px color-mix(in srgb, var(--accent) 0%, transparent), 0 0 0 200vmax var(--g-shade)' }], { duration: 700, easing: 'ease-out' });
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); end(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); if (i < steps.length - 1) go(i + 1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); if (i > 0) go(i - 1); }
    else if (e.key === 'Tab') { // カードの中だけを行き来する
      const f = [...card.querySelectorAll('button')];
      const k = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
    e.stopPropagation();
  }

  function start() {
    if (root) return;
    lastFocus = document.activeElement;
    build();
    i = 0;
    go(0);
    root.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' });
  }
  function end() {
    if (!root) return;
    const st = steps[i];
    if (st && st.leave) st.leave();
    markSeen();
    window.removeEventListener('resize', schedule);
    window.removeEventListener('scroll', schedule, true);
    const r = root;
    root = null;
    r.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in' }).onfinish = () => r.remove();
    if (onEnd) onEnd();
    else if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  return { start, end, isOpen: () => !!root };
}

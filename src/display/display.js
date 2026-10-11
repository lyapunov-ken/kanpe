// 表示ビュー：受け取った「表示イベント」を日本語タイポグラフィとして描く。
// 依存ゼロ。アニメーションは transform / opacity（漢字の滲みだけ filter）を Web Animations API で動かす。
import { THEMES, DEFAULTS, DEFAULT_THEME, ACCENTS, loadSettings } from '../core/settings.js?v=202610111226';
import { canUse, trialRemainingMs, addTrialUsage } from '../core/plan.js?v=202610111226';
import { createBus } from '../core/bus.js?v=202610111226';
import { connectObs, BG_KEEP } from '../core/obs.js?v=202610111226';
import { runs } from '../core/extract.js?v=202610111226';
import { EN, L, tr } from '../core/i18n.js?v=202610111226';
import { createVJ } from './vj.js?v=202610111226';

const P = new URLSearchParams(location.search);
const LOCK = {};
if (THEMES[P.get('theme')]) LOCK.theme = P.get('theme');
if (/^[0-9a-f]{6}$/i.test(P.get('accent') || '')) LOCK.accent = '#' + P.get('accent');
if (['compose', 'kanpe', 'ticker', 'vj'].includes(P.get('layout'))) LOCK.layout = P.get('layout');
if (['led', 'neon', 'pixel'].includes(P.get('vj'))) LOCK.vjStyle = P.get('vj');
if (+P.get('size') > 0) LOCK.baseSize = +P.get('size');
if (P.get('calm') === '1') LOCK.reduceMotion = true;
if (P.get('cap') === '0') LOCK.caption = false;
if (P.get('cap') === '1') LOCK.caption = true;
const LOCAL_FONTS = P.get('fonts') === 'local';
const EMBED = P.get('embed') === '1';

let S = { ...DEFAULTS, ...loadSettings(), ...LOCK };
const root = document.documentElement;
const stage = document.getElementById('stage');
const cap = document.getElementById('caption');
const hint = document.getElementById('hint');
if (EN && hint) { hint.textContent = 'Start talking and your words appear here'; document.documentElement.lang = 'en'; }
const items = new Map();
let host = stage;
let trackX = 0;
let lastWordAt = performance.now();
let vj = null; // VJ モードの描画エンジン
let lastSp = null; // 直前に表示した話者（話者が替わった最初の語にだけラベルを付ける）

// ジャンプ率：組版は大胆に、カンペ・テロップは読みやすさ優先で控えめに
const RATIOS = { compose: [1, 1.5, 2.25, 3.4], kanpe: [1, 1.2, 1.42, 1.7], ticker: [1, 1.14, 1.3, 1.48] };
const TRACK = [0.02, 0, -0.025, -0.045]; // 大きい語ほど字間を詰める
const MAXW = { compose: 40, kanpe: 14, ticker: 30 };

const unit = () => Math.max(0.2, stage.clientHeight / 720);
const basePx = () => S.baseSize * unit();
const now = () => performance.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const el = (cls, text) => { const e = document.createElement(text === undefined ? 'div' : 'span'); e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// ---------------------------------------------------------------- テーマ
const fontLinks = new Set();
let shownBg = '';
function applyTheme() {
  const th = THEMES[S.theme] || THEMES.yoru;
  const vars = {
    '--bg': th.bg, '--ink': th.ink, '--sub': th.sub, '--accent': S.accent || th.accent, '--accent2': th.accent2, '--stroke': th.stroke,
    '--font': `${th.family}, ${th.fallback}`, '--w-strong': th.strong, '--w-light': th.light, '--base': basePx() + 'px',
  };
  for (const k in vars) root.style.setProperty(k, vars[k]);
  // 背景画像：窓に合わせて cover でトリミング。上に地色を重ねて文字を読みやすくする
  const bgEl = document.getElementById('bg');
  if (bgEl) {
    if (shownBg !== (S.bgImage || '')) { // 数百KBの文字列なので、変わった時だけ差し替える
      shownBg = S.bgImage || '';
      bgEl.style.backgroundImage = S.bgImage ? `url("${S.bgImage}")` : '';
    }
    root.style.setProperty('--bg-dim', String(S.bgDim == null ? 0.4 : S.bgDim));
    root.style.setProperty('--bg-dim-color', th.bg === 'transparent' ? '#000' : th.bg);
  }
  document.body.className = `theme-${S.theme} layout-${S.layout}` + (S.reduceMotion ? ' calm' : '') +
    (S.caption ? ' has-cap' : '') + (EMBED ? ' embed' : '') + (S.credit === false ? '' : ' has-credit') + (S.bgImage ? ' has-bgimg' : '');
  if (!LOCAL_FONTS && th.gf && !fontLinks.has(th.gf)) {
    fontLinks.add(th.gf);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${th.gf}&display=swap`;
    document.head.appendChild(l);
  }
  configureVJ();
}

// 表示する語の字形だけを先読み（Google Fonts は文字範囲ごとに分割配信）。最大120msで見切る。
function fontReady(text, px) {
  if (LOCAL_FONTS || !document.fonts) return Promise.resolve();
  const th = THEMES[S.theme] || THEMES.yoru;
  const p = Promise.all([
    document.fonts.load(`${th.strong} ${px}px ${th.family}`, text),
    document.fonts.load(`${th.light} ${px}px ${th.family}`, text),
  ]).catch(() => {});
  return Promise.race([p, sleep(120)]);
}

// ---------------------------------------------------------------- レイアウト
function setupLayout() {
  for (const it of items.values()) it.el.remove();
  items.clear();
  if (vj) { vj.destroy(); vj = null; }
  stage.replaceChildren();
  lastSp = null;
  if (S.layout === 'vj') {
    vj = createVJ(stage, { localFonts: LOCAL_FONTS });
    configureVJ();
    host = stage;
  } else if (S.layout === 'kanpe') {
    host = el('flow');
    stage.appendChild(host);
  } else if (S.layout === 'ticker') {
    const t = el('ticker');
    host = el('track');
    t.appendChild(host);
    stage.appendChild(t);
    trackX = stage.clientWidth;
    host.style.transform = `translateX(${trackX}px)`;
  } else {
    host = stage;
  }
  updateHint();
}

function updateHint() {
  if (hint) hint.classList.toggle('on', EMBED && (vj ? vj.count() === 0 : items.size === 0));
}
function configureVJ() {
  if (!vj) return;
  const th = THEMES[S.theme] || THEMES.yoru;
  vj.configure({ style: S.vjStyle || 'led', accent: S.accent || th.accent, accent2: th.accent2,
    transparent: th.bg === 'transparent' || !!S.bgImage, calm: !!S.reduceMotion, caption: !!S.caption, ttl: S.ttl });
}

function level(kind, text, count) {
  let l = (kind === 'new' || kind === 'registered') ? 2 : (kind === 'number' || [...text].length >= 4) ? 1 : 0;
  l += Math.min((count || 1) - 1, 2); // 繰り返すと育つ
  return Math.min(l, 3);
}

// 1語を文字種ごとに組む。和字は1字ずつ、欧文・数字はランごと（カーニングを保つ）
function build(text, kind, vertical) {
  const w = el(`w k-${kind}` + (vertical ? ' v' : ''));
  const inner = el('wi', '');
  const parts = [];
  for (const r of runs(text)) {
    if (r.s === 'l' || r.s === 'n') {
      const cls = `c s-${r.s}` + (vertical && r.s === 'n' && r.t.length <= 2 ? ' tcy' : '');
      const s = el(cls, r.t); s.dataset.s = r.s; parts.push(s);
    } else {
      for (const ch of r.t) { const s = el(`c s-${r.s}`, ch); s.dataset.s = r.s; parts.push(s); }
    }
  }
  inner.append(...parts);
  w.appendChild(inner);
  if (kind === 'new') w.appendChild(el('bar'));
  return { node: w, inner, parts };
}

function overlap(x, y, w, h, r) {
  const ox = Math.max(0, Math.min(x + w, r.x + r.w) - Math.max(x, r.x));
  const oy = Math.max(0, Math.min(y + h, r.y + r.h) - Math.max(y, r.y));
  return ox * oy;
}

// 12カラムの格子にスナップしながら、重ならない場所を探す。大きい語ほど中央寄り。
function place(w, h, lv, self) {
  const W = stage.clientWidth, H = stage.clientHeight;
  const pad = Math.min(W, H) * 0.05;
  const reserve = S.caption ? H * 0.15 : 0;
  const maxX = Math.max(pad, W - pad - w), maxY = Math.max(pad, H - pad - reserve - h);
  const col = (W - 2 * pad) / 12, row = Math.max(6, basePx() * 0.5);
  const gap = basePx() * 0.3;
  const cx = W / 2, cy = (H - reserve) / 2;
  const centerWeight = w * h * (lv >= 3 ? 1.4 : lv === 2 ? 0.8 : lv === 1 ? 0.25 : 0.08);
  let best = null;
  for (let i = 0; i < 120; i++) {
    const x = Math.min(maxX, pad + Math.round((Math.random() * (maxX - pad)) / col) * col);
    const y = Math.min(maxY, pad + Math.round((Math.random() * (maxY - pad)) / row) * row);
    let ov = 0, fade = 0;
    for (const it of items.values()) {
      if (it === self || !it.rect) continue;
      const o = overlap(x - gap, y - gap, w + 2 * gap, h + 2 * gap, it.rect);
      if (it.leaving) fade += o; else ov += o;
    }
    const dc = Math.hypot((x + w / 2 - cx) / W, (y + h / 2 - cy) / H);
    // 重ならないことが最優先。次に退場中の語を避け、最後に中央寄せ
    const score = (ov > 0 ? 1e9 + ov : 0) + (fade > 0 ? 1e6 + fade : 0) + dc * centerWeight;
    if (!best || score < best.score) best = { x, y, w, h, ov, score };
  }
  return best;
}

// 画面（字幕ぶんを除く）に収まらない語は縮める。縦組みの長い語は高さで効く
function fit(node, px) {
  const W = stage.clientWidth, H = stage.clientHeight;
  const maxW = W * 0.9, maxH = (H - (S.caption ? H * 0.15 : 0)) * 0.86;
  const k = Math.min(1, maxW / node.offsetWidth, maxH / node.offsetHeight);
  if (k < 1) node.style.fontSize = px * k + 'px';
}

function clearSpot(r, self) {
  if (!r || r.ov <= 0) return;
  const gap = basePx() * 0.3;
  for (const it of liveItems()) {
    if (it !== self && it.rect && overlap(r.x - gap, r.y - gap, r.w + 2 * gap, r.h + 2 * gap, it.rect) > 0) expire(it);
  }
}

function liveItems() { return [...items.values()].filter((it) => !it.leaving); }

// ---------------------------------------------------------------- 追加・成長・退場
async function addWord(m) {
  const text = m.text;
  if (!text) return;
  lastWordAt = now();
  if (vj) { await vj.add(m); updateHint(); return; }
  const key = text.toLowerCase();
  const prev = items.get(key);
  if (prev && !prev.leaving) { bump(prev, m.count); return; }

  const kind = m.kind || 'normal';
  const lv = level(kind, text, m.count);
  const px = basePx() * RATIOS[S.layout][lv];
  const len = [...text].length;
  const vertical = S.layout === 'compose' && S.vertical && !/[A-Za-z]/.test(text) && len >= 2 && len <= 7 &&
    Math.random() < (lv >= 1 ? 0.4 : 0.22);
  await fontReady(text, px);

  const { node, inner, parts } = build(text, kind, vertical);
  if (m.spc) { // 話者の色とラベル（話者が替わった最初の語にだけ名前を添える）
    node.classList.add('has-sp');
    node.style.setProperty('--spc', m.spc);
    if (m.spn && m.sp !== lastSp) node.appendChild(el('sp-tag', m.spn));
    lastSp = m.sp;
  }
  node.style.fontSize = px + 'px';
  node.style.letterSpacing = TRACK[lv] + 'em';
  const ttl = S.ttl * 1000 * (kind === 'new' ? 1.25 : 1) * (lv >= 2 ? 1.15 : 1);
  const it = { key, text, kind, count: m.count || 1, lv, el: node, inner, parts, vertical,
    born: now(), ttl, expires: now() + ttl, rect: null, leaving: false, aging: false };

  const max = Math.min(S.maxWords, MAXW[S.layout]);
  let live = liveItems();
  while (live.length >= max) { expire(live[0]); live = liveItems(); }

  if (S.layout === 'compose') {
    node.style.visibility = 'hidden';
    host.appendChild(node);
    fit(node, px);
    const r = place(node.offsetWidth, node.offsetHeight, lv, it);
    clearSpot(r, it); // 空きがなければ、その場所にいる語に早めに退場してもらう
    it.rect = r;
    node.style.transform = `translate(${r.x}px, ${r.y}px)`;
    node.style.visibility = '';
  } else if (S.layout === 'kanpe') {
    flip(() => host.appendChild(node));
  } else {
    host.appendChild(node);
    shiftTrack(true);
  }
  items.set(key, it);
  updateHint();
  enter(it);
}

const EASE = 'cubic-bezier(.2,.75,.15,1)';
function enter(it) {
  const calm = S.reduceMotion;
  const stagger = calm ? 0 : Math.min(34, 300 / Math.max(1, it.parts.length));
  it.parts.forEach((p, i) => {
    const s = p.dataset.s;
    let from;
    if (calm) from = { opacity: 0 };
    else if (s === 'k') from = { opacity: 0, transform: 'scale(1.16)', filter: 'blur(5px)' }; // 墨が滲むように
    else if (s === 'ka') from = { opacity: 0, transform: it.vertical ? 'translateY(-.45em)' : 'translateX(-.45em)' };
    else if (s === 'h') from = { opacity: 0, transform: 'translateY(.35em)' };
    else if (s === 'l') from = { opacity: 0, transform: 'translateY(.5em)' };
    else if (s === 'n') from = { opacity: 0, transform: 'translateY(-.45em)' };
    else from = { opacity: 0 };
    const to = { opacity: 1 };
    if (from.transform) to.transform = 'none';
    if (from.filter) to.filter = 'blur(0px)';
    p.animate([from, to], { duration: calm ? 260 : s === 'k' ? 620 : 440, delay: i * stagger, easing: EASE, fill: 'backwards' });
  });
  const total = it.parts.length * stagger;
  if (it.kind === 'new') {
    const bar = it.el.querySelector('.bar');
    if (bar && !calm) bar.animate([{ transform: it.vertical ? 'scaleY(0)' : 'scaleX(0)' }, { transform: 'none' }],
      { duration: 560, delay: total + 140, easing: EASE, fill: 'backwards' });
  }
  if (it.kind === 'number' && !calm) countUp(it);
}

function countUp(it) {
  const p = it.parts.find((x) => x.dataset.s === 'n');
  if (!p) return;
  const target = parseInt(p.textContent, 10);
  if (!Number.isFinite(target) || target < 10) return;
  const digits = p.textContent.length;
  const t0 = now(), dur = 620;
  const step = () => {
    const k = Math.min(1, (now() - t0) / dur);
    const v = Math.round(target * (1 - Math.pow(1 - k, 3)));
    p.textContent = String(v).padStart(digits, ' ');
    if (k < 1 && p.isConnected) requestAnimationFrame(step);
    else p.textContent = String(target);
  };
  requestAnimationFrame(step);
}

function bump(it, count) {
  it.count = Math.max(it.count + 1, count || 0);
  it.born = now();
  it.expires = now() + it.ttl;
  if (it.aging) { it.aging = false; it.el.classList.remove('aging'); }
  const nl = level(it.kind, it.text, it.count);
  if (nl > it.lv && S.layout !== 'ticker') grow(it, nl);
  it.inner.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }],
    { duration: 380, easing: EASE });
}

function grow(it, nl) {
  it.lv = nl;
  const px = basePx() * RATIOS[S.layout][nl];
  if (S.layout === 'kanpe') {
    flip(() => { it.el.style.fontSize = px + 'px'; it.el.style.letterSpacing = TRACK[nl] + 'em'; });
    return;
  }
  const old = it.rect;
  it.el.style.fontSize = px + 'px';
  it.el.style.letterSpacing = TRACK[nl] + 'em';
  fit(it.el, px);
  const w = it.el.offsetWidth, h = it.el.offsetHeight;
  const r = place(w, h, nl, it);
  clearSpot(r, it);
  it.rect = r;
  const to = `translate(${r.x}px, ${r.y}px)`;
  it.el.style.transform = to;
  if (old && !S.reduceMotion) {
    it.el.animate([{ transform: `translate(${old.x}px, ${old.y}px) scale(${old.h / h})` }, { transform: to }],
      { duration: 520, easing: EASE });
  }
}

function expire(it) {
  if (it.leaving) return;
  it.leaving = true;
  const a = it.el.animate(S.reduceMotion ? { opacity: 0 } : { opacity: 0, filter: 'blur(3px)' },
    { duration: 900, easing: 'ease-in', fill: 'forwards' });
  a.onfinish = () => removeItem(it);
}

function removeItem(it) {
  const first = host.firstElementChild === it.el;
  const doRemove = () => {
    it.el.remove();
    if (items.get(it.key) === it) items.delete(it.key);
  };
  if (S.layout === 'kanpe') flip(doRemove);
  else doRemove();
  if (S.layout === 'ticker') shiftTrack(!first);
  updateHint();
}

function clearAll() {
  if (vj) vj.clear();
  lastSp = null;
  for (const it of [...items.values()]) expire(it);
  cap.classList.remove('on');
}

// カンペ：並びが変わるときに位置差分だけを補間（FLIP）
function flip(mutate) {
  const before = new Map();
  for (const it of items.values()) if (it.el.isConnected) before.set(it, it.el.getBoundingClientRect());
  mutate();
  if (S.reduceMotion) return;
  for (const [it, b] of before) {
    if (!it.el.isConnected) continue;
    const a = it.el.getBoundingClientRect();
    const dx = b.left - a.left, dy = b.top - a.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
      it.el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration: 460, easing: EASE });
    }
  }
}

// テロップ：最新の語が右端に来るよう帯全体をずらす
function shiftTrack(animate) {
  const W = stage.clientWidth;
  trackX = W * 0.96 - host.scrollWidth;
  host.style.transition = animate && !S.reduceMotion ? 'transform .8s cubic-bezier(.2,.75,.15,1)' : 'none';
  host.style.transform = `translateX(${trackX}px)`;
}

// ---------------------------------------------------------------- 時間経過（タイマーは1本だけ）
setInterval(() => {
  const t = now();
  const silent = t - lastWordAt > 3000; // 間があいたら、言葉を余韻として長めに残す
  for (const it of items.values()) {
    if (it.leaving) continue;
    if (silent) it.expires = Math.min(it.expires + 200, it.born + it.ttl * 2.5);
    const left = it.expires - t;
    if (left <= 0) expire(it);
    else if (!it.aging && left < it.ttl * 0.35) { it.aging = true; it.el.classList.add('aging'); }
  }
}, 200);

// ---------------------------------------------------------------- 字幕ライン
let capTimer = 0;
function caption(text, final, m = {}) {
  if (!S.caption || !text) return;
  const arr = [...text];
  const body = arr.length > 44 ? '…' + arr.slice(-43).join('') : text;
  if (m.spn) {
    const tag = el('cap-sp', m.spn);
    tag.style.setProperty('--spc', m.spc || 'currentColor');
    cap.replaceChildren(tag, document.createTextNode(body));
  } else {
    cap.textContent = body;
  }
  cap.classList.toggle('final', !!final);
  cap.classList.add('on');
  clearTimeout(capTimer);
  capTimer = setTimeout(() => cap.classList.remove('on'), final ? 4200 : 6000);
}

// ---------------------------------------------------------------- メッセージ
let queue = Promise.resolve();
let pending = 0;
function onMessage(m) {
  if (!m || !m.t) return;
  if (m.t === 'word') {
    pending++;
    queue = queue.then(() => addWord(m)).then(() => sleep(pending > 6 ? 0 : 90)).catch(() => {}).finally(() => { pending--; });
  } else if (m.t === 'caption') caption(m.text, m.final, m);
  else if (m.t === 'clear') clearAll();
  else if (m.t === 'lvl') { if (vj) vj.level(m.v); }
  else if (m.t === 'settings') applySettings(m.s);
}

let lastSettings = null; // コンソールから届いた最新の設定（別窓で「連動」に戻すときに使う）
function applySettings(s) {
  const prev = S;
  if (s && s.bgImage === BG_KEEP) s = { ...s, bgImage: prev.bgImage || '' };
  lastSettings = s;
  S = { ...DEFAULTS, ...s, ...LOCK };
  applyTheme();
  if (prev.layout !== S.layout) setupLayout();
  else configureVJ();
  if (!S.caption) cap.classList.remove('on');
}

const bus = createBus(onMessage);
if (P.get('obs')) {
  const link = connectObs({
    url: P.get('obs'), password: P.get('pw') || '',
    onMessage: bus.receive,
    onStatus: (st) => { if (st === 'connected') bus.send({ t: 'hello' }); },
  });
  bus.link(link);
}

// ---------------------------------------------------------------- 別窓での書体切り替え
// カンペ・組版を別窓で開いたときだけ、マウスを動かすと右上に書体の選択バーが出る。
// 選んだ書体はこの窓だけに効く（URL に残るので再読み込みしても保たれる）。「連動」でコンソールの書体に戻る。
const SHOW_UI = !EMBED && !P.get('obs') && P.get('ui') !== '0';
const isLocked = (id) => THEMES[id] && THEMES[id].pro && !canUse('theme:premium') && trialRemainingMs() <= 0;
let picker = null, pickerNote = null, uiTimer = 0;

function setWindowTheme(id) {
  if (id && isLocked(id)) { notify(L('プレミアム書体のお試し期間（1日）は終わりました', 'The 1-day trial of premium typefaces has ended')); return; }
  const url = new URL(location.href);
  if (id) { LOCK.theme = id; url.searchParams.set('theme', id); }
  else { delete LOCK.theme; url.searchParams.delete('theme'); }
  history.replaceState(null, '', url);
  S = { ...DEFAULTS, ...(lastSettings || loadSettings()), ...LOCK };
  applyTheme();
  renderPicker();
}

function notify(text) {
  if (!pickerNote) return;
  pickerNote.textContent = text;
  pickerNote.classList.add('on');
  showUi();
  clearTimeout(notify.t);
  notify.t = setTimeout(() => pickerNote.classList.remove('on'), 3200);
}

function renderPicker() {
  if (!picker) return;
  const row = picker.querySelector('.pk-themes');
  row.replaceChildren();
  const follow = document.createElement('button');
  follow.type = 'button';
  follow.className = 'pk-follow';
  follow.textContent = L('連動', 'Sync');
  follow.title = L('コンソールで選んだ書体に合わせる', 'Follow the typeface chosen in the console');
  follow.setAttribute('aria-pressed', String(!LOCK.theme));
  follow.addEventListener('click', () => setWindowTheme(null));
  row.appendChild(follow);
  for (const [id, th] of Object.entries(THEMES)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pk-theme' + (th.pro ? ' plus' : '') + (isLocked(id) ? ' locked' : '');
    b.title = th.pro ? L(`${th.label}（プレミアム書体）`, `${tr(th)} (premium)`) : tr(th);
    b.setAttribute('aria-pressed', String(S.theme === id));
    const tile = document.createElement('span');
    tile.className = 'pk-tile';
    tile.textContent = '字';
    tile.style.background = th.bg === 'transparent' ? 'repeating-conic-gradient(#3a3d44 0 25%, #2a2d33 0 50%) 0 0 / 8px 8px' : th.bg;
    tile.style.color = th.ink;
    tile.style.fontFamily = `${th.family}, ${th.fallback}`;
    tile.style.fontWeight = th.strong;
    const name = document.createElement('span');
    name.className = 'pk-name';
    name.textContent = tr(th);
    b.append(tile, name);
    b.addEventListener('click', () => setWindowTheme(id));
    row.appendChild(b);
  }
  const fs = document.createElement('button');
  fs.type = 'button';
  fs.className = 'pk-fs';
  fs.textContent = document.fullscreenElement ? L('戻す', 'Exit') : L('全画面', 'Full');
  fs.title = L('全画面（F キー）', 'Fullscreen (F key)');
  fs.addEventListener('click', toggleFullscreen);
  row.appendChild(fs);

  // アクセントカラー（この窓だけ。「連動」でコンソールの色に戻る）
  const arow = picker.querySelector('.pk-accents');
  arow.replaceChildren();
  const accLocked = !canUse('accent:custom') && trialRemainingMs() <= 0;
  const af = document.createElement('button');
  af.type = 'button';
  af.className = 'pk-follow small';
  af.textContent = L('連動', 'Sync');
  af.title = L('コンソールで選んだ色に合わせる', 'Follow the color chosen in the console');
  af.setAttribute('aria-pressed', String(!LOCK.accent));
  af.addEventListener('click', () => setWindowAccent(null));
  arow.appendChild(af);
  for (const a of ACCENTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pk-acc' + (accLocked ? ' locked' : '');
    b.style.background = a.c;
    b.title = L(`${a.label}（お手軽プラン以上）`, `${tr(a)} (Plus and up)`);
    b.setAttribute('aria-pressed', String(LOCK.accent === a.c));
    b.addEventListener('click', () => setWindowAccent(a.c));
    arow.appendChild(b);
  }
}

function setWindowAccent(c) {
  if (c && !canUse('accent:custom') && trialRemainingMs() <= 0) { notify(L('プレミアム機能のお試し期間（1日）は終わりました', 'The 1-day trial of premium features has ended')); return; }
  const url = new URL(location.href);
  if (c) { LOCK.accent = c; url.searchParams.set('accent', c.slice(1)); }
  else { delete LOCK.accent; url.searchParams.delete('accent'); }
  history.replaceState(null, '', url);
  S = { ...DEFAULTS, ...(lastSettings || loadSettings()), ...LOCK };
  applyTheme();
  renderPicker();
}

function showUi() {
  if (!picker) return;
  document.body.classList.add('ui-on');
  document.body.classList.remove('ui-idle');
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => {
    if (picker.matches(':hover') || picker.querySelector(':focus-visible')) return showUi(); // キーボード操作中は出したまま
    document.body.classList.remove('ui-on');
    document.body.classList.add('ui-idle');
  }, 2600);
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
}

if (SHOW_UI) {
  picker = document.createElement('div');
  picker.id = 'picker';
  picker.setAttribute('role', 'toolbar');
  picker.setAttribute('aria-label', L('この窓の書体', 'Typeface for this window'));
  picker.innerHTML = `<span class="pk-label">${L('書体', 'TYPEFACE')}</span><div class="pk-row pk-themes"></div>` +
    `<span class="pk-label">${L('アクセント', 'ACCENT')}</span><div class="pk-row pk-accents"></div><p class="pk-note" aria-live="polite"></p>`;
  pickerNote = picker.querySelector('.pk-note');
  document.body.appendChild(picker);
  renderPicker();
  for (const ev of ['mousemove', 'pointerdown', 'touchstart']) window.addEventListener(ev, showUi, { passive: true });
  picker.addEventListener('focusin', showUi);
  document.addEventListener('fullscreenchange', renderPicker);
  showUi();

  // この窓でプレミアム機能を使い始めたら、無料プランの1日お試しを開始する（コンソールと共通）
  let last = performance.now();
  setInterval(() => {
    const t = performance.now();
    const dt = t - last;
    last = t;
    const plusTheme = LOCK.theme && THEMES[LOCK.theme] && THEMES[LOCK.theme].pro;
    if ((plusTheme || LOCK.accent) && !canUse('theme:premium')) {
      addTrialUsage(dt);
      if (trialRemainingMs() <= 0) {
        if (plusTheme) setWindowTheme(null);
        if (LOCK.accent) setWindowAccent(null);
        notify(L('プレミアム機能のお試し期間（1日）が終わったので、コンソールの設定に戻しました', 'The 1-day trial has ended, so this window follows the console again'));
      }
    }
  }, 1000);
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') clearAll();
  if ((e.key === 't' || e.key === 'T') && SHOW_UI) { // T キーで書体を順に切り替え
    const ids = Object.keys(THEMES).filter((id) => !isLocked(id));
    setWindowTheme(ids[(ids.indexOf(S.theme) + 1) % ids.length]);
    showUi();
  }
  if (e.key === 'f' && !EMBED) toggleFullscreen();
});
window.addEventListener('resize', () => root.style.setProperty('--base', basePx() + 'px'));

applyTheme();
setupLayout();
bus.send({ t: 'hello' });

// 単体デモ：display.html?demo=1
if (P.get('demo') === '1') {
  // sp=1：話者の色分けの見本（2人が交互に話す）
  const SPK = [{ n: L('わたし', 'Me'), c: '#ffb020' }, { n: L('ゲスト', 'Guest'), c: '#3fb6ff' }];
  let cur = 0;
  const deliver = P.get('sp') === '1'
    ? (m) => { const k = SPK[cur]; onMessage({ ...m, sp: cur, spn: k.n, spc: k.c }); if (m.t === 'caption' && m.final) cur = (cur + 1) % SPK.length; }
    : onMessage;
  import('../console/demo.js?v=202610111226').then(({ runDemo }) => runDemo({ lang: EN ? 'en-US' : S.lang, deliver, registered: S.registered }));
}

// 検証用フック
window.__kanpe = { onMessage, items, get settings() { return S; } };

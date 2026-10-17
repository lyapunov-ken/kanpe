// 表示ビュー：受け取った「表示イベント」を日本語タイポグラフィとして描く。
// 依存ゼロ。アニメーションは transform / opacity（漢字の滲みだけ filter）を Web Animations API で動かす。
import { THEMES, DEFAULTS, DEFAULT_THEME, ACCENTS, VJ_FONTS, VJ_DETAILS, VJ_FX, LOGO_SIZES, loadSettings } from '../core/settings.js?v=202610171947';
import { canUse, trialRemainingMs, addTrialUsage } from '../core/plan.js?v=202610171947';
import { createBus } from '../core/bus.js?v=202610171947';
import { connectObs, BG_KEEP } from '../core/obs.js?v=202610171947';
import { runs } from '../core/extract.js?v=202610171947';
import { EN, L, tr } from '../core/i18n.js?v=202610171947';
import { createVJ } from './vj.js?v=202610171947';
import { tuneColor, rainbowColor, isLight } from '../core/color.js?v=202610171947';

const P = new URLSearchParams(location.search);
// OBS の接続先とパスワードは URL の # 以降（サーバーに送られない部分）で受け取る。古い ?obs= 形式も読める
const H = new URLSearchParams(location.hash.slice(1));
const OBS_URL = H.get('obs') || P.get('obs') || '';
const OBS_PW = H.get('pw') || P.get('pw') || '';
const LOCK = {};
if (THEMES[P.get('theme')]) LOCK.theme = P.get('theme');
if (/^[0-9a-f]{6}$/i.test(P.get('accent') || '')) LOCK.accent = '#' + P.get('accent');
if (['compose', 'kanpe', 'ticker', 'vj'].includes(P.get('layout'))) LOCK.layout = P.get('layout');
if (['micro', 'led', 'neon', 'pixel'].includes(P.get('vj'))) LOCK.vjStyle = P.get('vj');
if (VJ_FONTS[P.get('vjfont')]) LOCK.vjFont = P.get('vjfont');
if (VJ_DETAILS[P.get('detail')]) LOCK.vjDetail = P.get('detail');
if (VJ_FX[P.get('fx')]) LOCK.vjFx = P.get('fx');
if (+P.get('size') > 0) LOCK.baseSize = +P.get('size');
if (P.get('calm') === '1') LOCK.reduceMotion = true;
if (P.get('cap') === '0') LOCK.caption = false;
if (P.get('cap') === '1') LOCK.caption = true;
if (+P.get('ttl') > 0) LOCK.ttl = Math.min(60, +P.get('ttl'));
if (+P.get('max') > 0) LOCK.maxWords = Math.min(40, +P.get('max'));
if (P.get('vert') === '0') LOCK.vertical = false;
if (['0', '5', '10'].includes(P.get('echo'))) LOCK.echo = P.get('echo');
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

// 基準の大きさ：1280×720 を 1 として、窓の高さと幅の小さい方に合わせる（縦長・小さな窓でもはみ出しにくい）
const unit = () => Math.max(0.2, Math.min(stage.clientHeight / 720, stage.clientWidth / 800));
const basePx = () => S.baseSize * unit();
// 時計。あとから開いた窓が流れをなぞって追いつくあいだ（replay）だけ、過去の時刻を指す
let clockShift = 0;
const now = () => performance.now() - clockShift;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// 決まった種から、いつも同じ並びの乱数を出す（mulberry32）。
// コンソールが言葉ごとに種を付けて送るので、プレビューも別窓も同じ置き場所・同じ縦横になる
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rngFor = (m) => (m && Number.isFinite(m.seed) ? seededRandom(m.seed) : Math.random);
let replaying = false; // 追いつき中は、登場・退場のアニメーションを省いてすぐに組む
// 言葉の時刻：コンソールが送った時刻（ts）を使う。書体の読み込み待ちなどで窓ごとに処理が遅れても、
// 生まれた時刻・消える時刻がどの窓でも同じになる（時計が5秒以上ずれていそうなときは受け取った時刻）。
// ts からこの窓の時計への換算は、最初に1回だけ決めた差（EPOCH）で行う。毎回換算すると1ms ほどの揺れが出て、
// 「消える直前に次の言葉が来た」ときの判断が窓ごとに分かれてしまうため
const EPOCH = Date.now() - performance.now();
const tsClock = (ts) => ts - EPOCH;
let evAt = null; // いま組んでいる言葉の時刻（そのあいだに退く語は、この時刻に退いたことにする）
const clockAt = () => (evAt ?? now());
function evTime(m) {
  const n = now();
  if (replaying || !m || !Number.isFinite(m.ts)) return n;
  const t = tsClock(m.ts);
  return t <= n + 50 && t > n - 5000 ? t : n;
}
// ---------------------------------------------------------------- カンペ：同じ話の記憶
// 決めた時間（5分・10分）のあいだに聞こえた言葉を数える。くり返した言葉ほど大きく・長く残り、
// 同じ話を続けるほど、画面が言葉で埋まっていく（カンペのレイアウトだけ）。記録はこの窓のメモリだけ。
const heard = new Map(); // 語 → 聞こえた時刻の列
const echoMs = () => (S.layout === 'kanpe' ? (+S.echo || 0) * 60000 : 0);
function hear(key, t = now()) {
  const span = echoMs();
  if (!span) return;
  const a = (heard.get(key) || []).filter((x) => t - x < span);
  a.push(t);
  heard.delete(key); heard.set(key, a); // 新しく聞こえた語を後ろへ（古いものから捨てられるように）
  if (heard.size > 600) heard.delete(heard.keys().next().value);
}
function pruneHeard() {
  const span = echoMs(), t = now();
  for (const [k, a] of heard) {
    const b = span ? a.filter((x) => t - x < span) : [];
    if (b.length) heard.set(k, b); else heard.delete(k);
  }
}
// くり返しの回数。似た言葉（一方がもう一方を含む2字以上の語）は半分として数える
function echoCount(key) {
  if (!echoMs()) return 1;
  const own = (heard.get(key) || []).length;
  let rel = 0;
  if ([...key].length >= 2) {
    for (const [k, a] of heard) if (k !== key && [...k].length >= 2 && (k.includes(key) || key.includes(k))) rel += a.length;
  }
  return Math.max(1, own + rel * 0.5);
}
const echoScale = (n) => Math.min(4, 1 + 0.3 * (n - 1)); // 2回で1.3倍、5回で2.2倍、11回で4倍まで
let echoK = 1; // 画面がくり返しの語だけで埋まったら、みんなでそろって少し縮む（あふれた語を出し入れしない）
const echoPx = (lv, n) => basePx() * RATIOS.kanpe[lv] * Math.max(1, echoScale(n) * echoK);
const echoLife = (n, fill) => (1 + 0.5 * (n - 1)) * (1 + fill); // くり返した語ほど、画面が埋まっているほど長く残す
// 画面の埋まりぐあい（0〜1）：記憶の中のくり返しの総量で決める
function echoFill() {
  if (!echoMs()) return 0;
  let r = 0;
  for (const a of heard.values()) r += a.length - 1;
  return Math.min(1, r / 30);
}

const el = (cls, text) => { const e = document.createElement(text === undefined ? 'div' : 'span'); e.className = cls; if (text !== undefined) e.textContent = text; return e; };

// ---------------------------------------------------------------- 背景のカメラ映像
// この端末の中だけで映す（どこにも送らない）。デモや OBS のブラウザソース（カメラを開けない）では使わない。
const CAM_OK = P.get('demo') !== '1' && !window.obsstudio && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
let camStream = null, camVideo = null, camWant = '';
const camAllowed = () => canUse('bg:camera') || trialRemainingMs() > 0;
function stopCamera() {
  try { camStream && camStream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
  if (camVideo) camVideo.remove();
  camStream = camVideo = null;
}
function camChanged() {
  document.body.classList.toggle('has-bgimg', !!S.bgImage || !!camStream);
  configureVJ();
}
async function syncCamera() {
  const want = CAM_OK && S.bgCamera && camAllowed() ? (S.bgCameraId || 'default') : '';
  if (camVideo) camVideo.classList.toggle('mirror', S.bgMirror !== false);
  if (want === camWant) return;
  camWant = want;
  stopCamera();
  camChanged();
  if (!want) return;
  try {
    const video = { width: { ideal: 1280 }, height: { ideal: 720 } };
    if (S.bgCameraId) video.deviceId = { ideal: S.bgCameraId };
    const st = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    if (camWant !== want) { st.getTracks().forEach((t) => t.stop()); return; } // 待っている間に設定が変わった
    camStream = st;
    camVideo = document.createElement('video');
    camVideo.className = 'bgcam' + (S.bgMirror !== false ? ' mirror' : '');
    camVideo.muted = true; camVideo.playsInline = true; camVideo.autoplay = true;
    camVideo.setAttribute('playsinline', '');
    camVideo.srcObject = st;
    const bgEl = document.getElementById('bg');
    if (bgEl) bgEl.prepend(camVideo);
    camVideo.play().catch(() => {});
    camChanged();
  } catch { /* 許可がない・カメラがない：テーマの背景（または背景画像）のまま */ }
}
window.addEventListener('pagehide', stopCamera);

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
  document.body.className = `theme-${S.theme} layout-${S.layout}` + (isLight(themeBg()) ? ' bg-light' : '') + (S.layout === 'vj' ? ` vj-${S.vjStyle || 'micro'}` : '') + (S.reduceMotion ? ' calm' : '') +
    (S.caption ? ' has-cap' : '') + (EMBED ? ' embed' : '') + (S.credit === false ? '' : ' has-credit') + (S.bgImage || camStream ? ' has-bgimg' : '') +
    (S.logo ? ' has-logo' : '');
  applyLogo();
  if (!LOCAL_FONTS && th.gf && !fontLinks.has(th.gf)) {
    fontLinks.add(th.gf);
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = `https://fonts.googleapis.com/css2?family=${th.gf}&display=swap`;
    document.head.appendChild(l);
  }
  configureVJ();
  syncCamera();
}

// 表示する語の字形だけを先読み（Google Fonts は文字範囲ごとに分割配信）。最大120msで見切る。
function fontReady(text, px, wait = 120) {
  if (LOCAL_FONTS || !document.fonts) return Promise.resolve();
  const th = THEMES[S.theme] || THEMES.yoru;
  const p = Promise.all([
    document.fonts.load(`${th.strong} ${px}px ${th.family}`, text),
    document.fonts.load(`${th.light} ${px}px ${th.family}`, text),
  ]).catch(() => {});
  return Promise.race([p, sleep(wait)]);
}

// ---------------------------------------------------------------- レイアウト
function setupLayout() {
  for (const it of items.values()) it.el.remove();
  items.clear();
  if (vj) { vj.destroy(); vj = null; }
  stage.replaceChildren();
  heard.clear(); lastFill = -1; echoK = 1;
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
  const font = VJ_FONTS[S.vjFont] ? S.vjFont : 'gothic';
  root.style.setProperty('--vj-font', VJ_FONTS[font].family); // 字幕も VJ の書体にそろえる
  root.style.setProperty('--vj-weight', String(VJ_FONTS[font].weight));
  vj.configure({ style: S.vjStyle || 'micro', accent: S.accent || th.accent, accent2: th.accent2,
    transparent: th.bg === 'transparent' || !!S.bgImage || !!camStream, calm: !!S.reduceMotion, caption: !!S.caption, ttl: S.ttl,
    font, detail: S.vjDetail || 'mid', fx: S.vjFx || 'mid' });
}

function level(kind, text, count) {
  let l = (kind === 'new' || kind === 'registered' || kind === 'fusion') ? 2 : (kind === 'number' || [...text].length >= 4) ? 1 : 0;
  l += Math.min((count || 1) - 1, 2); // 繰り返すと育つ
  return Math.min(l, 3);
}

// 1語を文字種ごとに組む。和字は1字ずつ、欧文・数字はランごと（カーニングを保つ）
function build(text, kind, vertical, from) {
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
  if (kind === 'fusion') { // 新語ミックス：「新語」のバッジと、元になった2語
    w.appendChild(el('fz-badge', L('新語', 'NEW WORD')));
    if (from && from.length === 2) w.appendChild(el('fz-from', `${from[0]} × ${from[1]}`));
    parts.forEach((p, i) => p.style.setProperty('--i', i));
  }
  return { node: w, inner, parts };
}

function overlap(x, y, w, h, r) {
  const ox = Math.max(0, Math.min(x + w, r.x + r.w) - Math.max(x, r.x));
  const oy = Math.max(0, Math.min(y + h, r.y + r.h) - Math.max(y, r.y));
  return ox * oy;
}

// ---------------------------------------------------------------- カスタムロゴ（お手軽プラン）
// 左上に正方形で出す。一辺と余白は「1280×720 を 1 とした基準の大きさ」で決めて、窓の大きさに合わせて拡縮する
// （余白は言葉の置き場所の余白と同じ。どの窓でも同じ場所・同じ大きさになり、言葉の並びもそろう）
const logoEl = document.getElementById('logo');
function logoRef() {
  if (!S.logo) return null;
  const s = unit();
  const W = Math.round(stage.clientWidth / s), H = Math.round(stage.clientHeight / s);
  return { pad: Math.min(W, H) * 0.05, size: (LOGO_SIZES[S.logoSize] || LOGO_SIZES.m).ref };
}
function applyLogo() {
  if (!logoEl) return;
  const src = typeof S.logo === 'string' && S.logo.startsWith('data:image/') ? S.logo : '';
  if (logoEl.dataset.src !== src) { // 数十KBの文字列なので、変わった時だけ差し替える
    logoEl.dataset.src = src;
    if (src) logoEl.src = src; else logoEl.removeAttribute('src');
  }
  logoEl.hidden = !src;
  const r = logoRef(), s = unit();
  root.style.setProperty('--logo', r ? r.size * s + 'px' : '0px');
  root.style.setProperty('--logo-pad', r ? r.pad * s + 'px' : '0px');
}

// 12カラムの格子にスナップしながら、重ならない場所を探す。大きい語ほど中央寄り。
// 計算は「1280×720 を 1 とした基準の大きさ」で行う（字の大きさと同じ倍率 unit() で割る）。
// w・h も基準の大きさで測ったもの（refSize）を受け取る。こうすると、プレビューと別窓のように
// 大きさの違う窓でも、同じ種から同じ答えが出る。
function place(w, h, lv, self, rand = Math.random) {
  const s = unit();
  const W = Math.round(stage.clientWidth / s), H = Math.round(stage.clientHeight / s);
  const pad = Math.min(W, H) * 0.05;
  const reserve = S.caption ? H * 0.15 : 0;
  const maxX = Math.max(pad, W - pad - w), maxY = Math.max(pad, H - pad - reserve - h);
  const col = (W - 2 * pad) / 12, row = Math.max(6, S.baseSize * 0.5);
  const gap = S.baseSize * 0.3;
  const cx = W / 2, cy = (H - reserve) / 2;
  const centerWeight = w * h * (lv >= 3 ? 1.4 : lv === 2 ? 0.8 : lv === 1 ? 0.25 : 0.08);
  const others = [];
  const t = clockAt();
  const lr = logoRef(); // ロゴには絶対に重ねない（新語と同じ扱い）
  if (lr) others.push({ r: { x: lr.pad, y: lr.pad, w: lr.size, h: lr.size }, leaving: false, fz: true });
  for (const it of items.values()) {
    if (it === self || !it.rect || (it.leaving && it.goneAt <= t)) continue;
    others.push({ r: { x: it.rect.x / s, y: it.rect.y / s, w: it.rect.w / s, h: it.rect.h / s }, leaving: it.leaving, fz: it.kind === 'fusion' });
  }
  let best = null;
  for (let i = 0; i < 120; i++) {
    const x = Math.min(maxX, pad + Math.round((rand() * (maxX - pad)) / col) * col);
    const y = Math.min(maxY, pad + Math.round((rand() * (maxY - pad)) / row) * row);
    let ov = 0, fade = 0, fz = 0;
    for (const o of others) {
      const a = overlap(x - gap, y - gap, w + 2 * gap, h + 2 * gap, o.r);
      if (o.leaving) fade += a; else if (o.fz) fz += a; else ov += a;
    }
    const dc = Math.hypot((x + w / 2 - cx) / W, (y + h / 2 - cy) / H);
    // 新語には絶対に重ねない（ほかの語を退かせてでも空ける）。次にほかの語と重ならないこと、退場中の語を避け、最後に中央寄せ
    const score = (fz > 0 ? 1e12 + fz : 0) + (ov > 0 ? 1e9 + ov : 0) + (fade > 0 ? 1e6 + fade : 0) + dc * centerWeight;
    if (!best || score < best.score) best = { x, y, w, h, ov, score };
  }
  // 実際の窓の大きさに戻す
  return { x: best.x * s, y: best.y * s, w: best.w * s, h: best.h * s, ov: best.ov, score: best.score };
}

// 語の大きさを「基準の大きさ」（1280×720 の窓に出したとき）で測る。
// 窓ごとの字の大きさで測ると、端数の丸めで1〜2px ずれて置き場所が変わってしまうので、
// 写しを基準の字の大きさで組んで測る（どの窓でも同じ数字になる）
function refSize(node) {
  const s = unit();
  const c = node.cloneNode(true);
  c.style.fontSize = (node._vpx || parseFloat(node.style.fontSize) / s) + 'px';
  c.style.transform = 'none';
  c.style.visibility = 'hidden';
  c.setAttribute('aria-hidden', 'true');
  (node.parentNode || host).appendChild(c);
  const r = { w: c.offsetWidth, h: c.offsetHeight };
  c.remove();
  return r;
}
// 画面（字幕ぶんを除く）に収まらない語は縮める。縦組みの長い語は高さで効く（判断は基準の大きさで）
function fit(node, px) {
  const s = unit();
  const W = Math.round(stage.clientWidth / s), H = Math.round(stage.clientHeight / s);
  const maxW = W * 0.9, maxH = (H - (S.caption ? H * 0.15 : 0)) * 0.86;
  node._vpx = px / s;
  const r = refSize(node);
  const k = Math.min(1, maxW / r.w, maxH / r.h);
  if (k < 1) { node._vpx = (px * k) / s; node.style.fontSize = px * k + 'px'; }
}

function clearSpot(r, self, keep = []) {
  if (!r || r.ov <= 0) return;
  const gap = basePx() * 0.3;
  for (const it of liveItems()) {
    if (it !== self && !keep.includes(it) && it.kind !== 'fusion' && it.rect && overlap(r.x - gap, r.y - gap, r.w + 2 * gap, r.h + 2 * gap, it.rect) > 0) expire(it);
  }
}

function liveItems() { return [...items.values()].filter((it) => !it.leaving); }
// 新語は同時に5つまで。5つになったら、いちばん古い新語をいつもより早めに（3秒ほどで）消していく。
// 「いま混ぜる」を続けて押して6つ目が来たら、いちばん古いものはその場で薄れはじめる
const FZ_MAX = 5, FZ_HURRY = 3000;
function capFusion(fresh) {
  const old = liveItems().filter((x) => x.kind === 'fusion' && x !== fresh).sort((a, b) => a.born - b.born);
  while (old.length + 1 > FZ_MAX) expire(old.shift());
  if (old.length + 1 >= FZ_MAX && old.length) {
    const o = old[0];
    o.hurry = true;
    o.expires = Math.min(o.expires, clockAt() + FZ_HURRY);
  }
}
// 先に退いてもらう語：新語は残す。カンペで記憶がオンなら、くり返しの少ない・古い語から
function evictee(live) {
  const pool = live.filter((x) => x.kind !== 'fusion');
  if (!pool.length) return live[0];
  if (!echoMs()) return pool[0];
  return pool.reduce((a, b) => ((b.echo || 1) < (a.echo || 1) || ((b.echo || 1) === (a.echo || 1) && b.born < a.born) ? b : a));
}

// ---------------------------------------------------------------- 追加・成長・退場
async function addWord(m) {
  const text = m.text;
  if (!text) return;
  if (vj) { lastWordAt = now(); await vj.add(m); updateHint(); return; }
  const t0 = evTime(m);
  tick(t0); // この時刻で消えているはずの語を先に消す（タイマーの刻みは窓ごとにずれるので）
  lastWordAt = Math.max(lastWordAt, t0);
  evAt = t0;
  try { await addWordAt(m, text, t0); } finally { evAt = null; }
}
async function addWordAt(m, text, t0) {
  const key = text.toLowerCase();
  const rand = rngFor(m);
  if (m.kind !== 'fusion') hear(key, t0);
  const prev = items.get(key);
  if (prev && !prev.leaving) { bump(prev, m.count, rand, t0); return; }

  const kind = m.kind || 'normal';
  const lv = level(kind, text, m.count);
  const echo = echoMs() ? echoCount(key) : 1, fill = echoFill();
  const px = echo > 1 ? echoPx(lv, echo) : basePx() * RATIOS[S.layout][lv];
  const len = [...text].length;
  const vertical = S.layout === 'compose' && S.vertical && kind !== 'fusion' && !/[A-Za-z]/.test(text) && len >= 2 && len <= 7 &&
    rand() < (lv >= 1 ? 0.4 : 0.22);
  await fontReady(text, px);

  const { node, inner, parts } = build(text, kind, vertical, m.from);
  if (kind === 'fusion' && m.fz) colorize(node, parts, m.fz.color, rand);
  if (m.spc) { // 話者の色とラベル（話者が替わった最初の語にだけ名前を添える）
    node.classList.add('has-sp');
    node.style.setProperty('--spc', m.spc);
    if (m.spn && m.sp !== lastSp) node.appendChild(el('sp-tag', m.spn));
    lastSp = m.sp;
  }
  node.style.fontSize = px + 'px';
  node.style.letterSpacing = TRACK[Math.min(3, lv + (echo >= 3 ? 1 : 0))] + 'em';
  const ttl0 = S.ttl * 1000 * (kind === 'new' ? 1.25 : kind === 'fusion' ? 3 : 1) * (lv >= 2 ? 1.15 : 1); // 新語は余韻を残して長めに
  const ttl = echoMs() ? Math.min(echoMs(), ttl0 * echoLife(echo, fill)) : ttl0;
  const it = { key, text, kind, count: m.count || 1, lv, el: node, inner, parts, vertical,
    born: t0, ttl0, ttl, echo, expires: t0 + ttl, rect: null, leaving: false, aging: false, fz: m.fz };

  // 同時に出す語の上限。カンペで同じ話が続くときは、埋まりぐあいに合わせて上限を広げる
  const max = Math.min(S.maxWords, MAXW[S.layout]) + (S.layout === 'kanpe' ? Math.round(fill * 26) : 0);
  let live = liveItems();
  while (live.length >= max) { expire(evictee(live)); live = liveItems(); } // 新語は最後まで残す

  if (S.layout === 'compose') {
    node.style.visibility = 'hidden';
    host.appendChild(node);
    fit(node, px);
    const ref = refSize(node);
    const r = place(ref.w, ref.h, lv, it, rand);
    clearSpot(r, it); // 空きがなければ、その場所にいる語に早めに退場してもらう
    it.rect = r;
    node.style.transform = `translate(${r.x}px, ${r.y}px)`;
    node.style.visibility = '';
  } else if (S.layout === 'kanpe') {
    flip(() => { host.appendChild(node); if (echo > 1) fit(node, px); });
  } else {
    host.appendChild(node);
    shiftTrack(true);
  }
  items.set(key, it);
  if (kind === 'fusion') capFusion(it);
  updateHint();
  enter(it);
}

const EASE = 'cubic-bezier(.2,.75,.15,1)';
function enter(it) {
  if (replaying) { if (it.kind === 'fusion') it.el.classList.add('fz-live', 'filled'); return; }
  if (it.kind === 'fusion') { fzEnter(it); return; }
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
// 新語：輪郭だけで生まれて、少しあとに色が満ちる
function fill(it, delay) { setTimeout(() => it.el.classList.add('filled'), delay); }

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

function bump(it, count, rand, t0 = now()) {
  it.count = Math.max(it.count + 1, count || 0);
  it.born = t0;
  it.hurry = false;
  it.expires = t0 + it.ttl;
  if (it.aging) { it.aging = false; it.el.classList.remove('aging'); }
  const nl = level(it.kind, it.text, it.count);
  if (echoMs() && it.kind !== 'fusion') echoGrow(it, Math.max(nl, it.lv), t0);
  else if (nl > it.lv && S.layout !== 'ticker') grow(it, nl, rand);
  if (!replaying) it.inner.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }],
    { duration: 380, easing: EASE });
}

function grow(it, nl, rand) {
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
  const h = it.el.offsetHeight;
  const ref = refSize(it.el);
  const r = place(ref.w, ref.h, nl, it, rand);
  clearSpot(r, it);
  it.rect = r;
  const to = `translate(${r.x}px, ${r.y}px)`;
  it.el.style.transform = to;
  if (old && !S.reduceMotion && !replaying) {
    it.el.animate([{ transform: `translate(${old.x}px, ${old.y}px) scale(${old.h / h})` }, { transform: to }],
      { duration: 520, easing: EASE });
  }
}

// カンペ：くり返すたびに、回数に合わせて大きく・長く
function echoGrow(it, nl, t0 = now()) {
  const n = echoCount(it.key);
  it.echo = n;
  it.lv = nl;
  it.ttl = Math.min(echoMs(), (it.ttl0 || it.ttl) * echoLife(n, echoFill()));
  it.expires = t0 + it.ttl;
  flip(() => sizeEcho(it));
}
function sizeEcho(it) {
  const px = echoPx(it.lv, it.echo || 1);
  it.el.style.fontSize = px + 'px';
  it.el.style.letterSpacing = TRACK[Math.min(3, it.lv + ((it.echo || 1) >= 3 ? 1 : 0))] + 'em';
  fit(it.el, px);
}
function resizeEcho() {
  for (const it of liveItems()) if (it.kind !== 'fusion' && (it.echo || 1) > 1 && it.el.parentNode === host) sizeEcho(it);
}

// カンペ：言葉が画面からあふれたら、くり返しの少ない・古い語から退いてもらう（いつも画面いっぱいまで）。
// あふれた面積ぶんだけまとめて退かせる（退場中の語が空ける面積も数に入れて、退かせすぎない）
let lastFill = -1, lastPrune = 0, lastRelax = 0;
function echoTick(t) {
  if (host === stage) return;
  if (!echoMs()) { if (lastFill >= 0) { host.style.removeProperty('--fill'); lastFill = -1; } return; }
  if (t - lastPrune > 2000) { lastPrune = t; pruneHeard(); }
  const fill = echoFill();
  if (Math.abs(fill - lastFill) > 0.02) { lastFill = fill; host.style.setProperty('--fill', fill.toFixed(2)); }
  const room = stage.clientHeight - host.scrollHeight;
  if (room > stage.clientHeight * 0.2 && echoK < 1 && t - lastRelax > 3000) { // 余裕ができたら、少しずつ元の大きさへ
    lastRelax = t;
    echoK = Math.min(1, echoK * 1.06);
    flip(resizeEcho);
  }
  if (room >= -2) return;
  flip(() => {
    // 退場中でまだ流れの中にいる語から外し、それでもあふれていれば、くり返しの少ない・古い語から
    const fading = [...items.values()].filter((it) => it.leaving && it.el.parentNode === host);
    let live = liveItems();
    while (host.scrollHeight - stage.clientHeight > 2) {
      if (fading.length) { lift(fading.shift()); continue; }
      if (live.length <= 1) break;
      const it = evictee(live);
      if ((it.echo || 1) >= 2 && echoK > 0.3) { echoK *= 0.88; resizeEcho(); continue; } // 残りがくり返しの語だけなら、そろって縮む
      live = live.filter((x) => x !== it);
      lift(it);
    }
  });
}
// 流れから外して、いまの場所ですばやく消す（ほかの語がすぐに詰めても、重なって見える時間をつくらない）
function lift(it) {
  const r = it.el.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  Object.assign(it.el.style, { position: 'absolute', left: r.left - sr.left + 'px', top: r.top - sr.top + 'px', margin: '0' });
  stage.appendChild(it.el);
  expire(it);
  for (const a of it.el.getAnimations()) a.playbackRate = 4;
}

function expire(it, at = clockAt()) {
  if (it.leaving) return;
  it.leaving = true;
  const slow = it.kind === 'fusion'; // 新語はゆっくり薄れて余韻を残す
  it.goneAt = at + (slow ? 1800 : 900); // 消え終わる時刻（置き場所を決めるときは、これを過ぎた語を数えない）
  if (replaying) { // 追いつき中：見えなくして、本来なら消え終わる時刻に外す（置き場所の判断は同じになる）
    it.el.style.opacity = '0';
    return;
  }
  // 外すのはタイマー（tick）が goneAt を過ぎたときに行う（窓ごとの描画のタイミングによらず、そろって外れる）
  it.el.animate(S.reduceMotion ? { opacity: 0 } : { opacity: 0, filter: slow ? 'blur(6px)' : 'blur(3px)' },
    { duration: slow ? 1800 : 900, easing: 'ease-in', fill: 'forwards' });
}

function removeItem(it) {
  if (it.removed) return;
  it.removed = true;
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
  if (fx) fx.replaceChildren();
  heard.clear(); echoK = 1;
  lastSp = null;
  for (const it of [...items.values()]) expire(it);
  cap.classList.remove('on');
}

// カンペ：並びが変わるときに位置差分だけを補間（FLIP）
function flip(mutate) {
  const before = new Map();
  for (const it of items.values()) if (it.el.isConnected) before.set(it, it.el.getBoundingClientRect());
  mutate();
  if (S.reduceMotion || replaying) return;
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

// ---------------------------------------------------------------- 新語ミックス（新語誕生）
// 画面の2語から新しい言葉が生まれる。出かた（motion）・速さ（k）・色（color）はコンソールが決めて送ってくる。
//  collide 衝突：元の2語の分身が引き寄せられてぶつかり、閃光の中から生まれる
//  decode デコード：別の字がめまぐるしく入れ替わり、左から順に正しい字に確定する
//  shutter シャッター：1字を横に裂いた帯が左右から滑り込んで組み上がる
//  converge 集束：散らばった字が回転とブレを残して一点へ集まる（輪は外から内へ縮む）
//  scan スキャン：光の線が走り、通ったところから走査線と色ずれを伴って字が実体化する
// どの出かたも、輪郭だけで生まれて少しあとに色が満ちる。組版では元の2語から細い系統線が伸びる。
const SVGNS = 'http://www.w3.org/2000/svg';
const FZ_MOTIONS = ['collide', 'decode', 'shutter', 'converge', 'scan'];
let fx = null;
function fxLayer() {
  if (fx && fx.isConnected) return fx;
  fx = document.createElementNS(SVGNS, 'svg');
  fx.id = 'fx';
  fx.setAttribute('aria-hidden', 'true');
  document.body.insertBefore(fx, cap);
  return fx;
}
function svg(tag, attrs) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
const centerOf = (it) => ({ x: it.rect.x + it.el.offsetWidth / 2, y: it.rect.y + (it.dy || 0) + it.el.offsetHeight / 2 });
const fzLook = (m) => ({
  motion: FZ_MOTIONS.includes(m.motion) ? m.motion : 'collide',
  k: Math.min(2, Math.max(0.4, +m.k || 1)),
  color: typeof m.color === 'string' && (m.color === 'rainbow' || /^#[0-9a-f]{6}$/i.test(m.color)) ? m.color : '',
});
const fzInk = (node) => getComputedStyle(node).getPropertyValue('--fz').trim() || getComputedStyle(root).getPropertyValue('--accent2').trim();

// 書体テーマの背景色（透過は null＝暗い映像の上とみなす）
function themeBg() { const th = THEMES[S.theme] || THEMES[DEFAULT_THEME]; return th.bg === 'transparent' ? null : th.bg; }
// 色をつける：単色は --fz、虹は1字ずつ --fzc（バッジと線は最初の字の色）。
// どの色も背景に合わせて明るさを整える（明るい紙では濃く、黒地では明るく。コントラスト 4.5 以上）
function colorize(node, parts, color, rand = Math.random) {
  const bg = themeBg();
  if (color === 'rainbow') {
    const h0 = rand() * 360, n = Math.max(1, parts.length);
    parts.forEach((p, i) => p.style.setProperty('--fzc', rainbowColor(h0 + (i * 300) / n, bg)));
    node.style.setProperty('--fz', rainbowColor(h0, bg));
  } else {
    const th = THEMES[S.theme] || THEMES[DEFAULT_THEME];
    node.style.setProperty('--fz', tuneColor(color || th.accent2, bg));
  }
}
// スキャンの色ずれ：明るい背景では落ち着いた濃い色、暗い背景ではネオン
const fringe = (d) => (isLight(themeBg()) ? `${d}em 0 #c2185b, -${d}em 0 #00838f` : `${d}em 0 #ff2a6d, -${d}em 0 #16e0ff`);

// 親から子へ伸びる系統線（描かれて、しばらく残って、消える）
function lineage(a, b, delay, k = 1, color = '', rand = Math.random) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
  const bend = Math.min(80, len * 0.22) * (rand() < 0.5 ? 1 : -1);
  const cx = (a.x + b.x) / 2 - (dy / len) * bend, cy = (a.y + b.y) / 2 + (dx / len) * bend;
  const path = svg('path', { d: `M${a.x},${a.y} Q${cx},${cy} ${b.x},${b.y}`, pathLength: '1', class: 'fz-line' });
  const head = svg('circle', { cx: a.x, cy: a.y, r: 2.6, class: 'fz-head' });
  if (color) { path.style.stroke = color; head.style.fill = color; }
  fxLayer().append(path, head);
  const d = 640 * k;
  path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: d, delay, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' });
  path.animate([{ opacity: 0.9 }, { opacity: 0.9, offset: 0.55 }, { opacity: 0 }], { duration: 4200 * k, delay, fill: 'both' }).onfinish = () => path.remove();
  // 線の先を小さな点が走る
  const steps = 18, kf = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, u = 1 - t;
    kf.push({ transform: `translate(${u * u * a.x + 2 * u * t * cx + t * t * b.x - a.x}px, ${u * u * a.y + 2 * u * t * cy + t * t * b.y - a.y}px)`, opacity: i === steps ? 0 : 1 });
  }
  head.animate(kf, { duration: d, delay, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' }).onfinish = () => head.remove();
}
// 衝突の閃光：細い放射線と、広がる輪
function burst(c, size, k = 1, color = '') {
  const g = svg('g', { class: 'fz-burst' });
  if (color) g.style.setProperty('--fzs', color);
  const n = 18, r0 = size * 0.18, r1 = size * 0.9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.2, kk = 0.6 + Math.random() * 0.6;
    const ln = svg('line', { x1: c.x + Math.cos(a) * r0, y1: c.y + Math.sin(a) * r0, x2: c.x + Math.cos(a) * r1 * kk, y2: c.y + Math.sin(a) * r1 * kk, pathLength: '1' });
    g.appendChild(ln);
    ln.animate([{ strokeDasharray: '0.35 1', strokeDashoffset: 0.35, opacity: 1 }, { strokeDasharray: '0.35 1', strokeDashoffset: -1, opacity: 0 }],
      { duration: (620 + Math.random() * 260) * k, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
  }
  const ring = svg('circle', { cx: c.x, cy: c.y, r: size * 0.5, class: 'fz-ring' });
  g.appendChild(ring);
  ring.animate([{ transform: 'scale(.1)', opacity: 1 }, { transform: 'scale(1.6)', opacity: 0 }], { duration: 760 * k, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
  fxLayer().appendChild(g);
  setTimeout(() => g.remove(), 1200 * k);
}
// 集束の輪：外から3重の輪が時間差で縮んで、一点に吸い込まれる
function rings(c, size, k, color) {
  const g = svg('g', { class: 'fz-burst' });
  if (color) g.style.setProperty('--fzs', color);
  for (let i = 0; i < 3; i++) {
    const ring = svg('circle', { cx: c.x, cy: c.y, r: size * (0.32 + i * 0.12), class: 'fz-ring' });
    g.appendChild(ring);
    ring.animate([{ transform: 'scale(1.7)', opacity: 0 }, { opacity: 0.8, offset: 0.4 }, { transform: 'scale(.05)', opacity: 0 }], { duration: 760 * k, delay: i * 120 * k, easing: 'cubic-bezier(.7,0,.3,1)', fill: 'both' });
  }
  fxLayer().appendChild(g);
  setTimeout(() => g.remove(), (900 + 480) * k + 100);
}
// グリッチの帯：言葉の上を横縞が数回走る
function bands(box, k, color) {
  const g = svg('g', { class: 'fz-burst' });
  for (let i = 0; i < 5; i++) {
    const h = Math.max(2, box.h * (0.04 + Math.random() * 0.12));
    const rect = svg('rect', { x: box.x - box.w * 0.08, y: box.y + Math.random() * (box.h - h), width: box.w * 1.16, height: h, class: 'fz-band' });
    if (color) rect.style.fill = color;
    g.appendChild(rect);
    rect.animate([{ opacity: 0, transform: 'translateX(-6%)' }, { opacity: 0.55, transform: 'translateX(4%)', offset: 0.3 }, { opacity: 0, transform: 'translateX(0)' }],
      { duration: 260 * k, delay: (60 + Math.random() * 380) * k, easing: 'linear', fill: 'both' });
  }
  fxLayer().appendChild(g);
  setTimeout(() => g.remove(), 900 * k);
}
// デコードの照準：言葉の四隅にかぎ括弧が寄ってきて、確定したら消える
function brackets(box, k, color, hold) {
  const g = svg('g', { class: 'fz-burst' });
  const m = Math.min(box.w, box.h) * 0.18, pad = box.h * 0.12;
  const x0 = box.x - pad, y0 = box.y - pad, x1 = box.x + box.w + pad, y1 = box.y + box.h + pad;
  for (const [x, y, sx, sy] of [[x0, y0, 1, 1], [x1, y0, -1, 1], [x0, y1, 1, -1], [x1, y1, -1, -1]]) {
    const pl = svg('polyline', { points: `${x},${y + sy * m} ${x},${y} ${x + sx * m},${y}`, class: 'fz-bracket' });
    if (color) pl.style.stroke = color;
    g.appendChild(pl);
    pl.animate([{ transform: `translate(${-sx * m}px, ${-sy * m}px)`, opacity: 0 }, { transform: 'none', opacity: 1, offset: 0.25 }, { transform: 'none', opacity: 1, offset: 0.85 }, { transform: 'none', opacity: 0 }],
      { duration: hold, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' });
  }
  fxLayer().appendChild(g);
  setTimeout(() => g.remove(), hold + 50);
}
// シャッターのスリット：言葉の上下に線が中央から左右へ開く
function slits(box, k, color) {
  const cx = box.x + box.w / 2;
  for (const y of [box.y - box.h * 0.06, box.y + box.h * 1.06]) {
    for (const dir of [-1, 1]) {
      const ln = svg('line', { x1: cx, y1: y, x2: cx + dir * box.w * 0.62, y2: y, pathLength: '1', class: 'fz-line solid' });
      if (color) ln.style.stroke = color;
      fxLayer().appendChild(ln);
      ln.animate([{ strokeDasharray: '1 1', strokeDashoffset: 1, opacity: 1 }, { strokeDasharray: '1 1', strokeDashoffset: 0, opacity: 1, offset: 0.45 }, { strokeDasharray: '1 1', strokeDashoffset: -1, opacity: 0 }],
        { duration: 1000 * k, easing: 'cubic-bezier(.16,1,.3,1)', fill: 'both' }).onfinish = () => ln.remove();
    }
  }
}

// 1字ずつの登場。戻り値は登場が終わるまでの時間（ミリ秒）
const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン言葉新語想像組版文字音声光線点画01#%&*+=/<>';
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&*+=';
const rnd = (s) => s[Math.floor(Math.random() * s.length)];
function fzAnimate(it, motion, k, d0 = 0) {
  const parts = it.parts, n = parts.length;
  const step = (ms) => ms * k;
  const EXPO = 'cubic-bezier(.16,1,.3,1)';

  if (motion === 'decode') {
    // デコード：1字ずつ別の文字がめまぐるしく入れ替わり、左から順に正しい字に確定する
    const fin = parts.map((p) => p.textContent);
    parts.forEach((p) => { p.style.width = p.offsetWidth + 'px'; p.style.textAlign = 'center'; p.style.opacity = '0'; });
    const t0 = now();
    const startAt = (i) => d0 + step(40) * i, lockAt = (i) => d0 + step(320) + step(95) * i;
    const end = lockAt(n - 1) + 60;
    let last = 0;
    const tick = () => {
      if (!it.el.isConnected) return;
      const t = now() - t0, swap = t - last > 45;
      if (swap) last = t;
      let done = true;
      parts.forEach((p, i) => {
        if (t < startAt(i)) { done = false; return; }
        if (t < lockAt(i)) {
          done = false;
          p.style.opacity = '1';
          p.classList.add('fz-scr');
          if (swap) p.textContent = p.dataset.s === 'l' || p.dataset.s === 'n' ? [...fin[i]].map(() => rnd(LATIN)).join('') : rnd(GLYPHS);
        } else if (p.textContent !== fin[i] || p.classList.contains('fz-scr')) {
          p.textContent = fin[i];
          p.style.opacity = '1';
          p.classList.remove('fz-scr');
          p.animate([{ transform: 'scale(1.18)', filter: 'brightness(2.2)' }, { transform: 'none', filter: 'none' }], { duration: step(260), easing: EXPO });
        }
      });
      if (!done) requestAnimationFrame(tick);
      else parts.forEach((p) => { p.style.width = ''; p.style.textAlign = ''; });
    };
    requestAnimationFrame(tick);
    return end;
  }

  if (motion === 'shutter') {
    // シャッター：1字を横に4本に裂き、帯が左右から交互に滑り込んで1字に組み上がる
    const N = 4, dur = step(560);
    parts.forEach((p, i) => {
      p.style.position = 'relative';
      p.style.visibility = 'hidden';
      const strips = [];
      for (let s = 0; s < N; s++) {
        const c = p.cloneNode(true);
        c.className = p.className + ' fz-strip'; // 見た目（色・輪郭）は元の字と同じ。大きさは元の字から受け継ぐ
        c.style.fontSize = 'inherit'; c.style.letterSpacing = 'inherit';
        c.setAttribute('aria-hidden', 'true');
        c.style.clipPath = `inset(${(s * 100) / N}% -10% ${100 - ((s + 1) * 100) / N}% -10%)`;
        p.appendChild(c);
        strips.push(c);
        const dir = s % 2 ? 1 : -1;
        c.animate([
          { transform: `translateX(${dir * 1.4}em) skewX(${dir * -18}deg)`, opacity: 0 },
          { opacity: 1, offset: 0.3 },
          { transform: 'none', opacity: 1 },
        ], { duration: dur, delay: d0 + step(70) * i + step(45) * s, easing: EXPO, fill: 'backwards' });
      }
      setTimeout(() => { strips.forEach((c) => c.remove()); p.style.visibility = ''; p.style.position = ''; }, d0 + step(70) * i + step(45) * (N - 1) + dur + 20);
    });
    return d0 + step(70) * (n - 1) + step(45) * (N - 1) + dur;
  }

  if (motion === 'converge') {
    // 集束：散らばっていた字が、回転とブレを残しながら一点へ吸い込まれるように集まる
    let end = 0;
    parts.forEach((p, i) => {
      const a = Math.random() * Math.PI * 2, r = 2.2 + Math.random() * 2.4;
      const x = Math.cos(a) * r, y = Math.sin(a) * r * 0.7, rot = (Math.random() - 0.5) * 300;
      const delay = d0 + step(30) * i + Math.random() * step(120);
      end = Math.max(end, delay + step(820));
      p.animate([
        { opacity: 0, transform: `translate(${x}em, ${y}em) rotate(${rot}deg) scale(2.4)`, filter: 'blur(10px)' },
        { opacity: 0.9, transform: `translate(${x * 0.18}em, ${y * 0.18}em) rotate(${rot * 0.12}deg) scale(1.15)`, filter: 'blur(2px)', offset: 0.62 },
        { opacity: 1, transform: 'none', filter: 'blur(0px)' },
      ], { duration: step(820), delay, easing: 'cubic-bezier(.7,0,.2,1)', fill: 'backwards' });
    });
    return end;
  }

  if (motion === 'scan') {
    // スキャン：光の線が左から走り、通ったところから字が実体化する（走査線と色ずれを伴って）
    const w = it.inner.offsetWidth || it.el.offsetWidth, dur = step(900);
    const bar = el('fz-scan');
    it.el.appendChild(bar);
    bar.animate([{ transform: 'translateX(-.2em)', opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.9 }, { transform: `translateX(${w}px)`, opacity: 0 }],
      { duration: dur, delay: d0, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'both' }).onfinish = () => bar.remove();
    it.inner.animate([{ clipPath: 'inset(-20% 100% -20% 0)' }, { clipPath: 'inset(-20% 0% -20% 0)' }], { duration: dur, delay: d0, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'backwards' });
    parts.forEach((p) => {
      const at = d0 + dur * ((p.offsetLeft + p.offsetWidth / 2) / Math.max(1, w));
      p.animate([
        { filter: isLight(themeBg()) ? 'blur(4px)' : 'blur(4px) brightness(2)', transform: 'scaleY(.2)', textShadow: fringe(0.08) },
        { filter: 'blur(0px) brightness(1.4)', transform: 'scaleY(1.12)', offset: 0.45 },
        { filter: 'none', transform: 'none', textShadow: '0 0 transparent' },
      ], { duration: step(460), delay: at - step(60), easing: EXPO, fill: 'backwards' });
    });
    return d0 + dur + step(300);
  }

  // collide：言葉全体が閃光の中から膨らんで生まれる
  it.inner.animate([
    { transform: 'scale(.25)', opacity: 0, filter: 'blur(8px)' },
    { transform: 'scale(1.1)', opacity: 1, filter: 'blur(0px)', offset: 0.6 },
    { transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' },
  ], { duration: step(720), delay: d0, easing: EASE, fill: 'backwards' });
  return d0 + step(720);
}
// 新語の登場の仕上げ：バッジと元の2語を出し、色を満たす
function fzFinish(it, end, k) {
  for (const sel of ['.fz-badge', '.fz-from']) {
    const e = it.el.querySelector(sel);
    if (e) e.animate([{ opacity: 0, transform: 'translateY(.4em)' }, { opacity: 1, transform: 'none' }], { duration: 420 * k, delay: Math.max(0, end * 0.55), easing: EASE, fill: 'backwards' });
  }
  fill(it, end + 80);
}
// カンペ・テロップでの新語（enter から呼ぶ）
function fzEnter(it) {
  const { motion, k } = it.fz || { motion: 'collide', k: 1 };
  it.el.classList.add('fz-live');
  if (S.reduceMotion) { fill(it, 0); return; }
  fzFinish(it, fzAnimate(it, motion, k), k);
}

async function fuseWord(m) {
  const text = (m.text || '').trim();
  if (!text) return;
  const look = fzLook(m);
  const rand = rngFor(m);
  if (vj) { lastWordAt = now(); await vj.fuse({ text, from: [m.a, m.b], color: look.color, k: look.k }); updateHint(); return; }
  const prev = items.get(text.toLowerCase());
  if (S.layout !== 'compose') { await addWord({ text, kind: 'fusion', count: 1, from: [m.a, m.b], fz: look, seed: m.seed, ts: m.ts }); return; }
  const t0 = evTime(m);
  tick(t0);
  lastWordAt = Math.max(lastWordAt, t0);
  evAt = t0;
  try { await fuseWordAt(m, text, look, rand, prev, t0); } finally { evAt = null; }
}
async function fuseWordAt(m, text, look, rand, prev, t0) {
  if (prev && !prev.leaving) { bump(prev, 0, rand, t0); return; }

  const { motion, k, color } = look;
  const parents = [m.a, m.b].map((t) => items.get(String(t || '').toLowerCase())).filter((it) => it && !it.leaving && it.rect && it.el.isConnected);
  const lv = 2;
  const px = basePx() * RATIOS.compose[lv];
  await fontReady(text, px);
  const { node, inner, parts } = build(text, 'fusion', false, [m.a, m.b]);
  colorize(node, parts, color, rand);
  node.style.fontSize = px + 'px';
  node.style.letterSpacing = TRACK[lv] + 'em';
  const ttl = S.ttl * 1000 * 3.2; // 新語は余韻を残して長めに
  const it = { key: text.toLowerCase(), text, kind: 'fusion', count: 1, lv, el: node, inner, parts, vertical: false,
    born: t0, ttl, expires: t0 + ttl, rect: null, leaving: false, aging: false, fz: look };
  let live = liveItems();
  const max = Math.min(S.maxWords, MAXW.compose);
  while (live.length >= max) { const old = live.find((x) => !parents.includes(x)) || live[0]; expire(old); live = liveItems(); }
  node.style.visibility = 'hidden';
  host.appendChild(node);
  fit(node, px);
  // 上の「新語」バッジと下の元の2語のぶんも空けて置く（新語はなるべく中央に）
  const fs = parseFloat(node.style.fontSize) || px, tagH = Math.max(10, fs * 0.17) * 1.9;
  const ref = refSize(node), vTag = Math.max(10, node._vpx * 0.17) * 1.9; // 置き場所は基準の大きさで決める
  const r = place(ref.w, ref.h + vTag * 2, 3, it, rand);
  clearSpot(r, it, parents);
  it.rect = r;
  const y = r.y + tagH;
  it.dy = tagH;
  node.style.transform = `translate(${r.x}px, ${y}px)`;
  items.set(it.key, it);
  capFusion(it);
  updateHint();
  const c = { x: r.x + node.offsetWidth / 2, y: y + node.offsetHeight / 2 };
  const size = Math.max(node.offsetWidth, node.offsetHeight);
  const box = { x: r.x, y, w: node.offsetWidth, h: node.offsetHeight };
  const ink = fzInk(node); // 背景に合わせて整えた色

  // 元の2語が新語に重なっていたら、誕生を見届けたあとで静かに退場してもらう。
  // 時刻は演出の長さから決めて、タイマー（tick）で行う（どの窓でも、追いつき中でも同じになる）
  if (!S.reduceMotion) {
    const at = t0 + (parents.length ? (motion === 'collide' ? 800 : 520) * k : 0) + fzDur(motion, k, parts.length) + 400;
    for (const p of parents) p.stepAside = { at, r };
  }
  if (S.reduceMotion || replaying) { node.style.visibility = ''; node.classList.add('fz-live'); fill(it, 0); return; }
  // 置き場所はもう決まったので、誕生の演出は待たずに次の言葉へ進む
  // （演出のあいだ次の言葉を止めると、窓ごとに言葉の出る時刻がずれて、並びがそろわなくなる）
  fzBirth(it, { node, parents, motion, k, c, size, box, ink, rand }).catch(() => {});
}
// 出かたごとの登場の長さ（fzAnimate の戻り値と同じ計算。集束の揺らぎは最大で見積もる）
function fzDur(motion, k, n) {
  const m = Math.max(0, n - 1);
  if (motion === 'decode') return (320 + 95 * m) * k + 60;
  if (motion === 'shutter') return (70 * m + 45 * 3 + 560) * k;
  if (motion === 'converge') return (30 * m + 120 + 820) * k;
  if (motion === 'scan') return 1200 * k;
  return 720 * k;
}
async function fzBirth(it, { node, parents, motion, k, c, size, box, ink, rand }) {
  // 1) 元の2語が光る。衝突では分身がまん中へ吸い寄せられる。どの出かたでも系統線が伸びる
  for (const p of parents) {
    p.el.classList.add('fz-parent');
    if (ink) p.el.style.setProperty('--fzp', ink);
    setTimeout(() => { p.el.classList.remove('fz-parent'); p.el.style.removeProperty('--fzp'); }, 1800 * k);
    p.inner.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 420 * k, easing: EASE });
    if (motion === 'collide') {
      const ghost = p.el.cloneNode(true);
      ghost.classList.remove('aging');
      ghost.classList.add('fz-ghost');
      host.appendChild(ghost);
      const kk = 0.42, pw = p.el.offsetWidth, ph = p.el.offsetHeight;
      ghost.animate([
        { transform: `translate(${p.rect.x}px, ${p.rect.y + (p.dy || 0)}px)`, opacity: 0.85 },
        { transform: `translate(${c.x - (pw * kk) / 2}px, ${c.y - (ph * kk) / 2}px) scale(${kk})`, opacity: 0.6 },
      ], { duration: 680 * k, delay: 120 * k, easing: 'cubic-bezier(.6,0,.85,.25)', fill: 'both' }).onfinish = () => ghost.remove();
    }
    lineage(centerOf(p), c, 120 * k, k, ink, rand);
  }
  await sleep(parents.length ? (motion === 'collide' ? 800 : 520) * k : 0);

  // 2) 出かたごとの登場
  node.style.visibility = '';
  node.classList.add('fz-live');
  if (motion === 'collide') burst(c, size, k, ink);
  else if (motion === 'converge') rings(c, size, k, ink);
  else if (motion === 'scan') bands(box, k, ink);
  else if (motion === 'shutter') slits(box, k, ink);
  const end = fzAnimate(it, motion, k);
  if (motion === 'decode') brackets(box, k, ink, end + 200);
  fzFinish(it, end, k);
}

// ---------------------------------------------------------------- 時間経過（タイマーは1本だけ）
let tickedAt = 0;
function tick(t) {
  // 間があいたら（最後の言葉から3秒すぎたら）、そのあいだは言葉の残り時間を減らさない（余韻として長めに残す）。
  // 前回からの「間があいていた時間」をそのまま足すので、タイマーの刻みかたによらず同じ結果になる
  const quiet = t - Math.max(tickedAt, lastWordAt + 3000);
  tickedAt = Math.max(tickedAt, t);
  for (const it of items.values()) {
    if (it.leaving) continue;
    if (it.stepAside && t >= it.stepAside.at) { // 新語の誕生を見届けた元の語：まだ新語に重なっていれば退く
      const r = it.stepAside.r, g = basePx() * 0.3, at0 = it.stepAside.at;
      it.stepAside = null;
      if (it.rect && overlap(r.x - g, r.y - g, r.w + 2 * g, r.h + 2 * g, it.rect) > 0) { expire(it, at0); continue; }
    }
    if (quiet > 0 && !it.hurry) it.expires = Math.max(it.expires, Math.min(it.expires + quiet, it.born + it.ttl * 2.5));
    const left = it.expires - t;
    if (left <= 0) expire(it, it.expires); // 刻みの遅れによらず、本来の時刻に退いたことにする
    else if (!it.aging && left < it.ttl * 0.35) { it.aging = true; it.el.classList.add('aging'); }
  }
  sweepGone(t);
}
// 届いた言葉を組んでいる途中（pending）は時間を進めない。言葉の側がその時刻で tick を呼ぶので、
// 処理の遅れぐあいが窓ごとに違っても、消える・残るの順番がそろう。
// 届く途中の言葉を追い越さないよう、時計より 60ms 遅れて進める（見た目にはわからない差）
setInterval(() => { const t = now(); if (!pending) tick(t - 60); echoTick(t); }, 200);

// ---------------------------------------------------------------- あとから開いた窓の追いつき
// コンソールが「これまでの流れ」（最近の言葉と、それぞれ何ミリ秒前か）を送ってくるので、
// 時計を巻き戻して同じ順番・同じ種でなぞり直す。プレビューと同じ画面ができあがる。
function sweepGone(t = now()) {
  for (const it of [...items.values()]) if (it.leaving && it.goneAt && it.goneAt <= t) removeItem(it);
}
async function replay(msg, recvAt) {
  if (vj) return; // VJ は流れの演出なので、途中からでも困らない
  let evs = (Array.isArray(msg.events) ? msg.events : []).filter((e) => e && Number.isFinite(e.ago));
  // コンソールの設定に連動する窓は、レイアウトを切り替えたときに画面が作り直されるので、それ以降だけ
  if (!LOCK.layout && Number.isFinite(msg.since)) evs = evs.filter((e) => e.ago <= msg.since);
  const words = evs.filter((e) => (e.t === 'word' || e.t === 'fuse') && e.text);
  const cap0 = evs.filter((e) => e.t === 'caption').pop();
  if (words.length) {
    if (items.size) setupLayout(); // 追いつく前に届いた言葉は、流れの中にも入っているので組み直す
    // 字の幅で置き場所が決まるので、書体を先に読み込んでおく（最大2.5秒）
    await Promise.race([Promise.all(words.map((e) => fontReady(e.text, basePx(), 2500))), sleep(2500)]);
    replaying = true;
    lastWordAt = -Infinity; tickedAt = 0; // 時計を巻き戻すので、「最後の言葉」も過去からなぞり直す
    // 時刻はふだんと同じく ts から（ずれていそうなら「何ミリ秒前か」から）
    const at = (e) => {
      const a = recvAt - e.ago;
      if (!Number.isFinite(e.ts)) return a;
      const b = tsClock(e.ts);
      return Math.abs(b - a) < 2000 ? b : a;
    };
    const setClock = (v) => { clockShift = performance.now() - v; };
    let v = at(words[0]);
    try {
      for (const e of words) {
        const target = at(e);
        for (v += 200; v < target; v += 200) { setClock(v); tick(v); } // 言葉と言葉のあいだの時間を進める
        v = target;
        setClock(v);
        if (e.t === 'word') await addWord(e); else await fuseWord(e);
        echoTick(now());
      }
      for (const end = performance.now(); v + 200 <= end; ) { v += 200; setClock(v); tick(v); }
    } finally {
      replaying = false;
      clockShift = 0;
    }
    updateHint(); // 消えかけの語は、いつものタイマーが本来の時刻に外す
  }
  if (cap0 && performance.now() - (recvAt - cap0.ago) < 4000) caption(cap0.text, cap0.final, cap0);
}

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
  } else if (m.t === 'fuse') {
    pending++;
    queue = queue.then(() => fuseWord(m)).catch(() => {}).finally(() => { pending--; });
  } else if (m.t === 'caption') caption(m.text, m.final, m);
  else if (m.t === 'clear') clearAll();
  else if (m.t === 'lvl') { if (vj) vj.level(m.v); }
  else if (m.t === 'settings') applySettings(m.s);
  else if (m.t === 'sync') {
    const recvAt = performance.now();
    pending++;
    queue = queue.then(() => replay(m, recvAt)).catch(() => {}).finally(() => { pending--; });
  }
}

let lastSettings = null; // コンソールから届いた最新の設定（別窓で「連動」に戻すときに使う）
function applySettings(s) {
  const prev = S;
  if (s && s.bgImage === BG_KEEP) s = { ...s, bgImage: prev.bgImage || '' };
  if (s && s.logo === BG_KEEP) s = { ...s, logo: prev.logo || '' };
  lastSettings = s;
  S = { ...DEFAULTS, ...s, ...LOCK };
  applyTheme();
  if (prev.layout !== S.layout) setupLayout();
  else configureVJ();
  if (!S.caption) cap.classList.remove('on');
}

const bus = createBus(onMessage);
if (OBS_URL) {
  const link = connectObs({
    url: OBS_URL, password: OBS_PW,
    onMessage: bus.receive,
    onStatus: (st) => { if (st === 'connected') bus.send({ t: 'hello' }); },
  });
  bus.link(link);
}

// ---------------------------------------------------------------- 別窓での書体切り替え
// カンペ・組版を別窓で開いたときだけ、マウスを動かすと右上に書体の選択バーが出る。
// 選んだ書体はこの窓だけに効く（URL に残るので再読み込みしても保たれる）。「連動」でコンソールの書体に戻る。
const SHOW_UI = !EMBED && !OBS_URL && P.get('ui') !== '0';
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
    b.title = tr(a);
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
    if (plusTheme && !canUse('theme:premium')) { // アクセントカラーは無料なので数えない
      addTrialUsage(dt);
      if (trialRemainingMs() <= 0) {
        setWindowTheme(null);
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
window.addEventListener('resize', () => { root.style.setProperty('--base', basePx() + 'px'); applyLogo(); });

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
  import('../console/demo.js?v=202610171947').then(({ runDemo }) => runDemo({ lang: EN ? 'en-US' : S.lang, deliver, registered: S.registered,
    script: ['meeting', 'speech'].includes(P.get('script')) ? P.get('script') : '' }));
}

// 検証用フック
window.__kanpe = { onMessage, items, get settings() { return S; }, get vj() { return vj; } };

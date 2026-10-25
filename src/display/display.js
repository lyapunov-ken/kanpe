// 表示ビュー：受け取った「表示イベント」を日本語タイポグラフィとして描く。
// 依存ゼロ。アニメーションは transform / opacity（漢字の滲みだけ filter）を Web Animations API で動かす。
import { THEMES, LAYOUTS, DEFAULTS, DEFAULT_THEME, ACCENTS, VJ_FONTS, VJ_DETAILS, VJ_FX, LOGO_SIZES, SIZE_STEPS, nearestStep, loadSettings,
  CAP_SIZES, CAP_TTLS, CAP_LINES, LAYOUT_SIZES, GROW_STEPS, JUMP_STEPS, VERT_STEPS, LIFE_STEPS, MOTION_TASTES, MOTION_SOUND, SIZE_KEY } from '../core/settings.js?v=202610251717';
import { canUse, trialRemainingMs, addTrialUsage } from '../core/plan.js?v=202610251717';
import { createBus } from '../core/bus.js?v=202610251717';
import { connectObs, BG_KEEP } from '../core/obs.js?v=202610251717';
import { runs } from '../core/extract.js?v=202610251717';
import { EN, L, tr } from '../core/i18n.js?v=202610251717';
import { createVJ } from './vj.js?v=202610251717';
import { createMotion } from './motion.js?v=202610251717';
import { tuneColor, rainbowColor, isLight } from '../core/color.js?v=202610251717';

const P = new URLSearchParams(location.search);
// OBS の接続先とパスワードは URL の # 以降（サーバーに送られない部分）で受け取る。古い ?obs= 形式も読める
const H = new URLSearchParams(location.hash.slice(1));
const OBS_URL = H.get('obs') || P.get('obs') || '';
const OBS_PW = H.get('pw') || P.get('pw') || '';
const LOCK = {};
if (THEMES[P.get('theme')]) LOCK.theme = P.get('theme');
if (/^[0-9a-f]{6}$/i.test(P.get('accent') || '')) LOCK.accent = '#' + P.get('accent');
if (['compose', 'kanpe', 'motion', 'vj'].includes(P.get('layout'))) LOCK.layout = P.get('layout');
if (P.get('layout') === 'ticker') LOCK.layout = 'motion'; // テロップはモーションに置き換わった（古い URL も開ける）
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

// 以前の「テロップ」はモーションに置き換わった（古い保存値・古い窓から来た設定も読み替える）
const fixLayout = (o) => (o.layout === 'ticker' || !LAYOUTS[o.layout] ? { ...o, layout: o.layout === 'ticker' ? 'motion' : 'compose' } : o);
let S = fixLayout({ ...DEFAULTS, ...loadSettings(), ...LOCK });
const root = document.documentElement;
const stage = document.getElementById('stage');
const cap = document.getElementById('caption');
const hint = document.getElementById('hint');
if (EN && hint) { hint.textContent = 'Start talking and your words appear here'; document.documentElement.lang = 'en'; }
const items = new Map();
// 消えかけのうちに同じ言葉がもう一度来ると、items には新しい方が入る。古い方は消え終わる時刻まで
// ここで覚えておいて外す（以前は外されないまま透明な要素がたまり、長く使うほど重く・言葉が出にくくなっていた）
const fading = new Set();
const allItems = () => [...items.values(), ...fading];
function track(it) {
  const old = items.get(it.key);
  if (old && old !== it && !old.removed) { if (!old.leaving) expire(old); fading.add(old); }
  items.set(it.key, it);
}
let host = stage;
let lastWordAt = performance.now();
let vj = null; // VJ モードの描画エンジン
let mo = null; // モーションの描画エンジン
let lastSp = null; // 直前に表示した話者（話者が替わった最初の語にだけラベルを付ける）

// ジャンプ率：組版は大胆に（「大小の差」で3段階）、カンペは読みやすさ優先で控えめに
const RATIOS = { kanpe: [1, 1.2, 1.42, 1.7] };
const ratio = (layout, lv) => (layout === 'compose' ? (JUMP_STEPS[S.cJump] || JUMP_STEPS.mid).r : RATIOS[layout] || RATIOS.kanpe)[lv];
const TRACK = [0.02, 0, -0.025, -0.045]; // 大きい語ほど字間を詰める
const MAXW = { compose: 40, kanpe: 14 };

// 基準の大きさ：1280×720 を 1 として、窓の高さと幅の小さい方に合わせる（縦長・小さな窓でもはみ出しにくい）
const unit = () => Math.max(0.2, Math.min(stage.clientHeight / 720, stage.clientWidth / 800));
// レイアウトごとの「文字の大きさ」（小・中・大）は、基準の大きさにかける倍率
const layoutK = () => (LAYOUT_SIZES[S[SIZE_KEY[S.layout]]] || LAYOUT_SIZES.m).k;
const refBase = () => S.baseSize * layoutK(); // 1280×720 換算の基準の大きさ
const basePx = () => refBase() * unit();
// 育つまで：同じ言葉を何回くり返したら、ひと回り大きくなるか（組版・カンペ）
const growEvery = () => +(S.layout === 'kanpe' ? S.kGrow : S.layout === 'compose' ? S.cGrow : 1) || 1;
// 言葉が消えるまでの秒数（組版は「残る時間」で3段階。ほかのレイアウトは固定）
const lifeSec = () => (S.layout === 'compose' && LIFE_STEPS[S.cLife] ? +S.cLife : S.ttl);
// 組版の縦組みの量（古い設定の vertical: false は「なし」）
const vertP = () => (S.vertical === false ? VERT_STEPS.off : VERT_STEPS[S.cVert] || VERT_STEPS.mid).p;
// ---- 字幕ライン（画面の最下部）：文字の大きさ・行数と、言葉を置かずに空けておく高さ（どれも 1280×720 換算）
const capRef = () => (CAP_SIZES[S.capSize] || CAP_SIZES.m).ref;
const capLineMax = () => +(CAP_LINES[S.capLines] ? S.capLines : 1);
const capTtlMs = () => +(CAP_TTLS[S.capTtl] ? S.capTtl : 5) * 1000;
const capReserve = (H) => (S.caption && S.layout !== 'motion' ? H * 0.045 + capRef() * (1.55 * capLineMax() + 0.9) : 0); // モーションは字幕ラインを出さない
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
const echoScale = (n) => Math.min(4, 1 + 0.3 * (n - 1) / growEvery()); // 2回で1.3倍、5回で2.2倍、11回で4倍まで（「育つまで」が2回・3回ならゆっくり）
let echoK = 1; // 画面がくり返しの語だけで埋まったら、みんなでそろって少し縮む（あふれた語を出し入れしない）
const echoPx = (lv, n) => basePx() * ratio('kanpe', lv) * Math.max(1, echoScale(n) * echoK);
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
  setCapVars();
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
  const keep = ['ui-on', 'ui-idle', 'fz-focus'].filter((c) => document.body.classList.contains(c)); // 操作バーの表示や新語の演出中の印は残す
  document.body.className = keep.concat('').join(' ') + `theme-${S.theme} layout-${S.layout}` + (isLight(themeBg()) ? ' bg-light' : '') + (S.layout === 'vj' ? ` vj-${S.vjStyle || 'micro'}` : '') + (S.reduceMotion ? ' calm' : '') +
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
  configureMotion();
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
  for (const it of allItems()) it.el.remove();
  items.clear(); fading.clear();
  if (vj) { vj.destroy(); vj = null; }
  if (mo) { mo.destroy(); mo = null; }
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
  } else if (S.layout === 'motion') {
    mo = createMotion(stage);
    configureMotion();
    host = stage;
  } else {
    host = stage;
  }
  updateHint();
}

function updateHint() {
  if (hint) hint.classList.toggle('on', EMBED && (vj ? vj.count() === 0 : mo ? mo.count() === 0 : items.size === 0));
}
function configureVJ() {
  if (!vj) return;
  const th = THEMES[S.theme] || THEMES.yoru;
  const font = VJ_FONTS[S.vjFont] ? S.vjFont : 'gothic';
  root.style.setProperty('--vj-font', VJ_FONTS[font].family); // 字幕も VJ の書体にそろえる
  root.style.setProperty('--vj-weight', String(VJ_FONTS[font].weight));
  vj.configure({ style: S.vjStyle || 'micro', accent: S.accent || th.accent, accent2: th.accent2,
    transparent: th.bg === 'transparent' || !!S.bgImage || !!camStream, calm: !!S.reduceMotion, caption: !!S.caption, capRes: capReserve(720) / 720, ttl: S.ttl,
    font, detail: S.vjDetail || 'mid', fx: S.vjFx || 'mid' });
}

// モーション：書体テーマの色・文字の大きさ（レイアウトの3段階 × 別窓の文字サイズ）・テイスト・計器
function configureMotion() {
  if (!mo) return;
  const th = THEMES[S.theme] || THEMES[DEFAULT_THEME];
  const lr = logoRef();
  mo.configure({ calm: !!S.reduceMotion, sizeK: layoutK() * (S.baseSize / DEFAULTS.baseSize), taste: MOTION_TASTES[S.mTaste] ? S.mTaste : 'mix', hud: S.mHud !== 'off', sound: MOTION_SOUND[S.mSound] ? S.mSound : 'voice',
    transparent: th.bg === 'transparent' || !!S.bgImage || !!camStream, bg: th.bg === 'transparent' ? '#000000' : th.bg, ink: th.ink, accent: S.accent || th.accent, accent2: th.accent2,
    logo: lr ? { pad: lr.pad, size: lr.size } : null, credit: S.credit !== false });
}

function level(kind, text, count) {
  let l = (kind === 'new' || kind === 'registered' || kind === 'fusion') ? 2 : (kind === 'number' || [...text].length >= 4) ? 1 : 0;
  l += Math.min(Math.floor(((count || 1) - 1) / growEvery()), 2); // 繰り返すと育つ（「育つまで」の回数ごとに）
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
  const reserve = capReserve(H);
  const maxX = Math.max(pad, W - pad - w), maxY = Math.max(pad, H - pad - reserve - h);
  const col = (W - 2 * pad) / 12, row = Math.max(6, refBase() * 0.5);
  const gap = refBase() * 0.3;
  const cx = W / 2, cy = (H - reserve) / 2;
  const centerWeight = w * h * (lv >= 3 ? 1.4 : lv === 2 ? 0.8 : lv === 1 ? 0.25 : 0.08);
  // 文字の重なりがオン：ほかの言葉の上にも置く（ロゴと新語ミックスの新語は避ける）。
  // 中央に寄りすぎないよう、3か所だけ試して選ぶ（新語ミックスの新語そのものは、いつも重ねない）
  const stack = S.cOverlap === 'on' && !(self && self.kind === 'fusion');
  const others = [];
  const t = clockAt();
  const lr = logoRef(); // ロゴには絶対に重ねない（新語と同じ扱い）
  if (lr) others.push({ r: { x: lr.pad, y: lr.pad, w: lr.size, h: lr.size }, leaving: false, fz: true });
  for (const it of allItems()) {
    if (it === self || !it.rect || (it.leaving && it.goneAt <= t)) continue;
    others.push({ r: { x: it.rect.x / s, y: it.rect.y / s, w: it.rect.w / s, h: it.rect.h / s }, leaving: it.leaving, fz: it.kind === 'fusion' });
  }
  let best = null;
  for (let i = 0; i < 120; i++) {
    if (stack && i >= 3 && best.score < 1e12) break;
    const x = Math.min(maxX, pad + Math.round((rand() * (maxX - pad)) / col) * col);
    const y = Math.min(maxY, pad + Math.round((rand() * (maxY - pad)) / row) * row);
    let ov = 0, fade = 0, fz = 0;
    for (const o of others) {
      const a = overlap(x - gap, y - gap, w + 2 * gap, h + 2 * gap, o.r);
      if (o.leaving) fade += a; else if (o.fz) fz += a; else ov += a;
    }
    const dc = Math.hypot((x + w / 2 - cx) / W, (y + h / 2 - cy) / H);
    // 新語には絶対に重ねない（ほかの語を退かせてでも空ける）。次にほかの語と重ならないこと、退場中の語を避け、最後に中央寄せ
    const score = (fz > 0 ? 1e12 + fz : 0) + (stack ? 0 : (ov > 0 ? 1e9 + ov : 0) + (fade > 0 ? 1e6 + fade : 0)) + dc * centerWeight * (stack ? 0.35 : 1);
    if (!best || score < best.score) best = { x, y, w, h, ov: stack ? 0 : ov, score }; // 重ねるときは、その場所の語を退かせない
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
  const maxW = W * 0.9, maxH = (H - capReserve(H)) * 0.86;
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
  if (mo) { lastWordAt = now(); mo.word(m); updateHint(); return; }
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
  const px = echo > 1 ? echoPx(lv, echo) : basePx() * ratio(S.layout, lv);
  const len = [...text].length;
  const vp = vertP();
  const vertical = S.layout === 'compose' && vp[0] > 0 && kind !== 'fusion' && !/[A-Za-z]/.test(text) && len >= 2 && len <= 7 &&
    rand() < (lv >= 1 ? vp[1] : vp[0]);
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
  const ttl0 = lifeSec() * 1000 * (kind === 'new' ? 1.25 : kind === 'fusion' ? 3 : 1) * (lv >= 2 ? 1.15 : 1); // 新語は余韻を残して長めに
  const ttl = echoMs() ? Math.min(echoMs(), ttl0 * echoLife(echo, fill)) : ttl0;
  const it = { key, text, kind, count: m.count || 1, lv, el: node, inner, parts, vertical,
    born: t0, ttl0, ttl, echo, expires: t0 + ttl, rect: null, leaving: false, aging: false, fz: m.fz, fzr: fzRand(m) };

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
  } else {
    flip(() => { host.appendChild(node); if (echo > 1) fit(node, px); });
  }
  track(it);
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
  else if (nl > it.lv) grow(it, nl, rand);
  if (!replaying) it.inner.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.1)' }, { transform: 'scale(1)' }],
    { duration: 380, easing: EASE });
}

function grow(it, nl, rand) {
  it.lv = nl;
  const px = basePx() * ratio(S.layout, nl);
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
    const gone = allItems().filter((it) => it.leaving && it.el.parentNode === host);
    let live = liveItems();
    while (host.scrollHeight - stage.clientHeight > 2) {
      if (gone.length) { lift(gone.shift()); continue; }
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
  fading.delete(it);
  const doRemove = () => {
    it.el.remove();
    if (items.get(it.key) === it) items.delete(it.key);
  };
  if (S.layout === 'kanpe') flip(doRemove);
  else doRemove();
  updateHint();
}

function clearAll() {
  if (vj) vj.clear();
  if (mo) mo.clear();
  if (fx) fx.replaceChildren();
  heard.clear(); echoK = 1;
  lastSp = null;
  for (const it of [...items.values()]) expire(it);
  clearCaption();
}

// カンペ：並びが変わるときに位置差分だけを補間（FLIP）
function flip(mutate) {
  const before = new Map();
  for (const it of allItems()) if (it.el.isConnected) before.set(it, it.el.getBoundingClientRect());
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

// ---------------------------------------------------------------- 新語ミックス（新語誕生）
// 画面の2語から新しい言葉が生まれる。出かた（motion）・速さ（k）・色（color）はコンソールが決めて送ってくる。
//  collide 衝突：元の2語の分身が引き寄せられてぶつかり、閃光の中から生まれる
//  decode デコード：別の字がめまぐるしく入れ替わり、左から順に正しい字に確定する
//  shutter シャッター：1字を横に裂いた帯が左右から滑り込んで組み上がる
//  converge 集束：散らばった字が回転とブレを残して一点へ集まる（輪は外から内へ縮む）
//  scan スキャン：光の線が走り、通ったところから走査線と色ずれを伴って字が実体化する
// どの出かたも、輪郭だけで生まれて少しあとに色が満ちる。組版では元の2語から細い系統線が伸びる。
const SVGNS = 'http://www.w3.org/2000/svg';
const FZ_MOTIONS = ['collide', 'decode', 'shutter', 'converge', 'scan', 'ink', 'firework'];
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
function burst(c, size, k = 1, color = '', rand = Math.random) {
  const g = svg('g', { class: 'fz-burst' });
  if (color) g.style.setProperty('--fzs', color);
  const n = 18, r0 = size * 0.18, r1 = size * 0.9;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rand() * 0.2, kk = 0.6 + rand() * 0.6;
    const ln = svg('line', { x1: c.x + Math.cos(a) * r0, y1: c.y + Math.sin(a) * r0, x2: c.x + Math.cos(a) * r1 * kk, y2: c.y + Math.sin(a) * r1 * kk, pathLength: '1' });
    g.appendChild(ln);
    ln.animate([{ strokeDasharray: '0.35 1', strokeDashoffset: 0.35, opacity: 1 }, { strokeDasharray: '0.35 1', strokeDashoffset: -1, opacity: 0 }],
      { duration: (620 + rand() * 260) * k, easing: 'cubic-bezier(.2,.7,.2,1)', fill: 'both' });
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
function bands(box, k, color, rand = Math.random) {
  const g = svg('g', { class: 'fz-burst' });
  for (let i = 0; i < 5; i++) {
    const h = Math.max(2, box.h * (0.04 + rand() * 0.12));
    const rect = svg('rect', { x: box.x - box.w * 0.08, y: box.y + rand() * (box.h - h), width: box.w * 1.16, height: h, class: 'fz-band' });
    if (color) rect.style.fill = color;
    g.appendChild(rect);
    rect.animate([{ opacity: 0, transform: 'translateX(-6%)' }, { opacity: 0.55, transform: 'translateX(4%)', offset: 0.3 }, { opacity: 0, transform: 'translateX(0)' }],
      { duration: 260 * k, delay: (60 + rand() * 380) * k, easing: 'linear', fill: 'both' });
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

// ---------------------------------------------------------------- 新語の誕生：モーションタイポグラフィ
// どの出かたも「予兆 → 誕生 → 余韻」の3幕で組む。乱数は言葉ごとの種から作るので、プレビューと別窓で同じ動きになる。
// 動かすのは transform / opacity / filter だけ。演出用の要素は終わったらすぐ外す。「動きを控えめに」では呼ばれない。
const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン言葉新語想像組版文字音声光線点画01#%&*+=/<>';
const LATIN = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789#%&*+=';
const EXPO = 'cubic-bezier(.16,1,.3,1)';
const fzRand = (m) => (m && Number.isFinite(m.seed) ? seededRandom((m.seed ^ 0x9E3779B9) >>> 0) : Math.random);
const pick = (str, rand) => str[Math.floor(rand() * str.length)];
// 中央の字から順に（外側ほど遅れて）動かすための順位
const rankFromCenter = (i, n) => Math.round(Math.abs(i - (n - 1) / 2));

// 予兆までの待ち時間（元の2語が光り、系統線が伸びるあいだ）
const fzLead = (motion) => (motion === 'collide' ? 900 : 520);
// 出かたごとの登場の長さ（fzAnimate の戻り値と同じ計算）
function fzDur(motion, k, n) {
  const m = Math.max(0, n - 1), half = Math.ceil(m / 2);
  if (motion === 'decode') return (360 + 110 * m) * k + 60;
  if (motion === 'shutter') return (70 * m + 40 * 4 + 640) * k;
  if (motion === 'converge') return (40 * m + 100 + 1100) * k;
  if (motion === 'scan') return 1400 * k;
  if (motion === 'ink') return (60 * half + 1000) * k;
  if (motion === 'firework') return (FW_RISE + 40 * half + 900) * k;
  return (35 * half + 820) * k; // collide
}

const FW_RISE = 620; // 花火：光が昇りきるまで（この間、字はまだ出ない）

// ---- 画面全体の演出
// ピント送り：誕生のあいだ、ほかの言葉を少し沈めて新語に視線を集める
let focusN = 0;
function focusPull(ms) {
  if (vj) return;
  focusN++;
  document.body.classList.add('fz-focus');
  setTimeout(() => { if (--focusN <= 0) { focusN = 0; document.body.classList.remove('fz-focus'); } }, ms);
}
// 閃光：衝撃の瞬間に、新語の位置から光が広がる
function flash(c, color, k, strength = 0.55) {
  const f = document.createElement('div');
  f.className = 'fz-flash';
  f.style.setProperty('--x', c.x + 'px');
  f.style.setProperty('--y', c.y + 'px');
  if (color) f.style.setProperty('--fl', color);
  document.body.appendChild(f);
  f.animate([{ opacity: 0 }, { opacity: strength, offset: 0.12 }, { opacity: 0 }], { duration: 520 * k, easing: 'ease-out', fill: 'both' }).onfinish = () => f.remove();
}
// 画面の揺れ：組版のときだけ、短く減衰する
function shake(k, rand, amp = 1) {
  if (S.layout !== 'compose') return;
  const u = Math.max(2, basePx() * 0.14) * amp, kf = [];
  for (let i = 0; i <= 7; i++) {
    const d = (1 - i / 7) ** 2 * u;
    kf.push({ transform: i === 7 ? 'none' : `translate(${(rand() - 0.5) * 2 * d}px, ${(rand() - 0.5) * 2 * d}px)` });
  }
  stage.animate(kf, { duration: 380 * k, easing: 'linear' });
}
// 粒子：中心から飛び散る（inward で外から吸い込まれる）
function particles(c, n, reach, color, k, rand, { delay = 0, inward = false, min = 1.2, max = 3.6, life = 900 } = {}) {
  const g = svg('g', { class: 'fz-burst' });
  if (color) g.style.setProperty('--fzs', color);
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, d = reach * (0.35 + rand() * 0.75), r = min + rand() * (max - min);
    const dot = svg('circle', { cx: c.x, cy: c.y, r, class: 'fz-dot' });
    g.appendChild(dot);
    const far = `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px)`, near = 'translate(0px, 0px)';
    dot.animate(inward
      ? [{ transform: `${far} scale(.4)`, opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: `${near} scale(1)`, opacity: 0 }]
      : [{ transform: `${near} scale(1)`, opacity: 1 }, { opacity: 0.9, offset: 0.4 }, { transform: `${far} scale(.2)`, opacity: 0 }],
    { duration: (life + rand() * 300) * k, delay: delay + rand() * 80 * k, easing: inward ? 'cubic-bezier(.6,0,.4,1)' : 'cubic-bezier(.1,.8,.25,1)', fill: 'both' });
  }
  fxLayer().appendChild(g);
  setTimeout(() => g.remove(), delay + (life + 420) * k);
}
// 衝撃波：輪が2重に広がる
function shockwave(c, size, k, color, delay = 0) {
  const g = svg('g', { class: 'fz-burst' });
  if (color) g.style.setProperty('--fzs', color);
  for (let i = 0; i < 2; i++) {
    const ring = svg('circle', { cx: c.x, cy: c.y, r: size * 0.5, class: 'fz-ring' + (i ? '' : ' bold') });
    g.appendChild(ring);
    ring.animate([{ transform: 'scale(.05)', opacity: 0.95 }, { transform: `scale(${2.2 + i * 0.9})`, opacity: 0 }],
      { duration: (780 + i * 260) * k, delay: delay + i * 110 * k, easing: 'cubic-bezier(.1,.75,.25,1)', fill: 'both' });
  }
  fxLayer().appendChild(g);
  setTimeout(() => g.remove(), delay + 1200 * k);
}
// 余韻：生まれ終わった新語が一度だけ光る
function afterglow(it, delay, k, color) {
  if (!color) return;
  it.inner.animate([{ filter: 'drop-shadow(0 0 0 transparent)' }, { filter: `drop-shadow(0 0 .18em ${color})`, offset: 0.3 }, { filter: 'drop-shadow(0 0 0 transparent)' }],
    { duration: 1100 * k, delay, easing: 'ease-out' });
}
// 光の柱：デコードで字が確定した瞬間に、縦に光が走る
function pillar(x, box, k, color, delay) {
  const w = Math.max(2, box.h * 0.06), h = box.h * 2.6;
  const r = svg('rect', { x: x - w / 2, y: box.y + box.h / 2 - h / 2, width: w, height: h, class: 'fz-pillar' });
  if (color) r.style.fill = color;
  fxLayer().appendChild(r);
  r.animate([{ transform: 'scaleY(0)', opacity: 0.95 }, { transform: 'scaleY(1)', opacity: 0.7, offset: 0.35 }, { transform: 'scaleY(1.1)', opacity: 0 }],
    { duration: 520 * k, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' }).onfinish = () => r.remove();
}
// 墨のにじみ：新語の下に墨が落ちて広がる
function inkBlot(c, size, k, color, rand) {
  const g = svg('g', { class: 'fz-burst' });
  if (color) g.style.setProperty('--fzs', color);
  for (let i = 0; i < 3; i++) {
    const blot = svg('ellipse', { cx: c.x + (rand() - 0.5) * size * 0.12, cy: c.y + (rand() - 0.5) * size * 0.06, rx: size * (0.42 - i * 0.08), ry: size * (0.2 - i * 0.03), class: 'fz-ink' });
    g.appendChild(blot);
    blot.animate([{ transform: 'scale(.02)', opacity: 0.32 }, { transform: 'scale(1)', opacity: 0.16, offset: 0.5 }, { transform: `scale(${1.25 + i * 0.1})`, opacity: 0 }],
      { duration: (1300 + i * 200) * k, delay: i * 90 * k, easing: 'cubic-bezier(.08,.75,.2,1)', fill: 'both' });
  }
  fxLayer().appendChild(g);
  setTimeout(() => g.remove(), 1900 * k);
}

// 花火：画面の下から光の玉が昇り、新語の位置で弾ける。火花は重力で垂れながら、またたいて消える
function firework(c, size, k, color, rand) {
  const H = stage.clientHeight, g = svg('g', { class: 'fz-burst' });
  if (color) g.style.setProperty('--fzs', color);
  // 1) 昇る光（尾を引く）
  const y0 = H + 20, rise = FW_RISE * k;
  const tail = svg('line', { x1: c.x, y1: y0, x2: c.x, y2: c.y, pathLength: '1', class: 'fz-rocket' });
  const head = svg('circle', { cx: c.x, cy: y0, r: Math.max(2, size * 0.018), class: 'fz-dot fz-spark' });
  g.append(tail, head);
  head.animate([{ transform: 'translate(0px, 0px)', opacity: 1 }, { transform: `translate(0px, ${c.y - y0}px)`, opacity: 1, offset: 0.98 }, { transform: `translate(0px, ${c.y - y0}px)`, opacity: 0 }],
    { duration: rise, easing: 'cubic-bezier(.2,.6,.35,1)', fill: 'both' });
  // 尾：長さ0.2の光の線が、光の玉を追って下から上へ移る（pathLength=1 で長さをそろえる）
  tail.animate([{ strokeDasharray: '0.2 1', strokeDashoffset: 0.2, opacity: 0.9 }, { strokeDasharray: '0.2 1', strokeDashoffset: -0.8, opacity: 0.7, offset: 0.98 }, { strokeDasharray: '0.2 1', strokeDashoffset: -0.8, opacity: 0 }],
    { duration: rise + 120 * k, easing: 'cubic-bezier(.2,.6,.35,1)', fill: 'both' }).onfinish = () => tail.remove();
  // 2) 弾ける：大きな輪の火花と、少し遅れて小さな2つの花
  const bursts = [{ x: c.x, y: c.y, n: 44, reach: size * 1.05, d: rise }];
  for (let i = 0; i < 2; i++) bursts.push({ x: c.x + (rand() - 0.5) * size * 1.4, y: c.y + (rand() - 0.6) * size * 0.7, n: 18, reach: size * 0.45, d: rise + (260 + i * 220) * k });
  for (const b of bursts) {
    for (let i = 0; i < b.n; i++) {
      const a = (i / b.n) * Math.PI * 2 + rand() * 0.25, sp = b.reach * (0.65 + rand() * 0.45);
      const dot = svg('circle', { cx: b.x, cy: b.y, r: 1 + rand() * 2.2, class: 'fz-dot' + (i % 3 ? '' : ' fz-spark') });
      g.appendChild(dot);
      const kf = [];
      for (let j = 0; j <= 6; j++) {
        const t = j / 6, e = 1 - (1 - t) ** 3; // 速く広がって、ゆっくり止まる
        const x = Math.cos(a) * sp * e, y = Math.sin(a) * sp * e + size * 0.35 * t * t; // 重力で垂れる
        kf.push({ offset: t, transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`, opacity: t < 0.6 ? 1 : (j % 2 ? 0.35 : 0.9) * (1 - t) * 2.5 });
      }
      dot.animate(kf, { duration: (1100 + rand() * 500) * k, delay: b.d, easing: 'linear', fill: 'both' });
    }
  }
  setTimeout(() => flash(c, color, k, 0.45), rise); // 弾けた瞬間に光る
  fxLayer().appendChild(g);
  setTimeout(() => g.remove(), rise + 2400 * k);
}

// ---- 1字ずつの登場。戻り値は登場が終わるまでの時間（ミリ秒）
function fzAnimate(it, motion, k, d0 = 0) {
  const parts = it.parts, n = parts.length, rand = it.fzr || Math.random;
  const step = (ms) => ms * k;
  const end = d0 + fzDur(motion, k, n);

  if (motion === 'decode') {
    // デコード：別の字がめまぐるしく入れ替わり、左から順に、光の柱とともに確定する。最後に色ずれが走る
    const fin = parts.map((p) => p.textContent);
    parts.forEach((p) => { p.style.width = p.offsetWidth + 'px'; p.style.textAlign = 'center'; p.style.opacity = '0'; });
    const box = boxOf(it), ink = fzInk(it.el);
    const t0 = now();
    const startAt = (i) => d0 + step(40) * i, lockAt = (i) => d0 + step(360) + step(110) * i;
    let last = 0;
    const locked = new Set();
    const tickFn = () => {
      if (!it.el.isConnected) return;
      const t = now() - t0, swap = t - last > 40;
      if (swap) last = t;
      let done = true;
      parts.forEach((p, i) => {
        if (t < startAt(i)) { done = false; return; }
        if (t < lockAt(i)) {
          done = false;
          p.style.opacity = '1';
          p.classList.add('fz-scr');
          if (swap) p.textContent = p.dataset.s === 'l' || p.dataset.s === 'n' ? [...fin[i]].map(() => pick(LATIN, rand)).join('') : pick(GLYPHS, rand);
        } else if (!locked.has(i)) {
          locked.add(i);
          p.textContent = fin[i];
          p.style.opacity = '1';
          p.classList.remove('fz-scr');
          p.animate([{ transform: 'scale(1.35)', filter: 'brightness(2.6) blur(1px)' }, { transform: 'none', filter: 'none' }], { duration: step(300), easing: EXPO });
          pillar(box.x + p.offsetLeft + p.offsetWidth / 2, box, k, ink, 0);
        }
      });
      if (!done) requestAnimationFrame(tickFn);
      else {
        parts.forEach((p) => { p.style.width = ''; p.style.textAlign = ''; });
        it.inner.animate([{ textShadow: fringe(0.09), transform: 'translateX(.03em)' }, { textShadow: fringe(0.04), transform: 'translateX(-.02em)', offset: 0.4 }, { textShadow: '0 0 transparent', transform: 'none' }],
          { duration: step(320), easing: 'steps(6, end)' });
      }
    };
    requestAnimationFrame(tickFn);
    return end;
  }

  if (motion === 'shutter') {
    // シャッター：1字を横に5本に裂き、帯が残像（ぶれ）を引いて左右から走り込み、最後にカチッとはまる
    const N = 5, dur = step(640);
    parts.forEach((p, i) => {
      p.style.position = 'relative';
      p.style.visibility = 'hidden';
      const strips = [];
      for (let s = 0; s < N; s++) {
        const c = p.cloneNode(true);
        c.className = p.className + ' fz-strip';
        c.style.position = ''; c.style.visibility = ''; // 元の字に付けた「隠す」を写しに持ち込まない
        c.style.fontSize = 'inherit'; c.style.letterSpacing = 'inherit';
        c.setAttribute('aria-hidden', 'true');
        c.style.clipPath = `inset(${(s * 100) / N}% -10% ${100 - ((s + 1) * 100) / N}% -10%)`;
        p.appendChild(c);
        strips.push(c);
        const dir = s % 2 ? 1 : -1;
        c.animate([
          { transform: `translateX(${dir * 3.2}em) skewX(${dir * -24}deg) scaleX(1.6)`, opacity: 0, filter: 'blur(5px)' },
          { opacity: 1, offset: 0.25 },
          { transform: `translateX(${-dir * 0.08}em) skewX(${dir * 4}deg) scaleX(1)`, filter: 'blur(0px)', offset: 0.62 },
          { transform: 'none', opacity: 1, filter: 'blur(0px)' },
        ], { duration: dur, delay: d0 + step(70) * i + step(40) * s, easing: EXPO, fill: 'backwards' });
      }
      setTimeout(() => { strips.forEach((c) => c.remove()); p.style.visibility = ''; p.style.position = ''; }, d0 + step(70) * i + step(40) * (N - 1) + dur + 20);
    });
    it.inner.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: step(360), delay: end - step(120), easing: 'ease-out' });
    return end;
  }

  if (motion === 'converge') {
    // 集束：散らばった字が、2つの残像を引きながら、らせんを描いて一点へ吸い込まれる
    const spinDir = rand() < 0.5 ? -1 : 1;
    parts.forEach((p, i) => {
      const a0 = rand() * Math.PI * 2, r0 = 2.6 + rand() * 2.2, spin = spinDir * (1.3 + rand() * 0.7) * Math.PI, rot = (rand() - 0.5) * 540;
      const delay = d0 + step(40) * i + rand() * step(100);
      const kf = [];
      for (let j = 0; j <= 8; j++) {
        const t = j / 8, inv = 1 - t, rr = r0 * inv ** 1.5, ang = a0 + spin * t;
        kf.push({ offset: t, transform: `translate(${(Math.cos(ang) * rr).toFixed(3)}em, ${(Math.sin(ang) * rr * 0.62).toFixed(3)}em) rotate(${(rot * inv).toFixed(1)}deg) scale(${(1 + inv * 1.4).toFixed(3)})`,
          opacity: t < 0.12 ? t / 0.12 : 1, filter: `blur(${(inv * 8).toFixed(2)}px)` });
      }
      const opts = { duration: step(1100), easing: 'cubic-bezier(.55,0,.25,1)' };
      p.animate(kf, { ...opts, delay, fill: 'backwards' });
      for (const q of [1, 2]) { // 残像
        const tr = p.cloneNode(true);
        tr.classList.add('fz-trail');
        tr.setAttribute('aria-hidden', 'true');
        tr.style.left = p.offsetLeft + 'px'; tr.style.top = p.offsetTop + 'px';
        it.el.appendChild(tr);
        tr.animate(kf.map((f) => ({ ...f, opacity: (f.opacity * (q === 1 ? 0.4 : 0.18)) })), { ...opts, delay: delay + step(55 * q), fill: 'both' }).onfinish = () => tr.remove();
      }
    });
    return end;
  }

  if (motion === 'scan') {
    // スキャン：光の線が走り抜け、通ったところから字が奥から起き上がって実体化する（ホログラムのちらつき）
    const w = it.inner.offsetWidth || it.el.offsetWidth, dur = step(1000);
    const bar = el('fz-scan');
    it.el.appendChild(bar);
    bar.animate([{ transform: 'translateX(-.2em)', opacity: 0 }, { opacity: 1, offset: 0.08 }, { opacity: 1, offset: 0.9 }, { transform: `translateX(${w}px)`, opacity: 0 }],
      { duration: dur, delay: d0, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'both' }).onfinish = () => bar.remove();
    it.inner.style.perspective = '4em';
    parts.forEach((p) => {
      const at = d0 + dur * ((p.offsetLeft + p.offsetWidth / 2) / Math.max(1, w));
      p.style.transformOrigin = '50% 100%';
      p.animate([
        { transform: 'rotateX(88deg) translateY(.35em) scaleY(.6)', opacity: 0, filter: isLight(themeBg()) ? 'blur(3px)' : 'blur(3px) brightness(2.2)', textShadow: fringe(0.1) },
        { transform: 'rotateX(-14deg)', opacity: 1, filter: 'blur(0px) brightness(1.5)', offset: 0.5 },
        { opacity: 0.45, offset: 0.62 }, { opacity: 1, offset: 0.7 }, { opacity: 0.7, offset: 0.78 },
        { transform: 'none', opacity: 1, filter: 'none', textShadow: '0 0 transparent' },
      ], { duration: step(560), delay: Math.max(0, at - step(60)), easing: EXPO, fill: 'backwards' });
    });
    setTimeout(() => { it.inner.style.perspective = ''; }, end + 50);
    return end;
  }

  if (motion === 'firework') {
    // 花火：光が昇りきって弾けた瞬間、火花の中心から字が花開くように広がり、きらめいて止まる
    const cx = it.inner.offsetLeft + it.inner.offsetWidth / 2, d1 = d0 + step(FW_RISE);
    parts.forEach((p, i) => {
      const dx = cx - (p.offsetLeft + p.offsetWidth / 2);
      p.animate([
        { transform: `translate(${dx}px, 0) scale(0)`, opacity: 0, filter: 'brightness(3) blur(4px)' },
        { transform: `translate(${-dx * 0.06}px, -.04em) scale(1.18)`, opacity: 1, filter: 'brightness(2.2) blur(0px)', offset: 0.42 },
        { filter: 'brightness(1.6)', offset: 0.6 }, { filter: 'brightness(1)', offset: 0.7 }, { filter: 'brightness(1.5)', offset: 0.8 },
        { transform: 'none', opacity: 1, filter: 'none' },
      ], { duration: step(900), delay: d1 + step(40) * rankFromCenter(i, n), easing: 'cubic-bezier(.2,.8,.25,1)', fill: 'backwards' });
    });
    return end;
  }

  if (motion === 'ink') {
    // 墨：にじんだ墨の中から、中央の字から順に輪郭が浮かび上がる
    parts.forEach((p, i) => {
      p.animate([
        { opacity: 0, filter: 'blur(16px)', transform: 'scale(1.5)' },
        { opacity: 0.9, filter: 'blur(4px)', transform: 'scale(1.06)', offset: 0.5 },
        { opacity: 1, filter: 'blur(0px)', transform: 'none' },
      ], { duration: step(1000), delay: d0 + step(60) * rankFromCenter(i, n), easing: 'cubic-bezier(.2,.65,.2,1)', fill: 'backwards' });
    });
    return end;
  }

  // collide：衝撃の中心から字がはじけ出し、行き過ぎて戻って、ぴたりと止まる
  const cx = it.inner.offsetLeft + it.inner.offsetWidth / 2;
  parts.forEach((p, i) => {
    const dx = cx - (p.offsetLeft + p.offsetWidth / 2), r = (rand() - 0.5) * 160;
    p.animate([
      { transform: `translate(${dx}px, 0) scale(.1) rotate(${r}deg)`, opacity: 0, filter: 'blur(6px)' },
      { transform: `translate(${-dx * 0.08}px, -.06em) scale(1.14) rotate(${-r * 0.08}deg)`, opacity: 1, filter: 'blur(0px)', offset: 0.55 },
      { transform: 'scale(.97)', offset: 0.8 },
      { transform: 'none', opacity: 1, filter: 'blur(0px)' },
    ], { duration: step(820), delay: d0 + step(35) * rankFromCenter(i, n), easing: 'cubic-bezier(.2,.85,.25,1)', fill: 'backwards' });
  });
  return end;
}
// 新語の画面上の箱（演出の位置合わせ用。カンペ・テロップでも使えるように実際の位置から測る）
function boxOf(it) {
  const r = it.inner.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
}
// 出かたごとの、画面全体の演出（誕生の瞬間に）
function fzStage(it, motion, k, ink) {
  const rand = it.fzr || Math.random, box = boxOf(it);
  const c = { x: box.x + box.w / 2, y: box.y + box.h / 2 }, size = Math.max(box.w, box.h);
  focusPull(fzDur(motion, k, it.parts.length) + 1200 * k);
  if (motion === 'collide') {
    flash(c, ink, k);
    shake(k, rand, 1);
    burst(c, size, k, ink, rand);
    shockwave(c, size, k, ink);
    particles(c, 26, size * 0.9, ink, k, rand);
  } else if (motion === 'converge') {
    rings(c, size, k, ink);
    particles(c, 18, size * 0.8, ink, k, rand, { inward: true, life: 1000 });
    flash(c, ink, k, 0.3);
  } else if (motion === 'scan') {
    bands(box, k, ink, rand);
  } else if (motion === 'shutter') {
    slits(box, k, ink);
  } else if (motion === 'firework') {
    firework(c, size, k, ink, rand);
  } else if (motion === 'ink') {
    inkBlot(c, size, k, ink, rand);
    particles(c, 22, size * 0.75, ink, k, rand, { min: 1, max: 6, life: 800 });
  } else if (motion === 'decode') {
    brackets(box, k, ink, fzDur(motion, k, it.parts.length) + 200);
  }
}
// 新語の登場の仕上げ：バッジと元の2語を出し、色を満たし、一度だけ光る
function fzFinish(it, end, k) {
  for (const sel of ['.fz-badge', '.fz-from']) {
    const e = it.el.querySelector(sel);
    if (e) e.animate([{ opacity: 0, transform: 'translateY(.4em)' }, { opacity: 1, transform: 'none' }], { duration: 420 * k, delay: Math.max(0, end * 0.55), easing: EASE, fill: 'backwards' });
  }
  fill(it, end + 80);
  afterglow(it, end + 60, k, fzInk(it.el));
}
// カンペ・テロップでの新語（enter から呼ぶ）
function fzEnter(it) {
  const { motion, k } = it.fz || { motion: 'collide', k: 1 };
  it.el.classList.add('fz-live');
  if (S.reduceMotion) { fill(it, 0); return; }
  const end = fzAnimate(it, motion, k);
  requestAnimationFrame(() => fzStage(it, motion, k, fzInk(it.el)));
  fzFinish(it, end, k);
}

async function fuseWord(m) {
  const text = (m.text || '').trim();
  if (!text) return;
  const look = fzLook(m);
  const rand = rngFor(m);
  if (vj) { lastWordAt = now(); await vj.fuse({ text, from: [m.a, m.b], color: look.color, k: look.k }); updateHint(); return; }
  if (mo) { lastWordAt = now(); mo.fuse({ ...m, text, color: look.color }); updateHint(); return; }
  if (m.replay) { // 「生まれた新語」から呼び出したとき：まだ画面にあっても、いったん退いてもらって生まれ直す
    const old = items.get(text.toLowerCase());
    if (old && !old.leaving) expire(old);
  }
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
  const px = basePx() * ratio('compose', lv);
  await fontReady(text, px);
  const { node, inner, parts } = build(text, 'fusion', false, [m.a, m.b]);
  colorize(node, parts, color, rand);
  node.style.fontSize = px + 'px';
  node.style.letterSpacing = TRACK[lv] + 'em';
  const ttl = lifeSec() * 1000 * 3.2; // 新語は余韻を残して長めに
  const it = { key: text.toLowerCase(), text, kind: 'fusion', count: 1, lv, el: node, inner, parts, vertical: false,
    born: t0, ttl, expires: t0 + ttl, rect: null, leaving: false, aging: false, fz: look, fzr: fzRand(m) };
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
  track(it);
  capFusion(it);
  updateHint();
  const c = { x: r.x + node.offsetWidth / 2, y: y + node.offsetHeight / 2 };
  const size = Math.max(node.offsetWidth, node.offsetHeight);
  const box = { x: r.x, y, w: node.offsetWidth, h: node.offsetHeight };
  const ink = fzInk(node); // 背景に合わせて整えた色

  // 元の2語が新語に重なっていたら、誕生を見届けたあとで静かに退場してもらう。
  // 時刻は演出の長さから決めて、タイマー（tick）で行う（どの窓でも、追いつき中でも同じになる）
  if (!S.reduceMotion) {
    const at = t0 + (parents.length ? fzLead(motion) * k : 0) + fzDur(motion, k, parts.length) + 400;
    for (const p of parents) p.stepAside = { at, r };
  }
  if (S.reduceMotion || replaying) { node.style.visibility = ''; node.classList.add('fz-live'); fill(it, 0); return; }
  // 置き場所はもう決まったので、誕生の演出は待たずに次の言葉へ進む
  // （演出のあいだ次の言葉を止めると、窓ごとに言葉の出る時刻がずれて、並びがそろわなくなる）
  fzBirth(it, { node, parents, motion, k, c, size, box, ink, rand }).catch(() => {});
}
async function fzBirth(it, { node, parents, motion, k, c, size, box, ink, rand }) {
  const vr = it.fzr || rand;
  focusPull((parents.length ? fzLead(motion) : 0) * k + 400);
  // 1) 予兆：元の2語が光り、系統線が伸びる。衝突では分身が加速しながら中心へ吸い寄せられ、光が一点に集まる
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
      const kk = 0.36, pw = p.el.offsetWidth, ph = p.el.offsetHeight;
      ghost.animate([
        { transform: `translate(${p.rect.x}px, ${p.rect.y + (p.dy || 0)}px)`, opacity: 0.85, filter: 'blur(0px)' },
        { transform: `translate(${c.x - (pw * kk) / 2}px, ${c.y - (ph * kk) / 2}px) scale(${kk})`, opacity: 0.75, filter: 'blur(3px)' },
      ], { duration: 720 * k, delay: 140 * k, easing: 'cubic-bezier(.7,0,.9,.3)', fill: 'both' }).onfinish = () => ghost.remove();
    }
    lineage(centerOf(p), c, 120 * k, k, ink, vr);
  }
  if (motion === 'collide' && parents.length) {
    particles(c, 16, size * 0.7, ink, k, vr, { inward: true, delay: 380 * k, life: 520 });
  }
  await sleep(parents.length ? fzLead(motion) * k : 0);

  // 2) 誕生：出かたごとの動きと、画面全体の演出（閃光・揺れ・衝撃波・粒子・ピント送り）
  node.style.visibility = '';
  node.classList.add('fz-live');
  const end = fzAnimate(it, motion, k);
  fzStage(it, motion, k, ink);
  // 3) 余韻：色が満ち、一度だけ光る
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
  for (const it of allItems()) if (it.leaving && it.goneAt && it.goneAt <= t) removeItem(it);
}
async function replay(msg, recvAt) {
  if (vj || mo) return; // VJ・モーションは流れの演出なので、途中からでも困らない
  let evs = (Array.isArray(msg.events) ? msg.events : []).filter((e) => e && Number.isFinite(e.ago));
  // コンソールの設定に連動する窓は、レイアウトを切り替えたときに画面が作り直されるので、それ以降だけ
  if (!LOCK.layout && Number.isFinite(msg.since)) evs = evs.filter((e) => e.ago <= msg.since);
  const words = evs.filter((e) => (e.t === 'word' || e.t === 'fuse') && e.text);
  const caps = evs.filter((e) => e.t === 'caption' && e.text);
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
  for (const c of caps) caption(c.text, c.final, c, recvAt - c.ago); // 消える時刻を過ぎたものは renderCap が外す
}

// ---------------------------------------------------------------- 字幕ライン（画面の最下部）
// いま話している文と、少し前の文（「同時に出す行」の数まで）を、1文1行で下から積む。
// 行に入りきらない長い文は、頭を「…」で省いて終わりの方を見せる。話し終えた文は「表示時間」のあとに消える。
// 大きさと行数は 1280×720 換算で決め、言葉はそのぶんの高さ（--cap-res）を空けて置く
let capRows = []; // { text, final, at, spn, spc }
let capTimer = 0;
function setCapVars() {
  const s = unit();
  root.style.setProperty('--cap', capRef() * s + 'px');
  root.style.setProperty('--cap-res', capReserve(stage.clientHeight / s) * s + 'px');
}
// 消える時刻：話し終えた文は「表示時間」のあと。話している途中の文は、途切れても少し長めに残す
const capEnd = (r) => r.at + (r.final ? capTtlMs() : Math.max(capTtlMs(), 6000) + 2000);
function caption(text, final, m = {}, at = performance.now()) {
  if (!S.caption || !text) return;
  const row = { text, final: !!final, at, spn: m.spn || '', spc: m.spc || '' };
  const last = capRows[capRows.length - 1];
  if (last && !last.final) capRows[capRows.length - 1] = row; else capRows.push(row);
  renderCap();
}
function renderCap() {
  clearTimeout(capTimer);
  const t = performance.now();
  capRows = capRows.filter((r) => capEnd(r) > t).slice(-capLineMax());
  if (!S.caption || !capRows.length) { cap.classList.remove('on'); return; } // 中身はそのまま薄れて消える
  const lines = capRows.map((r, i) => {
    const line = el('cap-l' + (r.final ? ' final' : '') + (i < capRows.length - 1 ? ' old' : ''));
    if (r.spn) {
      const tag = el('cap-sp', r.spn);
      tag.style.setProperty('--spc', r.spc || 'currentColor');
      line.appendChild(tag);
    }
    line.appendChild(el('cap-t', r.text));
    return line;
  });
  cap.replaceChildren(...lines);
  cap.classList.remove('peek');
  for (const l of lines) fitCapLine(l);
  cap.classList.add('on');
  capTimer = setTimeout(renderCap, Math.max(60, Math.min(...capRows.map(capEnd)) - t));
}
// 1行に収まるまで、文の頭を「…」で省く（終わりの方＝いま話している言葉を残す）
function fitCapLine(line) {
  const body = line.lastChild;
  if (line.scrollWidth <= line.clientWidth + 1) return;
  const chars = [...body.textContent];
  let lo = 1, hi = chars.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    body.textContent = '…' + chars.slice(-mid).join('');
    if (line.scrollWidth <= line.clientWidth + 1) lo = mid; else hi = mid - 1;
  }
  body.textContent = '…' + chars.slice(-lo).join('');
}
function clearCaption() {
  capRows = [];
  clearTimeout(capTimer);
  cap.classList.remove('on', 'peek');
}
// プレビューだけ：コンソールで字幕ラインの設定にふれたとき、最下部の字幕の場所を枠で示す
// （字幕が出ていなければ見本の文を出す）。別窓・OBS には出さない
let peekTimer = 0;
function capPeek() {
  if (!EMBED) return;
  clearTimeout(peekTimer);
  if (!S.caption) { cap.classList.remove('peek'); return; }
  if (!capRows.length) {
    const n = capLineMax();
    const sample = [L('ここに、聞き取った文が出ます', 'What you say appears here'), L('少し前の文も残せます', 'Earlier sentences can stay too'), L('いちばん下が、いま話している文です', 'The bottom line is what you’re saying now')];
    const lines = sample.slice(3 - n).map((x, i) => { const l = el('cap-l final' + (i < n - 1 ? ' old' : '')); l.appendChild(el('cap-t', x)); return l; });
    cap.replaceChildren(...lines);
    cap.classList.add('on');
  }
  cap.classList.add('peek');
  peekTimer = setTimeout(() => {
    cap.classList.remove('peek');
    if (!capRows.length) cap.classList.remove('on');
  }, 1800);
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
  } else if (m.t === 'caption') { if (mo) { mo.caption(m.text, m.final, m); updateHint(); } else caption(m.text, m.final, m); }
  else if (m.t === 'capPeek') capPeek();
  else if (m.t === 'clear') clearAll();
  else if (m.t === 'lvl') { if (vj) vj.level(m.v); if (mo) mo.level(m.v); }
  else if (m.t === 'aud') { if (mo) mo.audio(m); } // 周りの音（帯域・拍・テンポ）
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
  S = fixLayout({ ...DEFAULTS, ...s, ...LOCK });
  applyTheme();
  if (prev.layout !== S.layout) setupLayout();
  else { configureVJ(); configureMotion(); }
  setCapVars();
  if (!S.caption) clearCaption(); else renderCap(); // 行数・表示時間が変わったら、すぐに合わせる
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

// ---------------------------------------------------------------- 別窓の操作バー
// カンペ・組版を別窓で開いたときだけ、マウスを動かすと画面の下に操作バーが出る（動画プレーヤーのように、しばらくすると隠れる）。
// レイアウト・文字サイズ・書体・色は「この窓だけ」に効く（URL に残るので、再読み込みしても保たれる）。
// コンソールと違う設定にしているときだけ「コンソールに合わせる」が出て、全部まとめて戻せる。
// キー：F 全画面／L レイアウト／T 書体／+ − 文字サイズ／0 コンソールに合わせる／Esc 消去／? キーの一覧。ダブルクリックでも全画面
const SHOW_UI = !EMBED && !OBS_URL && P.get('ui') !== '0';
const isLocked = (id) => THEMES[id] && THEMES[id].pro && !canUse('theme:premium') && trialRemainingMs() <= 0;
const vjLocked = () => !canUse('layout:vj') && trialRemainingMs() <= 0;
const WIN_KEYS = { theme: 'theme', accent: 'accent', layout: 'layout', baseSize: 'size' }; // この窓だけの設定と、URL での名前
const SIZE_KEYS = Object.keys(SIZE_STEPS).map(Number);
let bar = null, pop = null, keysPop = null, note = null, uiTimer = 0;

// この窓だけの設定を変える（val が null ならコンソールに合わせる）
function setWindowOpt(key, val) {
  const url = new URL(location.href), param = WIN_KEYS[key];
  if (val == null) { delete LOCK[key]; url.searchParams.delete(param); }
  else { LOCK[key] = val; url.searchParams.set(param, key === 'accent' ? String(val).slice(1) : String(val)); }
  history.replaceState(null, '', url);
  const prev = S;
  S = fixLayout({ ...DEFAULTS, ...(lastSettings || loadSettings()), ...LOCK });
  applyTheme();
  root.style.setProperty('--base', basePx() + 'px');
  setCapVars();
  if (prev.layout !== S.layout) setupLayout();
  renderBar();
}
function setWindowTheme(id) {
  if (id && isLocked(id)) { notify(L('プレミアム書体のお試し期間（1日）は終わりました', 'The 1-day trial of premium typefaces has ended')); return; }
  setWindowOpt('theme', id);
}
function setWindowAccent(c) { setWindowOpt('accent', c); }
function setWindowLayout(id) {
  if (id === 'vj' && vjLocked()) { notify(L('VJ モードのお試し期間（1日）は終わりました', 'The 1-day trial of VJ mode has ended')); return; }
  setWindowOpt('layout', id);
}
function stepSize(dir) {
  const i = SIZE_KEYS.indexOf(nearestStep(SIZE_STEPS, S.baseSize));
  const j = Math.max(0, Math.min(SIZE_KEYS.length - 1, i + dir));
  if (j !== i) setWindowOpt('baseSize', SIZE_KEYS[j]);
  showUi();
}
function syncAll() {
  const url = new URL(location.href);
  for (const [k, param] of Object.entries(WIN_KEYS)) { delete LOCK[k]; url.searchParams.delete(param); }
  history.replaceState(null, '', url);
  setWindowOpt('theme', null);
  notify(L('コンソールの設定に合わせました', 'Now following the console'));
}
const windowOwn = () => Object.keys(WIN_KEYS).filter((k) => LOCK[k] != null);

function notify(text) {
  if (!note) return;
  note.textContent = text;
  note.classList.add('on');
  showUi();
  clearTimeout(notify.t);
  notify.t = setTimeout(() => note.classList.remove('on'), 3200);
}

const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
function btn(cls, label, title, fn) {
  const b = mk('button', cls);
  b.type = 'button';
  if (label != null) b.innerHTML = label;
  if (title) { b.title = title; b.setAttribute('aria-label', title); }
  b.addEventListener('click', fn);
  return b;
}

function renderBar() {
  if (!bar) return;
  document.title = `${tr(LAYOUTS[S.layout] || LAYOUTS.compose)}｜KANPE`; // OBS のウィンドウキャプチャで選びやすいように
  bar.replaceChildren();
  // レイアウト
  const lay = mk('div', 'wb-seg');
  lay.setAttribute('role', 'radiogroup');
  lay.setAttribute('aria-label', L('レイアウト', 'Layout'));
  for (const [id, def] of Object.entries(LAYOUTS)) {
    const b = btn('wb-opt' + (def.pro ? ' plus' : '') + (id === 'vj' && vjLocked() ? ' locked' : ''), tr(def) + (def.pro ? '<i aria-hidden="true">+</i>' : ''), tr(def, 'note'), () => setWindowLayout(id));
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(S.layout === id));
    lay.appendChild(b);
  }
  // 文字サイズ
  const size = mk('div', 'wb-size');
  const cur = nearestStep(SIZE_STEPS, S.baseSize), ci = SIZE_KEYS.indexOf(cur);
  const dn = btn('wb-icon', 'A<small>−</small>', L('文字を小さく（−）', 'Smaller text (−)'), () => stepSize(-1));
  const up = btn('wb-icon', 'A<small>+</small>', L('文字を大きく（+）', 'Larger text (+)'), () => stepSize(1));
  dn.disabled = ci <= 0; up.disabled = ci >= SIZE_KEYS.length - 1;
  const v = mk('span', 'wb-size-v', tr(SIZE_STEPS[cur]));
  v.title = L('文字サイズ', 'Text size');
  size.append(dn, v, up);
  if (S.layout === 'vj') size.classList.add('off'); // VJ では文字サイズは効かない
  // 書体と色（ポップアップ）
  const th = THEMES[S.theme] || THEMES[DEFAULT_THEME];
  const tb = btn('wb-btn wb-theme', '', L('書体と色（T）', 'Typeface and color (T)'), () => togglePop(pop));
  const tile = mk('span', 'wb-tile', '字');
  tile.style.background = th.bg === 'transparent' ? 'repeating-conic-gradient(#3a3d44 0 25%, #2a2d33 0 50%) 0 0 / 8px 8px' : th.bg;
  tile.style.color = th.ink; tile.style.fontFamily = `${th.family}, ${th.fallback}`; tile.style.fontWeight = th.strong;
  tb.append(tile, mk('span', null, tr(th)));
  tb.setAttribute('aria-expanded', String(!pop.hidden));
  // 消去・全画面・キー
  const clr = btn('wb-btn', `${L('消去', 'Clear')}<kbd>Esc</kbd>`, L('この窓の言葉を消す（Esc）', 'Clear this window (Esc)'), () => clearAll());
  const fs = btn('wb-btn wb-fs', `${document.fullscreenElement ? L('戻す', 'Exit') : L('全画面', 'Full screen')}<kbd>F</kbd>`, L('全画面（F・ダブルクリック）', 'Full screen (F or double-click)'), toggleFullscreen);
  const kb = btn('wb-icon wb-keys', '?', L('キー操作の一覧（?）', 'Keyboard shortcuts (?)'), () => togglePop(keysPop));
  kb.setAttribute('aria-expanded', String(!keysPop.hidden));
  bar.append(lay, size, tb, clr, fs, kb);
  // この窓だけの設定があるとき
  const own = windowOwn();
  if (own.length) {
    const names = { theme: L('書体', 'typeface'), accent: L('色', 'color'), layout: L('レイアウト', 'layout'), baseSize: L('文字サイズ', 'size') };
    const sync = btn('wb-sync', `${L('コンソールに合わせる', 'Follow console')}<kbd>0</kbd>`, L(`この窓だけ：${own.map((k) => names[k]).join('・')}。コンソールの設定に戻します（0）`, `This window only: ${own.map((k) => names[k]).join(', ')}. Go back to the console’s settings (0)`), syncAll);
    bar.append(sync);
  }
  renderPop();
}

function renderPop() {
  if (!pop) return;
  pop.replaceChildren();
  const row = mk('div', 'pk-row');
  const follow = btn('pk-follow', L('コンソールと同じ', 'Same as console'), L('コンソールで選んだ書体に合わせる', 'Follow the typeface chosen in the console'), () => setWindowTheme(null));
  follow.setAttribute('aria-pressed', String(!LOCK.theme));
  row.appendChild(follow);
  for (const [id, th] of Object.entries(THEMES)) {
    const b = btn('pk-theme' + (th.pro ? ' plus' : '') + (isLocked(id) ? ' locked' : ''), '', th.pro ? L(`${th.label}（お手軽プランの書体）`, `${tr(th)} (Plus)`) : tr(th), () => setWindowTheme(id));
    b.setAttribute('aria-pressed', String(S.theme === id));
    const tile = mk('span', 'pk-tile', '字');
    tile.style.background = th.bg === 'transparent' ? 'repeating-conic-gradient(#3a3d44 0 25%, #2a2d33 0 50%) 0 0 / 8px 8px' : th.bg;
    tile.style.color = th.ink; tile.style.fontFamily = `${th.family}, ${th.fallback}`; tile.style.fontWeight = th.strong;
    b.append(tile, mk('span', 'pk-name', tr(th)));
    row.appendChild(b);
  }
  const arow = mk('div', 'pk-row pk-accents');
  const af = btn('pk-follow small', L('コンソールと同じ', 'Same as console'), L('コンソールで選んだ色に合わせる', 'Follow the color chosen in the console'), () => setWindowAccent(null));
  af.setAttribute('aria-pressed', String(!LOCK.accent));
  arow.appendChild(af);
  for (const a of ACCENTS) {
    const b = btn('pk-acc', '', tr(a), () => setWindowAccent(a.c));
    b.style.background = a.c;
    b.setAttribute('aria-pressed', String(LOCK.accent === a.c));
    arow.appendChild(b);
  }
  pop.append(mk('span', 'pk-label', L('書体', 'TYPEFACE')), row, mk('span', 'pk-label', L('アクセントの色', 'ACCENT')), arow);
}

function togglePop(which, force) {
  const open = force != null ? force : which.hidden;
  for (const p of [pop, keysPop]) p.hidden = p === which ? !open : true;
  renderBar();
  showUi();
}

function showUi() {
  if (!bar) return;
  document.body.classList.add('ui-on');
  document.body.classList.remove('ui-idle');
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => {
    const busy = bar.matches(':hover') || !pop.hidden || !keysPop.hidden || pop.matches(':hover') || document.activeElement && bar.contains(document.activeElement) && document.activeElement.matches(':focus-visible');
    if (busy) return showUi();
    document.body.classList.remove('ui-on');
    document.body.classList.add('ui-idle');
  }, 2600);
}

function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {});
}

if (SHOW_UI) {
  bar = mk('div');
  bar.id = 'wbar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', L('この窓の操作', 'Window controls'));
  pop = mk('div', 'wb-pop');
  pop.hidden = true;
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', L('この窓の書体と色', 'Typeface and color for this window'));
  keysPop = mk('div', 'wb-pop wb-keys-pop');
  keysPop.hidden = true;
  keysPop.setAttribute('role', 'dialog');
  keysPop.setAttribute('aria-label', L('キー操作', 'Keyboard shortcuts'));
  const keys = [['F', L('全画面（ダブルクリックでも）', 'Full screen (or double-click)')], ['L', L('レイアウトを切り替え', 'Next layout')], ['T', L('書体を切り替え', 'Next typeface')],
    ['+ / −', L('文字を大きく／小さく', 'Larger / smaller text')], ['0', L('コンソールに合わせる', 'Follow the console')], ['Esc', L('画面の言葉を消す', 'Clear the words')], ['?', L('この一覧', 'This list')]];
  keysPop.innerHTML = `<span class="pk-label">${L('キー操作', 'KEYBOARD')}</span><dl class="wb-keylist">${keys.map(([k, d]) => `<dt><kbd>${k}</kbd></dt><dd>${d}</dd>`).join('')}</dl>` +
    `<p class="wb-keynote">${L('この窓で変えた設定は、この窓だけに効きます', 'Changes here apply to this window only')}</p>`;
  note = mk('p', 'wb-note');
  note.setAttribute('aria-live', 'polite');
  document.body.append(pop, keysPop, bar, note);
  renderBar();
  for (const ev of ['mousemove', 'pointerdown', 'touchstart']) window.addEventListener(ev, showUi, { passive: true });
  bar.addEventListener('focusin', showUi);
  document.addEventListener('fullscreenchange', renderBar);
  // 画面（バーの外）を押したら、開いているポップアップを閉じる。ダブルクリックで全画面
  stage.addEventListener('pointerdown', () => { if (!pop.hidden || !keysPop.hidden) togglePop(pop, false); });
  window.addEventListener('dblclick', (e) => { if (!bar.contains(e.target) && !pop.contains(e.target) && !keysPop.contains(e.target)) toggleFullscreen(); });
  // はじめて開いたときだけ、使い方をひとこと（この端末で一度見たら出さない）
  let seen = false;
  try { seen = localStorage.getItem('kanpe.wbar.v1') === '1'; localStorage.setItem('kanpe.wbar.v1', '1'); } catch {}
  showUi();
  if (!seen) notify(L('この窓だけの見た目を変えられます。マウスを止めるとバーは隠れます（F：全画面・?：キー操作）', 'Change the look of this window only. The bar hides when the mouse stops (F: full screen, ?: shortcuts)'));

  // この窓でプレミアム機能を使い始めたら、無料プランの1日お試しを開始する（コンソールと共通）
  let last = performance.now();
  setInterval(() => {
    const t = performance.now();
    const dt = t - last;
    last = t;
    const plusTheme = LOCK.theme && THEMES[LOCK.theme] && THEMES[LOCK.theme].pro;
    const plusLayout = LOCK.layout === 'vj';
    if ((plusTheme && !canUse('theme:premium')) || (plusLayout && !canUse('layout:vj'))) { // アクセントカラーは無料なので数えない
      addTrialUsage(dt);
      if (trialRemainingMs() <= 0) {
        if (plusTheme) setWindowTheme(null);
        if (plusLayout) setWindowOpt('layout', null);
        notify(L('プレミアム機能のお試し期間（1日）が終わったので、コンソールの設定に戻しました', 'The 1-day trial has ended, so this window follows the console again'));
      }
    }
  }, 1000);
}

window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape') {
    if (SHOW_UI && (!pop.hidden || !keysPop.hidden)) { togglePop(pop, false); return; }
    clearAll();
    return;
  }
  if (e.key === 'f' || e.key === 'F') { if (!EMBED) toggleFullscreen(); return; }
  if (!SHOW_UI) return;
  const k = e.key;
  if (k === 't' || k === 'T') { // 書体を順に
    const ids = Object.keys(THEMES).filter((id) => !isLocked(id));
    setWindowTheme(ids[(ids.indexOf(S.theme) + 1) % ids.length]);
  } else if (k === 'l' || k === 'L') { // レイアウトを順に
    const ids = Object.keys(LAYOUTS).filter((id) => id !== 'vj' || !vjLocked());
    setWindowLayout(ids[(ids.indexOf(S.layout) + 1) % ids.length]);
  } else if (k === '+' || k === '=' || k === 'ArrowUp') { e.preventDefault(); stepSize(1); }
  else if (k === '-' || k === '_' || k === 'ArrowDown') { e.preventDefault(); stepSize(-1); }
  else if (k === '0') { if (windowOwn().length) syncAll(); }
  else if (k === '?' || k === '/') togglePop(keysPop);
  else return;
  showUi();
});
window.addEventListener('resize', () => { root.style.setProperty('--base', basePx() + 'px'); setCapVars(); applyLogo(); renderCap(); if (mo) { mo.resize(); configureMotion(); } });

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
  import('../console/demo.js?v=202610251717').then(({ runDemo }) => runDemo({ lang: EN ? 'en-US' : S.lang, deliver, registered: S.registered,
    script: ['meeting', 'speech', 'talk'].includes(P.get('script')) ? P.get('script') : '', pace: () => (S.layout === 'motion' ? 2.2 : 1) }));
}

// 検証用フック
window.__kanpe = { onMessage, items, get settings() { return S; }, get vj() { return vj; }, get mo() { return mo; } };

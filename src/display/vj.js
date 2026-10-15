// VJ モード：話した言葉をドットアート（ドット絵）で描く。canvas 1枚・依存なし。
// - 言葉は選んだ書体で 16〜38 段のドットに起こし、1 ドットずつ光らせる（段数が多いほど細かく読みやすい）
// - 最新の言葉を中央に大きく、ひとつ前までの言葉は小さくなって周りを漂う
// - スタイルごとに「動き」を持つ：LED＝声で脈打ち光が走る／ネオン＝波打つ／ピクセル＝1字ずつ跳ねる
//   1px＝白黒の 1px の点と線だけで組む（方眼・目盛り・座標の読み出し・書き込みヘッド）
// - 繰り返した言葉はコンボ（×2, ×3 …）、初めて出た目立つ言葉はインパクト（閃光・揺れ・グリッチ）
// - 背景もスタイルごと：ステージの光線／シンセウェーブの床／星空。声の大きさで強まる
import { VJ_FONTS, VJ_DETAILS, VJ_FX } from '../core/settings.js?v=202610151239';
import { tuneColor, rainbowColor } from '../core/color.js?v=202610151239';

const FALLBACK = '"Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", sans-serif';
const PIXEL_PALETTE = ['#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#ff77a8', '#ffccaa', '#83f3ff'];
const STYLES = ['micro', 'led', 'neon', 'pixel']; // 知らない見た目（以前のホロなど）は 1px にする
const MAX_SAT = 6;
const FZ_MAX = 5, FZ_HURRY = 3000; // 新語の同時表示の上限と、上限に来たときの古い新語の残り時間

// 3×5 ピクセルの英数字（1px モードの計器用）。5 行 × 3 列を 1 と 0 で
const FONT3 = (() => {
  const src = {
    0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
    5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
    A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
    F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
    K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '010101101101010',
    P: '110101110100100', Q: '010101101110011', R: '110101110101101', S: '011100010001110', T: '111010010010010',
    U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
    Z: '111001010100111', ':': '000010000010000', '.': '000000000000010', '/': '001001010100100', '-': '000000111000000',
    '+': '000010111010000', '#': '101111101111101', '[': '110100100100110', ']': '011001001001011', '=': '000111000111000',
    '_': '000000000000111', '>': '100010001010100', ' ': '000000000000000',
  };
  return src;
})();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeBack = (k) => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const hash = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };

// ---------------------------------------------------------------- 書体
function fontSpec(cfg) {
  const f = VJ_FONTS[cfg.font] || VJ_FONTS.gothic;
  const k = (VJ_DETAILS[cfg.detail] || VJ_DETAILS.mid).k;
  const rows = f.fixed ? f.rows : Math.round(f.rows * k);
  return { id: cfg.font in VJ_FONTS ? cfg.font : 'gothic', family: f.family, weight: f.weight, gf: f.gf, rows, dot: !!f.fixed,
    css: `${f.weight} ${rows}px ${f.family}, ${FALLBACK}` };
}
const linked = new Set();
function ensureFont(spec, local) {
  if (local || linked.has(spec.gf)) return;
  linked.add(spec.gf);
  if ([...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.href.includes(spec.gf.split(':')[0]))) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = `https://fonts.googleapis.com/css2?family=${spec.gf}&display=swap`;
  document.head.appendChild(l);
}
async function fontFor(spec, text) {
  if (!document.fonts) return;
  await Promise.race([document.fonts.load(`${spec.weight} ${spec.rows}px ${spec.family}`, text).catch(() => {}), new Promise((r) => setTimeout(r, 700))]);
}
const fontReady = (spec, text) => { try { return document.fonts ? document.fonts.check(`${spec.weight} ${spec.rows}px ${spec.family}`, text) : true; } catch { return true; } };

// 文字列を spec.rows 段のビットマップに起こす → 点の座標と、各点が何文字目か
const rasterCache = new Map();
function rasterize(text, spec) {
  const key = `${spec.id}:${spec.rows}:${fontReady(spec, text) ? 1 : 0}|${text}`;
  if (rasterCache.has(key)) return rasterCache.get(key);
  const c = document.createElement('canvas');
  const g = c.getContext('2d', { willReadFrequently: true });
  g.font = spec.css;
  const chars = [...text];
  const edges = [];
  let acc = '';
  for (const ch of chars) { acc += ch; edges.push(2 + g.measureText(acc).width); }
  const pad = Math.ceil(spec.rows * 0.3);
  const w = Math.max(4, Math.ceil(g.measureText(text).width) + 4);
  const h = spec.rows + pad * 2;
  c.width = w; c.height = h;
  g.font = spec.css;
  g.textBaseline = 'top';
  g.fillStyle = '#fff';
  g.fillText(text, 2, pad);
  const d = g.getImageData(0, 0, w, h).data;
  const thr = spec.dot ? 110 : 120;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  const raw = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > thr) {
        raw.push(x, y);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  let bmp;
  if (maxX < 0) bmp = { w: 1, h: 1, pts: new Int16Array(0), ci: new Uint8Array(0), nChars: 1 };
  else {
    const n = raw.length / 2;
    const pts = new Int16Array(raw.length), ci = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const x = raw[i * 2], y = raw[i * 2 + 1];
      pts[i * 2] = x - minX; pts[i * 2 + 1] = y - minY;
      let k = 0;
      while (k < edges.length - 1 && x >= edges[k]) k++;
      ci[i] = Math.min(255, k);
    }
    bmp = { w: maxX - minX + 1, h: Math.max(spec.rows - 2, maxY - minY + 1), pts, ci, nChars: chars.length };
  }
  if (rasterCache.size > 400) rasterCache.clear();
  rasterCache.set(key, bmp);
  return bmp;
}

// 光るドットの元絵（色ごとに1回だけ作る）
const spriteCache = new Map();
function sprite(color) {
  if (spriteCache.has(color)) return spriteCache.get(color);
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const halo = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  halo.addColorStop(0, color);
  halo.addColorStop(0.36, color);
  halo.addColorStop(0.46, hexA(color, 0.42));
  halo.addColorStop(1, hexA(color, 0));
  g.fillStyle = halo;
  g.fillRect(0, 0, S, S);
  g.fillStyle = 'rgba(255,255,255,.55)'; // 芯を少し白く
  g.beginPath(); g.arc(S / 2, S / 2, S * 0.1, 0, Math.PI * 2); g.fill();
  if (spriteCache.size > 96) spriteCache.clear();
  spriteCache.set(color, c);
  return c;
}
function hexA(color, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
  if (!m) return color;
  const n = parseInt(m[1], 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
}
function hsl(h) { // ネオン用：彩度の高い色を #rrggbb で
  const s = 1, l = 0.62, k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))));
  return '#' + [f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export function createVJ(stage, { localFonts = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'vj-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const grid = document.createElement('canvas'); // 背景の升目（リサイズ時だけ描き直す）

  let W = 0, H = 0, dpr = 1, cell = 10, cols = 0, rows = 0;
  let cfg = { style: 'led', accent: '#3ddc84', accent2: '#62d0ff', transparent: false, calm: false, caption: true, ttl: 8,
    font: 'gothic', detail: 'mid', fx: 'mid' };
  let spec = fontSpec(cfg);
  ensureFont(spec, localFonts);
  let words = [];
  let ripples = [];
  let sparks = [];
  let stars = [];
  let lvl = 0, lvlAt = 0, wordSeq = 0, raf = 0, last = performance.now(), lastSp = null, lastHeroAt = 0;
  let shake = { t0: -1e9, amp: 0 }, flash = { t0: -1e9, a: 0 }, glitchUntil = 0, glitchAmt = 0;
  let frameNo = 0, glitchAt = 0;
  const bornAt = performance.now();
  const labelSpec = fontSpec({ font: 'dot', detail: 'mid' }); // 1px の小さなラベル（新語の元の語・話者名）
  let dtAvg = 16, lite = false; // 1コマの時間の平均。遅い端末では lite（中央の言葉も1枚の絵で描く）にする

  const fxk = () => (cfg.calm ? 0 : (VJ_FX[cfg.fx] || VJ_FX.mid).k);
  const glowy = () => cfg.style !== 'pixel';

  function resize() {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    cell = Math.max(8, Math.round(H / 60));
    cols = Math.ceil(W / cell) + 1; rows = Math.ceil(H / cell) + 1;
    drawGrid();
    stars = Array.from({ length: Math.round(clamp(W * H / 9000, 40, 140)) }, (_, i) => ({ x: Math.random() * W, y: Math.random() * H, z: 0.3 + Math.random() * 1.2, c: PIXEL_PALETTE[i % PIXEL_PALETTE.length] }));
    for (const w of words) w.slot = null;
    layout(false);
  }

  // 背景の升目（リサイズ時と見た目を変えた時だけ描き直す）
  let gridStyle = '';
  function drawGrid() {
    gridStyle = cfg.style;
    grid.width = canvas.width; grid.height = canvas.height;
    const g = grid.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, grid.width, grid.height);
    if (cfg.style === 'micro') { drawMicroGrid(g); return; }
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = 'rgba(255,255,255,.07)';
    const rr = Math.max(0.8, cell * 0.11);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      g.beginPath(); g.arc(x * cell + cell / 2, y * cell + cell / 2, rr, 0, Math.PI * 2); g.fill();
    }
  }
  // 1px：デバイスの 1 ピクセルの点と線だけで、方眼・目盛り・枠を描く
  function drawMicroGrid(g) {
    const CW = grid.width, CH = grid.height, D = dpr;
    const gs = Math.max(12, Math.round(cell * 2.4)) * D; // 方眼の間隔（デバイス px）
    const m = Math.round(14 * D);
    g.fillStyle = '#fff';
    for (let y = m, j = 0; y < CH - m; y += gs, j++) {
      for (let x = m, i = 0; x < CW - m; x += gs, i++) {
        const X = Math.round(x), Y = Math.round(y);
        if (i % 4 === 0 && j % 4 === 0) { // 4 マスごとに小さな十字
          g.globalAlpha = 0.34;
          const a = Math.round(3 * D);
          g.fillRect(X - a, Y, a * 2 + 1, 1); g.fillRect(X, Y - a, 1, a * 2 + 1);
        } else { g.globalAlpha = 0.2; g.fillRect(X, Y, 1, 1); }
      }
    }
    // 外枠と四隅
    g.globalAlpha = 0.12;
    g.fillRect(m, m, CW - 2 * m, 1); g.fillRect(m, CH - m, CW - 2 * m, 1);
    g.fillRect(m, m, 1, CH - 2 * m); g.fillRect(CW - m, m, 1, CH - 2 * m + 1);
    g.globalAlpha = 0.7;
    const k = Math.round(10 * D);
    for (const [x, y, sx, sy] of [[m, m, 1, 1], [CW - m, m, -1, 1], [m, CH - m, 1, -1], [CW - m, CH - m, -1, -1]]) {
      g.fillRect(sx > 0 ? x : x - k + 1, y, k, 1); g.fillRect(x, sy > 0 ? y : y - k + 1, 1, k);
    }
    // 上と左の目盛り（定規）
    g.globalAlpha = 0.32;
    for (let x = m, i = 0; x < CW - m; x += gs / 2, i++) g.fillRect(Math.round(x), m - (i % 10 === 0 ? 7 : i % 2 === 0 ? 4 : 2) * D, 1, (i % 10 === 0 ? 7 : i % 2 === 0 ? 4 : 2) * D);
    for (let y = m, i = 0; y < CH - m; y += gs / 2, i++) g.fillRect(m - (i % 10 === 0 ? 7 : i % 2 === 0 ? 4 : 2) * D, Math.round(y), (i % 10 === 0 ? 7 : i % 2 === 0 ? 4 : 2) * D, 1);
    g.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- 配置
  const reserve = () => (cfg.caption ? H * 0.16 : H * 0.06);
  const rowsK = () => 16 / spec.rows; // 段数が増えても見た目の大きさを揃える
  function heroTarget(w) {
    const avH = H - reserve() - H * 0.12;
    const pitch = Math.max(1.5, Math.min((W * 0.84) / w.bmp.w, (avH * 0.6) / w.bmp.h, (H / 15) * rowsK()));
    return { pitch, x: (W - w.bmp.w * pitch) / 2, y: H * 0.08 + (avH - w.bmp.h * pitch) / 2 };
  }
  // 小さくなった言葉の居場所：中央の言葉と、ほかの小さな言葉に重ならない場所を探して、そこに留まる
  const ov = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  function satPitch(w) { return Math.max(1.3, Math.min(cell * 0.42 * rowsK(), (W * 0.3) / w.bmp.w)); }
  function boxOf(w, pitch, x, y) { const m = cell * 0.8; return { x: x - m, y: y - m, w: w.bmp.w * pitch + 2 * m, h: w.bmp.h * pitch + 2 * m }; }
  function findSpot(w, heroBox, others) {
    let best = null;
    // 空きがなければ、少しずつ小さくして探し直す（重なるよりは小さいほうが読める）
    for (const shrink of [1, 0.85, 0.72]) {
      const pitch = satPitch(w) * shrink;
      const bw = w.bmp.w * pitch, bh = w.bmp.h * pitch;
      const x0 = W * 0.04, x1 = Math.max(x0, W * 0.96 - bw), y0 = H * 0.05, y1 = Math.max(y0, H - reserve() - bh);
      for (let i = 0; i < 160; i++) {
        const x = x0 + Math.random() * (x1 - x0), y = y0 + Math.random() * (y1 - y0);
        const b = boxOf(w, pitch, x, y);
        let hit = ov(b, heroBox) * 50;
        for (const o of others) hit += ov(b, o) * 10;
        const score = hit + Math.abs((y + bh / 2) - H * 0.45) * 0.02 + (1 - shrink) * 40; // わずかに上下の端へ散らす。縮めるのは最後の手段
        if (!best || score < best.score) best = { x, y, pitch, score, hit };
        if (hit === 0 && i > 30) break;
      }
      if (best && best.hit === 0) break;
    }
    return best;
  }
  function layout(animate = true) {
    const live = words.filter((w) => w.state !== 'out');
    const hero = live[live.length - 1];
    let heroBox = { x: W * 0.2, y: H * 0.3, w: W * 0.6, h: H * 0.3 };
    if (hero) {
      const t = heroTarget(hero);
      Object.assign(hero, { tox: t.x, toy: t.y, tpitch: t.pitch, hero: true, slot: null });
      const m = cell;
      heroBox = { x: t.x - m * 2, y: t.y - m * 3, w: hero.bmp.w * t.pitch + 4 * m, h: hero.bmp.h * t.pitch + 6 * m }; // 下はレベルメーターの分も空ける
    }
    const placed = [];
    for (const w of live.slice(0, -1).reverse()) { // 新しい順に場所を確保する
      let s = w.slot;
      if (s) {
        const b = boxOf(w, s.pitch, s.x, s.y);
        if (ov(b, heroBox) > 0 || placed.some((o) => ov(b, o) > 0)) s = null;
      }
      if (!s) s = w.slot = findSpot(w, heroBox, placed);
      placed.push(boxOf(w, s.pitch, s.x, s.y));
      Object.assign(w, { tox: s.x, toy: s.y, tpitch: s.pitch, hero: false });
    }
    if (!animate) for (const w of words) { w.ox = w.tox; w.oy = w.toy; w.pitch = w.tpitch; }
  }

  // 新語の色（1px は白だけ）。虹は鮮やかな色をひとつ選ぶ
  // VJ はいつも黒地なので、暗い色は明るく整えてから光らせる
  function fusionColor(c) {
    const BG = '#040506';
    if (c === 'rainbow') return rainbowColor(Math.random() * 360, BG, 5);
    return tuneColor(/^#[0-9a-f]{6}$/i.test(c || '') ? c : (cfg.accent2 || cfg.accent), BG, 5);
  }
  function colorFor(m) {
    if (cfg.style === 'micro') return '#ffffff'; // 1px は白だけ
    if (m.spc) return m.spc;
    if (cfg.style === 'neon') return hsl((wordSeq * 67 + performance.now() / 50) % 360);
    if (cfg.style === 'pixel') return PIXEL_PALETTE[wordSeq % PIXEL_PALETTE.length];
    return m.kind === 'registered' ? cfg.accent2 : cfg.accent;
  }

  // ---------------------------------------------------------------- 登場のしかた（スタイルごと）
  function entrance(w) {
    const bmp = w.bmp, n = bmp.pts.length / 2;
    w.starts = new Float32Array(n * 2);
    w.delays = new Float32Array(n);
    const t = { x: w.tox, y: w.toy, pitch: w.tpitch };
    const cx = t.x + (bmp.w * t.pitch) / 2, cy = t.y + (bmp.h * t.pitch) / 2;
    for (let i = 0; i < n; i++) {
      const px = bmp.pts[i * 2], py = bmp.pts[i * 2 + 1];
      const tx = t.x + px * t.pitch, ty = t.y + py * t.pitch;
      if (w.src && w.src.length) { // 新語ミックス：親の言葉のドットから飛んでくる
        const k = Math.floor(Math.random() * (w.src.length / 2)) * 2;
        w.starts[i * 2] = w.src[k]; w.starts[i * 2 + 1] = w.src[k + 1];
        w.delays[i] = Math.random() * 260;
      } else if (cfg.style === 'micro') { // 1px：左から書き込みヘッドが走る
        w.starts[i * 2] = tx; w.starts[i * 2 + 1] = ty;
        w.delays[i] = (px / bmp.w) * 560 + Math.random() * 70;
      } else if (cfg.style === 'pixel') { // 上から降ってくる
        w.starts[i * 2] = tx; w.starts[i * 2 + 1] = ty - H * (0.35 + Math.random() * 0.4);
        w.delays[i] = (px / bmp.w) * 260 + Math.random() * 120;
      } else if (cfg.style === 'neon') { // 左から走査線のように点灯
        w.starts[i * 2] = tx; w.starts[i * 2 + 1] = ty;
        w.delays[i] = (px / bmp.w) * 420;
      } else { // 中心から弾けて集まる
        const a = Math.random() * Math.PI * 2, r = (0.25 + Math.random() * 0.6) * Math.max(W, H) * 0.5;
        w.starts[i * 2] = cx + Math.cos(a) * r; w.starts[i * 2 + 1] = cy + Math.sin(a) * r;
        w.delays[i] = Math.random() * 220;
      }
    }
    w.ox = t.x; w.oy = t.y; w.pitch = t.pitch;
    w.t0 = performance.now(); w.state = 'in';
    if (w.spd && w.spd !== 1) for (let i = 0; i < n; i++) w.delays[i] *= w.spd; // 新語の速さ
    w.travel = !!(w.src && w.src.length);
    w.src = null; // 飛んでくるのは最初の登場だけ（書体を替えて組み直すときは普通に出る）
  }

  // ---------------------------------------------------------------- 言葉が来たとき
  async function add(m) {
    const text = (m.text || '').trim();
    if (!text) return;
    await fontFor(spec, text + (m.spn || ''));
    const now = performance.now();
    lvl = Math.max(lvl, 0.55 + Math.random() * 0.35);
    const same = words.find((w) => w.text === text && w.state !== 'out');
    if (same) { // 繰り返した言葉は中央に呼び戻して、コンボとして光らせる
      words.splice(words.indexOf(same), 1);
      words.push(same);
      same.combo = (same.combo || 1) + 1; same.comboAt = now;
      same.flash = now; same.t0 = Math.min(same.t0, now - 2000); same.expires = now + cfg.ttl * 1500;
      lastHeroAt = now;
      layout();
      ripple(same, 1.2 + Math.min(same.combo, 6) * 0.15);
      impact(0.35 + Math.min(same.combo, 5) * 0.1);
      ring(same);
      return;
    }
    wordSeq++;
    const fusion = m.kind === 'fusion';
    const w = { text, kind: m.kind || 'normal', color: fusion && cfg.style !== 'micro' ? fusionColor(m.color) : colorFor(m), spd: fusion ? clamp(+m.k || 1, 0.4, 2) : 1, fixed: !!m.spc || (fusion && !!m.color), bmp: rasterize(text, spec), state: 'in', seed: wordSeq * 17 + text.length,
      ox: 0, oy: 0, pitch: 1, tox: 0, toy: 0, tpitch: 1, expires: now + cfg.ttl * (fusion ? 3600 : 1500), flash: m.kind === 'new' ? now : 0, combo: 1, comboAt: 0, no: wordSeq };
    if (m.spn && m.sp !== lastSp) w.tag = { text: m.spn };
    if (m.sp != null) lastSp = m.sp;
    // 新語ミックス：親の言葉のいまのドットの位置から飛んできて、新しい言葉になる
    if (fusion && Array.isArray(m.from)) {
      const parents = words.filter((x) => x.state !== 'out' && m.from.includes(x.text));
      w.tag = { text: m.from.join('×') };
      w.from = parents.map((p) => ({ x: p.ox + (p.bmp.w * p.pitch) / 2, y: p.oy + (p.bmp.h * p.pitch) / 2 }));
      const src = [];
      for (const p of parents) for (let i = 0; i < p.bmp.pts.length; i += 2) src.push(p.ox + p.bmp.pts[i] * p.pitch, p.oy + p.bmp.pts[i + 1] * p.pitch);
      w.src = src;
    }
    // 中央の言葉は 0.9 秒に1回まで入れ替える（立て続けに来た言葉は、最初から周りに小さく出す。新語はいつも中央）
    const important = w.kind === 'new' || w.kind === 'registered' || fusion;
    const hero = [...words].reverse().find((x) => x.state !== 'out');
    const asSat = !fusion && hero && now - lastHeroAt < (important ? 400 : 900);
    if (asSat) words.splice(words.indexOf(hero), 0, w);
    else { words.push(w); lastHeroAt = now; }
    // 多すぎる分は退場
    const live = words.filter((x) => x.state !== 'out');
    const maxSat = H < 420 ? 3 : MAX_SAT; // 小さな画面では漂う言葉を減らす
    let extra = live.length - (maxSat + 1);
    for (const x of live) { if (extra <= 0) break; if (x === w) continue; leave(x, now); extra--; } // 古い順に退場
    if (fusion) { // 新語は同時に5つまで。5つになったら、いちばん古い新語をいつもより早めに消す
      const fz = words.filter((x) => x.kind === 'fusion' && x.state !== 'out' && x !== w);
      while (fz.length + 1 > FZ_MAX) leave(fz.shift(), now);
      if (fz.length + 1 >= FZ_MAX && fz.length) fz[0].expires = Math.min(fz[0].expires, now + FZ_HURRY);
    }
    layout();
    entrance(w);
    const cx = w.tox + (w.bmp.w * w.tpitch) / 2, cy = w.toy + (w.bmp.h * w.tpitch) / 2;
    if (!asSat) { ripple(w, w.kind === 'new' || fusion ? 1.6 : 1); glitchAt = now; }
    if (important) burst(cx, cy, w.color, w.kind === 'new' || fusion ? 48 : 28);
    if ((w.kind === 'new' || fusion) && !asSat) impact(0.85);
    kick();
  }
  // 新語ミックス（表示側から呼ぶ）：m = { text, from: [元の語, 元の語] }
  function fuse(m) { return add({ ...m, kind: 'fusion' }); }

  function ripple(w, strength) {
    ripples.push({ x: w.tox + (w.bmp.w * w.tpitch) / 2, y: w.toy + (w.bmp.h * w.tpitch) / 2, t0: performance.now(), color: w.color, s: strength });
    if (ripples.length > 4) ripples.shift();
  }
  function burst(x, y, color, n = 28) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.15 + Math.random() * 0.5;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: performance.now(), life: 700 + Math.random() * 600, color });
    }
  }
  function ring(w) { // コンボの輪：言葉のまわりに火花をぐるりと
    const cx = w.tox + (w.bmp.w * w.tpitch) / 2, cy = w.toy + (w.bmp.h * w.tpitch) / 2;
    const rx = (w.bmp.w * w.tpitch) / 2 + cell * 2, ry = (w.bmp.h * w.tpitch) / 2 + cell * 2;
    const n = 36 + Math.min(w.combo, 6) * 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2, v = 0.18 + Math.random() * 0.12;
      sparks.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: performance.now(), life: 650 + Math.random() * 300, color: i % 3 ? w.color : '#ffffff' });
    }
  }
  // 画面全体の手応え：揺れ・閃光・グリッチ（「動きを控えめに」では出さない）
  function impact(strength) {
    const f = fxk();
    if (!f) return;
    const now = performance.now();
    shake = { t0: now, amp: strength * f };
    flash = { t0: now, a: 0.2 * strength * f };
    glitchUntil = now + 220 + 260 * strength;
    glitchAmt = strength;
  }
  function leave(w, now) {
    if (w.state === 'out') return;
    w.state = 'out'; w.out0 = now;
    const n = w.bmp.pts.length / 2;
    w.vel = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.05 + Math.random() * 0.25;
      w.vel[i * 2] = Math.cos(a) * v; w.vel[i * 2 + 1] = Math.sin(a) * v - (cfg.style === 'pixel' ? 0.05 : 0);
    }
  }

  function clear() { const now = performance.now(); for (const w of words) leave(w, now); lastSp = null; kick(); }
  function level(v) { lvl = Math.max(lvl * 0.6, clamp(v, 0, 1)); lvlAt = performance.now(); kick(); }

  // ---------------------------------------------------------------- 描画の部品
  function paintDot(g2, x, y, size, color, alpha, glowK) {
    if (alpha <= 0.01) return;
    g2.globalAlpha = Math.min(1, alpha);
    if (cfg.style === 'pixel') {
      g2.fillStyle = color;
      g2.fillRect(x, y, size * 0.86, size * 0.86);
    } else {
      const g = size * glowK;
      g2.drawImage(sprite(color), x + size * 0.43 - g / 2, y + size * 0.43 - g / 2, g, g);
    }
  }
  const drawDot = (x, y, size, color, alpha, glowK) => paintDot(ctx, x, y, size, color, alpha, glowK);
  // 止まっている周りの言葉は、1枚の絵にしておいて貼るだけにする（ドットを毎コマ描かない）
  function stillImage(w, P, color, gk) {
    const key = `${P.toFixed(2)}|${color}|${gk.toFixed(2)}|${cfg.style}|${dpr}`;
    if (w.cache && w.cache.key === key) return w.cache;
    const pad = Math.ceil(P * gk), cw = w.bmp.w * P + pad * 2, ch = w.bmp.h * P + pad * 2;
    const c = (w.cache && w.cache.c) || document.createElement('canvas');
    c.width = Math.ceil(cw * dpr); c.height = Math.ceil(ch * dpr);
    const g = c.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, cw, ch);
    g.globalCompositeOperation = glowy() ? 'lighter' : 'source-over';
    const n = w.bmp.pts.length / 2;
    for (let i = 0; i < n; i++) paintDot(g, pad + w.bmp.pts[i * 2] * P, pad + w.bmp.pts[i * 2 + 1] * P, P, color, 1, gk);
    w.cache = { key, c, pad, w: cw, h: ch };
    return w.cache;
  }
  // 光のにじみ：段数が多い（細かい）ほど控えめにして、ドット同士がつぶれないようにする
  const glowFor = () => {
    const fine = clamp((spec.rows - 16) / 16, 0, 1);
    if (cfg.style === 'neon') return 1.9 - fine * 0.5;
    return 1.6 - fine * 0.42;
  };

  // コンボの数字：中央の言葉の右上に「×3」
  function drawCombo(w, x0, y0, P, base, gk, now) {
    const f = fxk(), age = now - w.comboAt;
    const bmp = rasterize(`×${w.combo}`, spec);
    const bp = Math.max(1.4, P * 0.4) * (1 + 0.9 * Math.exp(-age / 160) * Math.max(f, 0.3));
    // 言葉の右上の外側に置く（上に余白がなければ右側へ）
    let bx = x0 + w.bmp.w * P - bmp.w * bp, by = y0 - bmp.h * bp - P * 3;
    if (by < cell) { bx = x0 + w.bmp.w * P + P * 3; by = y0; }
    bx = clamp(bx, cell, W - bmp.w * bp - cell); by = Math.max(cell, by);
    const bc = age < 260 ? '#ffffff' : w.color;
    const bn = bmp.pts.length / 2;
    for (let i = 0; i < bn; i++) drawDot(bx + bmp.pts[i * 2] * bp, by + bmp.pts[i * 2 + 1] * bp, bp, bc, base, gk);
  }

  // ステージの光線（LED）：下から照らすライト。声が大きいほど明るく
  function drawBeams(now, f, lv) {
    const n = 4;
    for (let i = 0; i < n; i++) {
      const bx = W * (0.1 + (0.8 * i) / (n - 1));
      const ang = Math.sin(now / 1900 + i * 1.7) * 0.42 + (i < n / 2 ? 0.14 : -0.14);
      const len = H * 1.3, spread = 0.09 + 0.05 * lv;
      const a = (0.05 + 0.2 * lv) * f;
      const color = i % 2 ? cfg.accent2 : cfg.accent;
      const ex = bx + Math.sin(ang) * len, ey = H - Math.cos(ang) * len;
      const gr = ctx.createLinearGradient(bx, H, ex, ey);
      gr.addColorStop(0, hexA(color, a)); gr.addColorStop(1, hexA(color, 0));
      ctx.globalAlpha = 1;
      ctx.fillStyle = gr;
      ctx.beginPath();
      ctx.moveTo(bx, H + 4);
      ctx.lineTo(bx + Math.sin(ang - spread) * len, H - Math.cos(ang - spread) * len);
      ctx.lineTo(bx + Math.sin(ang + spread) * len, H - Math.cos(ang + spread) * len);
      ctx.closePath();
      ctx.fill();
    }
  }
  // シンセウェーブの床（ネオン）：地平線から手前へ流れる升目
  function drawFloor(now, f, lv) {
    const hz = H * 0.68, vx = W / 2;
    const c = cfg.accent2;
    ctx.globalAlpha = 1;
    const sky = ctx.createLinearGradient(0, hz - H * 0.18, 0, hz);
    sky.addColorStop(0, hexA(c, 0)); sky.addColorStop(1, hexA(c, 0.16 * f));
    ctx.fillStyle = sky; ctx.fillRect(0, hz - H * 0.18, W, H * 0.18);
    ctx.lineWidth = 1;
    for (let i = -14; i <= 14; i++) {
      const bx = vx + i * W * 0.085;
      ctx.strokeStyle = hexA(c, 0.22 * f);
      ctx.beginPath(); ctx.moveTo(vx + (bx - vx) * 0.04, hz + (H - hz) * 0.04); ctx.lineTo(bx, H); ctx.stroke();
    }
    const N = 10, phase = (now / (900 - 500 * lv)) % 1;
    for (let k = 0; k < N; k++) {
      const z = (k + phase) / N, y = hz + (H - hz) * Math.pow(z, 2.1);
      ctx.strokeStyle = hexA(c, (0.06 + 0.3 * z) * f);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.strokeStyle = hexA(cfg.accent, 0.5 * f); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, hz); ctx.lineTo(W, hz); ctx.stroke();
  }
  // 星空（ピクセル）：横に流れる四角い星。声が大きいほど速く
  function drawStars(dt, f, lv) {
    const sp = (0.015 + 0.09 * lv) * f;
    for (const s of stars) {
      s.x -= sp * s.z * dt;
      if (s.x < -4) { s.x = W + Math.random() * 20; s.y = Math.random() * H; }
      const sz = Math.max(1.5, cell * 0.22 * s.z);
      ctx.globalAlpha = 0.18 + 0.32 * (s.z / 1.5);
      ctx.fillStyle = s.c;
      ctx.fillRect(Math.round(s.x / 2) * 2, Math.round(s.y / 2) * 2, sz, sz);
    }
  }

  // ---------------------------------------------------------------- 1コマ
  function frame() {
    raf = 0;
    const now = performance.now();
    const dt = Math.min(64, now - last);
    last = now;
    frameNo++;
    if (cfg.style === 'micro') { frameMicro(now, dt); raf = requestAnimationFrame(frame); return; }
    dtAvg += (dt - dtAvg) * 0.03;
    if (!lite && dtAvg > 27) lite = true;        // 約37fps を下回り続けたら軽くする
    else if (lite && dtAvg < 17.5) lite = false; // 余裕が戻ったら元に戻す
    const f = fxk();
    // 揺れ
    let sx = 0, sy = 0;
    const sAge = now - shake.t0;
    if (f && sAge < 380) { const d = (1 - sAge / 380) * shake.amp * cell * 1.4; sx = (Math.random() - 0.5) * d; sy = (Math.random() - 0.5) * d; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (cfg.transparent) ctx.clearRect(0, 0, W, H);
    else { ctx.fillStyle = '#040506'; ctx.fillRect(0, 0, W, H); }
    ctx.setTransform(dpr, 0, 0, dpr, sx * dpr, sy * dpr);
    if (!cfg.transparent) ctx.drawImage(grid, 0, 0, W, H);

    // 声の大きさ：届かなくなったら少しずつ落とす
    if (now - lvlAt > 1200) lvl *= Math.pow(0.985, dt / 16);
    const lv = clamp(lvl * 1.15, 0, 1);
    const gk = glowFor();

    // 背景の演出（OBS に透過で重ねるときは出さない）
    if (!cfg.transparent && f) {
      ctx.globalCompositeOperation = cfg.style === 'pixel' ? 'source-over' : 'lighter';
      if (cfg.style === 'led') drawBeams(now, f, lv);
      else if (cfg.style === 'neon') drawFloor(now, f, lv);
      else if (cfg.style === 'pixel') drawStars(dt, f, lv);
    }
    ctx.globalCompositeOperation = glowy() ? 'lighter' : 'source-over';

    // 波紋：升目のドットを帯状に光らせる
    const diag = Math.hypot(W, H);
    ripples = ripples.filter((r) => now - r.t0 < 1800);
    if (ripples.length && !cfg.calm) {
      const band = cell * 2.2;
      for (const r of ripples) {
        const age = (now - r.t0) / 1800;
        const rad = easeOut(age) * diag * 0.75;
        const x0 = Math.max(0, Math.floor((r.x - rad - band) / cell)), x1 = Math.min(cols, Math.ceil((r.x + rad + band) / cell));
        const y0 = Math.max(0, Math.floor((r.y - rad - band) / cell)), y1 = Math.min(rows, Math.ceil((r.y + rad + band) / cell));
        for (let gy = y0; gy < y1; gy++) for (let gx = x0; gx < x1; gx++) {
          const px = gx * cell + cell / 2, py = gy * cell + cell / 2;
          const d = Math.abs(Math.hypot(px - r.x, py - r.y) - rad);
          if (d > band) continue;
          const a = (1 - d / band) * (1 - age) * 0.5 * r.s;
          drawDot(px - cell * 0.22, py - cell * 0.22, cell * 0.5, r.color, a, 1.6);
        }
      }
    }

    // イコライザー（上下の端）
    const eqColor = words.length ? words[words.length - 1].color : cfg.accent;
    const maxRows = 5;
    if (!cfg.calm) {
      for (let gx = 0; gx < cols; gx++) {
        const n = 0.5 + 0.5 * Math.sin(gx * 0.55 + now / 210) * Math.sin(gx * 0.17 - now / 530);
        const h = Math.round(lvl * maxRows * (0.25 + 0.75 * n));
        for (let k = 0; k < h; k++) {
          const a = 0.16 + 0.34 * (1 - k / maxRows);
          drawDot(gx * cell + cell * 0.25, (rows - 2 - k) * cell + cell * 0.25, cell * 0.5, eqColor, a * 0.8, 1.6);
          drawDot((cols - 1 - gx) * cell + cell * 0.25, k * cell + cell * 0.25, cell * 0.5, eqColor, a * 0.55, 1.6);
        }
      }
    }

    // 言葉
    const k = 1 - Math.pow(0.0025, dt / 1000); // 位置と大きさのばね（約0.4秒で追いつく）
    words = words.filter((w) => !(w.state === 'out' && now - w.out0 > 900));
    const liveCount = words.filter((w) => w.state !== 'out').length;
    const glitching = f > 0 && now < glitchUntil;
    const gSeed = Math.floor(now / 55);
    let heroW = null;
    for (const w of words) {
      if (w.state !== 'out' && !w.hero && now > w.expires) leave(w, now);
      if (w.state !== 'out' && w.hero && liveCount === 1 && now > w.expires + cfg.ttl * 1500) leave(w, now);
      w.ox += (w.tox - w.ox) * k; w.oy += (w.toy - w.oy) * k; w.pitch += (w.tpitch - w.pitch) * k;
      const isHero = w.hero && w.state !== 'out';
      if (isHero) heroW = w;
      const n = w.bmp.pts.length / 2;
      const base = w.state === 'out' ? Math.max(0, 1 - (now - w.out0) / 900) : isHero ? 1 : 0.62;
      const flashK = w.flash ? Math.max(0, 1 - (now - w.flash) / 500) : 0;
      const color = flashK > 0.5 ? '#ffffff' : w.color;
      const c = cfg.style === 'neon' && !flashK && !w.fixed ? hsl((w.seed * 37 + now / 40) % 360) : color; // ネオンはゆっくり色が移ろう
      const dur = (cfg.calm ? 300 : cfg.style === 'pixel' ? 620 : 760) * (w.spd || 1);
      // コンボの「パンチ」：一瞬大きく膨らむ
      const punch = w.comboAt ? Math.exp(-(now - w.comboAt) / 200) : 0;
      const P = w.pitch * (1 + 0.16 * punch * Math.max(f, 0.3));
      const cxw = w.ox + (w.bmp.w * w.pitch) / 2, cyw = w.oy + (w.bmp.h * w.pitch) / 2;
      // 漂う：周りの言葉はゆっくり上下に揺れる
      const drift = !isHero && w.state !== 'out' ? Math.sin(now / 1700 + w.seed) * cell * 0.35 * f : 0;
      const x0 = cxw - (w.bmp.w * P) / 2, y0 = cyw - (w.bmp.h * P) / 2 + drift;
      if ((!isHero || (lite && !glitching)) && w.state === 'hold' && Math.abs(w.pitch - w.tpitch) < w.tpitch * 0.01) {
        // ネオンの色の移ろいは 12 度刻みにして、絵の描き直しを0.5秒に1回程度に抑える
        const sc = cfg.style === 'neon' && !flashK && !w.fixed ? hsl(Math.round(((w.seed * 37 + now / 40) % 360) / 12) * 12) : color;
        const img = stillImage(w, w.tpitch, sc, gk);
        const zoom = isHero ? (P / w.tpitch) * (1 + 0.05 * f * lv) : 1;
        ctx.globalAlpha = base;
        ctx.drawImage(img.c, cxw - (img.w * zoom) / 2, cyw - (img.h * zoom) / 2 + drift, img.w * zoom, img.h * zoom);
        if (isHero) heroW = w;
        if (isHero && w.combo > 1) drawCombo(w, x0, y0, P, base, gk, now);
        continue;
      }
      const live = isHero && w.state !== 'in' && f > 0; // 登場が終わった中央の言葉だけが「動き」を持つ
      const glint = ((now % 2600) / 2600) * (w.bmp.w + w.bmp.h + 24) - 12;
      const hopChar = Math.floor(now / 260) % Math.max(1, w.bmp.nChars), hopT = (now % 260) / 260;
      const flicker = cfg.style === 'neon' && isHero && f > 0 && hash(gSeed, w.seed) < 0.025 * f ? 0.35 : 1;
      for (let i = 0; i < n; i++) {
        const px = w.bmp.pts[i * 2], py = w.bmp.pts[i * 2 + 1];
        let x = x0 + px * P, y = y0 + py * P, a = base * flicker, size = P;
        if (w.state === 'in' && w.starts) {
          const p = clamp((now - w.t0 - (cfg.calm ? 0 : w.delays[i])) / dur, 0, 1);
          if (p < 1) {
            if (cfg.calm) a *= p;
            else if (cfg.style === 'neon' && !w.travel) { a *= p > 0 ? Math.min(1, p * 3) * (p < 0.3 ? (Math.random() < 0.6 ? 1 : 0.2) : 1) : 0; }
            else {
              const e = cfg.style === 'pixel' ? easeBack(p) : easeOut(p);
              x = w.starts[i * 2] + (x - w.starts[i * 2]) * e;
              y = w.starts[i * 2 + 1] + (y - w.starts[i * 2 + 1]) * e;
              a *= Math.min(1, p * 2.2);
            }
          }
        } else if (w.state === 'out' && w.vel) {
          const t = now - w.out0;
          x += w.vel[i * 2] * t; y += w.vel[i * 2 + 1] * t + (cfg.style === 'pixel' ? 0.0006 * t * t : 0);
        }
        if (live) {
          // 声に合わせて脈打つ：波が文字の上を流れる
          const wave = 0.5 + 0.5 * Math.sin(now / 130 - px * 0.45 - py * 0.18);
          size = P * (1 + 0.34 * f * lv * wave);
          if (cfg.style === 'neon') y += Math.sin(now / 260 + px * 0.3) * P * 0.7 * f;
          else if (cfg.style === 'pixel' && w.bmp.ci[i] === hopChar) y -= Math.round(Math.sin(hopT * Math.PI) * 3 * f) * P; // 8ビット風に1字ずつ跳ねる
        }
        if (glitching && isHero) { // グリッチ：横の帯ごとにずれる
          const band = Math.floor(py / 3);
          if (hash(band, gSeed) > 0.62) x += (hash(band + 9, gSeed) - 0.5) * P * 10 * glitchAmt * f;
        }
        const off = (size - P) / 2;
        drawDot(x - off, y - off, size, c, a, gk);
        if (live && cfg.style === 'led') { // 光の筋が斜めに走る
          const d = px + py * 0.6 - glint;
          if (d > -2.5 && d < 2.5) drawDot(x - off, y - off, size, '#ffffff', a * (1 - Math.abs(d) / 2.5) * 0.8 * f, gk);
        }
      }
      if (w.state === 'in' && now - w.t0 > dur + 500) w.state = 'hold';

      if (isHero && w.combo > 1) drawCombo(w, x0, y0, P, base, gk, now);
      // 話者ラベル：言葉の左上に小さなドット文字で
      if (w.tag && isHero) {
        const tb = rasterize(w.tag.text, spec);
        const tp = Math.max(1.2, Math.min(P * 0.24, cell * 0.36 * rowsK()));
        const tx = x0, ty = y0 - tb.h * tp - tp * 3;
        const tn = tb.pts.length / 2;
        for (let i = 0; i < tn; i++) drawDot(tx + tb.pts[i * 2] * tp, ty + tb.pts[i * 2 + 1] * tp, tp, w.color, base * 0.9, gk);
      }
    }

    // 中央の言葉の下に、声の大きさのメーター
    if (heroW && f && !cfg.transparent) {
      const P = heroW.pitch, wpx = heroW.bmp.w * P;
      const cnt = clamp(Math.round(wpx / (cell * 0.9)), 10, 48), step = wpx / cnt;
      const yv = heroW.oy + heroW.bmp.h * P + cell * 1.4;
      const lit = Math.round(lv * cnt);
      const ds = Math.min(step * 0.7, cell * 0.6);
      for (let i = 0; i < cnt; i++) {
        const on = i < lit;
        const col = !on ? heroW.color : i > cnt * 0.85 ? '#ff4b3e' : i > cnt * 0.65 ? '#ffd23f' : heroW.color;
        drawDot(heroW.ox + i * step + (step - ds) / 2, yv, ds, col, on ? 0.9 : 0.1, 1.5);
      }
    }

    // 火花
    sparks = sparks.filter((s) => now - s.t0 < s.life);
    for (const s of sparks) {
      const t = now - s.t0, a = 1 - t / s.life;
      drawDot(s.x + s.vx * t - cell * 0.2, s.y + s.vy * t + 0.00012 * t * t - cell * 0.2, cell * 0.45, s.color, a, 1.6);
    }

    // 仕上げの重ね：インパクトの閃光
    if (!cfg.transparent && f) {
      const fa = now - flash.t0 < 260 ? flash.a * (1 - (now - flash.t0) / 260) : 0;
      if (fa > 0.005) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = fa; ctx.fillStyle = '#ffffff'; ctx.fillRect(-20, -20, W + 40, H + 40); }
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  // ---- 1px（モノクロ・テクノ）：デバイスの 1 ピクセルの点と線だけで組む。色は白だけ
  function frameMicro(now, dt) {
    const D = dpr, P = Math.max(1, Math.round(D)); // P＝CSS の 1px（Retina では 2 デバイス px）
    const CW = canvas.width, CH = canvas.height;
    const R = (v) => Math.round(v * D);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (cfg.transparent) ctx.clearRect(0, 0, CW, CH);
    else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CW, CH); ctx.drawImage(grid, 0, 0); }
    ctx.fillStyle = '#fff';
    const A = (a) => { ctx.globalAlpha = Math.max(0, Math.min(1, a)); };
    if (now - lvlAt > 1200) lvl *= Math.pow(0.985, dt / 16);
    const calm = cfg.calm;
    sparks = []; // 1px では火花を使わない

    // 走査線（縦にゆっくり横切る 1px の線）
    if (!calm) {
      A(0.28); ctx.fillRect(Math.round(((now / 3600) % 1) * CW), 0, 1, CH);
      A(0.1); ctx.fillRect(0, Math.round(((now / 5300) % 1) * CH), CW, 1);
    }

    // 言葉の位置と寿命
    const k = 1 - Math.pow(0.0025, dt / 1000);
    words = words.filter((w) => !(w.state === 'out' && now - w.out0 > 900));
    const live = words.filter((w) => w.state !== 'out');
    const hero = live[live.length - 1];
    for (const w of words) {
      if (w.state !== 'out' && !w.hero && now > w.expires) leave(w, now);
      if (w.state !== 'out' && w.hero && live.length === 1 && now > w.expires + cfg.ttl * 1500) leave(w, now);
      w.ox += (w.tox - w.ox) * k; w.oy += (w.toy - w.oy) * k; w.pitch += (w.tpitch - w.pitch) * k;
    }
    const heroBox = hero ? { x: hero.ox, y: hero.oy, w: hero.bmp.w * hero.pitch, h: hero.bmp.h * hero.pitch } : null;

    // 小さな言葉から中央の言葉へ、点線の引き出し線
    if (heroBox) {
      const hx = heroBox.x + heroBox.w / 2, hy = heroBox.y + heroBox.h / 2;
      for (const w of live) {
        if (w === hero) continue;
        const bx = w.ox + (w.bmp.w * w.pitch) / 2, by = w.oy + (w.bmp.h * w.pitch) / 2;
        dotted(bx, by, clampTo(heroBox, bx, by), 0.22, 4);
      }
    }
    // 新語ミックス：親の言葉から生まれた言葉へ、細い系統線（だんだん薄れる）
    for (const w of live) {
      if (!w.from || !w.from.length) continue;
      const age = (now - w.t0) / 2600;
      if (age > 1) continue;
      const cx = w.ox + (w.bmp.w * w.pitch) / 2, cy = w.oy + (w.bmp.h * w.pitch) / 2;
      for (const f of w.from) dotted(f.x, f.y, { x: cx, y: cy }, 0.75 * (1 - age), 2);
    }

    // 言葉そのもの
    for (const w of words) {
      const n = w.bmp.pts.length / 2;
      const big = w.hero && w.pitch >= 5;
      const base = w.state === 'out' ? Math.max(0, 1 - (now - w.out0) / 900) : w.hero ? 1 : 0.62;
      const flash = w.flash ? Math.max(0, 1 - (now - w.flash) / 500) : 0;
      const dur = (calm ? 300 : 620) * (w.spd || 1);
      const gap = Math.max(1.5, w.pitch * 0.24);
      const s = Math.max(P, R(w.pitch - gap));
      let head = -1; // 書き込みヘッドの位置（登場中だけ）
      for (let i = 0; i < n; i++) {
        const px = w.bmp.pts[i * 2], py = w.bmp.pts[i * 2 + 1];
        let x = w.ox + px * w.pitch, y = w.oy + py * w.pitch, a = base, writing = false;
        if (w.state === 'in' && w.starts) {
          const p = clamp((now - w.t0 - (calm ? 0 : w.delays[i])) / dur, 0, 1);
          if (p <= 0) continue;
          if (p < 1) {
            writing = true;
            if (w.travel) { const e = easeOut(p); x = w.starts[i * 2] + (x - w.starts[i * 2]) * e; y = w.starts[i * 2 + 1] + (y - w.starts[i * 2 + 1]) * e; }
            else head = Math.max(head, x + w.pitch);
            if (calm) a *= p;
          }
        } else if (w.state === 'out' && w.vel) {
          const t = now - w.out0;
          x += w.vel[i * 2] * t; y += w.vel[i * 2 + 1] * t;
          A(a * 0.9); ctx.fillRect(R(x), R(y), P, P);
          continue;
        }
        const X = R(x), Y = R(y);
        if (!big || writing && w.travel) { A(a); ctx.fillRect(X, Y, w.hero ? Math.max(P, Math.round(s * 0.5)) : P, w.hero ? Math.max(P, Math.round(s * 0.5)) : P); continue; }
        if (writing || flash > 0.2) { A(a); ctx.fillRect(X, Y, s, s); continue; } // 書き込み中・繰り返しは塗りつぶし
        A(a * 0.95); // ふだんは 1px の中抜きの四角と、中心の点
        ctx.fillRect(X, Y, s, 1); ctx.fillRect(X, Y + s - 1, s, 1); ctx.fillRect(X, Y, 1, s); ctx.fillRect(X + s - 1, Y, 1, s);
        A(a * 0.8); ctx.fillRect(X + (s >> 1), Y + (s >> 1), 1, 1);
      }
      if (w.state === 'in' && now - w.t0 > dur + 700) w.state = 'hold';
      if (head > 0 && !calm) { A(0.85); ctx.fillRect(R(head), R(w.oy - w.pitch * 2), 1, R(w.bmp.h * w.pitch + w.pitch * 4)); }
      if (w.state === 'out') continue;
      if (w === hero) heroFrame(w, now);
      else { A(0.42 * base); text3(`#${String(w.no).padStart(3, '0')}`, R(w.ox), R(w.oy) - 8 * P, P); }
    }

    // 波紋：中央から 1px の四角が広がる
    ripples = ripples.filter((r) => now - r.t0 < 1400);
    if (!calm) for (const r of ripples) {
      const age = (now - r.t0) / 1400, e = easeOut(age), half = e * Math.max(W, H) * 0.6;
      A((1 - age) * 0.5); strokeBox(R(r.x - half), R(r.y - half * 0.56), R(half * 2), R(half * 1.12));
    }

    // グリッチ：新しい言葉が出た直後だけ、横の帯を少しずらす
    if (!calm && (now - glitchAt < 260 || now < glitchUntil)) {
      ctx.globalAlpha = 1;
      for (let i = 0; i < 4; i++) {
        const y = Math.floor(Math.random() * CH), h = Math.max(1, Math.floor(Math.random() * 14 * D)), dx = Math.round((Math.random() - 0.5) * 36 * D);
        ctx.drawImage(canvas, 0, y, CW, h, dx, y, CW, h);
      }
    }

    // 計器：左上の読み出し、右上のフレーム番号、下のオシロスコープ、右端のレベル
    const m = R(22), lh = 9 * P;
    A(0.75); text3('KANPE.VJ / 1PX MONO', m, m, P);
    A(0.5);
    const tsec = (now - bornAt) / 1000;
    const tc = `T+${String(Math.floor(tsec / 60)).padStart(2, '0')}:${String(Math.floor(tsec % 60)).padStart(2, '0')}.${String(Math.floor((tsec % 1) * 100)).padStart(2, '0')}`;
    text3(tc, m, m + lh, P);
    const dots = live.reduce((t, w) => t + w.bmp.pts.length / 2, 0);
    text3(`WORDS ${String(live.length).padStart(2, '0')}  DOTS ${String(dots).padStart(5, '0')}`, m, m + lh * 2, P);
    text3('LVL', m, m + lh * 3, P);
    for (let i = 0; i < 24; i++) { A(i < lvl * 24 ? 0.8 : 0.16); ctx.fillRect(m + 16 * P + i * 3 * P, m + lh * 3, P, 5 * P); }
    A(0.5); text3(`FR ${String(frameNo % 1e6).padStart(6, '0')}`, CW - m, m, P, 'right');
    text3(cfg.calm ? 'MODE CALM' : 'MODE LIVE', CW - m, m + lh, P, 'right');
    if (hero) { // 中央の言葉の文字コードを流す
      A(0.32);
      const codes = [...hero.text].map((c) => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0'));
      for (let i = 0; i < Math.min(6, codes.length); i++) text3(codes[i], CW - m, m + lh * (3 + i), P, 'right');
    }
    if (!calm) { // オシロスコープ
      const y0 = CH - R(8), amp = R(6) * (0.15 + lvl);
      A(0.55);
      for (let x = m; x < CW - m; x += 2 * P) {
        const v = Math.sin(x / (D * 7) + now / 90) * Math.sin(x / (D * 41) - now / 400) * (0.6 + 0.4 * Math.sin(now / 130 + x));
        ctx.fillRect(x, Math.round(y0 + v * amp), P, P);
      }
    }
    A(1);
  }
  // 1px の四角の枠
  function strokeBox(x, y, w, h) { ctx.fillRect(x, y, w, 1); ctx.fillRect(x, y + h, w + 1, 1); ctx.fillRect(x, y, 1, h); ctx.fillRect(x + w, y, 1, h); }
  // 点線（CSS px 座標）
  function dotted(x0, y0, to, alpha, step) {
    const dx = to.x - x0, dy = to.y - y0, len = Math.hypot(dx, dy);
    if (len < 2) return;
    ctx.globalAlpha = alpha;
    for (let d = 0; d < len; d += step) ctx.fillRect(Math.round((x0 + (dx * d) / len) * dpr), Math.round((y0 + (dy * d) / len) * dpr), 1, 1);
  }
  function clampTo(b, x, y) { return { x: clamp(x, b.x, b.x + b.w), y: clamp(y, b.y, b.y + b.h) }; }
  // 中央の言葉の枠：四隅のかぎ、座標、種類のラベル
  function heroFrame(w, now) {
    const D = dpr, P = Math.max(1, Math.round(D)), R = (v) => Math.round(v * D);
    const mg = Math.max(6, w.pitch * 0.9);
    const x = R(w.ox - mg), y = R(w.oy - mg), bw = R(w.bmp.w * w.pitch + mg * 2), bh = R(w.bmp.h * w.pitch + mg * 2);
    const age = Math.min(1, (now - w.t0) / 500);
    ctx.globalAlpha = 0.14 * age; strokeBox(x, y, bw, bh);
    ctx.globalAlpha = 0.85 * age;
    const k = Math.min(R(14), bw / 3);
    for (const [cx, cy, sx, sy] of [[x, y, 1, 1], [x + bw, y, -1, 1], [x, y + bh, 1, -1], [x + bw, y + bh, -1, -1]]) {
      ctx.fillRect(sx > 0 ? cx : cx - k + 1, cy, k, 1); ctx.fillRect(cx, sy > 0 ? cy : cy - k + 1, 1, k);
    }
    const label = (w.kind === 'fusion' ? '[MIX]' : w.kind === 'new' ? '[NEW]' : w.kind === 'registered' ? '[REG]' : `[${String(w.no).padStart(4, '0')}]`) + (w.combo > 1 ? ` X${w.combo}` : '');
    ctx.globalAlpha = 0.8 * age; text3(label, x, y - 9 * P, P);
    ctx.globalAlpha = 0.45 * age;
    text3(`X${String(Math.round(w.ox)).padStart(4, '0')} Y${String(Math.round(w.oy)).padStart(4, '0')}`, x + bw, y - 9 * P, P, 'right');
    // 新語ミックスの親の言葉・話者名は、ドット書体を 1px の点で
    if (w.tag) {
      ctx.globalAlpha = 0.75 * age;
      const pts = rasterize(w.tag.text, labelSpec).pts, ty = y + bh + 4 * P;
      for (let i = 0; i < pts.length; i += 2) ctx.fillRect(x + pts[i] * P, ty + pts[i + 1] * P, P, P);
    }
  }
  // 3×5 ピクセルの英数字（計器の文字）
  function text3(str, x, y, s, align) {
    const chars = String(str).toUpperCase();
    let cx = align === 'right' ? x - chars.length * 4 * s : x;
    for (const ch of chars) {
      const g = FONT3[ch];
      if (g) for (let r = 0; r < 5; r++) for (let c = 0; c < 3; c++) if (g.charCodeAt(r * 3 + c) === 49) ctx.fillRect(cx + c * s, y + r * s, s, s);
      cx += 4 * s;
    }
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  // 書体・細かさが変わったら、いま出ている言葉を新しい書体で組み直して、もう一度登場させる
  async function refont() {
    const live = words.filter((w) => w.state !== 'out');
    await fontFor(spec, live.map((w) => w.text + (w.tag ? w.tag.text : '')).join('') + '×0123456789');
    for (const w of live) w.bmp = rasterize(w.text, spec);
    for (const w of words) w.slot = null;
    layout(false);
    for (const w of live) entrance(w);
    kick();
  }
  function configure(next) {
    cfg = { ...cfg, ...next };
    if (!STYLES.includes(cfg.style)) cfg.style = 'micro';
    if (cfg.style !== gridStyle) drawGrid();
    if (cfg.style === 'micro') ensureFont(labelSpec, localFonts);
    const s = fontSpec(cfg);
    const changed = s.id !== spec.id || s.rows !== spec.rows;
    spec = s;
    ensureFont(spec, localFonts);
    if (changed) refont();
    else layout();
    kick();
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);
  resize();
  kick();

  return {
    add, fuse, clear, level, configure, resize,
    count: () => words.filter((w) => w.state !== 'out').length,
    // 検証用：いま出ている言葉の位置（重なりの確認に使う）
    boxes: () => words.filter((w) => w.state !== 'out').map((w) => ({ text: w.text, hero: !!w.hero, state: w.state, x: w.ox, y: w.oy, w: w.bmp.w * w.pitch, h: w.bmp.h * w.pitch, tx: w.tox, ty: w.toy, tw: w.bmp.w * w.tpitch, th: w.bmp.h * w.tpitch })),
    destroy() { cancelAnimationFrame(raf); raf = -1; ro.disconnect(); canvas.remove(); words = []; },
  };
}

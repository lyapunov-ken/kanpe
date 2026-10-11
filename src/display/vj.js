// VJ モード：話した言葉をドットアート（ドット絵）で描く。canvas 1枚・依存なし。
// - 言葉は DotGothic16（16px の升目で設計されたドット書体）で 16 ドットの高さに起こし、1 ドットずつ光らせる
// - 最新の言葉を中央に大きく、ひとつ前までの言葉は小さくなって周りを漂う
// - 背景はドットの升目。言葉が来ると波紋が走り、声の大きさで上下のイコライザーが揺れる
const GLYPH = 16;
const DOT_FONT = '"DotGothic16", "Hiragino Sans", "Yu Gothic", "Noto Sans CJK JP", sans-serif';
const PIXEL_PALETTE = ['#ff004d', '#ffa300', '#ffec27', '#00e436', '#29adff', '#ff77a8', '#ffccaa', '#83f3ff'];
const MAX_SAT = 6;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const easeOut = (k) => 1 - Math.pow(1 - k, 3);
const easeBack = (k) => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

let fontLinked = false;
function ensureFont(local) {
  if (fontLinked || local) return;
  fontLinked = true;
  if ([...document.querySelectorAll('link[rel=stylesheet]')].some((l) => l.href.includes('DotGothic16'))) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=DotGothic16&display=swap';
  document.head.appendChild(l);
}
async function fontFor(text) {
  if (!document.fonts) return;
  await Promise.race([document.fonts.load(`${GLYPH}px "DotGothic16"`, text).catch(() => {}), new Promise((r) => setTimeout(r, 700))]);
}

// 文字列を 16 ドットの高さのビットマップに起こす → 点の座標の配列
const rasterCache = new Map();
function rasterize(text) {
  if (rasterCache.has(text)) return rasterCache.get(text);
  const c = document.createElement('canvas');
  const g = c.getContext('2d', { willReadFrequently: true });
  g.font = `${GLYPH}px ${DOT_FONT}`;
  const w = Math.max(4, Math.ceil(g.measureText(text).width) + 4);
  const h = GLYPH + 8;
  c.width = w; c.height = h;
  g.font = `${GLYPH}px ${DOT_FONT}`;
  g.textBaseline = 'top';
  g.fillStyle = '#fff';
  g.fillText(text, 2, 3);
  const d = g.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1;
  const raw = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (d[(y * w + x) * 4 + 3] > 110) {
        raw.push(x, y);
        if (x < minX) minX = x; if (x > maxX) maxX = x;
        if (y < minY) minY = y; if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) { const empty = { w: 1, h: 1, pts: new Int16Array(0) }; rasterCache.set(text, empty); return empty; }
  const pts = new Int16Array(raw.length);
  for (let i = 0; i < raw.length; i += 2) { pts[i] = raw[i] - minX; pts[i + 1] = raw[i + 1] - minY; }
  const bmp = { w: maxX - minX + 1, h: Math.max(GLYPH - 2, maxY - minY + 1), pts };
  if (rasterCache.size > 300) rasterCache.clear();
  rasterCache.set(text, bmp);
  return bmp;
}

// 光るドットの元絵（色ごとに1回だけ作る）
const spriteCache = new Map();
function sprite(color, glow) {
  const key = color + (glow ? 'g' : '');
  if (spriteCache.has(key)) return spriteCache.get(key);
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  if (glow) {
    const halo = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    halo.addColorStop(0, color);
    halo.addColorStop(0.32, color);
    halo.addColorStop(0.42, hexA(color, 0.45));
    halo.addColorStop(1, hexA(color, 0));
    g.fillStyle = halo;
    g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(255,255,255,.55)'; // 芯を少し白く
    g.beginPath(); g.arc(S / 2, S / 2, S * 0.1, 0, Math.PI * 2); g.fill();
  } else {
    g.fillStyle = color;
    g.beginPath(); g.arc(S / 2, S / 2, S * 0.36, 0, Math.PI * 2); g.fill();
  }
  if (spriteCache.size > 80) spriteCache.clear();
  spriteCache.set(key, c);
  return c;
}
function hexA(color, a) {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
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
  ensureFont(localFonts);
  const canvas = document.createElement('canvas');
  canvas.className = 'vj-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  stage.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  const grid = document.createElement('canvas'); // 背景の升目（リサイズ時だけ描き直す）

  let W = 0, H = 0, dpr = 1, cell = 10, cols = 0, rows = 0;
  let cfg = { style: 'led', accent: '#3ddc84', accent2: '#62d0ff', transparent: false, calm: false, caption: true, ttl: 8 };
  let words = []; // { text, color, bmp, t0, state, ox, oy, pitch, tox, toy, tpitch, starts, delays, alpha, out0, vx, vy, tag }
  let ripples = [];
  let sparks = [];
  let lvl = 0, lvlAt = 0, wordSeq = 0, raf = 0, last = performance.now(), lastSp = null, lastHeroAt = 0;

  function resize() {
    const r = stage.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    cell = Math.max(8, Math.round(H / 60));
    cols = Math.ceil(W / cell) + 1; rows = Math.ceil(H / cell) + 1;
    grid.width = canvas.width; grid.height = canvas.height;
    const g = grid.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.07)';
    const rr = Math.max(0.8, cell * 0.11);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      g.beginPath(); g.arc(x * cell + cell / 2, y * cell + cell / 2, rr, 0, Math.PI * 2); g.fill();
    }
    for (const w of words) w.slot = null;
    layout(false);
  }

  const reserve = () => (cfg.caption ? H * 0.16 : H * 0.06);
  function heroTarget(w) {
    const avH = H - reserve() - H * 0.1;
    const pitch = Math.max(3, Math.min((W * 0.86) / w.bmp.w, (avH * 0.62) / w.bmp.h, H / 15));
    return { pitch, x: (W - w.bmp.w * pitch) / 2, y: H * 0.08 + (avH - w.bmp.h * pitch) / 2 };
  }
  // 小さくなった言葉の居場所：中央の言葉と、ほかの小さな言葉に重ならない場所を探して、そこに留まる
  const ov = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
  function satPitch(w) { return Math.max(2.2, Math.min(cell * 0.42, (W * 0.3) / w.bmp.w)); }
  function boxOf(w, pitch, x, y) { const m = cell * 0.8; return { x: x - m, y: y - m, w: w.bmp.w * pitch + 2 * m, h: w.bmp.h * pitch + 2 * m }; }
  function findSpot(w, heroBox, others) {
    const pitch = satPitch(w);
    const bw = w.bmp.w * pitch, bh = w.bmp.h * pitch;
    const x0 = W * 0.04, x1 = Math.max(x0, W * 0.96 - bw), y0 = H * 0.05, y1 = Math.max(y0, H - reserve() - bh);
    let best = null;
    for (let i = 0; i < 80; i++) {
      const x = x0 + Math.random() * (x1 - x0), y = y0 + Math.random() * (y1 - y0);
      const b = boxOf(w, pitch, x, y);
      let score = ov(b, heroBox) * 50;
      for (const o of others) score += ov(b, o) * 10;
      score += Math.abs((y + bh / 2) - H * 0.45) * 0.02; // わずかに上下の端へ散らす
      if (!best || score < best.score) best = { x, y, pitch, score };
      if (score === 0 && i > 20) break;
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
      heroBox = { x: t.x - m, y: t.y - m * 3, w: hero.bmp.w * t.pitch + 2 * m, h: hero.bmp.h * t.pitch + 4 * m };
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

  function colorFor(m) {
    if (m.spc) return m.spc;
    if (cfg.style === 'neon') return hsl((wordSeq * 67 + performance.now() / 50) % 360);
    if (cfg.style === 'pixel') return PIXEL_PALETTE[wordSeq % PIXEL_PALETTE.length];
    return m.kind === 'registered' ? cfg.accent2 : cfg.accent;
  }

  async function add(m) {
    const text = (m.text || '').trim();
    if (!text) return;
    await fontFor(text + (m.spn || ''));
    const now = performance.now();
    lvl = Math.max(lvl, 0.55 + Math.random() * 0.35);
    const same = words.find((w) => w.text === text && w.state !== 'out');
    if (same) { // 繰り返した言葉は中央に呼び戻して光らせる
      words.splice(words.indexOf(same), 1);
      words.push(same);
      same.flash = now; same.t0 = Math.min(same.t0, now - 2000); same.expires = now + cfg.ttl * 1500;
      lastHeroAt = now;
      layout();
      ripple(same, 1.2);
      return;
    }
    wordSeq++;
    const bmp = rasterize(text);
    const w = { text, kind: m.kind || 'normal', color: colorFor(m), fixed: !!m.spc, bmp, t0: now, state: 'in', seed: wordSeq * 17 + text.length,
      ox: 0, oy: 0, pitch: 1, tox: 0, toy: 0, tpitch: 1, expires: now + cfg.ttl * 1500, flash: m.kind === 'new' ? now : 0 };
    if (m.spn && m.sp !== lastSp) { w.tag = { bmp: rasterize(m.spn), text: m.spn }; }
    if (m.sp != null) lastSp = m.sp;
    // 中央の言葉は 0.9 秒に1回まで入れ替える（立て続けに来た言葉は、最初から周りに小さく出す）
    const important = w.kind === 'new' || w.kind === 'registered';
    const hero = [...words].reverse().find((x) => x.state !== 'out');
    const asSat = hero && now - lastHeroAt < (important ? 400 : 900);
    if (asSat) { words.splice(words.indexOf(hero), 0, w); }
    else { words.push(w); lastHeroAt = now; }
    // 多すぎる分は退場
    const live = words.filter((x) => x.state !== 'out');
    const maxSat = H < 420 ? 3 : MAX_SAT; // 小さな画面では漂う言葉を減らす
    let extra = live.length - (maxSat + 1);
    for (const x of live) { if (extra <= 0) break; if (x === w) continue; leave(x, now); extra--; } // 古い順に退場
    layout();
    // 登場の出発点を決める
    const n = bmp.pts.length / 2;
    w.starts = new Float32Array(n * 2);
    w.delays = new Float32Array(n);
    const t = { x: w.tox, y: w.toy, pitch: w.tpitch };
    w.ox = t.x; w.oy = t.y; w.pitch = t.pitch;
    const cx = t.x + (bmp.w * t.pitch) / 2, cy = t.y + (bmp.h * t.pitch) / 2;
    for (let i = 0; i < n; i++) {
      const px = bmp.pts[i * 2], py = bmp.pts[i * 2 + 1];
      const tx = t.x + px * t.pitch, ty = t.y + py * t.pitch;
      if (cfg.style === 'pixel') { // 上から降ってくる
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
    if (!asSat) ripple(w, w.kind === 'new' ? 1.6 : 1);
    if (important) burst(cx, cy, w.color);
    kick();
  }

  function ripple(w, strength) {
    ripples.push({ x: w.tox + (w.bmp.w * w.tpitch) / 2, y: w.toy + (w.bmp.h * w.tpitch) / 2, t0: performance.now(), color: w.color, s: strength });
    if (ripples.length > 4) ripples.shift();
  }
  function burst(x, y, color) {
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2, v = 0.15 + Math.random() * 0.5;
      sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: performance.now(), life: 700 + Math.random() * 600, color });
    }
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

  // ---- 描画
  function drawDot(x, y, size, color, alpha) {
    if (alpha <= 0.01) return;
    ctx.globalAlpha = alpha;
    if (cfg.style === 'pixel') {
      ctx.fillStyle = color;
      ctx.fillRect(x, y, size * 0.86, size * 0.86);
    } else {
      const g = size * (cfg.style === 'neon' ? 1.9 : 1.6);
      ctx.drawImage(sprite(color, true), x + size * 0.43 - g / 2, y + size * 0.43 - g / 2, g, g);
    }
  }

  function frame() {
    raf = 0;
    const now = performance.now();
    const dt = Math.min(64, now - last);
    last = now;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    if (cfg.transparent) ctx.clearRect(0, 0, W, H);
    else { ctx.fillStyle = '#040506'; ctx.fillRect(0, 0, W, H); }
    if (!cfg.transparent) ctx.drawImage(grid, 0, 0, W, H);

    // 声の大きさ：届かなくなったら少しずつ落とす
    if (now - lvlAt > 1200) lvl *= Math.pow(0.985, dt / 16);
    const glowy = cfg.style !== 'pixel';
    if (glowy) ctx.globalCompositeOperation = 'lighter';

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
          drawDot(px - cell * 0.22, py - cell * 0.22, cell * 0.5, r.color, a);
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
          drawDot(gx * cell + cell * 0.25, (rows - 2 - k) * cell + cell * 0.25 - (cfg.caption ? 0 : 0), cell * 0.5, eqColor, a * 0.8);
          drawDot((cols - 1 - gx) * cell + cell * 0.25, k * cell + cell * 0.25, cell * 0.5, eqColor, a * 0.55);
        }
      }
    }

    // 言葉
    const k = 1 - Math.pow(0.0025, dt / 1000); // 位置と大きさのばね（約0.4秒で追いつく）
    words = words.filter((w) => !(w.state === 'out' && now - w.out0 > 900));
    const liveCount = words.filter((w) => w.state !== 'out').length;
    for (const w of words) {
      if (w.state !== 'out' && !w.hero && now > w.expires) leave(w, now);
      if (w.state !== 'out' && w.hero && liveCount === 1 && now > w.expires + cfg.ttl * 1500) leave(w, now);
      w.ox += (w.tox - w.ox) * k; w.oy += (w.toy - w.oy) * k; w.pitch += (w.tpitch - w.pitch) * k;
      const n = w.bmp.pts.length / 2;
      const base = w.state === 'out' ? Math.max(0, 1 - (now - w.out0) / 900) : w.hero ? 1 : 0.62;
      const flash = w.flash ? Math.max(0, 1 - (now - w.flash) / 500) : 0;
      const color = flash > 0.5 ? '#ffffff' : w.color;
      // ネオンはゆっくり色が移ろう
      const c = cfg.style === 'neon' && !flash && !w.fixed ? hsl((w.seed * 37 + now / 40) % 360) : color;
      const dur = cfg.calm ? 300 : cfg.style === 'pixel' ? 620 : 760;
      for (let i = 0; i < n; i++) {
        const px = w.bmp.pts[i * 2], py = w.bmp.pts[i * 2 + 1];
        let x = w.ox + px * w.pitch, y = w.oy + py * w.pitch, a = base;
        if (w.state === 'in' && w.starts) {
          const p = clamp((now - w.t0 - (cfg.calm ? 0 : w.delays[i])) / dur, 0, 1);
          if (p < 1) {
            if (cfg.calm) a *= p;
            else if (cfg.style === 'neon') { a *= p > 0 ? Math.min(1, p * 3) * (p < 0.3 ? (Math.random() < 0.6 ? 1 : 0.2) : 1) : 0; }
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
        drawDot(x, y, w.pitch, c, a);
      }
      if (w.state === 'in' && now - w.t0 > dur + 500) w.state = 'hold';
      // 話者ラベル：言葉の左上に小さなドット文字で
      if (w.tag && w.hero && w.state !== 'out') {
        const tp = Math.max(1.4, Math.min(w.pitch * 0.2, cell * 0.32));
        const tx = w.ox, ty = w.oy - w.tag.bmp.h * tp - tp * 3;
        const tn = w.tag.bmp.pts.length / 2;
        for (let i = 0; i < tn; i++) drawDot(tx + w.tag.bmp.pts[i * 2] * tp, ty + w.tag.bmp.pts[i * 2 + 1] * tp, tp, w.color, base * 0.9);
      }
    }

    // 火花
    sparks = sparks.filter((s) => now - s.t0 < s.life);
    for (const s of sparks) {
      const t = now - s.t0, a = 1 - t / s.life;
      drawDot(s.x + s.vx * t - cell * 0.2, s.y + s.vy * t + 0.00012 * t * t - cell * 0.2, cell * 0.45, s.color, a);
    }

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(frame);
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }

  function configure(next) {
    cfg = { ...cfg, ...next };
    layout();
    kick();
  }

  const ro = new ResizeObserver(() => resize());
  ro.observe(stage);
  resize();
  kick();

  return {
    add, clear, level, configure, resize,
    count: () => words.filter((w) => w.state !== 'out').length,
    destroy() { cancelAnimationFrame(raf); raf = -1; ro.disconnect(); canvas.remove(); words = []; },
  };
}

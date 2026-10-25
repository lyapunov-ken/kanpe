// 1px の粒子（モーション用）。字の形を 1px の点に起こして、散らしたり集めたりする。canvas 1枚・依存なし。
// - disperse：字や箱が、形のまま 1px の粒になって風に流れて消える（場面の退場・無音が続いたとき・消去）
// - assemble：散らばった粒が集まって字の形になり、そこで字が現れる（字の出かた「粒子」）
// - spark：一点から火花のように飛び散る（キーワード・ビート・句点）
// - drift：周りの音に合わせて、ゆっくり漂う粒（音に反応「周りの音」）
// 軽さのくふう：
// - 粒は同じ色・同じ濃さ（8段）ごとにまとめて、1回の fill で塗る（粒ごとに色や透明度を切りかえない）
// - 字の形の点は「字・書体・大きさ」ごとに覚えておき、2回目からは字を描き直さない（getImageData を減らす）
// - 要素の位置はまとめて読んでから、まとめて隠す（読み書きを交互にしてレイアウトを何度もやり直させない）
// - 粒の数には上限があり、motion.js が重いと判断したら setBudget で減らす
const CAP = 3500;
const LEVELS = 8; // 濃さの段数

export function createDust(host) {
  const cv = document.createElement('canvas');
  cv.className = 'mo-dust';
  cv.setAttribute('aria-hidden', 'true');
  host.appendChild(cv);
  const ctx = cv.getContext('2d');
  const probe = document.createElement('canvas');
  const pctx = probe.getContext('2d', { willReadFrequently: true });

  // 粒ごとの値（配列で持つ）
  const x = new Float32Array(CAP), y = new Float32Array(CAP), vx = new Float32Array(CAP), vy = new Float32Array(CAP);
  const sx = new Float32Array(CAP), sy = new Float32Array(CAP), tx = new Float32Array(CAP), ty = new Float32Array(CAP);
  const born = new Float64Array(CAP), life = new Float32Array(CAP), delay = new Float32Array(CAP);
  const mode = new Uint8Array(CAP), col = new Uint8Array(CAP), big = new Uint8Array(CAP);
  const colors = [];
  let n = 0;
  let dpr = 1, W = 0, H = 0, ox = 0, oy = 0;
  let budget = 1;
  let lastT = 0, drawn = false;
  let wind = -1; // 散るときの風向き（-1 左へ）
  // 塗り分けのための入れ物（色 × 濃さ ごとに、粒の番号を並べる）
  let bucketOf = new Int32Array(CAP), order = new Int32Array(CAP), counts = new Int32Array(0);
  const glyphs = new Map(); // 字の形の点（字・書体・大きさ → 点の列）

  function resize() {
    const r = host.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height; ox = r.left; oy = r.top;
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
    drawn = true;
  }
  const colorId = (c) => {
    let i = colors.indexOf(c);
    if (i < 0) { if (colors.length >= 32) colors.length = 0; colors.push(c); i = colors.length - 1; } // 色は多くても数色。増えすぎたら覚え直す
    return i;
  };
  function add(m, px, py, ci, lf, dl = 0) {
    if (n >= CAP * budget) return -1;
    const i = n++;
    mode[i] = m; x[i] = sx[i] = tx[i] = px; y[i] = sy[i] = ty[i] = py; vx[i] = vy[i] = 0;
    born[i] = performance.now(); life[i] = lf; delay[i] = dl; big[i] = 0; col[i] = ci;
    return i;
  }

  // 字の形を点に起こす（字ごとに1回だけ）。戻り値は字の箱の左上からの [x, y] の列
  function glyphPts(text, font, w, h, fs, maxPts) {
    const key = `${text}|${font}|${w}|${h}|${maxPts}`;
    let pts = glyphs.get(key);
    if (pts) return pts;
    probe.width = w; probe.height = h;
    pctx.clearRect(0, 0, w, h);
    pctx.font = font;
    pctx.textAlign = 'center';
    pctx.textBaseline = 'middle';
    pctx.fillStyle = '#000';
    pctx.fillText(text, w / 2, h / 2 + fs * 0.03);
    pts = [];
    let data;
    try { data = pctx.getImageData(0, 0, w, h).data; } catch { return pts; }
    let filled = 0;
    for (let i = 3; i < data.length; i += 16) if (data[i] > 120) filled++;
    const step = Math.max(2, Math.round(Math.sqrt((filled * 4) / maxPts)));
    for (let yy = 0; yy < h; yy += step) for (let xx = 0; xx < w; xx += step) if (data[(yy * w + xx) * 4 + 3] > 120) pts.push(xx, yy);
    glyphs.set(key, pts);
    if (glyphs.size > 400) glyphs.delete(glyphs.keys().next().value);
    return pts;
  }
  // 要素の位置と見た目をまとめて読む（このあいだは何も書きかえない）
  function measure(el, maxPts) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right < ox || r.left > ox + W || r.bottom < oy || r.top > oy + H) return null;
    const cs = getComputedStyle(el);
    const box = el.classList.contains('mo-box') || el.classList.contains('mo-under') || el.classList.contains('mo-strike') || el.classList.contains('mo-end');
    const line = el.classList.contains('line');
    const color = line ? cs.borderTopColor : box ? cs.backgroundColor : cs.color;
    const w = Math.ceil(r.width), h = Math.ceil(r.height);
    const left = r.left - ox, top = r.top - oy;
    let pts;
    if (box || !el.textContent.trim()) { // 箱・線は面を点に（枠だけの箱は縁だけ）
      pts = [];
      const step = Math.max(3, Math.round(Math.sqrt((w * h) / maxPts)));
      for (let yy = 0; yy < h; yy += step) for (let xx = 0; xx < w; xx += step) {
        if (line && xx > 4 && yy > 4 && xx < w - 5 && yy < h - 5) continue;
        pts.push(xx, yy);
      }
    } else {
      const sc = el.offsetHeight ? r.height / el.offsetHeight : 1;
      const fs = Math.round(parseFloat(cs.fontSize) * sc);
      pts = glyphPts(el.textContent, `${cs.fontWeight} ${fs}px ${cs.fontFamily}`, w, h, fs, maxPts);
    }
    return { left, top, pts, color };
  }

  // 散る：要素は見えなくして、粒が風に流れて消える
  function disperse(els, { spread = 1, life: lf = 1100, dir = wind, up = 0.4, hide = true, stagger = 0 } = {}) {
    if (!W) resize();
    const list = [];
    for (const el of els) if (el && el.isConnected) list.push([el, measure(el, 70)]); // まず全部読む
    let k = 0;
    for (const [el, m] of list) {
      if (hide) el.style.visibility = 'hidden'; // それから全部書く
      if (!m) continue;
      const ci = colorId(m.color), dl = stagger * k++;
      const pts = m.pts;
      for (let j = 0; j < pts.length; j += 2) {
        const i = add(1, m.left + pts[j], m.top + pts[j + 1], ci, lf * (0.6 + Math.random() * 0.6), dl);
        if (i < 0) return;
        const a = Math.random() * Math.PI * 2, sp = (0.3 + Math.random() * 1.2) * spread;
        vx[i] = Math.cos(a) * sp + dir * (0.6 + Math.random() * 1.6) * spread;
        vy[i] = Math.sin(a) * sp - up * (0.4 + Math.random()) * spread;
      }
    }
  }
  // 集まる：字の形の点へ、散らばった場所から集まる。戻り値は集まりきるまでのミリ秒
  function assemble(el, { radius = 140, dur = 620, dl = 0 } = {}) {
    if (!W) resize();
    const m = measure(el, 60);
    if (!m) return dur + dl;
    const ci = colorId(m.color), pts = m.pts;
    for (let j = 0; j < pts.length; j += 2) {
      const px = m.left + pts[j], py = m.top + pts[j + 1];
      const a = Math.random() * Math.PI * 2, rr = radius * (0.35 + Math.random());
      const i = add(2, px + Math.cos(a) * rr, py + Math.sin(a) * rr * 0.7, ci, dur + 140, dl + Math.random() * 90);
      if (i < 0) break;
      tx[i] = px; ty[i] = py;
    }
    return dur + dl + 90;
  }
  // 火花：一点から飛び散る
  function spark(px, py, { count = 24, color = '#fff', speed = 3.2, life: lf = 700, up = 0, gravity = 0.04 } = {}) {
    if (!W) resize();
    const ci = colorId(color);
    for (let j = 0; j < count; j++) {
      const i = add(3, px, py, ci, lf * (0.5 + Math.random() * 0.7));
      if (i < 0) break;
      const a = Math.random() * Math.PI * 2, sp = speed * (0.3 + Math.random());
      vx[i] = Math.cos(a) * sp; vy[i] = Math.sin(a) * sp - up;
      big[i] = Math.random() < 0.18 ? 1 : 0;
      sx[i] = gravity; // 火花の重さ（使い回し）
    }
  }
  // 漂う：周りの音の大きさに合わせて、画面のあちこちに少しずつ（全体の上限の1割まで）
  function drift(level, color) {
    if (!W || n > CAP * budget * 0.1 + 200) return;
    const ci = colorId(color);
    const m = Math.floor(level * 3 + Math.random() * level * 2);
    for (let j = 0; j < m; j++) {
      const i = add(4, Math.random() * W, H * (0.2 + Math.random() * 0.8), ci, 1800 + Math.random() * 2200);
      if (i < 0) break;
      vx[i] = (Math.random() - 0.5) * 0.3; vy[i] = -(0.15 + Math.random() * 0.5) * (0.6 + level);
    }
  }

  const easeOut = (q) => 1 - Math.pow(1 - q, 3);
  function step(t) {
    const dt = lastT ? Math.min(100, t - lastT) : 16;
    lastT = t;
    if (!n) { if (drawn) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); drawn = false; } return; }
    const f = dt / 16.7;
    const dampS = Math.pow(0.985, f), dampF = Math.pow(0.94, f);
    const nb = colors.length * LEVELS;
    if (counts.length < nb + 1) counts = new Int32Array(nb + 1);
    counts.fill(0);
    // 1) 動かす・消えた粒を詰める・塗り分けの段を決める
    let j = 0;
    for (let i = 0; i < n; i++) {
      const age = t - born[i] - delay[i];
      if (age > life[i]) continue;
      const q = age > 0 ? age / life[i] : 0;
      let a;
      const md = mode[i];
      if (md === 1) { // 散る
        if (age >= 0) {
          vx[i] = vx[i] * dampS + (Math.random() - 0.5) * 0.12 * f; vy[i] = vy[i] * dampS - 0.012 * f;
          x[i] += vx[i] * f; y[i] += vy[i] * f;
        }
        a = 1 - q * q;
      } else if (md === 2) { // 集まる
        const p = Math.min(1, Math.max(0, age) / Math.max(1, life[i] - 140));
        const e = easeOut(p);
        x[i] = sx[i] + (tx[i] - sx[i]) * e; y[i] = sy[i] + (ty[i] - sy[i]) * e;
        a = age < 0 ? 0 : p < 1 ? 0.35 + 0.65 * p : 1 - (age - (life[i] - 140)) / 140;
      } else if (md === 3) { // 火花
        vx[i] *= dampF; vy[i] = vy[i] * dampF + sx[i] * f;
        x[i] += vx[i] * f; y[i] += vy[i] * f;
        a = 1 - q;
      } else { // 漂う
        x[i] += vx[i] * f; y[i] += vy[i] * f;
        a = Math.sin(q * Math.PI) * 0.7;
      }
      if (j !== i) copy(i, j);
      const lv = Math.min(LEVELS - 1, Math.floor(a * LEVELS));
      if (lv <= 0 || x[j] < -2 || y[j] < -2 || x[j] > W + 2 || y[j] > H + 2) bucketOf[j] = -1; // 見えない粒は塗らない
      else { const b = col[j] * LEVELS + lv; bucketOf[j] = b; counts[b + 1]++; }
      j++;
    }
    n = j;
    // 2) 段ごとに並べ直す（数え上げの並べ替え）
    for (let b = 1; b <= nb; b++) counts[b] += counts[b - 1];
    const start = counts.slice(0, nb + 1);
    for (let i = 0; i < n; i++) { const b = bucketOf[i]; if (b >= 0) order[start[b]++] = i; }
    // 3) 段ごとに、まとめて塗る
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    for (let b = 0; b < nb; b++) {
      const from = counts[b], to = counts[b + 1];
      if (from === to) continue;
      ctx.globalAlpha = ((b % LEVELS) + 0.5) / LEVELS;
      ctx.fillStyle = colors[(b / LEVELS) | 0] || '#fff';
      ctx.beginPath();
      for (let k = from; k < to; k++) { const i = order[k]; const s = big[i] ? 2 : 1; ctx.rect(x[i], y[i], s, s); }
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawn = true;
  }
  function copy(i, j) {
    x[j] = x[i]; y[j] = y[i]; vx[j] = vx[i]; vy[j] = vy[i]; sx[j] = sx[i]; sy[j] = sy[i]; tx[j] = tx[i]; ty[j] = ty[i];
    born[j] = born[i]; life[j] = life[i]; delay[j] = delay[i]; big[j] = big[i]; mode[j] = mode[i]; col[j] = col[i];
  }

  resize();
  return {
    disperse, assemble, spark, drift, step, resize,
    setWind(d) { wind = d; },
    setBudget(b) { budget = Math.max(0.1, Math.min(1, b)); },
    budget: () => budget,
    toLocal(r) { return { x: r.left - ox, y: r.top - oy, w: r.width, h: r.height }; }, // 画面上の矩形を、この canvas の座標へ
    count: () => n,
    clear() { n = 0; },
    destroy() { cv.remove(); glyphs.clear(); },
  };
}

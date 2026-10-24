// 1px の粒子（モーション用）。字の形を 1px の点に起こして、散らしたり集めたりする。canvas 1枚・依存なし。
// - disperse：字や箱が、形のまま 1px の粒になって風に流れて消える（場面の退場・無音が続いたとき・消去）
// - assemble：散らばった粒が集まって字の形になり、そこで字が現れる（字の出かた「粒子」）
// - spark：一点から火花のように飛び散る（キーワード・ビート・句点）
// - drift：周りの音に合わせて、ゆっくり漂う粒（音に反応「周りの音」）
// 粒の数には上限があり、描画が重いと感じたら自動で減らす。描画は呼び出し側の rAF から step() で行う。
const CAP = 9000;

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
  const born = new Float64Array(CAP), life = new Float32Array(CAP), delay = new Float32Array(CAP), size = new Float32Array(CAP);
  const mode = new Uint8Array(CAP), col = new Uint8Array(CAP);
  const colors = [];
  let n = 0;
  let dpr = 1, W = 0, H = 0, ox = 0, oy = 0;
  let budget = 1;          // 重いときは 0.5 → 0.25 と減らす
  let slowFrames = 0, lastT = 0, drawn = false;
  let wind = -1;           // 散るときの風向き（-1 左へ）

  function resize() {
    const r = host.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height; ox = r.left; oy = r.top;
    cv.width = Math.max(1, Math.round(W * dpr));
    cv.height = Math.max(1, Math.round(H * dpr));
  }
  const colorId = (c) => { let i = colors.indexOf(c); if (i < 0) { colors.push(c); i = colors.length - 1; if (colors.length > 200) colors.splice(0, 100); } return i; };
  function add(m, px, py, c, lf, dl = 0) {
    if (n >= CAP * budget) return -1;
    const i = n++;
    mode[i] = m; x[i] = sx[i] = tx[i] = px; y[i] = sy[i] = ty[i] = py; vx[i] = vy[i] = 0;
    born[i] = performance.now(); life[i] = lf; delay[i] = dl; size[i] = 1; col[i] = colorId(c);
    return i;
  }

  // 要素の字形（または箱）を、step px ごとの点に起こす。戻り値は画面上の点の列
  function sample(el, maxPts = 170) {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.right < ox || r.left > ox + W) return [];
    const cs = getComputedStyle(el);
    const w = Math.ceil(r.width), h = Math.ceil(r.height);
    const pts = [];
    const text = el.textContent;
    if (!text || el.classList.contains('mo-box') || el.classList.contains('mo-under') || el.classList.contains('mo-strike')) { // 箱・線は面を点に
      const isLine = el.classList.contains('mo-box') && el.classList.contains('line');
      const step = Math.max(2, Math.round(Math.sqrt((w * h) / (maxPts * 1.6))));
      for (let yy = 0; yy < h; yy += step) for (let xx = 0; xx < w; xx += step) {
        if (isLine && xx > 4 && yy > 4 && xx < w - 5 && yy < h - 5) continue;
        pts.push([r.left - ox + xx, r.top - oy + yy]);
      }
      return pts;
    }
    const sc = el.offsetHeight ? r.height / el.offsetHeight : 1;
    const fs = parseFloat(cs.fontSize) * sc;
    probe.width = w; probe.height = h;
    pctx.clearRect(0, 0, w, h);
    pctx.font = `${cs.fontWeight} ${fs}px ${cs.fontFamily}`;
    pctx.textAlign = 'center';
    pctx.textBaseline = 'middle';
    pctx.fillStyle = '#000';
    pctx.fillText(text, w / 2, h / 2 + fs * 0.03);
    let data;
    try { data = pctx.getImageData(0, 0, w, h).data; } catch { return pts; }
    // 字の面積に合わせて点の間隔を決める（どの字もおよそ maxPts 個まで）
    let filled = 0;
    for (let i = 3; i < data.length; i += 16) if (data[i] > 120) filled++;
    const area = filled * 4;
    const step = Math.max(2, Math.round(Math.sqrt(area / maxPts)));
    for (let yy = 0; yy < h; yy += step) for (let xx = 0; xx < w; xx += step) {
      if (data[(yy * w + xx) * 4 + 3] > 120) pts.push([r.left - ox + xx, r.top - oy + yy]);
    }
    return pts;
  }

  // 散る：要素は見えなくして、粒が風に流れて消える
  function disperse(els, { spread = 1, life: lf = 1100, dir = wind, up = 0.4, hide = true, stagger = 0 } = {}) {
    if (!W) resize();
    let k = 0;
    for (const el of els) {
      if (!el || !el.isConnected) continue;
      const c = getComputedStyle(el).color;
      const bg = el.classList.contains('mo-box') || el.classList.contains('mo-under') || el.classList.contains('mo-strike') ? getComputedStyle(el).backgroundColor : null;
      const isLine = el.classList.contains('line');
      const pts = sample(el);
      const dl = stagger * k++;
      for (const [px, py] of pts) {
        const i = add(1, px, py, isLine ? getComputedStyle(el).borderTopColor : bg || c, lf * (0.6 + Math.random() * 0.6), dl);
        if (i < 0) break;
        const a = Math.random() * Math.PI * 2, sp = (0.3 + Math.random() * 1.2) * spread;
        vx[i] = Math.cos(a) * sp + dir * (0.6 + Math.random() * 1.6) * spread;
        vy[i] = Math.sin(a) * sp - up * (0.4 + Math.random()) * spread;
      }
      if (hide) el.style.visibility = 'hidden';
    }
  }
  // 集まる：字の形の点へ、散らばった場所から集まる。戻り値は集まりきるまでのミリ秒
  function assemble(el, { radius = 140, dur = 620, dl = 0 } = {}) {
    if (!W) resize();
    const c = getComputedStyle(el).color;
    const pts = sample(el, 130);
    for (const [px, py] of pts) {
      const a = Math.random() * Math.PI * 2, rr = radius * (0.35 + Math.random());
      const i = add(2, px + Math.cos(a) * rr, py + Math.sin(a) * rr * 0.7, c, dur + 140, dl + Math.random() * 90);
      if (i < 0) break;
      tx[i] = px; ty[i] = py;
    }
    return dur + dl + 90;
  }
  // 火花：一点から飛び散る
  function spark(px, py, { count = 24, color = '#fff', speed = 3.2, life: lf = 700, up = 0, gravity = 0.04 } = {}) {
    if (!W) resize();
    for (let j = 0; j < count; j++) {
      const i = add(3, px, py, color, lf * (0.5 + Math.random() * 0.7));
      if (i < 0) break;
      const a = Math.random() * Math.PI * 2, sp = speed * (0.3 + Math.random());
      vx[i] = Math.cos(a) * sp; vy[i] = Math.sin(a) * sp - up;
      size[i] = Math.random() < 0.18 ? 2 : 1;
      sx[i] = gravity; // 火花の重さ（使い回し）
    }
  }
  // 漂う：周りの音の大きさに合わせて、画面のあちこちに少しずつ
  function drift(level, color) {
    if (!W) resize();
    const m = Math.floor(level * 3 + Math.random() * level * 2);
    for (let j = 0; j < m; j++) {
      const i = add(4, Math.random() * W, H * (0.2 + Math.random() * 0.8), color, 1800 + Math.random() * 2200);
      if (i < 0) break;
      vx[i] = (Math.random() - 0.5) * 0.3; vy[i] = -(0.15 + Math.random() * 0.5) * (0.6 + level);
    }
  }

  const easeOut = (q) => 1 - Math.pow(1 - q, 3);
  function step(t) {
    // 描画が重いときは粒を減らす（30fps を切るフレームが続いたら）
    const dt = lastT ? t - lastT : 16;
    lastT = t;
    if (n > 800) { slowFrames = dt > 34 ? slowFrames + 1 : Math.max(0, slowFrames - 1); if (slowFrames > 12 && budget > 0.25) { budget /= 2; slowFrames = 0; } }
    if (!n) { if (drawn) { ctx.clearRect(0, 0, cv.width, cv.height); drawn = false; } return; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const f = Math.min(3, dt / 16.7);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const age = t - born[i] - delay[i];
      if (age > life[i]) continue; // 消えた粒は詰める
      let a = 1;
      const q = Math.max(0, age) / life[i];
      if (mode[i] === 1) { // 散る
        if (age >= 0) {
          vx[i] *= Math.pow(0.985, f); vy[i] = vy[i] * Math.pow(0.985, f) - 0.012 * f;
          vx[i] += (Math.random() - 0.5) * 0.12 * f;
          x[i] += vx[i] * f; y[i] += vy[i] * f;
        }
        a = age < 0 ? 1 : 1 - q * q;
      } else if (mode[i] === 2) { // 集まる
        const p = Math.min(1, Math.max(0, age) / Math.max(1, life[i] - 140));
        const e = easeOut(p);
        x[i] = sx[i] + (tx[i] - sx[i]) * e; y[i] = sy[i] + (ty[i] - sy[i]) * e;
        a = age < 0 ? 0 : p < 1 ? 0.35 + 0.65 * p : 1 - (age - (life[i] - 140)) / 140;
      } else if (mode[i] === 3) { // 火花
        vx[i] *= Math.pow(0.94, f); vy[i] = vy[i] * Math.pow(0.94, f) + sx[i] * f;
        x[i] += vx[i] * f; y[i] += vy[i] * f;
        a = 1 - q;
      } else { // 漂う
        x[i] += vx[i] * f + Math.sin((t + i * 97) / 700) * 0.15; y[i] += vy[i] * f;
        a = Math.sin(q * Math.PI) * 0.7;
      }
      if (a > 0.02) {
        ctx.globalAlpha = a;
        ctx.fillStyle = colors[col[i]] || '#fff';
        ctx.fillRect(x[i], y[i], size[i], size[i]);
      }
      copy(i, j++);
    }
    n = j;
    ctx.globalAlpha = 1;
    drawn = true;
  }
  function copy(i, j) {
    if (i === j) return;
    x[j] = x[i]; y[j] = y[i]; vx[j] = vx[i]; vy[j] = vy[i]; sx[j] = sx[i]; sy[j] = sy[i]; tx[j] = tx[i]; ty[j] = ty[i];
    born[j] = born[i]; life[j] = life[i]; delay[j] = delay[i]; size[j] = size[i]; mode[j] = mode[i]; col[j] = col[i];
  }

  resize();
  return {
    disperse, assemble, spark, drift, step, resize,
    setWind(d) { wind = d; },
    toLocal(r) { return { x: r.left - ox, y: r.top - oy, w: r.width, h: r.height }; }, // 画面上の矩形を、この canvas の座標へ
    count: () => n,
    clear() { n = 0; },
    destroy() { cv.remove(); },
  };
}

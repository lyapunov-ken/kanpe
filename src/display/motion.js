// モーション：話した文がその場で1字ずつ現れ、ミニマルな図形がコミカルに動くモーショングラフィックス。
// - 文は短い行に区切り、2行ずつの「場面」に組む。場面が変わるたびにカメラが線の上を走り、線の上の点が次の駅へ進む
// - 言葉の意味をざっくり汲んで図形を選ぶ：
//   打ち消し → 取り消し線／問い → 大きな「？」／強調 → 集中線と揺れ／流れ → 矢印でつながる箱／
//   逆接 → 仕切り線／要点 → 四隅の枠／笑い → 跳ねる字と星／声・音 → 波形／数 → 数え上げと棒
// - キーワード（コンソールが拾った語）は色・塗りの箱・下線で目立たせる。同じ語をくり返すと背景に巨大な字が出る
// - 字の出かたは10通り（ぼかし・横すべり・弾む・落ちる・粒子・めくれる・走査・グリッチ・伸び・回転）、
//   場面の切り替えは6通り（横へ・下へ・粒子になって散る・押し込みズーム・字が落ちる・帯でワイプ）。1px の粒子は dust.js
// - 画面の四隅に小さな計器（経過時間・話す速さ・声の大きさ・場面の番号）
// - 音に反応：声（声の大きさ）／周りの音（BGM や会場の音の帯域と拍。拍で画面が脈打ち、計器はスペクトラムと BPM に）／オフ
// - 乱数は場面ごとの種から作る（コンソールが文ごとに種を付けて送る）ので、プレビューと別窓で同じ組み・同じ図形になる
// 依存ゼロ。動かすのは transform / opacity（字の現れとカメラの残像だけ filter）。消えた要素はすぐ外す。
import { charScript } from '../core/extract.js?v=202610250347';
import { tuneColor, parseColor, contrast } from '../core/color.js?v=202610250347';
import { createDust } from './dust.js?v=202610250347';

const SVGNS = 'http://www.w3.org/2000/svg';
const REF_W = 1280, REF_H = 720;
const EXPO = 'cubic-bezier(.16,1,.3,1)';
const SWING = 'cubic-bezier(.7,0,.18,1)';      // カメラ：ため → 一気に → ぴたりと止まる
const BACK = 'cubic-bezier(.34,1.56,.64,1)';   // 少し行き過ぎて戻る（コミカルな弾み）
const PAN_MS = 620;

// ---------------------------------------------------------------- 小さな道具
function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pad2 = (n) => String(n).padStart(2, '0');
const pickW = (rand, pairs) => { // [[値, 重み], ...]
  let s = 0;
  for (const [, w] of pairs) s += w;
  let r = rand() * s;
  for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
  return pairs[pairs.length - 1][0];
};
function div(cls, text) { const e = document.createElement('div'); e.className = cls; if (text != null) e.textContent = text; return e; }
function span(cls, text) { const e = document.createElement('span'); e.className = cls; if (text != null) e.textContent = text; return e; }
function svgEl(tag, attrs = {}) { const e = document.createElementNS(SVGNS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; }
const isCJK = (t) => /[぀-ヿ㐀-鿿豈-﫿]/.test(t);
const after = (ms, fn) => setTimeout(fn, ms);

// ---------------------------------------------------------------- 行に区切る（伸びていく途中の文でも、前の区切りが動かないように左から決める）
// 和文：ひらがなの後ろに漢字・カタカナ・英数字が来るところ（文節の切れ目らしいところ）で切る。読点・句点も切れ目
// 長すぎる行は、行の中でいちばん後ろの文節の切れ目で折り返す（伸びている最後の行だけが組み直されるので、前の行は動かない）
const SMALL = /[ーっッゃゅょャュョぁぃぅぇぉァィゥェォ」』）)!?！？]/;
function cutAt(a, min) {
  for (let b = a.length - 1; b >= min; b--) {
    if (a[b - 1] === ' ' || (charScript(a[b - 1]) === 'h' && charScript(a[b]) !== 'h' && a[b] !== ' ' && !SMALL.test(a[b]))) return b;
  }
  for (let b = a.length - 1; b >= min; b--) {
    if (charScript(a[b - 1]) !== charScript(a[b]) && charScript(a[b]) !== 'h' && !SMALL.test(a[b])) return b;
  }
  return -1; // 切れ目がない（長いカタカナ語など）
}
function lineifyJa(text, min, max) {
  const ch = [...text];
  const lines = [];
  let cur = [];
  const flush = () => { const t = cur.join('').trim(); if (t) lines.push(t); cur = []; };
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i], d = ch[i + 1];
    if (/[、。，．,\u3000]/.test(c)) { flush(); continue; }
    cur.push(c);
    if (/[!?！？]/.test(c) && d !== undefined && !/[!?！？]/.test(d)) { flush(); continue; }
    if (cur.length > max) {
      let b = cutAt(cur, 3);
      if (b < 0) { if (cur.length <= max * 1.6) continue; b = cur.length - 1; } // 1語が長いときは少しはみ出させて（あとで縮めて収める）
      const rest = cur.slice(b);
      cur = cur.slice(0, b);
      flush();
      cur = rest;
    }
  }
  flush();
  return lines;
}
// 欧文：単語で切る。まだ話している途中の最後の単語では切らない（区切りが行き来しないように）
function lineifyEn(text, max) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  words.forEach((w, i) => {
    const last = i === words.length - 1;
    if (cur && !last && (cur.length + 1 + w.length > max)) { lines.push(cur); cur = w; }
    else if (cur && last && cur.length >= max) { lines.push(cur); cur = w; }
    else cur = cur ? cur + ' ' + w : w;
    if (!last && /[.,!?;:]$/.test(w) && cur.length >= max * 0.5) { lines.push(cur); cur = ''; }
  });
  if (cur) lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- 言葉の意味（ざっくり）
const RX = {
  q: /(?:[？?]|(?:でしょう|だろう|かな|ますか|ですか|のか)$|なぜ|なんで|どうして|どうやって|どこ|だれ|誰|いつ|何を|何が|^(?:what|why|how|who|where|when|which|is|are|do|does|did|can|could|should|would|will)\b)/i,
  ex: /(?:[！!]|すごい|凄い|すげ|最高|やばい|ヤバい|めっちゃ|めちゃ|超|絶対|ついに|一気|爆|\b(?:amazing|awesome|wow|incredible|huge|insane|crazy|great|epic)\b)/i,
  but: /(?:でも|けど|けれど|しかし|一方|ところが|逆に|むしろ|\b(?:but|however|instead|versus|vs|rather|although)\b)/i,
  flow: /(?:そして|次に|まず|つまり|だから|なので|ステップ|順番|流れ|→|\b(?:then|next|first|second|third|because|step|therefore|so that)\b)/i,
  focus: /(?:大事|大切|ポイント|重要|注目|本当に|ほんとに|まさに|ここが|カギ|鍵|\b(?:key|important|point|focus|crucial|exactly|remember)\b)/i,
  fun: /(?:笑|ｗｗ|ww|ハハ|はは|面白|おもしろ|楽し|ウケ|うける|\b(?:lol|haha|funny|fun|hilarious|joke)\b)/i,
  voice: /(?:声|音|喋|しゃべ|歌|マイク|\b(?:voice|sound|speak|listen|music|mic|audio|song)\b)/i,
};
// 打ち消し：キーワードのすぐ後ろ（数文字以内）に来たら、そのキーワードに取り消し線
const NEG_JA = /^.{0,5}?(?:じゃない|ではない|じゃなく|ではなく|じゃなかった|ません|ないで|なくて|なかった|ない|いらない|要らない)/;
const NEG_SKIP = /^(?:少な|危な|切な|幼な|はかな|汚な|つまらな|くだらな)/;
const NEG_EN_AFTER = /^\s*(?:\S+\s+){0,2}?(?:is|are|was|were|do|does|did)?\s*(?:not|n't|never|no longer)\b/i;
const NEG_EN_BEFORE = /\b(?:not|no|never|without|n't)\s+(?:\S+\s+)?$/i;

// 字の出かた・場面の切り替えの選びやすさ（テイストごと）
const STYLE_W = {
  cool: [['blur', 4], ['slide', 2], ['scan', 2.5], ['dust', 2], ['glitch', 1.5], ['flip', 1.5]],
  mix: [['blur', 3], ['slide', 1.5], ['pop', 2], ['drop', 2], ['dust', 2], ['flip', 1.5], ['scan', 1.5], ['glitch', 1.2], ['stretch', 1.5], ['spin', 1.2]],
  pop: [['pop', 4], ['drop', 3], ['spin', 2], ['stretch', 2.5], ['dust', 1.5], ['flip', 1]],
};
const TRANS_W = {
  cool: [['pan', 4], ['drop', 1.4], ['dust', 2.2], ['zoom', 1.6], ['wipe', 1.4]],
  mix: [['pan', 3.5], ['drop', 1.2], ['dust', 1.8], ['zoom', 1.4], ['fall', 1.4], ['wipe', 1.4]],
  pop: [['pan', 3], ['drop', 1], ['fall', 2.4], ['wipe', 2], ['zoom', 1.4], ['dust', 1]],
};

// ---------------------------------------------------------------- 本体
export function createMotion(stage) {
  const root = div('mo');
  const view = div('mo-view');
  const plate = div('mo-plate');
  const grid = div('mo-grid');
  const big = div('mo-big');
  const world = div('mo-world');
  const track = svgEl('svg', { class: 'mo-track', width: '1', height: '1', 'aria-hidden': 'true' });
  const hud = div('mo-hud');
  // カメラが動くあいだの横方向の残像（SVG のぼかしを横だけにかける）
  const defs = svgEl('svg', { class: 'mo-defs', width: '0', height: '0', 'aria-hidden': 'true' });
  const filt = svgEl('filter', { id: 'mo-hb', x: '-20%', y: '-5%', width: '140%', height: '110%' });
  const blurN = svgEl('feGaussianBlur', { stdDeviation: '0 0' });
  filt.appendChild(blurN);
  defs.appendChild(filt);
  world.appendChild(track);
  // 拍で画面全体（板と計器を除く）が少しだけ脈打つように、カメラの外側にもう1枚かぶせる
  const camBox = div('mo-cam');
  camBox.append(grid, big, world);
  const wipe = div('mo-wipe'); // 帯でワイプする切り替え
  view.append(plate, camBox, wipe, hud);
  root.append(defs, view);
  stage.appendChild(root);
  const dust = createDust(root); // 1px の粒子（いちばん手前）

  const head = svgEl('circle', { r: '7', class: 'mo-head' }); // 線の上を進む点
  track.appendChild(head);

  let cfg = { calm: false, sizeK: 1, taste: 'mix', hud: true, sound: 'voice', transparent: false, bg: '#000', ink: '#fff', accent: '#f60', accent2: '#0af',
    logo: null, credit: false };
  let k = 1, VW = REF_W, VH = REF_H;
  let destroyed = false;

  // ---- 状態
  const kws = new Map();        // キーワード（小文字）→ { text, kind, count, at }
  let utt = null;               // いま話している文 { seed, text, lines, final, en, at, n }
  let uttN = 0;
  const plan = [];              // 出す予定の場面 { u, j } または { fz }
  let p = -1;                   // いま出している場面（plan の番号）
  let sc = null;                // いまの場面
  let sceneN = 0;               // 通し番号（計器と駅の番号）
  let shownAt = 0;
  let pumpTimer = 0;
  let panning = null;           // カメラが動いている間 { t0, dur }
  let lastCapAt = 0;
  let firstAt = 0;
  let idle = false;
  let lastKw = '';
  let beat = 0;
  let level = 0, levelAt = 0, levelHist = new Array(14).fill(0);
  let bands = new Array(14).fill(0), bandsAt = 0, bpm = 0, beatAt = 0, shoutAt = 0; // 周りの音（帯域・拍・テンポ）
  const paceLog = [];           // { t, n } 話す速さ（1分あたりの字数）
  let paceShown = 0;

  // ---------------------------------------------------------------- 大きさ
  function resize() {
    const W = stage.clientWidth || REF_W, H = stage.clientHeight || REF_H;
    k = Math.max(0.15, Math.min(W / REF_W, H / REF_H));
    VW = W / k; VH = H / k;
    view.style.width = VW + 'px';
    view.style.height = VH + 'px';
    view.style.transform = `scale(${k})`;
    if (sc) { cam(sc.x, sc.y); layout(sc, false); }
    placeHud();
    dust.resize();
  }
  const fs0 = () => 92 * cfg.sizeK;
  const lineMax = () => (cfg.sizeK >= 1.2 ? 9 : cfg.sizeK <= 0.85 ? 13 : 11);
  const padX = () => Math.max(64, VW * 0.07);

  // ---------------------------------------------------------------- 色（反転した場面でも読めるように整える）
  function applyColors() {
    const bg = cfg.transparent ? '#111111' : cfg.bg;
    const acc = tuneColor(cfg.accent, bg, 3);
    const accInv = tuneColor(cfg.accent, cfg.ink, 3);
    const onAcc = (a) => { const ra = parseColor(a), rb = parseColor(cfg.bg) || [0, 0, 0], ri = parseColor(cfg.ink) || [255, 255, 255];
      return ra && contrast(ra, rb) >= contrast(ra, ri) ? (cfg.transparent ? '#111111' : cfg.bg) : cfg.ink; };
    root.style.setProperty('--mo-acc', acc);
    root.style.setProperty('--mo-acc-inv', accInv);
    root.style.setProperty('--mo-on-acc', onAcc(acc));
    root.style.setProperty('--mo-on-acc-inv', onAcc(accInv));
    root.style.setProperty('--mo-acc2', tuneColor(cfg.accent2, bg, 3));
  }

  // ---------------------------------------------------------------- カメラ
  let camX = 0, camY = 0;
  function cam(x, y) {
    camX = x; camY = y;
    world.style.transform = `translate(${-x}px, ${-y}px)`;
  }
  function panTo(x, y, dur) {
    const from = world.style.transform || 'translate(0px, 0px)';
    const vert = Math.abs(y - camY) > Math.abs(x - camX);
    cam(x, y);
    if (cfg.calm || !dur) return;
    world.animate([{ transform: from }, { transform: world.style.transform }], { duration: dur, easing: SWING });
    panning = { t0: performance.now(), dur, vert };
    world.style.filter = 'url(#mo-hb)';
  }

  // ---------------------------------------------------------------- 線路（場面と場面をつなぐ線と駅）
  function polyPoints(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dy) > Math.abs(dx)) return [a, { x: a.x, y: a.y + dy * 0.35 }, { x: b.x, y: a.y + dy * 0.65 }, b];
    return [a, { x: a.x + dx * 0.32, y: a.y }, { x: a.x + dx * 0.62, y: b.y }, b];
  }
  const ptsAttr = (pts) => pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
  function drawRail(s, prev, dur = PAN_MS) {
    const node = { x: s.x + s.nodeX, y: s.y + s.trackY };
    s.node = node;
    const from = prev && prev.node ? prev.node : { x: s.x - 60, y: node.y };
    const pts = polyPoints(from, node);
    const seg = svgEl('polyline', { points: ptsAttr(pts), class: 'mo-rail', pathLength: '1' });
    const lead = svgEl('line', { x1: node.x, y1: node.y, x2: s.x + VW + 80, y2: node.y, class: 'mo-rail lead', pathLength: '1' });
    const ring = svgEl('circle', { cx: node.x, cy: node.y, r: '14', class: 'mo-node' });
    const dot = svgEl('circle', { cx: node.x, cy: node.y, r: '5.5', class: 'mo-node-in' });
    track.insertBefore(seg, head);
    track.insertBefore(lead, head);
    track.insertBefore(ring, head);
    track.insertBefore(dot, head);
    s.rail = [seg, lead, ring, dot];
    const d = cfg.calm ? 0 : dur;
    if (prev && prev.rail) prev.rail[1].remove(); // 前の場面の「先へ伸びる線」は、この線に置き換わる
    if (!cfg.calm) {
      seg.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: d || 500, easing: SWING, fill: 'both' });
      lead.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 700, delay: (d || 300) * 0.8, easing: EXPO, fill: 'both' });
      ring.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.35)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 520, delay: (d || 200) * 0.85, easing: EXPO, fill: 'both' });
    }
    // 点が線に沿って進む
    let total = 0;
    const lens = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y); lens.push(l); total += l; }
    head.setAttribute('cx', '0'); head.setAttribute('cy', '0');
    head.style.transform = `translate(${node.x}px, ${node.y}px)`;
    if (!cfg.calm && prev && total > 1) {
      let acc = 0;
      const kf = [{ transform: `translate(${pts[0].x}px, ${pts[0].y}px)`, offset: 0 }];
      for (let i = 1; i < pts.length; i++) { acc += lens[i - 1]; kf.push({ transform: `translate(${pts[i].x}px, ${pts[i].y}px)`, offset: acc / total }); }
      head.animate(kf, { duration: d, easing: SWING });
    }
    // 古い線と駅は外す（いまの場面の1つ前の線まで残す）
    const keep = new Set([...(s.rail || []), ...(prev && prev.rail ? prev.rail.slice(2) : []), head]);
    for (const e of [...track.children]) if (!keep.has(e)) e.remove();
  }

  // ---------------------------------------------------------------- 場面
  function sceneRand(entry) {
    if (entry.fz) return seeded(hashStr('fz:' + entry.fz.text) ^ (entry.fz.seed || 0));
    return seeded(((entry.u.seed >>> 0) + Math.imul(entry.j + 1, 0x9E3779B1)) >>> 0);
  }
  function makeScene(entry, prev) {
    const rand = sceneRand(entry);
    const n = ++sceneN;
    const s = { entry, rand, n, lines: [], decos: new Map(), props: new Set(), big: null, prop: null, filler: null, born: performance.now(), kw: '' };
    // 色の反転（暗転）：ときどき、ただし2回続けない。透過・控えめでは使わない
    const canInv = !cfg.transparent && cfg.taste !== 'cool-calm';
    s.inv = canInv && (entry.fz ? !(prev && prev.inv) : prev && prev.inv ? false : rand() < (cfg.taste === 'pop' ? 0.3 : cfg.taste === 'cool' ? 0.18 : 0.24));
    // 組み方
    s.comp = entry.fz ? 'center' : pickW(rand, [['left', 4], ['step', 3], ['center', 2], ['right', 1.4], ['bigsmall', 1.6]]);
    // 字の出かた（10通り）と、場面の切り替え（6通り）。テイストで選びやすさを変える
    s.style = pickW(rand, STYLE_W[cfg.taste] || STYLE_W.mix);
    s.tr = !prev ? 'none' : entry.fz ? 'zoom' : pickW(rand, TRANS_W[cfg.taste] || TRANS_W.mix);
    // 場所：横へ＝右隣、下へ＝真下、帯でワイプ＝右隣（帯に隠れたところで飛ぶ）、ほか（粒子・ズーム・落ちる）＝同じ場所に重ねて入れ替える
    const same = ['dust', 'zoom', 'fall'].includes(s.tr);
    s.x = !prev ? camX : same || s.tr === 'drop' ? prev.x : prev.x + VW;
    s.y = !prev ? camY : s.tr === 'drop' ? prev.y + VH : prev.y;
    s.vertical = s.tr === 'drop';
    // 文字の大きさと、2行のかたまりの高さ（行が増えても動かないよう、最初に決めておく）
    const f = fs0();
    s.fs = s.comp === 'bigsmall' ? [f * 0.62, f * 1.12] : entry.fz ? [f * 0.5, f * 1.15] : [f, f];
    s.gap = f * 0.62;
    const blockH = (s.fs[0] + s.fs[1]) * 1.22 + s.gap;
    const cy = VH * (0.5 + (rand() - 0.5) * 0.14);
    s.top = clamp(cy - blockH / 2, 96, VH - 110 - blockH);
    s.trackY = s.top + s.fs[0] * 1.22 + s.gap / 2;
    const px = padX();
    s.nodeX = s.comp === 'right' ? px + VW * (0.08 + rand() * 0.18) : s.comp === 'center' ? VW * (0.5 + (rand() < 0.5 ? -1 : 1) * (0.2 + rand() * 0.12)) : VW * (0.5 + rand() * 0.26);
    // 要素
    s.el = div('mo-scene' + (s.inv ? ' inv' : '') + (entry.fz ? ' fz' : ''));
    s.el.style.transform = `translate(${s.x}px, ${s.y}px)`;
    s.el.style.width = VW + 'px';
    s.el.style.height = VH + 'px';
    s.propsEl = div('mo-props');
    s.linesEl = div('mo-lines');
    s.label = div('mo-label');
    s.num = div('mo-num', pad2(n));
    s.el.append(s.propsEl, s.linesEl, s.label, s.num);
    world.insertBefore(s.el, track);
    return s;
  }

  // 場面の行をそろえる（足りない字は現れ、変わった字は外す）
  function linesFor(entry) {
    if (entry.fz) return entry.fzLines;
    const u = entry.u;
    return u.lines.slice(entry.j * 2, entry.j * 2 + 2);
  }
  // 字をそろえる（変わったところから後ろを入れ替える）。新しく出た字の列を返す（置き場所を決めてから enterChars で動かす）
  function syncLines(s) {
    const want = linesFor(s.entry);
    const fresh = [];
    for (let i = 0; i < 2; i++) {
      const text = want[i] || '';
      let ln = s.lines[i];
      if (!ln) {
        if (!text) continue;
        ln = { el: div('mo-line'), chars: [], text: '', k: 1, x: null, y: null, i };
        ln.el.style.fontSize = s.fs[i] + 'px';
        s.linesEl.appendChild(ln.el);
        s.lines[i] = ln;
      }
      if (ln.text === text) continue;
      const a = [...ln.text], b = [...text];
      let c = 0;
      while (c < a.length && c < b.length && a[c] === b[c]) c++;
      for (const x of ln.chars.splice(c)) x.remove();
      for (let j = c; j < b.length; j++) {
        const ch = b[j];
        const scr = ch === ' ' ? 'sp' : charScript(ch);
        const e = span(`mo-c s-${scr}`, ch === ' ' ? ' ' : ch);
        e._i = j;
        ln.el.appendChild(e);
        ln.chars.push(e);
        fresh.push(e);
      }
      ln.text = text;
    }
    return fresh;
  }
  // 字の出かた（10通り）。場面の切り替えの最中は、切り替えが終わるのを待ってから（s.enterAt / s.settleAt）
  function enterChars(s, chars) {
    if (!chars.length) return;
    const calm = cfg.calm;
    const t = performance.now();
    const stagger = calm ? 0 : clamp(380 / chars.length, 18, 44);
    if (s.style === 'dust' && !calm) {
      // 粒子：散らばった 1px の点が集まって字の形になり、そこで字が現れる（カメラが止まってから）
      for (const e of chars) e.style.opacity = '0';
      const wait = Math.max(0, (s.settleAt || 0) - t);
      after(wait, () => chars.forEach((e, i) => {
        if (!e.isConnected) return;
        const d = dust.assemble(e, { dl: i * stagger * 1.2, dur: 520, radius: 90 + s.rand() * 120 });
        e.style.opacity = '';
        e.animate([{ opacity: 0, filter: 'blur(3px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: 260, delay: Math.max(0, d - 150), easing: 'ease-out', fill: 'backwards' });
      }));
      return;
    }
    const base = Math.max(0, (s.enterAt || 0) - t);
    chars.forEach((e, i) => {
      const kanji = e.className.includes('s-k');
      const k = e._i || 0;
      let kf, dur = 520, easing = EXPO;
      if (calm) kf = [{ opacity: 0 }, { opacity: 1 }];
      else if (s.style === 'pop') {
        const r = (k % 2 ? 1 : -1) * (6 + s.rand() * 10);
        kf = [{ opacity: 0, transform: `translateY(.45em) scale(.15) rotate(${r}deg)` },
          { opacity: 1, transform: `translateY(-.12em) scale(1.18) rotate(${-r / 3}deg)`, offset: 0.55 },
          { transform: 'translateY(0) scale(.96) rotate(0deg)', offset: 0.8 }, { opacity: 1, transform: 'none' }];
        dur = 560; easing = 'ease-out';
      } else if (s.style === 'drop') {
        kf = [{ opacity: 0, transform: 'translateY(-.9em) scaleY(1.25)' }, { opacity: 1, transform: 'translateY(.04em) scale(1.12,.78)', offset: 0.55 },
          { transform: 'translateY(-.05em) scale(.96,1.06)', offset: 0.78 }, { opacity: 1, transform: 'none' }];
        dur = 560; easing = 'cubic-bezier(.3,0,.3,1)';
      } else if (s.style === 'slide') {
        kf = [{ opacity: 0, transform: 'translateX(1.2em) skewX(-14deg)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }];
        dur = 460;
      } else if (s.style === 'scan') { // 下から走査されるように立ち上がる
        kf = [{ opacity: 0, clipPath: 'inset(100% 0 0 0)', transform: 'translateY(.3em)' }, { opacity: 1, clipPath: 'inset(0% 0 0 0)', transform: 'none' }];
        dur = 520;
      } else if (s.style === 'glitch') { // 色がずれて、ちらついて決まる
        kf = [{ opacity: 0, transform: 'translateX(-.25em) skewX(20deg)', textShadow: '-.07em 0 var(--acc), .07em 0 rgba(0,220,255,.7)' },
          { opacity: 1, transform: 'translateX(.15em)', offset: 0.2 }, { opacity: 0.2, transform: 'translateX(-.08em) skewX(-10deg)', offset: 0.36 },
          { opacity: 1, transform: 'translateX(.05em)', offset: 0.55 }, { opacity: 0.55, offset: 0.7 },
          { opacity: 1, transform: 'none', textShadow: '0 0 transparent, 0 0 transparent' }];
        dur = 440; easing = 'linear';
      } else if (s.style === 'flip') { // 下を軸に、手前へめくれて起き上がる
        e.style.transformOrigin = '50% 100%';
        kf = [{ opacity: 0, transform: 'perspective(500px) rotateX(-100deg)' }, { opacity: 1, transform: 'perspective(500px) rotateX(14deg)', offset: 0.7 }, { opacity: 1, transform: 'perspective(500px) rotateX(0deg)' }];
        dur = 640;
      } else if (s.style === 'stretch') { // 横に伸びて、ゴムのように戻る
        e.style.transformOrigin = '0 70%';
        kf = [{ opacity: 0, transform: 'scaleX(0) skewX(-20deg)' }, { opacity: 1, transform: 'scaleX(1.35) skewX(6deg)', offset: 0.55 }, { transform: 'scaleX(.93)', offset: 0.8 }, { opacity: 1, transform: 'none' }];
        dur = 540; easing = 'ease-out';
      } else if (s.style === 'spin') { // くるっと回って飛び込む
        kf = [{ opacity: 0, transform: 'rotate(-220deg) scale(0)' }, { opacity: 1, transform: 'rotate(18deg) scale(1.18)', offset: 0.65 }, { transform: 'rotate(-4deg) scale(.97)', offset: 0.85 }, { opacity: 1, transform: 'none' }];
        dur = 620; easing = 'ease-out';
      } else {
        kf = kanji ? [{ opacity: 0, transform: 'scale(1.35)', filter: 'blur(12px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }]
          : [{ opacity: 0, transform: 'translateX(.28em)', filter: 'blur(9px)' }, { opacity: 1, transform: 'none', filter: 'blur(0px)' }];
        dur = kanji ? 640 : 480;
      }
      e.animate(kf, { duration: dur, delay: base + i * stagger, easing, fill: 'backwards' });
    });
  }

  // 行を置く：組み方に合わせて x・y を決め、はみ出す行は縮める（字が増えると、右寄せの行は左へ滑る）
  function layout(s, smooth = true) {
    const px = padX();
    const maxW = VW - px * 2;
    const ys = [s.top, s.top + s.fs[0] * 1.22 + s.gap];
    let blockR = 0, blockL = VW;
    s.lines.forEach((ln, i) => {
      if (!ln) return;
      const w = ln.el.offsetWidth || 1;
      const kk = Math.min(1, maxW / w);
      const vw = w * kk;
      let x = px;
      if (s.comp === 'center') x = (VW - vw) / 2;
      else if (s.comp === 'right') x = VW - px - vw;
      else if (s.comp === 'step' && i === 1) x = Math.min(VW - px - vw, px + VW * 0.16);
      else if (s.comp === 'bigsmall' && i === 0) x = px + 4;
      const y = ys[i];
      const moved = ln.x != null && (Math.abs(ln.x - x) > 0.5 || Math.abs(ln.k - kk) > 0.002);
      ln.x = x; ln.y = y; ln.k = kk; ln.w = vw;
      ln.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${kk.toFixed(4)})`;
      ln.el.classList.toggle('glide', smooth && moved && !cfg.calm);
      blockR = Math.max(blockR, x + vw);
      blockL = Math.min(blockL, x);
    });
    s.blockL = blockL; s.blockR = blockR;
    // 上のラベル（番号 — いちばん新しいキーワード）
    const l0 = s.lines[0];
    const lx = l0 ? l0.x : px;
    s.label.style.transform = `translate(${lx.toFixed(1)}px, ${(s.top - 34).toFixed(1)}px)`;
    s.num.style.transform = `translate(${(s.nodeX + 18).toFixed(1)}px, ${(s.trackY + 14).toFixed(1)}px)`;
    placeDecos(s);
  }

  // ---------------------------------------------------------------- キーワードの飾り（色・塗りの箱・下線・取り消し線）
  function kwStyle(kw) {
    if (kw.kind === 'new') return 'fill';
    if (kw.kind === 'registered') return 'outline';
    if (kw.kind === 'number') return 'num';
    const h = hashStr(kw.text.toLowerCase()) % 10;
    if (cfg.taste === 'pop') return h < 4 ? 'fill' : h < 7 ? 'color' : 'outline';
    if (cfg.taste === 'cool') return h < 6 ? 'color' : h < 9 ? 'under' : 'outline';
    return h < 5 ? 'color' : h < 7 ? 'under' : h < 9 ? 'fill' : 'outline';
  }
  // 場面の行の中で、キーワードが出てくる場所を探す（長い語から。重なる場所は先に見つけた方）
  function findRuns(s) {
    const out = [];
    const list = [...kws.values()].sort((a, b) => b.text.length - a.text.length);
    s.lines.forEach((ln, li) => {
      if (!ln) return;
      const low = [...ln.text.toLowerCase()];
      const taken = new Array(low.length).fill(false);
      for (const kw of list) {
        const w = [...kw.text.toLowerCase()];
        if (!w.length) continue;
        for (let i = 0; i + w.length <= low.length; i++) {
          let ok = true;
          for (let j = 0; j < w.length; j++) if (low[i + j] !== w[j] || taken[i + j]) { ok = false; break; }
          if (!ok) continue;
          for (let j = 0; j < w.length; j++) taken[i + j] = true;
          out.push({ li, i0: i, i1: i + w.length - 1, kw });
          i += w.length - 1;
        }
      }
    });
    return out;
  }
  function negAfter(s, r) {
    const ln = s.lines[r.li];
    const rest = [...ln.text].slice(r.i1 + 1).join('') + (s.lines[r.li + 1] ? s.lines[r.li + 1].text : '');
    if (isCJK(r.kw.text) || isCJK(rest)) return !NEG_SKIP.test(rest) && NEG_JA.test(rest);
    const before = [...ln.text].slice(0, r.i0).join('');
    return NEG_EN_AFTER.test(rest) || NEG_EN_BEFORE.test(before);
  }
  function markKeywords(s) {
    if (!s || s.entry.fz) return;
    const runs = findRuns(s);
    const seen = new Set();
    for (const r of runs) {
      const key = `${r.li}:${r.i0}:${r.kw.text.toLowerCase()}`;
      seen.add(key);
      if (!s.decos.has(key)) addDeco(s, key, r, kwStyle(r.kw));
      const sk = key + ':x';
      if (negAfter(s, r)) { seen.add(sk); if (!s.decos.has(sk)) addDeco(s, sk, r, 'strike'); }
      if (!s.kw || r.kw.at >= (s.kwAt || 0)) { s.kwAt = r.kw.at; setLabel(s, r.kw.text); }
    }
    for (const [key, d] of s.decos) {
      if (seen.has(key)) continue;
      d.el.remove();
      for (const c of d.chars || []) c.classList.remove('kw', 'on-fill', 'struck', 'k-num');
      s.decos.delete(key);
    }
    placeDecos(s);
  }
  function addDeco(s, key, r, type) {
    const ln = s.lines[r.li];
    const chars = ln.chars.slice(r.i0, r.i1 + 1);
    const d = { key, type, li: r.li, i0: r.i0, i1: r.i1, chars, el: null };
    // 字が出る前に飾りだけ見えないよう、場面の切り替えで字の出を待っているあいだは、飾りも待つ
    const wait = Math.max(0, ((s.style === 'dust' ? s.settleAt : s.enterAt) || 0) - performance.now()) + (s.style === 'dust' ? 520 : 0);
    const delay = cfg.calm ? 0 : wait + 120 + Math.min(500, (performance.now() - s.born < 400 ? r.i1 * 30 : 0));
    if (type === 'strike') {
      d.el = div('mo-strike' + (chars.some((c) => c.classList.contains('on-fill')) ? ' on-fill' : ''));
      ln.el.appendChild(d.el);
      if (!cfg.calm) {
        d.el.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1.06)', offset: 0.7 }, { transform: 'scaleX(1)' }], { duration: 420, delay: delay + 260, easing: EXPO, fill: 'backwards' });
        after(delay + 520, () => { if (!d.el.isConnected) return; for (const c of chars) c.classList.add('struck');
          ln.el.animate([{ transform: ln.el.style.transform }, { transform: ln.el.style.transform + ' translateX(-6px) rotate(-1deg)' }, { transform: ln.el.style.transform + ' translateX(5px) rotate(.8deg)' }, { transform: ln.el.style.transform }], { duration: 260, easing: 'ease-in-out' }); });
      } else for (const c of chars) c.classList.add('struck');
    } else {
      for (const c of chars) c.classList.add('kw');
      if (type === 'fill' || type === 'outline' || type === 'under' || type === 'num') {
        d.el = div(type === 'fill' ? 'mo-box fill' : type === 'outline' ? 'mo-box line' : 'mo-under');
        ln.el.insertBefore(d.el, ln.el.firstChild);
        if (type === 'fill') for (const c of chars) c.classList.add('on-fill');
        if (!cfg.calm) {
          const pop = type === 'fill' && (s.style === 'pop' || s.style === 'drop');
          d.el.animate(pop ? [{ transform: 'scale(0,.2)' }, { transform: 'scale(1.08,1.12)', offset: 0.6 }, { transform: 'none' }]
            : [{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: pop ? 480 : 520, delay, easing: pop ? 'ease-out' : EXPO, fill: 'backwards' });
        }
        if (type === 'num' && !cfg.calm) countUp(chars);
        if (type === 'fill' && !cfg.calm) after(delay + 420, () => { // 箱が塗り終わった右端から火花
          if (!d.el.isConnected) return;
          const r = d.el.getBoundingClientRect(), q = dust.toLocal(r);
          dust.spark(q.x + q.w, q.y + q.h / 2, { count: cfg.taste === 'pop' ? 34 : 20, color: getComputedStyle(d.el).backgroundColor, speed: 3.4 });
        });
      } else {
        d.el = span('mo-nil'); // 色だけ（飾りの要素はない。色は CSS の transition で変わる）
      }
    }
    s.decos.set(key, d);
  }
  function placeDecos(s) {
    for (const d of s.decos.values()) {
      if (!d.el || d.el.classList.contains('mo-nil') || !d.chars.length) continue;
      const a = d.chars[0], b = d.chars[d.chars.length - 1];
      if (!a.isConnected || !b.isConnected) continue;
      const x0 = a.offsetLeft, x1 = b.offsetLeft + b.offsetWidth;
      const top = Math.min(a.offsetTop, b.offsetTop), h = Math.max(a.offsetHeight, b.offsetHeight);
      const st = d.el.style;
      if (d.type === 'strike') { st.left = x0 - 6 + 'px'; st.width = x1 - x0 + 12 + 'px'; st.top = top + h * 0.52 + 'px'; }
      else if (d.type === 'under' || d.type === 'num') { st.left = x0 + 'px'; st.width = x1 - x0 + 'px'; st.top = top + h * 0.98 + 'px'; }
      else { st.left = x0 - h * 0.12 + 'px'; st.width = x1 - x0 + h * 0.24 + 'px'; st.top = top + h * 0.06 + 'px'; st.height = h * 0.92 + 'px'; }
    }
  }
  function countUp(chars) {
    const digits = chars.filter((c) => /[0-9]/.test(c.textContent));
    if (!digits.length) return;
    const finals = digits.map((c) => c.textContent);
    const t0 = performance.now(), dur = 700;
    const step = () => {
      const q = Math.min(1, (performance.now() - t0) / dur);
      digits.forEach((c, i) => { c.textContent = q < 1 ? String(Math.floor(Math.random() * 10)) : finals[i]; });
      if (q < 1 && digits[0].isConnected) after(50, step); else digits.forEach((c, i) => { c.textContent = finals[i]; });
    };
    step();
  }
  // ラベル：番号 — キーワード。字が入れ替わりながら決まる
  function setLabel(s, text) {
    const t = (isCJK(text) ? text : text.toUpperCase()).slice(0, 24);
    if (s.kw === t) return;
    s.kw = t;
    lastKw = t;
    const full = `${pad2(s.n)} — ${t}`;
    if (cfg.calm) { s.label.textContent = full; return; }
    const pool = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/#+';
    let i = 0;
    const tickL = () => {
      if (!s.label.isConnected) return;
      const done = Math.floor((i / 6) * full.length);
      s.label.textContent = full.slice(0, done) + [...full.slice(done)].map((c) => (c === ' ' ? ' ' : pool[Math.floor(Math.random() * pool.length)])).join('').slice(0, Math.max(0, full.length - done));
      if (++i <= 6) after(40, tickL); else s.label.textContent = full;
    };
    tickL();
  }

  // ---------------------------------------------------------------- 場面の図形
  // 空いている場所（字のかたまりの右・上・下）
  function freeSpots(s, avoidRail = false) {
    const px = padX();
    const bottom = s.top + (s.fs[0] + s.fs[1]) * 1.22 + s.gap;
    const spots = [];
    const R = { side: 'R', x: s.blockR + 48, y: s.top - 10, w: VW - px - (s.blockR + 48), h: bottom - s.top + 20 };
    const Lf = { side: 'L', x: px, y: s.top - 10, w: s.blockL - 48 - px, h: bottom - s.top + 20 };
    const T = { side: 'T', x: px, y: 84, w: VW - px * 2, h: s.top - 46 - 84 };
    const B = { side: 'B', x: px, y: bottom + 26, w: VW - px * 2, h: VH - 92 - (bottom + 26) };
    const out = [];
    for (const r of [R, Lf, T, B]) {
      if (avoidRail && (r.side === 'R' || r.side === 'L')) { // 線路（真ん中の横線）の上か下の広い方だけを使う
        const up = { ...r, h: s.trackY - 44 - r.y }, dn = { ...r, y: s.trackY + 44, h: r.y + r.h - (s.trackY + 44) };
        out.push(up.h >= dn.h ? up : dn);
      } else out.push(r);
    }
    for (const r of out) if (r.w > 150 && r.h > 70) spots.push(r);
    return spots.sort((a, b) => b.w * b.h - a.w * a.h);
  }
  const sceneText = (s) => s.lines.map((l) => (l ? l.text : '')).join('');
  // 場面の座標（1280×720 基準）→ 粒子の canvas の座標
  function toScreen(s, x, y) {
    const q = dust.toLocal(s.el.getBoundingClientRect());
    return { x: q.x + x * k, y: q.y + y * k };
  }
  const acc = () => (sc ? getComputedStyle(sc.el).getPropertyValue('--acc').trim() : '') || getComputedStyle(root).getPropertyValue('--mo-acc').trim() || cfg.accent;
  function evaluate(s, final) {
    if (!s || s.entry.fz) return;
    const t = sceneText(s);
    if (!t) return;
    const whole = s.entry.u ? s.entry.u.text : t;
    let want = null;
    if (RX.q.test(t) || (final && RX.q.test(whole) && s === sc && isLastOfUtt(s))) want = 'q';
    else if (RX.ex.test(t)) want = 'ex';
    else if (RX.but.test(t)) want = 'but';
    else if (RX.flow.test(t) && uttKws(s).length >= 2) want = 'flow';
    else if (RX.focus.test(t)) want = 'focus';
    else if (RX.fun.test(t)) want = 'fun';
    else if (RX.voice.test(t)) want = 'voice';
    if (want && !s.prop) { if (s.filler) { fadeOut(s.filler); s.filler = null; } s.prop = want; addProp(s, want); }
    // 意味の図形がない場面には、少し待ってから飾りの図形を1つ
    if (!s.prop && !s.filler && (final || performance.now() - s.born > 1300)) s.filler = addFiller(s);
    if (final && isLastOfUtt(s) && !s.endDot) endDot(s);
  }
  const isLastOfUtt = (s) => s.entry.u && s.entry.j === Math.floor(Math.max(0, s.entry.u.lines.length - 1) / 2);
  function uttKws(s) {
    const t = (s.entry.u ? s.entry.u.text : sceneText(s)).toLowerCase();
    return [...kws.values()].filter((kw) => t.includes(kw.text.toLowerCase())).sort((a, b) => t.indexOf(a.text.toLowerCase()) - t.indexOf(b.text.toLowerCase()));
  }
  function fadeOut(e, ms = 260) {
    if (!e) return;
    if (cfg.calm) { e.remove(); return; }
    e.animate([{ opacity: 1 }, { opacity: 0 }], { duration: ms, fill: 'forwards' }).onfinish = () => e.remove();
  }
  function put(s, e, x, y) {
    e.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    s.propsEl.appendChild(e);
    return e;
  }
  function popIn(e, delay = 0, from = 'scale(0)') {
    if (cfg.calm) return;
    e.animate([{ transform: from, opacity: 0 }, { transform: 'scale(1.15)', opacity: 1, offset: 0.6 }, { transform: 'scale(.95)', offset: 0.8 }, { transform: 'none', opacity: 1 }],
      { duration: 560, delay, easing: 'ease-out', fill: 'backwards' });
  }
  function addProp(s, kind) {
    const spots = freeSpots(s);
    const sp = spots[0];
    const rand = s.rand;
    if (kind === 'q') {
      // 大きな輪郭の「？」が回り込んで入り、ゆらゆら揺れる
      const h = clamp(sp ? Math.min(sp.h * 1.4, sp.w * 1.6) : VH * 0.5, 160, VH * 0.62);
      const e = div('mo-q', '?');
      e.style.fontSize = h + 'px';
      const inner = e;
      const x = sp ? sp.x + Math.max(0, sp.w - h * 0.62) * (0.4 + rand() * 0.5) : VW - padX() - h * 0.6;
      const y = sp ? sp.y + sp.h / 2 - h * 0.62 : VH * 0.5 - h * 0.6;
      const wrap = put(s, div('mo-prop'), x, y);
      wrap.appendChild(inner);
      if (!cfg.calm) {
        inner.animate([{ transform: 'rotate(-80deg) scale(.2)', opacity: 0 }, { transform: 'rotate(14deg) scale(1.12)', opacity: 1, offset: 0.6 }, { transform: 'rotate(-6deg) scale(.97)', offset: 0.8 }, { transform: 'none', opacity: 1 }],
          { duration: 760, easing: 'ease-out', fill: 'backwards' });
        after(780, () => inner.classList.add('wobble'));
      }
    } else if (kind === 'ex') {
      // 集中線：いちばん目立つ語（なければ最後の行）のまわりに放射線。画面が少し揺れる
      const target = strongestRect(s);
      const g = svgEl('svg', { class: 'mo-burst', width: VW, height: VH, viewBox: `0 0 ${VW} ${VH}` });
      const cx = target.x + target.w / 2, cy = target.y + target.h / 2;
      const n = 22;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + rand() * 0.15;
        const r0 = Math.max(target.w, target.h) * (0.62 + rand() * 0.12), r1 = r0 + 30 + rand() * 70;
        const ln = svgEl('line', { x1: cx + Math.cos(a) * r0, y1: cy + Math.sin(a) * r0 * 0.7, x2: cx + Math.cos(a) * r1, y2: cy + Math.sin(a) * r1 * 0.7 });
        g.appendChild(ln);
        if (!cfg.calm) ln.animate([{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1.08)', offset: 0.5 }, { opacity: 1, transform: 'none' }], { duration: 380, delay: i * 10, easing: EXPO, fill: 'backwards' });
      }
      g.style.transformOrigin = `${cx}px ${cy}px`;
      put(s, g, 0, 0);
      if (!cfg.calm) after(140, () => { if (!g.isConnected) return; const q = toScreen(s, cx, cy); dust.spark(q.x, q.y, { count: cfg.taste === 'cool' ? 40 : 70, color: acc(), speed: 5.5, life: 800 }); });
      if (!cfg.calm) {
        g.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }, { transform: 'scale(1)' }], { duration: 520, iterations: 3, delay: 420, easing: 'ease-in-out' });
        s.linesEl.animate([{ transform: 'translate(0,0)' }, { transform: 'translate(-7px,3px)' }, { transform: 'translate(6px,-4px)' }, { transform: 'translate(-3px,2px)' }, { transform: 'translate(0,0)' }],
          { duration: 300, delay: 260, easing: 'linear' });
      }
    } else if (kind === 'but') {
      // 仕切り線：上から下へ引かれ、点が滑り降りる
      const x = sp && sp.side === 'R' ? sp.x + Math.min(70, sp.w * 0.3) : sp && sp.side === 'L' ? sp.x + sp.w - 70 : VW * (0.52 + rand() * 0.2);
      const e = put(s, div('mo-split'), x, 0);
      e.style.height = VH + 'px';
      const dot = div('mo-split-dot');
      e.appendChild(dot);
      if (!cfg.calm) {
        e.animate([{ transform: `translate(${x}px, 0) scaleY(0)` }, { transform: `translate(${x}px, 0) scaleY(1)` }], { duration: 620, easing: EXPO, fill: 'backwards' });
        dot.animate([{ transform: 'translateY(0)' }, { transform: `translateY(${VH * (0.45 + rand() * 0.2)}px)` }], { duration: 900, delay: 300, easing: BACK, fill: 'both' });
      } else dot.style.transform = `translateY(${VH * 0.5}px)`;
    } else if (kind === 'flow') {
      // 矢印でつながる箱：この文のキーワードを順に（最大4つ）
      const list = uttKws(s).slice(-4);
      const row = div('mo-chain');
      list.forEach((kw, i) => {
        if (i) { const ar = span('mo-arrow', '→'); row.appendChild(ar); popIn(ar, 140 + i * 180, 'translateX(-20px) scale(.4)'); }
        const b = span('mo-chip', kw.text);
        row.appendChild(b);
        popIn(b, 80 + i * 180);
      });
      const area = spots.find((q) => q.side === 'T' || q.side === 'B') || sp;
      put(s, row, area ? area.x : padX(), area ? area.y + Math.max(0, area.h / 2 - 34) : 90);
      // 横幅に収める
      requestAnimationFrame(() => { const w = row.offsetWidth, mw = area ? area.w : VW - padX() * 2; if (w > mw) row.style.transform += ` scale(${(mw / w).toFixed(3)})`; });
    } else if (kind === 'focus') {
      // 四隅の枠：いちばん目立つ語を、外から寄ってきた枠がつかむ
      const r = strongestRect(s);
      const g = div('mo-frame');
      const m = 22;
      g.style.width = r.w + m * 2 + 'px';
      g.style.height = r.h + m * 2 + 'px';
      for (const c of ['tl', 'tr', 'bl', 'br']) {
        const corner = span('mo-corner ' + c);
        g.appendChild(corner);
        if (!cfg.calm) {
          const sx = c.includes('l') ? -1 : 1, sy = c.includes('t') ? -1 : 1;
          corner.animate([{ transform: `translate(${sx * 60}px, ${sy * 40}px)`, opacity: 0 }, { transform: `translate(${-sx * 6}px, ${-sy * 6}px)`, opacity: 1, offset: 0.6 }, { transform: 'none', opacity: 1 }],
            { duration: 620, delay: 200, easing: EXPO, fill: 'backwards' });
        }
      }
      put(s, g, r.x - m, r.y - m);
      if (!cfg.calm) after(900, () => g.classList.add('breathe'));
    } else if (kind === 'fun') {
      // 笑い：字がぴょんぴょん跳ねて、まわりに星がまたたく
      if (!cfg.calm) s.lines.forEach((ln) => ln && ln.chars.forEach((c, i) => c.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-.22em) rotate(-4deg)', offset: 0.3 }, { transform: 'translateY(0) scale(1.06,.92)', offset: 0.55 }, { transform: 'translateY(0)' }],
        { duration: 520, delay: 200 + i * 45, iterations: 2, easing: 'ease-in-out' })));
      const area = sp || { x: VW * 0.7, y: 100, w: 200, h: 200 };
      for (let i = 0; i < 4; i++) {
        const st = div('mo-star');
        const sz = 22 + rand() * 30;
        st.style.width = st.style.height = sz + 'px';
        put(s, st, area.x + rand() * Math.max(10, area.w - sz), area.y + rand() * Math.max(10, area.h - sz));
        popIn(st, 260 + i * 140, 'scale(0) rotate(-90deg)');
        if (!cfg.calm) after(900 + i * 140, () => st.classList.add('twinkle'));
      }
    } else if (kind === 'voice') {
      // 声・音：画面を横切る波形（声の大きさで振れ幅が変わる）
      const g = svgEl('svg', { class: 'mo-wave', width: VW, height: 240, viewBox: `0 0 ${VW * 2} 240`, preserveAspectRatio: 'none' });
      for (let w = 0; w < 3; w++) {
        let d = 'M0,120';
        const amp = [70, 46, 30][w], per = [520, 380, 300][w], ph = rand() * 400;
        for (let x = 0; x <= VW * 2; x += 16) d += ` L${x},${(120 + Math.sin((x + ph) / per * Math.PI * 2) * amp * Math.sin(x / (VW * 2) * Math.PI)).toFixed(1)}`;
        const path = svgEl('path', { d, class: 'mo-wave-l w' + w, pathLength: '1' });
        g.appendChild(path);
        if (!cfg.calm) path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 900, delay: w * 120, easing: EXPO, fill: 'backwards' });
      }
      const wrap = div('mo-wave-wrap');
      wrap.appendChild(g);
      // 字にかからない上か下の帯に。どちらも狭ければ線路に重ねて、薄く
      const band = spots.filter((q) => q.side === 'T' || q.side === 'B').sort((a, b) => b.h - a.h)[0];
      if (band && band.h >= 110) { wrap.style.setProperty('--wk', Math.min(1, band.h / 240).toFixed(2)); put(s, wrap, 0, band.y + band.h / 2 - 120); }
      else { wrap.classList.add('faint'); put(s, wrap, 0, s.trackY - 120); }
      s.wave = wrap;
    }
  }
  function strongestRect(s) {
    // 塗りの箱・下線のキーワード → ふつうのキーワード → 最後の行
    let best = null;
    for (const d of s.decos.values()) {
      if (d.type === 'strike' || !d.chars.length) continue;
      if (!best || d.type === 'fill') best = d;
    }
    const ln = best ? s.lines[best.li] : s.lines[s.lines.length - 1] || s.lines[0];
    if (!ln) return { x: VW / 2 - 100, y: VH / 2 - 50, w: 200, h: 100 };
    if (best) {
      const a = best.chars[0], b = best.chars[best.chars.length - 1];
      const x0 = a.offsetLeft, x1 = b.offsetLeft + b.offsetWidth;
      return { x: ln.x + x0 * ln.k, y: ln.y + a.offsetTop * ln.k, w: (x1 - x0) * ln.k, h: a.offsetHeight * ln.k };
    }
    return { x: ln.x, y: ln.y, w: ln.w, h: ln.el.offsetHeight * ln.k };
  }
  // 意味の図形がない場面の飾り：クール＝棒・枠・十字・輪、ポップ＝弾む丸・ぐにゃ線・星
  function addFiller(s) {
    if (cfg.calm && cfg.taste === 'cool') return null;
    const spots = freeSpots(s, true);
    const sp = spots[0];
    if (!sp) return null;
    const rand = s.rand;
    const cool = ['bars', 'frame', 'plus', 'ring', 'matrix', 'tri', 'arc'], pop = ['blob', 'squiggle', 'zigzag', 'confetti', 'pill', 'bars', 'ring'];
    const list = cfg.taste === 'cool' ? cool : cfg.taste === 'pop' ? pop : [...new Set([...cool, ...pop])];
    const kind = list[Math.floor(rand() * list.length)];
    const box = div('mo-prop');
    if (kind === 'bars') {
      const n = 3, wmax = clamp(sp.w * 0.7, 140, 320);
      for (let i = 0; i < n; i++) {
        const b = div('mo-bar' + (i === 1 ? ' acc' : ''));
        b.style.width = wmax * [1, 0.72, 0.46][i] + 'px';
        b.style.top = i * 22 + 'px';
        box.appendChild(b);
        if (!cfg.calm) b.animate([{ transform: 'scaleX(0)' }, { transform: 'none' }], { duration: 560, delay: 120 + i * 110, easing: EXPO, fill: 'backwards' });
      }
      put(s, box, sp.x + (sp.side === 'L' ? sp.w - wmax : rand() * Math.max(0, sp.w - wmax)), sp.y + sp.h / 2 - 30);
    } else if (kind === 'frame') {
      const w = clamp(sp.w * 0.6, 140, 360), h = clamp(sp.h * 0.7, 90, 220);
      const g = div('mo-frame thin');
      g.style.width = w + 'px'; g.style.height = h + 'px';
      for (const c of ['tl', 'tr', 'bl', 'br']) {
        const corner = span('mo-corner ' + c);
        g.appendChild(corner);
        if (!cfg.calm) corner.animate([{ transform: `scale(.2)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { duration: 520, delay: 140, easing: EXPO, fill: 'backwards' });
      }
      box.appendChild(g);
      put(s, box, sp.x + rand() * Math.max(0, sp.w - w), sp.y + rand() * Math.max(0, sp.h - h));
    } else if (kind === 'plus') {
      const cols = 4, rows = 2, gap = 36;
      for (let i = 0; i < cols * rows; i++) {
        const c = span('mo-plus', '+');
        c.style.left = (i % cols) * gap + 'px'; c.style.top = Math.floor(i / cols) * gap + 'px';
        box.appendChild(c);
        if (!cfg.calm) c.animate([{ opacity: 0, transform: 'rotate(-90deg) scale(.2)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 100 + i * 50, easing: EXPO, fill: 'backwards' });
      }
      put(s, box, sp.x + rand() * Math.max(0, sp.w - cols * gap), sp.y + sp.h / 2 - gap);
    } else if (kind === 'ring') {
      const r = clamp(Math.min(sp.w, sp.h) * 0.42, 40, 110);
      const g = svgEl('svg', { width: r * 2 + 20, height: r * 2 + 20, class: 'mo-ring' });
      const c = svgEl('circle', { cx: r + 10, cy: r + 10, r, pathLength: '1' });
      const o = svgEl('circle', { cx: r + 10, cy: 10, r: 6, class: 'orb' });
      g.append(c, o);
      g.style.setProperty('--r', r + 'px');
      box.appendChild(g);
      if (!cfg.calm) {
        c.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 900, easing: EXPO, fill: 'backwards' });
        o.classList.add('spin');
      }
      put(s, box, sp.x + rand() * Math.max(0, sp.w - r * 2), sp.y + sp.h / 2 - r - 10);
    } else if (kind === 'blob') {
      const r = clamp(Math.min(sp.w, sp.h) * 0.36, 34, 90);
      const b = div('mo-blob');
      b.style.width = b.style.height = r * 2 + 'px';
      box.appendChild(b);
      popIn(b, 120, 'scale(0)');
      if (!cfg.calm) after(800, () => b.classList.add('jelly'));
      put(s, box, sp.x + rand() * Math.max(0, sp.w - r * 2), sp.y + sp.h / 2 - r);
    } else if (kind === 'matrix') { // 1px の点の格子が、順に灯って消える
      const cols = 10, rows = 4, gap = 14;
      for (let i = 0; i < cols * rows; i++) {
        const c = span('mo-px' + (rand() < 0.14 ? ' acc' : ''));
        c.style.left = (i % cols) * gap + 'px'; c.style.top = Math.floor(i / cols) * gap + 'px';
        box.appendChild(c);
        if (!cfg.calm) c.animate([{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0.35 }], { duration: 900, delay: ((i % cols) + Math.floor(i / cols)) * 45, fill: 'backwards' });
        else c.style.opacity = '.35';
      }
      put(s, box, sp.x + rand() * Math.max(0, sp.w - cols * gap), sp.y + sp.h / 2 - rows * gap / 2);
    } else if (kind === 'tri') { // 輪郭の三角が回り込んで止まる
      const r = clamp(Math.min(sp.w, sp.h) * 0.4, 40, 96);
      const g = svgEl('svg', { width: r * 2.2, height: r * 2.2, class: 'mo-tri', viewBox: `0 0 ${r * 2.2} ${r * 2.2}` });
      const c = r * 1.1;
      const pts = [0, 1, 2].map((i) => { const a = -Math.PI / 2 + (i * Math.PI * 2) / 3; return `${(c + Math.cos(a) * r).toFixed(1)},${(c + Math.sin(a) * r).toFixed(1)}`; }).join(' ');
      const poly = svgEl('polygon', { points: pts, pathLength: '1' });
      g.appendChild(poly);
      box.appendChild(g);
      if (!cfg.calm) {
        poly.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 800, easing: EXPO, fill: 'backwards' });
        g.animate([{ transform: 'rotate(-120deg) scale(.6)' }, { transform: 'rotate(8deg) scale(1.04)', offset: 0.7 }, { transform: 'none' }], { duration: 900, easing: EXPO, fill: 'backwards' });
        after(950, () => g.classList.add('drift'));
      }
      put(s, box, sp.x + rand() * Math.max(0, sp.w - r * 2.2), sp.y + sp.h / 2 - r * 1.1);
    } else if (kind === 'arc') { // 同心の半円が、外から順に描かれる
      const r = clamp(Math.min(sp.w * 0.5, sp.h) * 0.8, 50, 120);
      const g = svgEl('svg', { width: r * 2 + 8, height: r + 8, class: 'mo-arc', viewBox: `-4 -4 ${r * 2 + 8} ${r + 8}` });
      for (let i = 0; i < 4; i++) {
        const rr = r - i * (r / 4.4);
        const path = svgEl('path', { d: `M${r - rr},${r} A${rr},${rr} 0 0 1 ${r + rr},${r}`, pathLength: '1', class: i === 1 ? 'acc' : '' });
        g.appendChild(path);
        if (!cfg.calm) path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 700, delay: i * 110, easing: EXPO, fill: 'backwards' });
      }
      box.appendChild(g);
      put(s, box, sp.x + rand() * Math.max(0, sp.w - r * 2), sp.y + sp.h / 2 - r / 2);
    } else if (kind === 'zigzag') { // ジグザグの矢印が、字の方を指してぴょこぴょこ
      const w = clamp(sp.w * 0.5, 120, 240);
      const g = svgEl('svg', { width: w + 30, height: 50, class: 'mo-zig', viewBox: `0 0 ${w + 30} 50` });
      let d = 'M2,25';
      for (let x = 2, i = 0; x < w; x += 22, i++) d += ` L${x + 11},${i % 2 ? 40 : 10}`;
      d += ` L${w},25`;
      const path = svgEl('path', { d, pathLength: '1' });
      const tip = svgEl('path', { d: `M${w - 6},12 L${w + 16},25 L${w - 6},38`, class: 'tip' });
      g.append(path, tip);
      const toLeft = sp.side === 'R';
      if (toLeft) g.style.transform = 'scaleX(-1)';
      box.appendChild(g);
      if (!cfg.calm) {
        path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 600, easing: EXPO, fill: 'backwards' });
        tip.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 450, fill: 'backwards' });
        after(700, () => box.classList.add('nudge' + (toLeft ? '-l' : '')));
      }
      put(s, box, toLeft ? sp.x : sp.x + Math.max(0, sp.w - w - 30), sp.y + sp.h / 2 - 25);
    } else if (kind === 'confetti') { // 紙ふぶき（粒子）が降って、小さな四角も弾む
      const n = 7;
      for (let i = 0; i < n; i++) {
        const c = span('mo-conf' + (i % 3 === 0 ? ' ink' : ''));
        c.style.left = rand() * Math.min(260, sp.w) + 'px'; c.style.top = rand() * 40 + 'px';
        c.style.rotate = Math.round(rand() * 90) + 'deg';
        box.appendChild(c);
        popIn(c, 100 + i * 70, 'scale(0) translateY(-40px)');
      }
      put(s, box, sp.x + rand() * Math.max(0, sp.w - 260), sp.y + sp.h / 2 - 30);
      if (!cfg.calm) after(300, () => { if (!box.isConnected) return; const q = dust.toLocal(box.getBoundingClientRect()); for (let i = 0; i < 3; i++) dust.spark(q.x + q.w * (0.2 + i * 0.3), q.y, { count: 16, color: i === 1 ? acc() : getComputedStyle(s.el).color, speed: 2.6, up: 1.4, gravity: 0.08, life: 1100 }); });
    } else if (kind === 'pill') { // カプセルの中を点が行ったり来たり
      const w = clamp(sp.w * 0.5, 130, 220);
      const pill = div('mo-pill');
      pill.style.width = w + 'px';
      const dot = span('mo-pill-dot');
      pill.appendChild(dot);
      dot.style.setProperty('--run', w - 30 + 'px');
      box.appendChild(pill);
      popIn(pill, 100, 'scaleX(0)');
      if (!cfg.calm) after(600, () => dot.classList.add('run'));
      put(s, box, sp.x + rand() * Math.max(0, sp.w - w), sp.y + sp.h / 2 - 15);
    } else {
      const w = clamp(sp.w * 0.7, 160, 360);
      const g = svgEl('svg', { width: w, height: 60, class: 'mo-squiggle', viewBox: `0 0 ${w} 60` });
      let d = 'M4,30';
      for (let x = 4, i = 0; x < w - 8; x += 26, i++) d += ` Q${x + 13},${i % 2 ? 54 : 6} ${x + 26},30`;
      const path = svgEl('path', { d, pathLength: '1' });
      g.appendChild(path);
      box.appendChild(g);
      if (!cfg.calm) path.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 760, delay: 100, easing: EXPO, fill: 'backwards' });
      put(s, box, sp.x + rand() * Math.max(0, sp.w - w), sp.y + sp.h / 2 - 30);
    }
    return box;
  }
  // 話し終えたら、最後の字の後ろに句点がわりの丸がぽんと弾む
  function endDot(s) {
    const ln = s.lines[s.lines.length - 1] || s.lines[0];
    if (!ln || !ln.chars.length) return;
    s.endDot = true;
    if (/[!?！？]$/.test(ln.text)) return;
    const d = span('mo-end');
    ln.el.appendChild(d);
    if (!cfg.calm) {
      d.animate([{ transform: 'translateY(-1.2em) scale(.4)', opacity: 0 }, { transform: 'translateY(0) scale(1.3,.7)', opacity: 1, offset: 0.55 },
        { transform: 'translateY(-.18em) scale(.9,1.1)', offset: 0.75 }, { transform: 'none', opacity: 1 }], { duration: 620, easing: 'ease-out', fill: 'backwards' });
      after(360, () => { if (!d.isConnected) return; const q = dust.toLocal(d.getBoundingClientRect()); dust.spark(q.x + q.w / 2, q.y + q.h, { count: 14, color: acc(), speed: 2.2, up: 1.2, gravity: 0.07 }); });
    }
    layout(s);
  }

  // ---------------------------------------------------------------- 巨大な字（くり返した言葉が、背景に大写しで）
  function bigGlyph(text) {
    if (cfg.calm) return;
    const ch = [...text].find((c) => charScript(c) === 'k') || [...text].find((c) => /\S/.test(c));
    if (!ch) return;
    for (const old of [...big.children]) fadeOut(old, 400);
    const e = span('mo-giant', isCJK(ch) ? ch : ch.toUpperCase());
    const h = VH * 1.05;
    e.style.fontSize = h + 'px';
    e.style.left = VW * (0.42 + Math.random() * 0.2) + 'px';
    e.style.top = VH * 0.5 - h * 0.58 + 'px';
    big.appendChild(e);
    e.animate([{ transform: 'scale(1.7)', opacity: 0, filter: 'blur(24px)' }, { transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' }], { duration: 900, easing: EXPO, fill: 'backwards' });
    after(5200, () => fadeOut(e, 900));
  }

  // ---------------------------------------------------------------- 場面の切り替え
  // 場面の切り替えにかかる時間
  const TR_MS = { none: 0, fade: 320, pan: PAN_MS, drop: PAN_MS, dust: 560, zoom: 640, fall: 600, wipe: 680 };
  const NONE = 'inset(0 100% 0 0)', FULL = 'inset(0 0 0 0)';
  function show(i) {
    const entry = plan[i];
    if (!entry) return;
    const prev = sc;
    p = i;
    if (entry.u && entry.u.final && entry.u.lines.length === 0) return;
    const s = makeScene(entry, prev);
    if (cfg.calm && prev) s.tr = 'fade';
    sc = s;
    const t0 = performance.now();
    shownAt = t0;
    idle = false;
    const tr = s.tr, D = TR_MS[tr] || 0;
    const moving = tr === 'pan' || tr === 'drop';
    // 新しい字が出はじめる時刻（s.enterAt）と、カメラが止まる時刻（s.settleAt。粒子が集まる出かたはこれを待つ）
    s.enterAt = t0 + (moving || tr === 'none' || tr === 'fade' ? 0 : tr === 'wipe' ? D * 0.5 : D * 0.5);
    s.settleAt = t0 + (moving ? D : tr === 'wipe' ? D * 0.5 : D * 0.45);
    const fresh = syncLines(s);
    layout(s, false);
    markKeywords(s);
    if (prev && !cfg.calm) leave(prev, s, tr, D);
    enterChars(s, fresh);
    // カメラ
    if (!prev) cam(s.x, s.y);
    else if (moving) panTo(s.x, s.y, D);
    else if (tr === 'wipe') after(D * 0.5, () => { if (sc === s) cam(s.x, s.y); });
    else cam(s.x, s.y);
    drawRail(s, prev, tr === 'wipe' ? D * 0.5 : D || PAN_MS);
    plateSwap(prev, s, tr, D);
    if (prev) {
      const old = prev;
      if (cfg.calm) { old.el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).onfinish = () => old.el.remove(); s.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, fill: 'backwards' }); }
      else after((tr === 'wipe' ? D * 0.5 : D) + 80, () => old.el.remove());
      for (const g of [...big.children]) fadeOut(g, 500);
    }
    // 前の場面から残っている場面（2つ以上前）は外す
    for (const e of [...world.querySelectorAll('.mo-scene')]) if (e !== s.el && (!prev || e !== prev.el)) e.remove();
    if (entry.fz) fzStage(s, entry.fz);
    else evaluate(s, entry.u.final);
    hud.querySelector('.mo-sc').textContent = `SC.${pad2(s.n)}`;
  }
  // 前の場面の退場（切り替えの種類ごと）
  function leave(old, s, tr, D) {
    const parts = [];
    old.lines.forEach((ln) => { if (ln) parts.push(...ln.chars, ...ln.el.querySelectorAll('.mo-box, .mo-under, .mo-strike, .mo-end')); });
    const T = `translate(${old.x}px, ${old.y}px)`;
    if (tr === 'dust') { // 字の形のまま 1px の粒になって、風に流れる
      dust.disperse(parts, { spread: 1.1, life: 1200, stagger: 6 });
      for (const e of [old.propsEl, old.label, old.num]) fadeOut(e, 240);
    } else if (tr === 'fall') { // 字がばらばらに落ちる（少し回りながら）
      parts.forEach((e, j) => {
        const rot = (old.rand() - 0.5) * 140, dx = (old.rand() - 0.5) * 60;
        e.animate([{ transform: 'none' }, { transform: `translate(${dx}px, -18px) rotate(${rot * 0.1}deg)`, offset: 0.18 }, { transform: `translate(${dx * 2}px, ${VH * 0.95}px) rotate(${rot}deg)` }],
          { duration: D + 120, delay: (j % 7) * 26, easing: 'cubic-bezier(.5,0,.9,.6)', fill: 'forwards' });
      });
      for (const e of [old.propsEl, old.label, old.num]) fadeOut(e, 300);
    } else if (tr === 'zoom') { // 押し込むように大きく、ぼけて抜ける。新しい場面は奥から
      old.el.animate([{ transform: T, opacity: 1, filter: 'blur(0px)' }, { transform: `${T} scale(1.7)`, opacity: 0, filter: 'blur(10px)' }], { duration: D, easing: 'cubic-bezier(.6,0,.9,.5)', fill: 'forwards' });
      s.el.animate([{ transform: `translate(${s.x}px, ${s.y}px) scale(.72)`, opacity: 0 }, { transform: `translate(${s.x}px, ${s.y}px)`, opacity: 1 }], { duration: D, delay: D * 0.3, easing: EXPO, fill: 'backwards' });
    } else if (tr === 'wipe') { // 帯が横切り、隠れたところで場面が替わる
      wipe.animate([{ transform: 'translateX(-102%)', easing: 'cubic-bezier(.7,0,.9,.6)' }, { transform: 'translateX(0)', offset: 0.5, easing: 'cubic-bezier(.1,.4,.3,1)' }, { transform: 'translateX(102%)' }], { duration: D });
    }
  }
  // 暗転の板：横・下へのときはカメラと同じ速さで差し込む。帯は隠れたところで切り替え、ほかは駅から円が広がる／縮む
  function plateSwap(prev, s, tr, D) {
    const wasInv = prev ? prev.inv : root.classList.contains('is-inv');
    const set = () => { plate.style.clipPath = s.inv ? FULL : NONE; root.classList.toggle('is-inv', !!s.inv); };
    if (cfg.transparent) { plate.style.clipPath = NONE; root.classList.remove('is-inv'); return; }
    if (s.inv === wasInv) { root.classList.toggle('is-inv', !!s.inv); return; }
    if (!prev || cfg.calm) { set(); return; }
    if (tr === 'pan' || tr === 'drop') {
      const vert = tr === 'drop';
      const hide = vert ? 'inset(100% 0 0 0)' : 'inset(0 0 0 100%)', gone = vert ? 'inset(0 0 100% 0)' : NONE;
      plate.style.clipPath = s.inv ? FULL : gone;
      plate.animate([{ clipPath: s.inv ? hide : FULL }, { clipPath: s.inv ? FULL : gone }], { duration: D, easing: SWING });
      root.classList.toggle('is-inv', !!s.inv);
    } else if (tr === 'wipe') after(D * 0.5, set);
    else {
      const at = `at ${((s.nodeX / VW) * 100).toFixed(1)}% ${((s.trackY / VH) * 100).toFixed(1)}%`;
      const small = `circle(0% ${at})`, large = `circle(150% ${at})`;
      plate.style.clipPath = s.inv ? large : small;
      plate.animate([{ clipPath: s.inv ? small : large }, { clipPath: s.inv ? large : small }], { duration: D * 1.15, easing: SWING });
      after(D * 0.5, () => { plate.style.clipPath = s.inv ? FULL : NONE; root.classList.toggle('is-inv', !!s.inv); });
    }
  }
  // 見せる長さ：たまっているほど短く（話すのが速いときに追いつく）
  function holdFor(entry, backlog) {
    if (entry && entry.fz) return 3400;
    return backlog >= 4 ? 420 : backlog === 3 ? 680 : backlog === 2 ? 950 : 1300;
  }
  function pump() {
    clearTimeout(pumpTimer);
    if (destroyed) return;
    if (p < 0 && plan.length) { show(0); }
    const backlog = plan.length - 1 - p;
    if (backlog <= 0) return;
    const wait = holdFor(plan[p], backlog) - (performance.now() - shownAt);
    if (wait <= 0) { show(p + 1); pump(); return; }
    pumpTimer = after(wait + 5, pump);
  }
  // 古い予定は忘れる（いまの場面より前）
  function trimPlan() {
    while (p > 2) { plan.shift(); p--; }
  }

  // ---------------------------------------------------------------- 受け取る
  function caption(text, final, m = {}) {
    if (!text) return;
    const t = performance.now();
    lastCapAt = t;
    if (!firstAt) firstAt = t;
    const en = !isCJK(text);
    if (!utt || utt.final) {
      uttN++;
      utt = { seed: Number.isFinite(m.useed) ? m.useed >>> 0 : hashStr('u' + uttN), text: '', lines: [], final: false, en, n: uttN };
    }
    const prevLen = [...utt.text].length;
    const prevTotal = utt.lines.length;
    utt.text = text;
    utt.en = en;
    utt.final = !!final;
    utt.lines = en ? lineifyEn(text, Math.round(lineMax() * 1.7)) : lineifyJa(text, Math.max(4, lineMax() - 6), lineMax());
    // 話す速さ（字数の伸び）と、声の大きさがないときの見せかけの揺れ
    const grow = Math.max(0, [...text].length - prevLen);
    if (grow) { paceLog.push({ t, n: en ? Math.max(1, Math.round(grow / 5)) : grow }); if (t - levelAt > 400) level = Math.max(level, 0.35 + Math.random() * 0.5); }
    beat++;
    // 予定に場面を足す（この文の j 番目の場面）
    const need = Math.max(1, Math.ceil(utt.lines.length / 2));
    const have = plan.filter((e) => e.u === utt).map((e) => e.j);
    const maxJ = have.length ? Math.max(...have) : -1;
    for (let j = maxJ + 1; j < need; j++) plan.push({ u: utt, j });
    // 文が縮んだ（言い直し）：まだ出していない余分な場面は取り消す
    for (let i = plan.length - 1; i > p; i--) if (plan[i].u === utt && plan[i].j >= need) plan.splice(i, 1);
    trimPlan();
    if (sc && sc.entry.u === utt) {
      const fresh = syncLines(sc);
      layout(sc);
      enterChars(sc, fresh);
      markKeywords(sc);
      evaluate(sc, utt.final);
    }
    if (sc && sc.el.classList.contains('idle')) sc.el.classList.remove('idle');
    void prevTotal;
    pump();
  }
  function word(m) {
    const text = (m.text || '').trim();
    if (!text) return;
    const key = text.toLowerCase();
    const prev = kws.get(key);
    const count = Math.max(m.count || 1, prev ? prev.count + 1 : 1);
    kws.delete(key);
    kws.set(key, { text, kind: m.kind || 'normal', count, at: performance.now() });
    while (kws.size > 60) kws.delete(kws.keys().next().value);
    beat++;
    if (count >= 3 && !(prev && prev.giantAt && performance.now() - prev.giantAt < 15000)) { bigGlyph(text); kws.get(key).giantAt = performance.now(); }
    else if (m.kind === 'new' && cfg.taste === 'pop') bigGlyph(text);
    if (sc) { markKeywords(sc); evaluate(sc, sc.entry.u && sc.entry.u.final); }
  }
  // 新語ミックス：A × B から新しい言葉が生まれる場面を割り込ませる
  function fuse(m) {
    if (!m.text) return;
    const from = [m.a, m.b].filter(Boolean);
    const entry = { fz: m, fzLines: [from.length === 2 ? `${from[0]}×${from[1]}` : 'NEW WORD', m.text] };
    plan.splice(p + 1, 0, entry);
    // 割り込みはすぐに見せる
    shownAt = -1e9;
    pump();
  }
  function fzStage(s, m) {
    s.label.textContent = `${pad2(s.n)} — NEW WORD`;
    const ln = s.lines[1];
    if (!ln) return;
    const color = typeof m.color === 'string' && /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '';
    if (color) s.el.style.setProperty('--fz', tuneColor(color, s.inv ? cfg.ink : cfg.bg, 3));
    const d = { key: 'fz', type: 'fill', li: 1, i0: 0, i1: ln.chars.length - 1, chars: ln.chars, el: div('mo-box fill fzbox') };
    ln.el.insertBefore(d.el, ln.el.firstChild);
    for (const c of ln.chars) c.classList.add('kw', 'on-fill');
    s.decos.set('fz', d);
    if (!cfg.calm) d.el.animate([{ transform: 'scale(0,.1)' }, { transform: 'scale(1.1,1.2)', offset: 0.6 }, { transform: 'none' }], { duration: 560, delay: 380, easing: 'ease-out', fill: 'backwards' });
    placeDecos(s);
    s.prop = 'ex';
    after(420, () => { if (s.el.isConnected) addProp(s, 'ex'); });
    bigGlyph(m.text);
  }

  // ---------------------------------------------------------------- 音に反応
  // 声：声の大きさで計器が揺れ、大きな声を出すと線の上の点から火花が散る
  // 周りの音：BGM や会場の音の帯域（計器がスペクトラムに）と拍（画面が脈打ち、点から火花・駅が光る・キーワードが跳ねる）・BPM
  let beatN = 0;
  function setLevel(v) {
    if (cfg.sound === 'off') return;
    level = Math.max(level * 0.6, clamp(+v || 0, 0, 1));
    levelAt = performance.now();
    if (cfg.sound === 'voice' && level > 0.82 && levelAt - shoutAt > 900 && sc && !cfg.calm) { shoutAt = levelAt; burstAtHead(cfg.taste === 'cool' ? 24 : 40); shakeScene(4); }
  }
  function audio(m) {
    if (cfg.sound !== 'room') return;
    const t = performance.now();
    if (Array.isArray(m.b)) { bands = m.b.slice(0, 14).map((v) => clamp((+v || 0) / 100, 0, 1)); bandsAt = t; }
    if (Number.isFinite(m.l)) { level = Math.max(level * 0.7, clamp(m.l, 0, 1)); levelAt = t; }
    bpm = +m.bpm || 0;
    if (m.beat) onBeat(t);
  }
  function headPos() {
    const r = head.getBoundingClientRect();
    const q = dust.toLocal(r);
    return { x: q.x + q.w / 2, y: q.y + q.h / 2 };
  }
  function burstAtHead(n) { const q = headPos(); dust.spark(q.x, q.y, { count: n, color: acc(), speed: 3.6 }); }
  function shakeScene(px) {
    if (!sc) return;
    sc.linesEl.animate([{ transform: 'none' }, { transform: `translate(${-px}px, ${px / 2}px)` }, { transform: `translate(${px * 0.8}px, ${-px / 2}px)` }, { transform: 'none' }], { duration: 220, easing: 'linear' });
  }
  function onBeat(t) {
    if (t - beatAt < 200) return;
    beatAt = t;
    beatN++;
    if (cfg.calm) return;
    const down = beatN % 4 === 1; // 小節の頭は強く
    const pop = cfg.taste === 'pop';
    camBox.animate([{ transform: `scale(${down ? (pop ? 1.024 : 1.012) : (pop ? 1.012 : 1.006)})` }, { transform: 'scale(1)' }], { duration: 260, easing: 'cubic-bezier(.2,.7,.3,1)' });
    grid.animate([{ opacity: down ? 1 : 0.85 }, { opacity: 0.5 }], { duration: 320, easing: 'ease-out' });
    if (sc && sc.rail) sc.rail[2].animate([{ transform: 'scale(1.7)', strokeWidth: 1.5 }, { transform: 'scale(1)' }], { duration: 360, easing: EXPO });
    burstAtHead(down ? (pop ? 34 : 22) : (pop ? 16 : 10));
    if (sc && (pop || cfg.taste === 'mix')) { // キーワードが拍で跳ねる
      for (const d of sc.decos.values()) {
        if (d.type === 'strike') continue;
        d.chars.forEach((c, i) => c.isConnected && c.animate([{ transform: 'none' }, { transform: `translateY(${pop ? -0.12 : -0.06}em) scale(1.04)`, offset: 0.35 }, { transform: 'none' }], { duration: 240, delay: i * 18, easing: 'ease-out' }));
      }
    }
    for (const g of big.children) g.animate([{ transform: 'scale(1.035)' }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
  }

  // 消す：いまの場面は字の形のまま粒になって散る
  function clear() {
    if (sc && !cfg.calm) dustScene(sc);
    plan.length = 0; p = -1; utt = null; kws.clear();
    for (const e of [...world.querySelectorAll('.mo-scene')]) fadeOut(e, 300);
    for (const e of [...track.children]) if (e !== head) e.remove();
    for (const e of [...big.children]) fadeOut(e, 300);
    sc = null; firstAt = 0; paceLog.length = 0; lastKw = '';
    plate.style.clipPath = NONE;
    root.classList.remove('is-inv');
    hud.querySelector('.mo-sc').textContent = 'SC.00';
  }
  function dustScene(s) {
    const parts = [];
    s.lines.forEach((ln) => { if (ln) parts.push(...ln.chars, ...ln.el.querySelectorAll('.mo-box, .mo-under, .mo-strike, .mo-end')); });
    dust.disperse(parts, { spread: 0.9, life: 1600, up: 0.8, stagger: 10 });
    for (const e of [s.propsEl, s.label, s.num]) fadeOut(e, 500);
  }

  // ---------------------------------------------------------------- 計器（四隅）
  function buildHud() {
    hud.innerHTML = '';
    const tl = div('mo-h tl'), tr = div('mo-h tr'), bl = div('mo-h bl'), br = div('mo-h br');
    tl.append(span('mo-live'), span('mo-h-t', 'LIVE'), span('mo-time', '00:00'));
    tr.append(span('mo-pace', '000'), span('mo-h-s', 'CPM'), span('mo-beat'));
    const beatEl = tr.querySelector('.mo-beat');
    for (let i = 0; i < 4; i++) beatEl.appendChild(span('mo-sq'));
    const meter = span('mo-meter');
    for (let i = 0; i < levelHist.length; i++) meter.appendChild(span('mo-mb'));
    bl.append(meter, span('mo-h-s mo-in', 'INPUT — VOICE'));
    br.append(span('mo-sc', 'SC.00'), span('mo-kw', ''));
    hud.append(tl, tr, bl, br);
  }
  function placeHud() {
    hud.classList.toggle('off', !cfg.hud);
    const lg = cfg.logo; // { pad, size }（1280×720 換算）
    const tl = hud.querySelector('.tl');
    if (tl) tl.style.left = lg ? lg.pad * 2 + lg.size + 'px' : '';
    hud.classList.toggle('credit', !!cfg.credit);
    hud.classList.toggle('room', cfg.sound === 'room');
    const inp = hud.querySelector('.mo-in');
    if (inp) inp.textContent = cfg.sound === 'room' ? 'INPUT — ROOM' : cfg.sound === 'off' ? 'INPUT — OFF' : 'INPUT — VOICE';
  }
  let hudAt = 0, trailAt = 0;
  function loop(t) {
    if (destroyed) return;
    requestAnimationFrame(loop);
    // カメラの残像：動き始めと終わりは弱く、真ん中で強く（横方向だけ）。動いている間、線の上の点から 1px の尾を引く
    if (panning) {
      const q = (t - panning.t0) / panning.dur;
      if (q >= 1) { panning = null; blurN.setAttribute('stdDeviation', '0 0'); world.style.filter = ''; }
      else {
        const b = (Math.pow(Math.sin(q * Math.PI), 2) * 12).toFixed(1);
        blurN.setAttribute('stdDeviation', panning.vert ? `0 ${b}` : `${b} 0`);
        if (t - trailAt > 16) { trailAt = t; const h = headPos(); dust.spark(h.x, h.y, { count: 3, color: acc(), speed: 0.8, life: 500, gravity: 0 }); }
      }
    }
    dust.step(t);
    if (t - hudAt < 66) return;
    hudAt = t;
    const room = cfg.sound === 'room' && t - bandsAt < 1500;
    // 声の大きさ（届かないときは、話している間だけそれらしく揺らす）
    if (t - levelAt > 600) level *= 0.86;
    const fake = cfg.sound !== 'off' && t - levelAt > 1200 && t - lastCapAt < 900 ? Math.random() * 0.18 : 0;
    levelHist.push(cfg.sound === 'off' ? 0 : clamp(level + fake, 0, 1));
    levelHist.shift();
    // 周りの音が鳴っているあいだ、話していなくても粒がゆっくり漂う
    if (room && !cfg.calm && level > 0.08) dust.drift(Math.min(1, level * 1.4), acc());
    if (sc && sc.wave) sc.wave.style.setProperty('--amp', (0.35 + (room ? (bands[1] + bands[3] + bands[6]) / 3 : level) * 0.9).toFixed(2));
    if (!cfg.hud) return;
    const show = room ? bands : levelHist; // 周りの音ではスペクトラム（低い音→高い音）、声では声の大きさの移り変わり
    hud.querySelectorAll('.mo-mb').forEach((b, i) => { b.style.transform = `scaleY(${(0.08 + (show[i] || 0) * 0.92).toFixed(2)})`; });
    const tm = hud.querySelector('.mo-time');
    if (tm) { const sec = firstAt ? Math.floor((t - firstAt) / 1000) : 0; tm.textContent = `${pad2(Math.floor(sec / 60) % 100)}:${pad2(sec % 60)}`; }
    // 右上：周りの音でテンポが取れていれば BPM、ほかは話す速さ（直近20秒の字数を1分あたりに）
    while (paceLog.length && t - paceLog[0].t > 20000) paceLog.shift();
    const span20 = firstAt ? Math.min(20000, Math.max(4000, t - firstAt)) : 20000;
    const showBpm = room && bpm > 0;
    const target = showBpm ? bpm : paceLog.reduce((a, b) => a + b.n, 0) * (60000 / span20);
    paceShown += (target - paceShown) * (showBpm ? 0.35 : 0.2);
    const pe = hud.querySelector('.mo-pace');
    if (pe) pe.textContent = String(Math.round(paceShown)).padStart(3, '0');
    const unit = hud.querySelector('.tr .mo-h-s');
    if (unit) unit.textContent = showBpm ? 'BPM' : utt && utt.en ? 'WPM' : 'CPM';
    const bi = room ? (beatN + 3) % 4 : beat % 4;
    hud.querySelectorAll('.mo-sq').forEach((q, i) => q.classList.toggle('on', i === bi));
    const kwEl = hud.querySelector('.mo-kw');
    if (kwEl && kwEl.textContent !== lastKw) kwEl.textContent = lastKw ? `/ ${lastKw}` : '';
    // 長く黙っていたら、場面は字の形のまま粒になって消える（次に話すと新しい場面から）
    if (sc && !idle && utt && utt.final && t - lastCapAt > 30000) {
      idle = true;
      if (cfg.calm) sc.el.classList.add('idle'); else dustScene(sc);
    }
  }

  buildHud();
  resize();
  requestAnimationFrame(loop);

  return {
    configure(c) {
      cfg = { ...cfg, ...c };
      root.classList.toggle('calm', !!cfg.calm);
      root.classList.toggle('clear', !!cfg.transparent);
      root.dataset.taste = cfg.taste;
      applyColors();
      placeHud();
      if (cfg.transparent) { plate.style.clipPath = NONE; root.classList.remove('is-inv'); }
      if (sc) {
        const f = fs0();
        const want = sc.comp === 'bigsmall' ? [f * 0.62, f * 1.12] : sc.entry.fz ? [f * 0.5, f * 1.15] : [f, f];
        if (want[0] !== sc.fs[0] || want[1] !== sc.fs[1]) { sc.fs = want; sc.lines.forEach((ln, i) => ln && (ln.el.style.fontSize = want[i] + 'px')); }
        layout(sc, false);
      }
    },
    caption, word, fuse, audio, level: setLevel, clear, resize,
    count: () => (sc ? 1 : 0),
    destroy() {
      destroyed = true;
      clearTimeout(pumpTimer);
      dust.destroy();
      root.remove();
    },
  };
}

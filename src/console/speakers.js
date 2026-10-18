// 話者の自動の聞き分け（声で自動）。ブラウザ内だけで動き、費用はかからない。
//  1. 声の特徴：声の高さ＋声色（voicefeat.js）。声の高さが近い人どうしでも、声色の違いで分けられることが多い
//  2. 話者のモデル：登録した声の特徴の平均とばらつき（その人の声がどれくらい揺れるか）
//  3. いま話している人：直近 0.7 秒の声がどのモデルに一番近いか。ばたつかないよう、切り替えには少し粘りを持たせる
//  4. 発言ごとの話者：音声認識の結果は話し終わってから遅れて届くので、「その発言を話していた時間帯」の声で決める（vote）
//  5. 覚える：手で 1〜4 を押して直したら、直前の声でその人のモデルを更新する。登録していない枠は、新しい声が聞こえたら自動で埋める
// 判定の重い計算は AudioWorklet（voice-worklet.js）で動かす。コンソールのタブが裏に回っても止まらない

import { DIM, NCEP, makeAnalyzer, FRAME } from './voicefeat.js?v=202610190043';

const WF0 = 3;                                // 声の高さは重めに見る（男女や大人・子どもの違いに強い）
const WSUM = DIM - 1 + WF0;
const VAR_FLOOR_CEP = 0.04, VAR_FLOOR_F0 = 1.5; // ばらつきの下限（少ない声で作ったモデルが厳しくなりすぎないように）
const SHRINK = 0.1;                          // 声色どうしのつながり（共分散）を少し弱める（少ない声でも安定するように）
const CLIP = 10;                             // 1フレームの票の上限（大きな外れ値に引っ張られないように）
const KEEP_MS = 30000;                       // 声の記録を残す長さ
const CUR_WIN = 700, CUR_MIN = 6;            // いま話している人：直近の声の長さ・最低フレーム数
const SWITCH_MARGIN = 0.8, SWITCH_HOLD = 220; // 切り替え：1フレームあたりの差・続く時間
const GAP_MS = 450;                          // これより声が途切れたら、別のひと続き（区間）とみなす
const NOVEL_DIST = 3, NOVEL_MIN = 28;        // 新しい声：どのモデルからもこれより遠く、これだけのフレームが続いたら
const ADAPT_CAP = 600;                       // 聞きながら育てるとき、これまでの声の重みの上限（新しい声が効き続けるように）
const ADAPT_MARGIN = 2.5;                    // はっきりその人だと分かるとき（1フレームあたりの差）だけ育てる

const median = (arr) => { const s = [...arr].sort((x, y) => x - y); return s[s.length >> 1]; };
const round = (x, k = 1000) => Math.round(x * k) / k;
const tri = (i, j) => (i >= j ? i * (i + 1) / 2 + j : j * (j + 1) / 2 + i); // 下三角の並び

// モデル：平均 m と共分散 c（下三角）。声色の各次元のつながりも見る（母音が変わっても同じ人だと分かりやすい）
function moments(frames) {
  const n = frames.length;
  const m = new Array(DIM).fill(0), c = new Array(DIM * (DIM + 1) / 2).fill(0);
  for (const x of frames) for (let d = 0; d < DIM; d++) m[d] += x[d] / n;
  for (const x of frames) for (let i = 0; i < DIM; i++) for (let j = 0; j <= i; j++) c[tri(i, j)] += (x[i] - m[i]) * (x[j] - m[j]) / n;
  return { m, c, n };
}
function regularize(c) {
  const out = c.slice();
  for (let i = 0; i < DIM; i++) for (let j = 0; j <= i; j++) {
    const k = tri(i, j);
    if (i === j) out[k] = Math.max(c[k], i === NCEP ? VAR_FLOOR_F0 : VAR_FLOOR_CEP);
    else out[k] = i === NCEP || j === NCEP ? 0 : c[k] * (1 - SHRINK); // 声の高さは声色と切り離して重みを付ける
  }
  return out;
}
// フレームの集まりからモデルを作る
export function fitModel(frames, auto = false) {
  if (frames.length < 8) return null;
  const { m, c, n } = moments(frames);
  const f0 = 100 * 2 ** (median(frames.map((x) => x[NCEP])) / 12);
  return pack({ m, c: regularize(c), n, f0, auto });
}
// 保存用に丸める（設定に入れて localStorage に残す）
function pack(md) {
  return { m: md.m.map((x) => round(x)), c: md.c.map((x) => round(x, 10000)), n: Math.round(md.n), f0: Math.round(md.f0), auto: !!md.auto };
}
export function validModel(md) {
  return !!md && Array.isArray(md.m) && Array.isArray(md.c) && md.m.length === DIM && md.c.length === DIM * (DIM + 1) / 2 && !!prep(md);
}
// 2つの声の集まりを混ぜる（b を重み wb で）
function blend(a, b, wb) {
  const wa = 1 - wb;
  const m = a.m.map((x, d) => wa * x + wb * b.m[d]);
  const c = new Array(a.c.length);
  for (let i = 0; i < DIM; i++) for (let j = 0; j <= i; j++) {
    const k = tri(i, j);
    c[k] = wa * (a.c[k] + (a.m[i] - m[i]) * (a.m[j] - m[j])) + wb * (b.c[k] + (b.m[i] - m[i]) * (b.m[j] - m[j]));
  }
  return pack({ m, c: regularize(c), n: a.n + b.n, f0: wa * a.f0 + wb * b.f0, auto: a.auto });
}

// 計算用の下ごしらえ（コレスキー分解）。モデルごとに1回だけ
const PREP = new WeakMap();
function cholesky(c) {
  const L = new Float64Array(DIM * DIM);
  for (let i = 0; i < DIM; i++) for (let j = 0; j <= i; j++) {
    let s = c[tri(i, j)];
    for (let k = 0; k < j; k++) s -= L[i * DIM + k] * L[j * DIM + k];
    if (i === j) { if (!(s > 1e-9)) return null; L[i * DIM + i] = Math.sqrt(s); }
    else L[i * DIM + j] = s / L[j * DIM + j];
  }
  return L;
}
function prep(md) {
  let p = PREP.get(md);
  if (p !== undefined) return p;
  const L = cholesky(md.c);
  p = null;
  if (L) {
    let logdet = 0;
    for (let i = 0; i < DIM; i++) logdet += 2 * Math.log(L[i * DIM + i]) * (i === NCEP ? WF0 : 1);
    p = { L, logdet };
  }
  PREP.set(md, p);
  return p;
}
const y = new Float64Array(DIM);
function quad(L, m, x) { // 重み付きのマハラノビス距離の2乗
  let q = 0;
  for (let i = 0; i < DIM; i++) {
    let s = x[i] - m[i];
    for (let k = 0; k < i; k++) s -= L[i * DIM + k] * y[k];
    y[i] = s / L[i * DIM + i];
    q += (i === NCEP ? WF0 : 1) * y[i] * y[i];
  }
  return q;
}
// モデルから見た声の遠さ（その人自身の声ならだいたい 1 前後）
export function dist(md, x) { return quad(prep(md).L, md.m, x) / WSUM; }
function loglik(md, x) { const p = prep(md); return -0.5 * (quad(p.L, md.m, x) + p.logdet); }
// 2人の声の近さ（小さいほど聞き分けにくい）
export function modelGap(a, b) {
  const L = cholesky(a.c.map((v, k) => (v + b.c[k]) / 2));
  return L ? quad(L, a.m, b.m) / WSUM : 0;
}

export class VoiceTracker {
  constructor() {
    this.models = [];      // 枠ごとのモデル（なければ null）
    this.slots = 2;        // 使う人数
    this.tl = [];          // 声のあるフレームの記録 { t, x, r }（r：枠ごとの票）
    this.cur = 0; this.cand = -1; this.candAt = 0;
    this.floor = 0.002;    // まわりの音の大きさ（自動で追う）
    this.lastVoiced = 0;
    this.lockUntil = 0;    // 手で直した直後は、しばらく自動で切り替えない
    this.enrolledAt = 0;
    this.onEnroll = null;  // (i, model) 新しい声を自動で覚えたとき
    this.onAdapt = null;   // (i, model) 自動で作ったモデルを育てたとき
  }
  setModels(models, slots = models.length) {
    this.slots = slots;
    this.models = Array.from({ length: slots }, (_, i) => (validModel(models[i]) ? models[i] : null));
    // モデルが変わったら、記録の票を付け直す
    for (const f of this.tl) f.r = this._score(f.x);
    if (this.cur >= slots) this.cur = 0;
  }
  set(i, t = performance.now()) { this.cur = i; this.cand = -1; this.lockUntil = t + 1500; }

  _score(x) {
    const ll = this.models.map((md) => (md ? loglik(md, x) : -Infinity));
    const top = Math.max(...ll);
    return ll.map((v) => (v === -Infinity ? -CLIP : Math.max(v - top, -CLIP)));
  }
  _sum(frames) {
    const s = new Array(this.slots).fill(0);
    for (const f of frames) for (let i = 0; i < this.slots; i++) s[i] += f.r[i];
    return s;
  }

  // 1フレームぶんの声の特徴を受け取り、いま話している人を返す
  frame({ rms, feat }, t = performance.now()) {
    // まわりの音の大きさ：静かなときはすぐ下げ、うるさいときはゆっくり上げる
    if (rms < this.floor) this.floor = Math.max(0.0005, this.floor * 0.9 + rms * 0.1);
    else this.floor = Math.min(0.05, this.floor * 1.0015);
    if (this.tl.length && t - this.tl[0].t > KEEP_MS) this.tl = this.tl.filter((f) => t - f.t < KEEP_MS);
    if (!feat || rms < this.floor * 2.5) return this.cur;
    const f = { t, x: feat, r: this._score(feat) };
    this.tl.push(f);
    this.lastVoiced = t;
    this._novel(t);
    if (t < this.lockUntil) return this.cur;
    const recent = this._since(t - CUR_WIN);
    const have = this.models.some(Boolean);
    if (!have || recent.length < CUR_MIN) return this.cur;
    const s = this._sum(recent);
    let best = 0;
    for (let i = 1; i < this.slots; i++) if (s[i] > s[best]) best = i;
    const curOk = !!this.models[this.cur];
    if (best !== this.cur && (!curOk || (s[best] - s[this.cur]) / recent.length > SWITCH_MARGIN)) {
      if (this.cand !== best) { this.cand = best; this.candAt = t; }
      else if (t - this.candAt > SWITCH_HOLD || !curOk) { this.cur = best; this.cand = -1; }
    } else {
      this.cand = -1;
      this._adapt(recent, best, s);
    }
    return this.cur;
  }
  _since(t0, t1 = Infinity) {
    const out = [];
    for (let k = this.tl.length - 1; k >= 0; k--) {
      const f = this.tl[k];
      if (f.t < t0) break;
      if (f.t <= t1) out.push(f);
    }
    return out.reverse();
  }
  // 直近のひと続きの声（途切れが GAP_MS 未満のあいだ）。maxMs まで
  lastRun(maxMs = 4000, t = performance.now()) {
    const out = [];
    let prev = t;
    for (let k = this.tl.length - 1; k >= 0; k--) {
      const f = this.tl[k];
      if (prev - f.t > (out.length ? GAP_MS : 2500) || t - f.t > maxMs) break;
      out.push(f); prev = f.t;
    }
    return out.reverse();
  }

  // 登録していない枠があり、どのモデルからも遠い声がしばらく続いたら、新しい人として覚える
  _novel(t) {
    const empty = this.models.findIndex((md) => !md);
    if (empty < 0 || t - this.enrolledAt < 2500) return;
    const run = this.lastRun(2500, t);
    if (run.length < NOVEL_MIN) return;
    const known = this.models.filter(Boolean);
    if (known.length) {
      const near = Math.min(...known.map((md) => run.reduce((a, f) => a + dist(md, f.x), 0) / run.length));
      if (near < NOVEL_DIST) return;
    }
    const md = fitModel(run.map((f) => f.x), true);
    if (!md) return;
    this.models[empty] = md;
    this.enrolledAt = t;
    for (const f of this.tl) f.r = this._score(f.x);
    this.cur = empty; this.cand = -1;
    this.onEnroll && this.onEnroll(empty, md);
  }
  // はっきりその人だと分かる声で、モデルを少しずつ育てる（登録した日と声の調子やマイクの位置が違っても合っていくように）
  _adapt(recent, best, s) {
    const md = this.models[best];
    if (!md || this.slots < 2 || this.models.filter(Boolean).length < 2) return;
    const second = Math.max(...s.filter((_, i) => i !== best && this.models[i]));
    if ((s[best] - second) / recent.length < ADAPT_MARGIN) return;
    const add = recent.filter((f) => !f.used);
    if (add.length < 15) return;
    add.forEach((f) => { f.used = true; });
    const nm = fitModel(add.map((f) => f.x), md.auto);
    if (!nm) return;
    this.models[best] = blend(md, nm, add.length / (Math.min(md.n, ADAPT_CAP) + add.length));
    this.onAdapt && this.onAdapt(best, this.models[best]);
  }

  // t0〜t1 に話していたのは誰か（発言ごとの話者）。声が少なすぎるときは null
  vote(t0, t1) {
    if (!this.models.some(Boolean)) return null;
    const fr = this._since(t0, t1);
    if (fr.length < 4) return null;
    const s = this._sum(fr);
    let best = 0;
    for (let i = 1; i < this.slots; i++) if (s[i] > s[best]) best = i;
    const second = Math.max(...s.filter((_, i) => i !== best), -Infinity);
    return { i: best, margin: (s[best] - second) / fr.length, n: fr.length };
  }

  // 手で直したとき：その発言の時間帯（なければ直前のひと続き）の声で、その人のモデルを作る・更新する
  learn(i, t0, t1, now = performance.now()) {
    const run = t0 != null ? this._since(t0, t1) : this.lastRun(4000, now);
    this.set(i, now);
    if (run.length < 8) return null;
    run.forEach((f) => { f.used = true; });
    const md = this.models[i];
    const nm = fitModel(run.map((f) => f.x), md ? md.auto : true);
    if (!nm) return null;
    // すでにあるモデルには、新しい声を 3〜5 割の重みで混ぜる（間違えた声をしっかり覚える）
    this.models[i] = md ? blend(md, nm, Math.min(0.5, Math.max(0.3, nm.n / (Math.min(md.n, 300) + nm.n)))) : nm;
    for (const f of this.tl) f.r = this._score(f.x);
    return this.models[i];
  }
}

// マイクの音から声の特徴を取り出して onFrame に渡す。AudioWorklet が使えればそちらで（タブが裏でも止まらない）、
// 使えなければ画面の描画に合わせて計算する。戻り値は止める関数
export async function attachVoice(ctx, src, onFrame) {
  if (ctx.audioWorklet && typeof AudioWorkletNode !== 'undefined') {
    try {
      // このファイルと同じ版（?v=）のワークレットを読む
      await ctx.audioWorklet.addModule(new URL('./voice-worklet.js' + new URL(import.meta.url).search, import.meta.url));
      const node = new AudioWorkletNode(ctx, 'kanpe-voice', { numberOfInputs: 1, numberOfOutputs: 0 });
      const lag = FRAME / 2 / ctx.sampleRate * 1000;
      node.port.onmessage = (e) => onFrame(e.data, performance.now() - lag);
      src.connect(node);
      return () => { try { src.disconnect(node); node.port.onmessage = null; } catch { /* noop */ } };
    } catch (err) {
      if (typeof console !== 'undefined') console.warn('[KANPE] voice worklet unavailable:', err);
    }
  }
  const an = ctx.createAnalyser();
  an.fftSize = FRAME;
  src.connect(an);
  const analyze = makeAnalyzer(ctx.sampleRate);
  const buf = new Float32Array(FRAME);
  let raf = 0, on = true, k = 0;
  const loop = () => {
    if (!on) return;
    if ((k++ & 1) === 0) { an.getFloatTimeDomainData(buf); onFrame(analyze(buf, 0.002), performance.now()); }
    raf = requestAnimationFrame(loop);
  };
  loop();
  return () => { on = false; cancelAnimationFrame(raf); try { src.disconnect(an); } catch { /* noop */ } };
}

// 声の登録：数秒しゃべってもらい、声のあるフレームからモデルを作る（拾えなければ null）
//   subscribe(fn) は声の特徴を fn に流し、止める関数を返す
export async function enroll(subscribe, ms = 5000, onTick) {
  const got = [];
  let floor = 0.002;
  const t0 = performance.now();
  const stop = await subscribe(({ rms, feat }) => {
    if (rms < floor) floor = Math.max(0.0005, floor * 0.9 + rms * 0.1);
    else floor = Math.min(0.05, floor * 1.0015);
    if (feat && rms > floor * 2.5) got.push(feat);
  });
  try {
    while (performance.now() - t0 < ms) {
      onTick && onTick((performance.now() - t0) / ms, got.length);
      await new Promise((r) => setTimeout(r, 100));
    }
  } finally { stop(); }
  return got.length >= 30 ? fitModel(got) : null;
}

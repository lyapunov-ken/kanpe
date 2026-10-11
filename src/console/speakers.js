// 話者の色分け：声の高さ（基本周波数）で「いま話しているのは誰か」を推定する簡易版。
// ブラウザ内だけで動き、費用はかからない。声の高さが近い人どうしは聞き分けにくいので、
// 確実に分けたいときは手動切り替えか、クラウド認識の話者分離（おトクプラン）を使う。

// 時間波形から基本周波数を求める（正規化自己相関）。声がない・不確かなときは 0
export function detectPitch(input, rate) {
  // 計算量を減らすため 1/2 に間引く（声の高さの推定には十分）
  const buf = new Float32Array(input.length >> 1);
  for (let i = 0; i < buf.length; i++) buf[i] = (input[i * 2] + input[i * 2 + 1]) * 0.5;
  const sampleRate = rate / 2;
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < 0.012) return 0;
  const minLag = Math.floor(sampleRate / 420), maxLag = Math.min(Math.floor(sampleRate / 65), n >> 1);
  const win = n - maxLag;
  let best = 0, bestLag = 0;
  const corr = new Float32Array(maxLag + 2);
  for (let lag = minLag; lag <= maxLag + 1; lag++) {
    let s = 0, e1 = 0, e2 = 0;
    for (let i = 0; i < win; i++) {
      const a = buf[i], b = buf[i + lag];
      s += a * b; e1 += a * a; e2 += b * b;
    }
    const c = s / (Math.sqrt(e1 * e2) || 1);
    corr[lag] = c;
    if (lag <= maxLag && c > best) { best = c; bestLag = lag; }
  }
  if (best < 0.6 || !bestLag) return 0;
  // 倍音（1/2 の周期）を拾っていないか：半分の周期にも十分な山があればそちらを採る
  const half = Math.round(bestLag / 2);
  if (half >= minLag && corr[half] > best * 0.9) bestLag = half;
  // 放物線補間で周期を細かく
  const y0 = corr[bestLag - 1] || 0, y1 = corr[bestLag], y2 = corr[bestLag + 1] || 0;
  const d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
  return sampleRate / (bestLag + (Math.abs(d) < 1 ? d : 0));
}

const semis = (a, b) => Math.abs(12 * Math.log2(a / b));
const median = (arr) => { const s = [...arr].sort((x, y) => x - y); return s[s.length >> 1]; };

// 直近の声の高さから、登録済みの話者のうち最も近い人を選ぶ。ばたつかないよう、切り替えには少し粘りを持たせる
export class SpeakerTracker {
  constructor() { this.frames = []; this.cur = 0; this.cand = -1; this.candAt = 0; this.profiles = []; }
  setProfiles(f0s) { this.profiles = f0s.map((f) => (f > 0 ? f : 0)); }
  set(i) { this.cur = i; this.cand = -1; }
  push(f0, t = performance.now()) {
    this.frames = this.frames.filter((x) => t - x.t < 700);
    if (f0 > 0) this.frames.push({ f0, t });
    const valid = this.profiles.map((f, i) => [f, i]).filter(([f]) => f > 0);
    if (valid.length < 2 || this.frames.length < 6) return this.cur;
    const m = median(this.frames.map((x) => x.f0));
    let best = valid[0][1], bestD = Infinity;
    for (const [f, i] of valid) { const d = semis(m, f); if (d < bestD) { bestD = d; best = i; } }
    const curD = this.profiles[this.cur] > 0 ? semis(m, this.profiles[this.cur]) : Infinity;
    if (best !== this.cur && bestD + 1.2 < curD) {
      if (this.cand !== best) { this.cand = best; this.candAt = t; }
      else if (t - this.candAt > 350) { this.cur = best; this.cand = -1; }
    } else {
      this.cand = -1;
    }
    return this.cur;
  }
}

// 声の登録：数秒しゃべってもらい、声の高さの中央値を返す（拾えなければ 0）
export async function calibrate(analyser, sampleRate, ms = 3000, onTick) {
  const buf = new Float32Array(analyser.fftSize);
  const got = [];
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    analyser.getFloatTimeDomainData(buf);
    const f = detectPitch(buf, sampleRate);
    if (f > 0) got.push(f);
    onTick && onTick((performance.now() - t0) / ms, got.length);
    await new Promise((r) => setTimeout(r, 40));
  }
  return got.length >= 12 ? median(got) : 0;
}

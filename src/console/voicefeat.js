// 声の特徴を取り出す計算（話者の聞き分け用）。画面（DOM）を使わないので、AudioWorklet の中からも画面側からも使える。
//  - 声の高さ（基本周波数 f0）：正規化自己相関
//  - 声色（声の響きの形）：メル周波数ケプストラム（MFCC）。声の高さが近い人どうしでも、口や喉の形の違いが出る
// 1フレームは FRAME サンプル（48kHz で約 43ms）。重ねながら 1 秒に 30 回ほど計算する。

export const FRAME = 2048;
export const NCEP = 12;          // 声色の次元（c1〜c12。c0＝音の大きさは使わない）
export const DIM = NCEP + 1;     // 声色 12 ＋ 声の高さ 1
const NMEL = 26;
const FMIN = 80, FMAX = 5500;

// 時間波形から基本周波数を求める（正規化自己相関）。声がない・不確かなときは 0
export function detectPitch(input, rate, minRms = 0.012) {
  // 計算量を減らすため 1/2 に間引く（声の高さの推定には十分）
  const buf = new Float32Array(input.length >> 1);
  for (let i = 0; i < buf.length; i++) buf[i] = (input[i * 2] + input[i * 2 + 1]) * 0.5;
  const sampleRate = rate / 2;
  const n = buf.length;
  let rms = 0;
  for (let i = 0; i < n; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / n);
  if (rms < minRms) return 0;
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
  // 倍音（1/2・1/3 の周期）を拾っていないか：短い周期にも十分な山があればそちらを採る
  for (const k of [3, 2]) {
    const sub = Math.round(bestLag / k);
    if (sub >= minLag && corr[sub] > best * 0.9) { bestLag = sub; break; }
  }
  // 放物線補間で周期を細かく
  const y0 = corr[bestLag - 1] || 0, y1 = corr[bestLag], y2 = corr[bestLag + 1] || 0;
  const d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
  return sampleRate / (bestLag + (Math.abs(d) < 1 ? d : 0));
}

// 高速フーリエ変換（長さは 2 の累乗・その場で書き換える）
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len >> 1; k++) {
        const a = i + k, b = a + (len >> 1);
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

const mel = (f) => 2595 * Math.log10(1 + f / 700);
const imel = (m) => 700 * (10 ** (m / 2595) - 1);

// サンプリング周波数ごとの計算器を作る。analyze(frame) → { rms, f0, feat }（feat は声があるときだけ）
export function makeAnalyzer(sampleRate) {
  const n = FRAME;
  const win = new Float32Array(n);
  for (let i = 0; i < n; i++) win[i] = 0.54 - 0.46 * Math.cos(2 * Math.PI * i / (n - 1));
  // メルフィルタ（三角形）：どの周波数の箱を、どれだけの重みで足すか
  const hi = Math.min(FMAX, sampleRate / 2 - 100);
  const pts = [];
  for (let i = 0; i < NMEL + 2; i++) pts.push(imel(mel(FMIN) + (mel(hi) - mel(FMIN)) * i / (NMEL + 1)));
  const bin = (f) => f * n / sampleRate;
  const filters = [];
  for (let m = 0; m < NMEL; m++) {
    const a = bin(pts[m]), b = bin(pts[m + 1]), c = bin(pts[m + 2]);
    const idx = [], w = [];
    for (let k = Math.ceil(a); k <= Math.floor(c); k++) {
      const v = k <= b ? (k - a) / (b - a || 1) : (c - k) / (c - b || 1);
      if (v > 0) { idx.push(k); w.push(v); }
    }
    filters.push({ idx, w });
  }
  // 離散コサイン変換の表
  const dct = [];
  for (let c = 1; c <= NCEP; c++) {
    const row = new Float32Array(NMEL);
    for (let m = 0; m < NMEL; m++) row[m] = Math.cos(Math.PI * c * (m + 0.5) / NMEL) * Math.sqrt(2 / NMEL);
    dct.push(row);
  }
  const re = new Float32Array(n), im = new Float32Array(n), logE = new Float32Array(NMEL);

  return function analyze(frame, minRms = 0.003) {
    let s = 0;
    for (let i = 0; i < n; i++) s += frame[i] * frame[i];
    const rms = Math.sqrt(s / n);
    if (rms < minRms) return { rms, f0: 0, feat: null };
    const f0 = detectPitch(frame, sampleRate, minRms);
    if (!f0) return { rms, f0: 0, feat: null }; // 声色は母音（声の高さが取れる区間）だけで比べる
    for (let i = 0; i < n; i++) { re[i] = frame[i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let m = 0; m < NMEL; m++) {
      const { idx, w } = filters[m];
      let e = 0;
      for (let j = 0; j < idx.length; j++) { const k = idx[j]; e += w[j] * (re[k] * re[k] + im[k] * im[k]); }
      logE[m] = Math.log(e + 1e-10);
    }
    const feat = new Float32Array(DIM);
    for (let c = 0; c < NCEP; c++) {
      const row = dct[c];
      let v = 0;
      for (let m = 0; m < NMEL; m++) v += row[m] * logE[m];
      feat[c] = v;
    }
    feat[NCEP] = 12 * Math.log2(f0 / 100); // 声の高さは半音の単位（100Hz が 0）
    return { rms, f0, feat };
  };
}

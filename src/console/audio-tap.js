// 周りの音の聞き取り（AudioWorklet）。音声の処理スレッドで動くので、コンソールの画面が裏に回っても止まらない。
// 2048 点の FFT を約 21ms ごとに行い、次を送る：
//   l：音の大きさ（0〜1） b：14 帯域の強さ（0〜1・低い音から高い音へ） beat：低音の立ち上がり（拍） bpm：拍の間隔から推定したテンポ
// 依存なし。ここで扱う音はこの端末の中だけで使い、どこにも送らない。
const N = 2048, HOP = 1024, BANDS = 14;

class KanpeTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(N);
    this.pos = 0;
    this.since = 0;
    this.re = new Float32Array(N);
    this.im = new Float32Array(N);
    this.win = new Float32Array(N);
    for (let i = 0; i < N; i++) this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1));
    // 帯域の境目（40Hz〜12kHz を対数で等分）
    const nyq = sampleRate / 2;
    this.edges = [];
    for (let i = 0; i <= BANDS; i++) this.edges.push(Math.min(N / 2 - 1, Math.max(1, Math.round((40 * Math.pow(300, i / BANDS)) / nyq * (N / 2)))));
    this.bassTo = Math.max(2, Math.round(160 / nyq * (N / 2)));
    this.avg = 0;
    this.lastBeat = -1;
    this.beats = [];
    this.t = 0; // 秒
    this.peak = 1e-4;
  }
  fft() {
    const re = this.re, im = this.im;
    for (let i = 1, j = 0; i < N; i++) { // ビット反転
      let bit = N >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
    }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = (-2 * Math.PI) / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < N; i += len) {
        let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = a + len / 2;
          const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
          re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
          const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr;
        }
      }
    }
  }
  analyze() {
    let sum = 0;
    for (let i = 0; i < N; i++) {
      const v = this.ring[(this.pos + i) % N];
      sum += v * v;
      this.re[i] = v * this.win[i];
      this.im[i] = 0;
    }
    const l = Math.min(1, Math.sqrt(sum / N) * 4);
    this.fft();
    const mag = (k) => Math.hypot(this.re[k], this.im[k]) / (N / 4);
    const b = [];
    for (let i = 0; i < BANDS; i++) {
      let m = 0, c = 0;
      for (let k = this.edges[i]; k <= Math.max(this.edges[i], this.edges[i + 1] - 1); k++) { m += mag(k); c++; }
      const db = 20 * Math.log10(m / c + 1e-9);
      b.push(Math.max(0, Math.min(1, (db + 72) / 60)));
    }
    // 拍：低音のエネルギーが、直前の平均より急に大きくなったところ
    let bass = 0;
    for (let k = 1; k <= this.bassTo; k++) { const m = mag(k); bass += m * m; }
    this.peak = Math.max(this.peak * 0.999, bass);
    let beat = false;
    if (bass > this.avg * 1.45 && bass > this.peak * 0.12 && bass > 1e-6 && this.t - this.lastBeat > 0.27) {
      beat = true;
      if (this.lastBeat > 0) { const d = this.t - this.lastBeat; if (d < 1.6) this.beats.push(d); if (this.beats.length > 12) this.beats.shift(); }
      this.lastBeat = this.t;
    }
    this.avg = this.avg * 0.88 + bass * 0.12;
    // テンポ：拍の間隔の中央値を 80〜170 に折りたたむ。3秒以上拍がなければ 0
    let bpm = 0;
    if (this.beats.length >= 4 && this.t - this.lastBeat < 3) {
      const s = [...this.beats].sort((x, y) => x - y);
      bpm = 60 / s[Math.floor(s.length / 2)];
      while (bpm < 80) bpm *= 2;
      while (bpm > 170) bpm /= 2;
    }
    this.port.postMessage({ l, b, beat, bpm: Math.round(bpm) });
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) { this.ring[this.pos] = ch[i]; this.pos = (this.pos + 1) % N; }
    this.since += ch.length;
    this.t += ch.length / sampleRate;
    if (this.since >= HOP) { this.since = 0; this.analyze(); }
    return true;
  }
}
registerProcessor('kanpe-tap', KanpeTap);

// 話者の聞き分け用：マイクの音から、1秒に30回ほど声の特徴（音の大きさ・声の高さ・声色）を取り出して画面側へ送る。
// AudioWorklet は音の処理専用の場所で動くので、コンソールのタブが裏に回っても止まらない
import { FRAME, makeAnalyzer } from './voicefeat.js?v=202610190043';

class KanpeVoice extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(FRAME);
    this.frame = new Float32Array(FRAME);
    this.w = 0; this.filled = 0; this.since = 0;
    this.hop = Math.round(sampleRate / 30);
    this.analyze = makeAnalyzer(sampleRate);
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) { this.ring[this.w] = ch[i]; this.w = (this.w + 1) % FRAME; }
    this.filled = Math.min(FRAME, this.filled + ch.length);
    this.since += ch.length;
    if (this.filled >= FRAME && this.since >= this.hop) {
      this.since = 0;
      for (let i = 0; i < FRAME; i++) this.frame[i] = this.ring[(this.w + i) % FRAME];
      const r = this.analyze(this.frame, 0.002);
      this.port.postMessage({ rms: r.rms, f0: r.f0, feat: r.feat }, r.feat ? [r.feat.buffer] : []);
    }
    return true;
  }
}
registerProcessor('kanpe-voice', KanpeVoice);

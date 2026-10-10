// 無料版の音声認識：ブラウザ内蔵の Web Speech API（Chrome / Edge 推奨）。
// 途中で切れても自動で再開する。有料版ではこのクラスと同じ形のアダプターでクラウド認識に差し替える。
export class Recognizer {
  constructor({ lang = 'ja-JP', onInterim, onFinal, onState, onError } = {}) {
    Object.assign(this, { lang, onInterim, onFinal, onState, onError });
    this.wanted = false;
    this.session = 0;
    this.r = null;
  }
  static supported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }

  start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { this.onError && this.onError('unsupported'); return false; }
    this.wanted = true;
    this._open(SR);
    return true;
  }

  _open(SR) {
    const r = new SR();
    r.lang = this.lang;
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 1;
    const session = ++this.session;
    r.onstart = () => this.onState && this.onState('listening');
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0] ? res[0].transcript : '';
        const id = `${session}:${i}`;
        if (res.isFinal) this.onFinal && this.onFinal(id, text);
        else this.onInterim && this.onInterim(id, text);
      }
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') this.wanted = false;
      this.onError && this.onError(e.error);
    };
    r.onend = () => {
      if (this.wanted) {
        this.onState && this.onState('restarting');
        setTimeout(() => { if (this.wanted) { try { this._open(SR); } catch { /* 次の機会に */ } } }, 120);
      } else {
        this.onState && this.onState('stopped');
      }
    };
    this.r = r;
    try { r.start(); } catch (err) { this.onError && this.onError(String(err)); }
  }

  stop() {
    this.wanted = false;
    try { this.r && this.r.stop(); } catch { /* noop */ }
  }

  setLang(lang) {
    this.lang = lang;
    if (this.wanted) { try { this.r && this.r.stop(); } catch { /* onend で開き直す */ } }
  }
}

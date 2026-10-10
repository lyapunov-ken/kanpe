// 無料版の音声認識：ブラウザ内蔵の Web Speech API。
// PC（Chrome / Edge）は連続モード。スマホは端末ごとの癖を避けるため「一言ずつ聞いて自動で再開」する。
//  - iPhone（Safari）：連続モードは結果が膨らみ続け、10秒前後で止まる。確定結果が届かないこともある
//  - Android（Chrome）：連続モードだと結果が重複して積み上がる
// どちらも、途中結果が一定時間変わらなければその文を確定扱いにして次へ進む。
// 有料版ではこのクラスと同じ形のアダプターでクラウド認識に差し替える。

const UA = typeof navigator !== 'undefined' ? navigator.userAgent : '';
export const IS_IOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
export const IS_ANDROID = /Android/.test(UA);
export const IS_MOBILE = IS_IOS || IS_ANDROID;

const SETTLE_MS = IS_IOS ? 1300 : 1600;   // 途中結果がこの時間変わらなければ確定扱い
const WATCHDOG_MS = IS_IOS ? 9000 : 15000; // 何も起きないまま止まっていたら開き直す

export class Recognizer {
  constructor({ lang = 'ja-JP', onInterim, onFinal, onState, onError } = {}) {
    Object.assign(this, { lang, onInterim, onFinal, onState, onError });
    this.wanted = false;
    this.session = 0;
    this.r = null;
    this.mobile = IS_MOBILE;
    this.settleTimer = 0;
    this.watchdog = 0;
    this.pending = null; // { id, text } 確定していない最新の途中結果
    this.done = new Set(); // 確定済みの id（遅れて届いた確定結果を二重に出さない）
  }
  static supported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); }

  start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { this.onError && this.onError('unsupported'); return false; }
    this.wanted = true;
    if (!this.r) this._create(SR); // 1つを使い回す（iPhone で開き直すたびの効果音を減らす）
    this._begin();
    return true;
  }

  _create(SR) {
    const r = new SR();
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onstart = () => { this.onState && this.onState('listening'); this._kick(); };
    r.onresult = (e) => {
      this._kick();
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        const text = res[0] ? res[0].transcript : '';
        const id = `${this.session}:${this.mobile ? 0 : i}`;
        if (this.done.has(id)) continue;
        if (res.isFinal) this._final(id, text);
        else this._interim(id, text);
      }
    };
    r.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') this.wanted = false;
      this.onError && this.onError(e.error);
    };
    r.onend = () => {
      clearTimeout(this.watchdog);
      this._flush(); // 確定が来ないまま終わった文を確定扱いにする
      if (this.wanted) {
        this.onState && this.onState('restarting');
        setTimeout(() => { if (this.wanted) this._begin(); }, this.mobile ? 200 : 120);
      } else {
        this.onState && this.onState('stopped');
      }
    };
    this.r = r;
  }

  _begin() {
    const r = this.r;
    r.lang = this.lang;
    r.continuous = !this.mobile;
    this.session++;
    this.pending = null;
    try { r.start(); } catch (err) {
      // すでに動いている（InvalidStateError）なら何もしない
      if (!/InvalidState|already started/i.test(String(err))) this.onError && this.onError(String(err));
    }
  }

  _interim(id, text) {
    this.pending = { id, text };
    this.onInterim && this.onInterim(id, text);
    clearTimeout(this.settleTimer);
    this.settleTimer = setTimeout(() => {
      // 途中結果が止まった：確定扱いにして次の一言へ（スマホでは聞き取りを区切り直す）
      this._flush();
      if (this.mobile) { try { this.r.stop(); } catch { /* noop */ } }
    }, SETTLE_MS);
  }

  _final(id, text) {
    clearTimeout(this.settleTimer);
    this.pending = null;
    this.done.add(id);
    if (this.done.size > 200) this.done = new Set([...this.done].slice(-100));
    this.onFinal && this.onFinal(id, text);
  }

  _flush() {
    clearTimeout(this.settleTimer);
    const p = this.pending;
    if (p && p.text && !this.done.has(p.id)) this._final(p.id, p.text);
    this.pending = null;
  }

  // 何も起きないまま固まったら開き直す（スマホで時々起こる）
  _kick() {
    clearTimeout(this.watchdog);
    if (!this.wanted) return;
    this.watchdog = setTimeout(() => {
      if (!this.wanted) return;
      try { this.r.stop(); } catch { /* noop */ }
    }, WATCHDOG_MS);
  }

  stop() {
    this.wanted = false;
    clearTimeout(this.watchdog);
    this._flush();
    try { this.r && this.r.stop(); } catch { /* noop */ }
  }

  // 画面が裏に回るとスマホでは認識が止まるので、戻ってきたら開き直す
  resume() {
    if (this.wanted && this.r) { try { this.r.stop(); } catch { /* onend で開き直す */ } }
  }

  setLang(lang) {
    this.lang = lang;
    if (this.wanted) { try { this.r && this.r.stop(); } catch { /* onend で開き直す */ } }
  }
}

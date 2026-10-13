// 無料版の音声認識：ブラウザ内蔵の Web Speech API。端末ごとに3つの聞き方を使い分ける。
//  - desktop（PC の Chrome / Edge）：連続モード
//  - oneshot（iPhone / Mac の Safari）：一言ずつ聞いて自動で再開する。
//      iPhone は連続モードだと結果が膨らみ続け、10秒前後で止まる。確定結果が届かないこともある
//  - android（Android の Chrome）：連続モード。開き直すたびにシステムの「ピコン」音とマイクの許可確認が出るため、
//      一言ずつ開き直すと音と確認が繰り返される。連続モードで聞き続け、開き直す回数そのものを減らす。
//      連続モードでは結果が重複して積み上がる（前の文を含んだ文がもう一度届く）ので、すでに出した部分を取り除く。
//      黙っている間は開き直しの間隔を少しずつ空け、長く声がなければ聞き取りを止める（音が鳴り続けないように）
// 途中結果が一定時間変わらなければ、その文を確定扱いにして次へ進む。
// 有料版ではこのクラスと同じ形のアダプターでクラウド認識に差し替える。

const UA = typeof navigator !== 'undefined' ? navigator.userAgent : '';
export const IS_IOS = /iPhone|iPad|iPod/.test(UA) || (/Macintosh/.test(UA) && typeof navigator !== 'undefined' && navigator.maxTouchPoints > 1);
export const IS_ANDROID = /Android/.test(UA);
export const IS_MOBILE = IS_IOS || IS_ANDROID;
// Mac の Safari：連続モードが不安定で、マイクを別に開くと認識に音が届かなくなることがある → スマホと同じ扱い
export const IS_SAFARI = !IS_IOS && /Safari\//.test(UA) && !/Chrome|Chromium|CriOS|FxiOS|Edg|OPR|Electron/.test(UA);
export const ONE_SHOT = IS_MOBILE || IS_SAFARI; // マイクを2つ同時に開けない端末（レベル表示を出さない）
export const MODE = IS_ANDROID ? 'android' : (IS_IOS || IS_SAFARI) ? 'oneshot' : 'desktop';

const SETTLE_MS = IS_IOS ? 1300 : 1600;   // 途中結果がこの時間変わらなければ確定扱い
const WATCHDOG_MS = IS_IOS ? 9000 : IS_ANDROID ? 60000 : 15000; // 何も起きないまま止まっていたら開き直す（Android は開き直すと音が鳴るので長め）
const ANDROID_BACKOFF = [250, 1500, 3500, 6000]; // 声のない回が続いたときの、開き直しまでの待ち時間
const ANDROID_IDLE_MS = 3 * 60 * 1000;           // これだけ声がなければ聞き取りを止める
const NET_FAIL_MAX = 3; // 結果が一度も来ないまま network エラーがこの回数続いたら、このブラウザでは使えないと判断する

export class Recognizer {
  constructor({ lang = 'ja-JP', onInterim, onFinal, onState, onError } = {}) {
    Object.assign(this, { lang, onInterim, onFinal, onState, onError });
    this.wanted = false;
    this.session = 0;
    this.r = null;
    this.mode = MODE;
    this.mobile = MODE === 'oneshot'; // 一言ずつ聞く端末
    this.emptyRuns = 0; this.heardInSession = false; this.activeAt = 0;
    this.a = { done: '', seg: 0 }; // android：この回の聞き取りで確定済みの文（空白を除いた形）
    this.netFails = 0;
    this.lastResultAt = 0;
    this.audioAt = 0; this.soundAt = 0; this.speechAt = 0; // 認識側にマイクの音・声が届いた時刻（診断用）
    this.renew = false; // 次に開き直すとき、認識オブジェクトを作り直す
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
    this.netFails = 0;
    this.emptyRuns = 0;
    this.activeAt = Date.now();
    if (!this.r) this._create(SR); // 1つを使い回す（iPhone で開き直すたびの効果音を減らす）
    this._begin();
    return true;
  }

  _create(SR) {
    if (this.r) { // 古いものは切り離す（作り直したあとに古いイベントが届いても無視する）
      const o = this.r;
      o.onstart = o.onresult = o.onerror = o.onend = o.onaudiostart = o.onsoundstart = o.onspeechstart = null;
      try { o.abort(); } catch { /* noop */ }
    }
    const r = new SR();
    r.interimResults = true;
    r.maxAlternatives = 1;
    r.onstart = () => { this.onState && this.onState('listening'); this._kick(); };
    r.onaudiostart = () => { this.audioAt = Date.now(); this.onAudio && this.onAudio('audio'); };
    r.onsoundstart = () => { this.soundAt = Date.now(); };
    r.onspeechstart = () => { this.speechAt = Date.now(); };    r.onresult = (e) => {
      this._kick();
      this.netFails = 0;
      this.lastResultAt = this.activeAt = Date.now();
      this.heardInSession = true;
      if (this.mode === 'android') { this._androidResult(e); return; }
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
      if (typeof console !== 'undefined') console.warn('[KANPE] speech error:', e.error, e.message || '');
      if (e.error === 'network') {
        // 一時的な切断なら開き直せば戻る。続くようなら（音声認識サービスに届かないブラウザ）止めて知らせる
        this.renew = true;
        if (++this.netFails < NET_FAIL_MAX) return;
        this.wanted = false;
      }
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') this.wanted = false;
      this.renew = true;
      this.onError && this.onError(e.error);
    };
    r.onend = () => {
      clearTimeout(this.watchdog);
      this._flush(); // 確定が来ないまま終わった文を確定扱いにする
      if (this.wanted && this.mode === 'android') {
        // 声のない回が続いたら、開き直しの間隔を空ける。長く声がなければ止める（開き直すたびに音が鳴るため）
        this.emptyRuns = this.heardInSession ? 0 : this.emptyRuns + 1;
        if (Date.now() - this.activeAt > ANDROID_IDLE_MS) {
          this.wanted = false;
          this.onState && this.onState('stopped');
          this.onIdle && this.onIdle();
          return;
        }
        this.onState && this.onState('restarting');
        setTimeout(() => { if (this.wanted) this._begin(); }, ANDROID_BACKOFF[Math.min(this.emptyRuns, ANDROID_BACKOFF.length - 1)]);
      } else if (this.wanted) {
        this.onState && this.onState('restarting');
        setTimeout(() => { if (this.wanted) this._begin(); }, this.mobile ? 200 : 120);
      } else {
        this.onState && this.onState('stopped');
      }
    };
    this.r = r;
  }

  _begin() {
    if (this.renew && !this.mobile) { // エラーのあとは作り直す（Chrome で同じものを使い回すと結果が返らなくなることがある）
      this.renew = false;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) this._create(SR);
    }
    const r = this.r;
    r.lang = this.lang;
    r.continuous = !this.mobile;
    this.session++;
    this.pending = null;
    this.heardInSession = false;
    this.a = { done: '', seg: 0 };
    try { r.start(); } catch (err) {
      // すでに動いている（InvalidStateError）なら何もしない
      if (!/InvalidState|already started/i.test(String(err))) this.onError && this.onError(String(err));
    }
  }

  // android：連続モードで届く結果から、すでに出した部分を取り除いて、新しい部分だけを渡す
  //   よくある届き方：「今日は」（確定）→「今日は天気が」（途中）→「今日は天気がいい」（確定）…（前の文を含んで積み上がる）
  //   同じ確定文が二度届くこともある。積み上がらない（PC と同じ）届き方にもそのまま対応する
  _androidResult(e) {
    const key = (t) => t.replace(/\s+/g, '');
    const after = (raw, n) => { // 空白以外の文字を n 個進んだ後ろ
      let k = 0, i = 0;
      for (const ch of raw) { if (k >= n) break; i += ch.length; if (!/\s/.test(ch)) k++; }
      return raw.slice(i);
    };
    const fresh = (raw) => {
      const kr = key(raw), done = this.a.done;
      if (!kr) return null;
      if (done && kr.startsWith(done)) return { text: after(raw, done.length).trim(), full: kr }; // 積み上がり：後ろだけ
      if (done && done.endsWith(kr)) return null;                                                 // すでに出した文の繰り返し
      return { text: raw.trim(), full: done + kr };                                                // 新しい文
    };
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      const raw = res[0] ? res[0].transcript : '';
      const f = fresh(raw);
      if (!f || !f.text) continue;
      const id = `${this.session}:a${this.a.seg}`;
      if (this.done.has(id)) continue;
      if (res.isFinal) {
        this.a.done = f.full; this.a.seg++;
        this._final(id, f.text);
      } else {
        this._interim(id, f.text, f.full);
      }
    }
  }

  _interim(id, text, full) {
    this.pending = { id, text, full };
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
    if (p && p.text && !this.done.has(p.id)) {
      if (this.mode === 'android' && p.full) { this.a.done = p.full; this.a.seg++; } // 遅れて届く確定文と重ならないように
      this._final(p.id, p.text);
    }
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

  // 声は届いているのに結果が返らないとき：認識オブジェクトを作り直して聞き取りを再開する
  reset() {
    if (!this.wanted) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    this._flush();
    this.renew = false;
    this._create(SR); // 古いものは abort（onend は切り離し済みなので、ここで開き直す）
    setTimeout(() => { if (this.wanted) this._begin(); }, 150);
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

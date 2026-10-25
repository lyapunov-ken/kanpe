// 操作コンソール：音声認識 → キーワード抽出 → 表示イベント送信、設定と文字起こしの管理。
import { THEMES, LAYOUTS, DEFAULTS, DEFAULT_THEME, ACCENTS, LOGO_SIZES, CAP_SIZES, CAP_TTLS, CAP_LINES, LAYOUT_SIZES, GROW_STEPS, JUMP_STEPS, VERT_STEPS, OVERLAP_STEPS, LIFE_STEPS, MOTION_TASTES, MOTION_HUD, MOTION_SOUND, SIZE_KEY, VJ_STYLES, VJ_FONTS, FUSION_COLORS, FUSION_MOTIONS, FUSION_SPEEDS, ECHO_SPANS, SPEAKER_COLORS, MAX_SPEAKERS, DEFAULT_SPEAKERS, loadSettings, saveSettings } from '../core/settings.js?v=202610251050';
import { EN, L, tr } from '../core/i18n.js?v=202610251050';
import { detectPitch, SpeakerTracker, calibrate } from './speakers.js?v=202610251050';
import { createBus } from '../core/bus.js?v=202610251050';
import { connectObs } from '../core/obs.js?v=202610251050';
import { Extractor, cleanCaption, maskNg } from '../core/extract.js?v=202610251050';
import { Recognizer, IS_MOBILE, IS_IOS, IS_ANDROID, ONE_SHOT } from './recognizer.js?v=202610251050';
import { simulateSpeech } from './demo.js?v=202610251050';
import { initHelp } from './help.js?v=202610251050';
import { initNews } from './news.js?v=202610251050';
import { createGuide, guideSeen } from './guide.js?v=202610251050';
import { coinWord } from '../core/coin.js?v=202610251050';
import { PRO, PLANS, canUse, currentPlan, trialRemainingMs, addTrialUsage, trialStarted, licenseInfo, clearLicense, activateFromSession, activateFromCode, activateDev, requestLicenseEmail, refreshLicense, startCheckout, openPortal } from '../core/plan.js?v=202610251050';

const $ = (s) => document.querySelector(s);
const PLUS_LABEL = L(`${PLANS.plus.label}（月${PLANS.plus.yen}）`, `the ${PLANS.plus.labelEn} plan (${PLANS.plus.yen}/mo)`);
const saved0 = loadSettings();
let S = { ...DEFAULTS, ...saved0 };
// 聞き取る言語：自分で選んでいなければページの言語に合わせる
// （英語版を一度開くと日本語版でも英語で聞き取ってしまい、日本語が文字にならなかったため）
if (!S.langChosen) S.lang = EN ? 'en-US' : 'ja-JP';
const ROOT = EN ? '../' : ''; // 英語版は /en/ にあるので、表示ビューは1つ上
const HL = EN ? 'hl=en' : '';

const ex = new Extractor({ lang: S.lang, registered: S.registered, ng: S.ng });
const bus = createBus((m) => {
  if (m.t !== 'hello') return;
  try { obs && obs.resetBg(); } catch { /* noop */ }
  pushSettings(false);
  sendSync(m.from); // 新しく開いた窓に、いま画面に出ている言葉を渡して追いつかせる
});
let obs = null, unlinkObs = null;

let paused = false;
let t0 = null;
const transcript = [];
const uttStart = new Map();
const clock = () => { if (t0 === null) t0 = performance.now(); return (performance.now() - t0) / 1000; };

// ------------------------------------------------------------ 送信
// 別窓とプレビューを同じ画面にするしくみ：
// - 言葉ごとに「種（seed）」を付けて送る。どの窓も同じ種から置き場所・縦横を決めるので、同じ並びになる
// - 最近送った言葉を覚えておき、あとから開いた窓には、それまでの流れをまとめて渡す（窓はそれをなぞって追いつく）
const recent = []; // { at, m }
let layoutAt = performance.now(), lastLayout = S.layout; // レイアウトを切り替えた時刻（その窓は画面が作り直される）
let caps = []; // 最近の字幕（話している途中の文と、少し前の文。あとから開いた窓に渡す）
let capSeed = 0, capDone = true; // 文ごとの種（モーションの組み方・図形を、プレビューと別窓でそろえる）
const newSeed = () => (Math.random() * 4294967296) >>> 0;
function logEvent(m) {
  const t = performance.now();
  recent.push({ at: t, m });
  // 画面に残りうる時間（新語の余韻・間があいたときの延長・カンペの記憶）より古いものは忘れる
  const keep = Math.max(lifeSec() * 1000 * 3.2 * 2.6, (+S.echo || 0) * 60000) + 5000;
  while (recent.length && (t - recent[0].at > keep || recent.length > 2000)) recent.shift();
}
function send(m) {
  if (m.t === 'word' || m.t === 'fuse') { m = { ...m, seed: newSeed(), ts: Date.now() }; logEvent(m); } // ts：言った時刻（どの窓も同じ時刻を使う）
  else if (m.t === 'clear') recent.length = 0;
  else if (m.t === 'caption') {
    if (capDone) capSeed = newSeed(); // 新しい文が始まったら、新しい種
    capDone = !!m.final;
    m = { ...m, useed: capSeed };
    const last = caps[caps.length - 1];
    if (last && !last.m.final) caps.pop();
    caps.push({ at: performance.now(), m });
    if (caps.length > 3) caps.shift();
  }
  bus.send(m);
}
function sendSync(to) {
  if (!to) return;
  const t = performance.now();
  const events = recent.map((r) => ({ ...r.m, ago: Math.round(t - r.at) }));
  for (const c of caps) if (t - c.at < 12000) events.push({ ...c.m, ago: Math.round(t - c.at) }); // 字幕は最長10秒残る
  bus.send({ t: 'sync', to, events, since: Math.round(t - layoutAt) });
}
function pushSettings(save = true) {
  if (save) saveSettings(S);
  updateMore();
  if (S.layout !== lastLayout) { lastLayout = S.layout; layoutAt = performance.now(); }
  // OBS の接続先・パスワードは表示ビューに不要なので送らない
  const { obsPassword, obsUrl, ...pub } = S; // eslint-disable-line no-unused-vars
  send({ t: 'settings', s: { ...pub, credit: !canUse('credit:hide') } });
}
function deliverWords(events) {
  if (paused) return;
  const sp = speakerInfo();
  for (const e of events) { send({ t: 'word', ...e, ...sp }); remember(e); }
}
function deliverCaption(raw, final) {
  if (paused) return;
  const t = maskNg(cleanCaption(raw), ex.ng);
  if (t) send({ t: 'caption', text: t, final, ...speakerInfo() });
}

function onInterim(id, text) {
  if (!uttStart.has(id)) {
    uttStart.set(id, clock());
    if (uttStart.size > 100) uttStart.delete(uttStart.keys().next().value); // 確定が来なかった文の印をためこまない
  }
  deliverWords(ex.interim(id, text));
  deliverCaption(text, false);
  $('#live').textContent = cleanCaption(text);
}
function onFinal(id, text) {
  const start = uttStart.has(id) ? uttStart.get(id) : clock();
  uttStart.delete(id);
  deliverWords(ex.final(id, text));
  deliverCaption(text, true);
  $('#live').textContent = '';
  const clean = cleanCaption(text);
  if (!clean) return;
  const sp = speakerInfo();
  const item = { start, end: Math.max(start + 0.8, clock()), raw: text, clean, spn: sp.spn || '', spc: sp.spc || '' };
  transcript.push(item);
  appendTx(item);
  saveTranscriptSoon();
}

// ------------------------------------------------------------ 音声認識
const rec = new Recognizer({
  lang: S.lang, onInterim, onFinal,
  onState: (st) => {
    if (st === 'listening') { setStatus('on', L('聞き取り中', 'Listening')); if (!diag.since) diag.since = Date.now(); }
    else if (st === 'restarting') setStatus('on', L('聞き取り中', 'Listening'));
    else if (st === 'stopped') { setStatus('', L('待機中', 'Idle')); setMic(false); stopMeter(); releaseWake(); stopDiag(); }
  },
  onError: (err) => {
    const msg = {
      unsupported: IS_IOS ? L('このブラウザでは音声認識を使えません。iPhone は Safari で開いてください（アプリ内ブラウザは非対応です）', 'Speech recognition isn’t available in this browser. On iPhone, open this page in Safari (in-app browsers aren’t supported).')
        : IS_ANDROID ? L('このブラウザでは音声認識を使えません。Android は Chrome で開いてください（アプリ内ブラウザは非対応です）', 'Speech recognition isn’t available in this browser. On Android, open this page in Chrome (in-app browsers aren’t supported).')
        : L('このブラウザは音声認識に対応していません。Chrome / Edge / Safari で開いてください', 'This browser doesn’t support speech recognition. Please use Chrome, Edge or Safari.'),
      'not-allowed': IS_IOS ? L('マイクか音声認識が許可されていません。「設定」→「Safari」→「マイク」を許可し、「設定」→「Siri」で Siri（または音声入力）をオンにしてください', 'Microphone or speech recognition is blocked. Allow the microphone in Settings → Safari → Microphone, and turn on Siri (or Dictation) in Settings → Siri.')
        : IS_MOBILE ? L('マイクが許可されていません。ブラウザのサイト設定でマイクを許可してください', 'The microphone is blocked. Allow it in your browser’s site settings.')
        : L('マイクの使用が許可されていません。アドレスバーのマイクアイコンから許可してください', 'The microphone is blocked. Allow it from the microphone icon in the address bar.'),
      'service-not-allowed': IS_IOS ? L('音声認識を使えません。「設定」→「Siri」で Siri（または「一般」→「キーボード」→「音声入力」）をオンにしてください', 'Speech recognition is unavailable. Turn on Siri in Settings → Siri (or Dictation in General → Keyboard).')
        : L('音声認識サービスを使えません（Chrome / Edge / Safari と https で開いてください）', 'The speech service is unavailable. Use Chrome, Edge or Safari over https.'),
      'audio-capture': L('マイクが見つかりません', 'No microphone was found.'),
      network: L('音声認識サービスに接続できません。ネットワークを確認し、Google Chrome か Microsoft Edge で開いてください（Brave などの一部のブラウザやアプリ内のブラウザでは使えません）', 'Can’t reach the speech service. Check your connection and use Google Chrome or Microsoft Edge (some browsers such as Brave, and in-app browsers, aren’t supported).'),
    }[err] || L(`音声認識エラー：${err}`, `Speech recognition error: ${err}`);
    toast(msg);
    if (!rec.wanted) { setStatus('err', L('エラー', 'Error')); setMic(false); stopMeter(); releaseWake(); stopDiag(); }
  },
});

function setMic(on) {
  $('#btnMic').classList.toggle('on', on);
  $('#btnMic').setAttribute('aria-pressed', String(on));
  $('#btnMic').setAttribute('aria-label', on ? L('聞き取りを止める', 'Stop listening') : L('話しはじめる', 'Start talking'));
  $('#micLabel').textContent = on ? L('聞き取り中', 'Listening') : L('話しはじめる', 'Start talking');
  $('#micHint').textContent = on ? L('もう一度押すと止まります', 'Press again to stop') : L('押すとマイクで聞き取りを始めます', 'Press to start listening with your mic');
}
// Android：音声認識だけに任せると、開き直すたびにマイクの許可を確かめに行き、確認が何度も出ることがある。
// まだ許可が決まっていなければ、最初に1回だけマイクの許可を取ってから始める（取ったマイクはすぐ閉じる）
let micAsked = false; // このページを開いている間に、もう許可を取ったか
async function micState() {
  try { const st = navigator.permissions && await navigator.permissions.query({ name: 'microphone' }); return st ? st.state : ''; } catch { return ''; }
}
async function ensureMicPermission() {
  if (!IS_ANDROID || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return true;
  const st = await micState();
  if (st === 'granted') return true;
  if (st === 'denied') { rec.onError('not-allowed'); return false; }
  if (micAsked) return true;
  try {
    const ms = await navigator.mediaDevices.getUserMedia({ audio: true });
    ms.getTracks().forEach((t) => t.stop());
    micAsked = true;
    // 「今回のみ許可」を選ぶと許可が残らず、聞き取りを開き直すたびに確認が出ることがある。常に許可にする方法を1回だけ案内する
    if ((await micState()) === 'prompt') {
      setTimeout(() => toast(L('マイクの確認が何度も出るときは、アドレスバー左のアイコン →「権限」→「マイク」を「許可」にしてください（「今回のみ」だと、聞き取りを開き直すたびに確認が出ます）',
        'If the microphone prompt keeps coming back, tap the icon left of the address bar → Permissions → Microphone and choose Allow (“Only this time” asks again each time listening restarts).'), 10000), 1500);
    }
    return true;
  } catch (e) {
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) { rec.onError('not-allowed'); return false; }
    return true; // そのほかの失敗は、音声認識側に任せる
  }
}
let micBusy = false; // 許可を待っている間の二度押しを防ぐ
$('#btnMic').addEventListener('click', async () => {
  if (rec.wanted) { rec.stop(); setMic(false); stopMeter(); releaseWake(); stopDiag(); return; }
  if (!Recognizer.supported()) { rec.onError('unsupported'); return; }
  if (micBusy) return;
  micBusy = true;
  const ok = await ensureMicPermission();
  micBusy = false;
  if (!ok) return;
  stopDemo();
  clock();
  if (rec.start()) {
    setMic(true); setStatus('on', L('準備中', 'Starting'));
    // スマホと Mac の Safari はマイクを2つ同時に開くと音声認識に音が届かなくなるので、レベル表示はそれ以外のみ。
    // PC でも、認識がマイクをつかんでから（audiostart）開く。取り合いで認識に音が届かなかった端末では開かない
    if (!ONE_SHOT && !meterOff()) {
      let opened = false;
      const open = () => { if (!opened && rec.wanted) { opened = true; startMeter(); } };
      rec.onAudio = open;
      setTimeout(open, 2000);
    }
    if (meterOff() && !ONE_SHOT && speakersOn() && S.speakerMode === 'auto') {
      toast(L('この端末では、音声認識とマイクを共有できないため、声の高さでの話者の自動切り替えを使えません。1〜4 キーかボタンで切り替えてください', 'On this device the mic can’t be shared with speech recognition, so automatic speaker switching by pitch is unavailable. Switch speakers with keys 1–4 or the buttons.'), 7000);
    }
    keepAwake();
    startDiag();
  }
});

// Android：長く声がなかったので止めた（開き直すたびにシステムの音が鳴るため）
rec.onIdle = () => {
  toast(L('3分間声が聞こえなかったので、聞き取りを止めました（Android は聞き取りを開き直すたびに通知音が鳴るため）。もう一度押すと再開します',
    'No voice for 3 minutes, so listening stopped (Android plays a sound every time listening restarts). Press again to resume.'), 8000);
};

// 聞き取りの自己診断：「聞き取り中」なのに文字が出ないとき、原因を推定して直す・知らせる
//  - 声はマイクに届いているのに、認識側には音が届いていない → レベル表示用のマイクとの取り合い。
//    レベル表示を止め（この端末では以後開かない）、認識を開き直す
//  - 認識側にも声が届いているのに結果が返らない → 認識を作り直して再開。それでもだめなら言語設定・ブラウザを案内
//  - マイクの音がほとんど届いていない → 入力デバイスを案内
//  レベル表示を止めるのは、まず「その回の聞き取りの間だけ」（お試し）。止めたあとに認識が戻ったときだけ取り合いと確定し、
//  この端末では 7 日間レベル表示を開かない。戻らなければレベル表示は関係なかったので、すぐ元に戻す。
//  （以前は1回の判定で永久に止めていたため、認識が一時的に固まっただけでもレベル表示が二度と動かなくなっていた）
const METER_OFF_KEY = 'kanpe.meter.off.v2';
const METER_OFF_DAYS = 7;
try { localStorage.removeItem('kanpe.meter.off'); } catch { /* 古い永久の印は消す */ }
function meterOff() {
  try {
    const v = JSON.parse(localStorage.getItem(METER_OFF_KEY) || 'null');
    if (v && v.until > Date.now()) return true;
    if (v) localStorage.removeItem(METER_OFF_KEY);
  } catch { /* noop */ }
  return false;
}
function setMeterOff(on) {
  try { if (on) localStorage.setItem(METER_OFF_KEY, JSON.stringify({ until: Date.now() + METER_OFF_DAYS * 86400000 })); else localStorage.removeItem(METER_OFF_KEY); } catch { /* noop */ }
  syncMeterNote();
}
// レベル表示を止めているときは、その旨と「戻す」ボタンを出す
function syncMeterNote() {
  const b = $('#meterOn');
  if (b) b.hidden = ONE_SHOT || !meterOff();
}
const diag = { since: 0, voiceMs: 0, peak: 0, step: 0, silentWarned: false, timer: 0, last: 0, guided: false, trialAt: 0 };
function startDiag() {
  stopDiag();
  Object.assign(diag, { since: 0, voiceMs: 0, peak: 0, step: 0, silentWarned: false, last: performance.now(), guided: false, trialAt: 0 });
  diag.timer = setInterval(checkDiag, 1000);
}
function stopDiag() { clearInterval(diag.timer); diag.timer = 0; diag.since = 0; diag.trialAt = 0; }
function diagLevel(v) { // メーターから毎フレーム呼ばれる
  const t = performance.now();
  if (v > 0.12) diag.voiceMs += Math.min(100, t - diag.last);
  diag.peak = Math.max(diag.peak, v);
  diag.last = t;
}
function guideLangBrowser() {
  if (diag.guided) return;
  diag.guided = true;
  const langName = S.lang === 'en-US' ? L('英語', 'English') : L('日本語', 'Japanese');
  // ブラウザには声が届いているのに、ブラウザの音声認識が文字を返していない（KANPE の外の問題）。試せることを案内する
  toast(L(`ブラウザには声が届いていますが、ブラウザの音声認識が文字を返していません。「言語」（いまは${langName}）を確認し、直らなければブラウザの再起動、パソコンの入力マイクの切り替え、別のブラウザ（Edge / Safari）を試してください`, `Your browser hears you, but its speech recognition isn’t returning text. Check “Language” (now: ${langName}); if that doesn’t help, restart the browser, switch your computer’s input mic, or try another browser (Edge / Safari).`), 10000);
}
function checkDiag() {
  if (!rec.wanted || !diag.since || paused) return;
  const now = Date.now();
  if (diag.trialAt) { // レベル表示をお試しで止めている
    if (rec.lastResultAt >= diag.trialAt) { // 止めたら認識が戻った → 取り合いだったと確定
      diag.trialAt = 0;
      setMeterOff(true);
      Object.assign(diag, { since: now, voiceMs: 0, peak: 0, step: 0 });
      toast(L(`この端末では、レベル表示と音声認識がマイクを取り合うため、レベル表示を${METER_OFF_DAYS}日間止めます（メーターの下の「レベル表示を戻す」でいつでも戻せます）`, `On this device the level meter and speech recognition compete for the mic, so the meter is off for ${METER_OFF_DAYS} days (use “Show level meter” under it to bring it back).`), 8000);
      return;
    }
    if (now - diag.trialAt > 12000) { // 止めても戻らない → レベル表示は関係なかった。元に戻して、認識側の対処へ
      diag.trialAt = 0;
      if (rec.wanted && !meterAnalyser) startMeter();
      Object.assign(diag, { since: now, voiceMs: 0, peak: 0, step: 1 });
      guideLangBrowser();
    }
    return;
  }
  if (rec.lastResultAt >= diag.since) { Object.assign(diag, { since: now, voiceMs: 0, peak: 0, step: 0 }); return; } // 正常
  const elapsed = now - diag.since;
  if (!meterAnalyser) { // レベル表示なし：声の有無は分からないので、認識側の手がかりだけで判断する
    if (elapsed > 15000 && rec.speechAt >= diag.since) guideLangBrowser();
    return;
  }
  if (!diag.silentWarned && elapsed > 7000 && diag.peak < 0.04) {
    diag.silentWarned = true;
    toast(L('マイクの音がほとんど届いていません。パソコンの入力デバイス（サウンド設定）と、アドレスバーのマイクアイコンで選ばれているマイクを確認してください', 'Almost no sound is reaching the microphone. Check your computer’s input device (sound settings) and the mic selected via the microphone icon in the address bar.'));
    return;
  }
  // 声（または BGM）が十分に届いているのに、一定時間まったく結果がないときだけ動く（誤報を避けるため控えめに）
  if (elapsed < 8000 || diag.voiceMs < 4000) return;
  const recHears = rec.soundAt >= diag.since || rec.speechAt >= diag.since;
  if (!recHears) {
    // マイクの取り合いかもしれない：この回だけレベル表示を止めて、認識だけにマイクを渡して確かめる
    stopMeter();
    diag.trialAt = now;
    rec.reset();
    toast(L('音声認識にマイクの音が届いていないようなので、レベル表示をいったん止めて聞き取りを開き直しました。もう一度話してみてください', 'Speech recognition doesn’t seem to be getting your mic, so the level meter was paused and listening restarted. Please try speaking again.'), 7000);
    return;
  }
  if (diag.step === 0) {
    diag.step = 1; diag.since = now; diag.voiceMs = 0;
    rec.reset();
    toast(L('声は届いていますが文字になりません。聞き取りを開き直しました。もう一度話してみてください', 'Your voice is reaching the mic but no text is coming back. Listening was restarted — please try speaking again.'));
  } else {
    guideLangBrowser();
  }
}

// 聞き取り中は画面を消さない（スマホ）。裏に回って戻ってきたら認識を開き直す
let wakeLock = null;
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) { wakeLock = await navigator.wakeLock.request('screen'); wakeLock.addEventListener('release', () => { wakeLock = null; }); } } catch { /* 任意 */ }
}
function releaseWake() { try { wakeLock && wakeLock.release(); } catch { /* noop */ } wakeLock = null; }
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !rec.wanted) return;
  keepAwake();
  if (IS_MOBILE) rec.resume();
});
if (IS_MOBILE) document.body.classList.add('is-mobile');

// 入力レベル表示（音声認識とは別に、マイクが拾えているかの目安）
let meterCtx = null, meterStream = null, meterRaf = 0, meterAnalyser = null;
async function startMeter() {
  try {
    // 音声処理（エコー除去など）を切ったストリームにする。macOS ではエコー除去つきのマイクを別に開くと、
    // 同じブラウザの音声認識に音が届かなくなることがあるため
    meterStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    if (!rec.wanted) { meterStream.getTracks().forEach((t) => t.stop()); meterStream = null; return; }
    meterCtx = new AudioContext();
    if (meterCtx.state === 'suspended') meterCtx.resume().catch(() => {}); // 自動再生の制限で止まった状態で作られることがある
    const src = meterCtx.createMediaStreamSource(meterStream);
    const an = meterCtx.createAnalyser();
    an.fftSize = 2048; // 声の高さ（話者の推定）にも使うので長めに取る
    src.connect(an);
    meterAnalyser = an;
    startTap(meterCtx, src);
    const buf = new Float32Array(an.fftSize);
    const bar = $('#meter');
    let frame = 0, lvlAt = 0;
    const loop = () => {
      an.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);
      const v = Math.min(1, rms * 4);
      bar.style.transform = `scaleX(${v.toFixed(3)})`;
      diagLevel(v);
      const t = performance.now();
      // VJ モードには声の大きさを送る（イコライザー用・毎秒20回まで）
      if ((S.layout === 'vj' || S.layout === 'motion') && t - lvlAt > 50 && !paused) { lvlAt = t; send({ t: 'lvl', v: Math.min(1, v * 1.6) }); }
      // 話者の自動推定（声の高さ）
      if (S.speakerMode === 'auto' && speakersOn() && (frame++ & 1) === 0) {
        const i = tracker.push(detectPitch(buf, meterCtx.sampleRate), t);
        if (i !== curSp) setSpeaker(i, true);
      }
      meterRaf = requestAnimationFrame(loop);
    };
    loop();
  } catch { /* メーターは任意 */ }
}
function stopMeter() {
  cancelAnimationFrame(meterRaf);
  try { tapNode && tapNode.disconnect(); } catch { /* noop */ }
  tapNode = null;
  try { meterStream && meterStream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
  try { meterCtx && meterCtx.close(); } catch { /* noop */ }
  meterStream = meterCtx = meterAnalyser = null;
  $('#meter').style.transform = 'scaleX(0)';
}

// ---- 周りの音（モーションの「音に反応：周りの音」）
// マイクの音を AudioWorklet（audio-tap.js）で聞き分け、帯域・拍・テンポを表示ビューへ送る。
// 音声の処理スレッドで動くので、コンソールが裏に回っていても止まらない。音はこの端末の中だけで使い、どこにも送らない
let tapNode = null, audAt = 0, fakeAud = 0;
async function startTap(ctx, src) {
  try {
    if (!ctx.audioWorklet) return;
    await ctx.audioWorklet.addModule(new URL('./audio-tap.js' + new URL(import.meta.url).search, import.meta.url));
    if (meterCtx !== ctx) return; // 待っている間にマイクが止まった
    tapNode = new AudioWorkletNode(ctx, 'kanpe-tap', { numberOfOutputs: 1 });
    const mute = ctx.createGain();
    mute.gain.value = 0; // 解析のためだけにつなぐ（音は鳴らさない）
    src.connect(tapNode);
    tapNode.connect(mute);
    mute.connect(ctx.destination);
    tapNode.port.onmessage = (e) => sendAud(e.data);
  } catch { /* 周りの音への反応は任意 */ }
}
function sendAud(d) {
  if (S.layout !== 'motion' || S.mSound !== 'room' || paused || !d) return;
  const t = performance.now();
  if (!d.beat && t - audAt < 60) return; // 拍はすぐ、ほかは毎秒16回まで
  audAt = t;
  send({ t: 'aud', l: Math.round((d.l || 0) * 1000) / 1000, b: (d.b || []).map((v) => Math.round(v * 100)), beat: !!d.beat, bpm: d.bpm || 0 });
}
// デモ中はマイクを使わないので、120 BPM の疑似ビートで見た目を確かめられるように
function fakeBeat() {
  if (S.layout !== 'motion' || S.mSound !== 'room' || meterAnalyser) return;
  const t = performance.now(), ph = (t % 500) / 500, kick = Math.pow(1 - ph, 3);
  const b = Array.from({ length: 14 }, (_, i) => Math.max(0, Math.min(1, (i < 3 ? 0.35 + kick * 0.6 : 0.55 - i * 0.025) + (Math.random() - 0.5) * 0.18 + Math.sin(t / 900 + i) * 0.06)));
  const beat = ph < fakeBeat.last; // 拍の頭を通りすぎた
  fakeBeat.last = ph;
  sendAud({ l: 0.25 + kick * 0.45, b, beat, bpm: 120 });
}
fakeBeat.last = 1;
// 「周りの音」を選んだときの案内
function soundHint() {
  if (ONE_SHOT || meterOff()) {
    toast(L('この端末では音声認識とマイクを同時に開けないため、周りの音には反応できません（デモでは疑似ビートで見た目を確かめられます）', 'On this device the mic can’t be shared with speech recognition, so room sound can’t be used (the demo shows it with a simulated beat).'), 7000);
  } else if (!rec.wanted && !demoRunning) {
    toast(L('マイクを始めると、BGM や会場の音の拍に合わせて画面が脈打ちます。マイクに音楽が聞こえる場所で使ってください（音はこの端末の中だけで使います）', 'Start the mic and the screen pulses to the beat of music or room sound. Make sure the mic can hear the music (audio stays on this device).'), 7000);
  }
}

$('#meterOn').addEventListener('click', () => {
  setMeterOff(false);
  if (rec.wanted && !meterAnalyser) startMeter();
  toast(L('レベル表示を戻しました', 'The level meter is back on'));
});
syncMeterNote();

// ------------------------------------------------------------ デモとテキスト入力
let demoRunning = false;
function stopDemo() { demoRunning = false; clearInterval(fakeAud); fakeAud = 0; $('#btnDemo').textContent = L('デモを流す', 'Play demo'); }
$('#btnDemo').addEventListener('click', async () => {
  if (demoRunning) { stopDemo(); return; }
  if (rec.wanted) { rec.stop(); setMic(false); stopMeter(); }
  demoRunning = true;
  clearInterval(fakeAud);
  fakeAud = setInterval(fakeBeat, 50); // 「周りの音」のときだけ疑似ビートを送る（ほかは何もしない）
  $('#btnDemo').textContent = L('デモを止める', 'Stop demo');
  setStatus('demo', L('デモ再生中', 'Demo playing'));
  // 話者の色分けがオンなら、デモでは話者を交互に切り替える
  const demoFinal = (id, t) => { onFinal(id, t); if (speakersOn()) setSpeaker((curSp + 1) % S.speakerCount); };
  await simulateSpeech({ lang: S.lang, onInterim, onFinal: demoFinal, shouldStop: () => !demoRunning, loop: true });
  stopDemo();
  setStatus('', L('待機中', 'Idle'));
});
let typed = 0;
$('#typeForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#typeInput').value.trim();
  if (!v) return;
  onFinal(`typed:${typed++}`, v);
  $('#typeInput').value = '';
});

// ------------------------------------------------------------ 設定 UI
function segButtons(container, entries, key) {
  const box = $(container);
  box.replaceChildren();
  for (const [id, def] of Object.entries(entries)) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(String(S[key]) === id));
    b.title = tr(def, 'note');
    if (key === 'theme') {
      b.className = 'theme';
      const tile = document.createElement('span');
      tile.className = 'tile';
      tile.textContent = '字';
      tile.style.setProperty('--sw-bg', def.bg === 'transparent' ? 'repeating-conic-gradient(#3a3d44 0 25%, #2a2d33 0 50%) 0 0 / 10px 10px' : def.bg);
      tile.style.setProperty('--sw-ink', def.ink);
      tile.style.setProperty('--sw-accent', def.accent);
      tile.style.fontFamily = `${def.family}, ${def.fallback}`;
      tile.style.fontWeight = def.strong;
      const name = document.createElement('span');
      name.textContent = tr(def);
      b.append(tile, name);
    } else {
      b.textContent = tr(def);
      if (key === 'vjFont') { b.style.fontFamily = `${def.family}, sans-serif`; b.style.fontWeight = def.weight; } // 書体の名前をその書体で見せる
    }
    if (def.pro && plusLocked(key === 'layout' ? 'layout:vj' : 'theme:premium')) b.classList.add('locked');
    if (def.pro && key === 'layout') { // お手軽プランの印（無料プランのときだけ見える。console.css）
      const t = document.createElement('em');
      t.className = 'seg-tag plus-mark';
      t.title = L('お手軽プランの機能', 'Plus plan feature');
      t.setAttribute('aria-hidden', 'true');
      t.innerHTML = '<b>+</b>';
      b.appendChild(t);
    }
    b.addEventListener('click', () => pick(container, entries, key, id, def));
    box.appendChild(b);
  }
  if (key === 'layout') renderLayOpts();
}
function pick(container, entries, key, id, def) {
  if (key === 'theme' && def.pro && plusLocked('theme:premium')) {
    toast(L(`お試し期間（1日）は終わりました。プレミアム書体は${PLUS_LABEL}で続けて使えます`, `Your 1-day trial has ended. Premium typefaces are part of ${PLUS_LABEL}.`));
    return;
  }
  if (key === 'layout' && def.pro && plusLocked('layout:vj')) {
    toast(L(`お試し期間（1日）は終わりました。VJ モードは${PLUS_LABEL}で使えます`, `Your 1-day trial has ended. VJ mode is part of ${PLUS_LABEL}.`));
    return;
  }
  if (key === 'speakerMode' && id !== 'off' && plusLocked('speaker:labels')) {
    toast(L(`お試し期間（1日）は終わりました。話者の色分けは${PLUS_LABEL}で使えます`, `Your 1-day trial has ended. Speaker colors are part of ${PLUS_LABEL}.`));
    return;
  }
  if (key === 'speakerMode' && id === 'auto' && IS_MOBILE) {
    toast(L('スマホでは「声で自動」は使えません。手動で切り替えてください', 'Voice-based switching isn’t available on phones. Please switch speakers manually.'));
    return;
  }
  if (key === 'mSound' && id === 'room') soundHint();
  if (key === 'speakerCount') { S[key] = +id; renderSpeakers(); pushSettings(); return; }
  if (key === 'speakerMode') { S[key] = id; renderSpeakers(); updateTrial(); pushSettings(); return; }
  S[key] = NUM_KEYS.has(key) ? +id : id; // 回数・秒数・行数は数で持つ
  if (key === 'theme') renderThemes(); else segButtons(container, entries, key);
  if (LAY_KEYS.has(key)) layNote(entries[id], container); // 選んだ段の説明を、レイアウトの説明の場所に少しだけ出す
  if (key === 'fusionMotion') $('#fzMotionNote').textContent = tr(FUSION_MOTIONS[id], 'note');
  if (key === 'fusionMotion' || key === 'fusionSpeed') setTimeout(() => fuse(false), 150); // 選んだ見た目をすぐ見せる（言葉が出ていれば）
  updateTrial();
  pushSettings();
  if (CAP_KEYS.has(key)) send({ t: 'capPeek' }); // プレビューで、字幕ライン（最下部）の場所を示す
}

// ---- レイアウトごとの設定（3段階）と、字幕ライン（画面の最下部）の設定 ----
const NUM_KEYS = new Set(['cGrow', 'kGrow', 'cLife', 'capTtl', 'capLines']);
// 言葉が消えるまでの秒数（組版は「残る時間」。表示ビューの lifeSec と同じ）
function lifeSec() { return S.layout === 'compose' && LIFE_STEPS[S.cLife] ? +S.cLife : S.ttl; }
const LAY_KEYS = new Set(['cSize', 'kSize', 'mSize', 'cGrow', 'kGrow', 'cJump', 'cVert', 'cOverlap', 'cLife', 'mTaste', 'mHud', 'mSound', 'echo', 'vjStyle', 'vjFont']);
const CAP_KEYS = new Set(['capSize', 'capTtl', 'capLines']);
// レイアウトの説明。いまのレイアウトだけに効く設定だと分かるように、名前を添える
const COLON = L('：', ': ');
function layNoteDefault() {
  const d = LAYOUTS[S.layout];
  return d ? `${tr(d)}${COLON}${tr(d, 'note')}` : '';
}
let layNoteTimer = 0;
function layNote(def, container) {
  const box = $('#layoutNote');
  clearTimeout(layNoteTimer);
  const lbl = container && $(container) && $(container).parentElement.querySelector('.lbl');
  const head = lbl && !container.startsWith('#vj') ? lbl.textContent + COLON : '';
  if (!def || !tr(def, 'note')) { box.textContent = layNoteDefault(); return; }
  box.textContent = head + tr(def, 'note');
  box.classList.add('flash');
  layNoteTimer = setTimeout(() => { box.textContent = layNoteDefault(); box.classList.remove('flash'); }, 4000);
}
function renderLayOpts() {
  const lay = S.layout;
  $('#layoutNote').textContent = layNoteDefault();
  $('#layoutNote').classList.remove('flash');
  $('#vjOpts').hidden = lay !== 'vj';
  for (const o of document.querySelectorAll('#layGrid .opt[data-lay]')) o.hidden = !o.dataset.lay.split(' ').includes(lay);
  document.body.classList.toggle('is-vj', lay === 'vj'); // VJ では効かない設定を隠す
  document.body.classList.toggle('is-motion', lay === 'motion'); // モーションでは字幕ラインを使わない
  if (lay === 'vj') return;
  segButtons('#optSize', LAYOUT_SIZES, SIZE_KEY[lay]);
  if (lay === 'compose' || lay === 'kanpe') segButtons('#optGrow', GROW_STEPS, lay === 'kanpe' ? 'kGrow' : 'cGrow');
  if (lay === 'compose') { segButtons('#optJump', JUMP_STEPS, 'cJump'); segButtons('#optVert', VERT_STEPS, 'cVert'); segButtons('#optOverlap', OVERLAP_STEPS, 'cOverlap'); segButtons('#optLife', LIFE_STEPS, 'cLife'); }
  if (lay === 'kanpe') segButtons('#echoSpans', ECHO_SPANS, 'echo');
  if (lay === 'motion') { segButtons('#optTaste', MOTION_TASTES, 'mTaste'); segButtons('#optHud', MOTION_HUD, 'mHud'); segButtons('#optSound', MOTION_SOUND, 'mSound'); }
}
function renderCapOpts() {
  segButtons('#capSizes', CAP_SIZES, 'capSize');
  segButtons('#capTtls', CAP_TTLS, 'capTtl');
  segButtons('#capLinesSeg', CAP_LINES, 'capLines');
  $('#capCard').classList.toggle('off', !S.caption);
}
// 以前の設定を、新しい設定に移す（1回だけ）。
// 以前の「文字サイズ」は言葉全体の大きさだったので、各レイアウトの文字の大きさへ。
// 「テロップ」はモーションに置き換わったので、テロップを選んでいた人はモーションへ（文字の大きさも引き継ぐ）。
// 言葉の基準の大きさ・表示時間・同時に出す語は、コンソールからは変えない（固定の値に戻す）
let migrated = false;
function migrateSettings() {
  const fromOld = !migrated && !('cSize' in saved0) && Object.keys(saved0).length > 0; // 以前の版で保存した設定がある人だけ
  migrated = true;
  if (fromOld) {
    const old = +S.baseSize || DEFAULTS.baseSize;
    const sz = old <= 30 ? 's' : old >= 42 ? 'l' : 'm';
    S.cSize = S.kSize = S.mSize = sz;
    const ttl = +S.ttl || DEFAULTS.ttl;
    S.cLife = ttl <= 5 ? 5 : ttl >= 15 ? 30 : 8;
    S.cVert = S.vertical === false ? 'off' : 'mid';
  }
  if (S.layout === 'ticker') S.layout = 'motion';
  if (S.tSize && !('mSize' in saved0)) S.mSize = S.tSize;
  delete S.tSize; delete S.tSpeed;
  S.baseSize = DEFAULTS.baseSize;
  S.ttl = DEFAULTS.ttl;
  S.maxWords = DEFAULTS.maxWords;
  for (const k of ['cSize', 'kSize', 'mSize']) if (!LAYOUT_SIZES[S[k]]) S[k] = 'm';
  for (const k of ['cGrow', 'kGrow']) S[k] = GROW_STEPS[S[k]] ? +S[k] : 1;
  if (!JUMP_STEPS[S.cJump]) S.cJump = 'mid';
  if (!VERT_STEPS[S.cVert]) S.cVert = 'mid';
  if (!OVERLAP_STEPS[S.cOverlap]) S.cOverlap = 'off';
  S.cLife = LIFE_STEPS[S.cLife] ? +S.cLife : 8;
  S.vertical = S.cVert !== 'off'; // 古い窓（vertical を見る）とも合わせる
  if (!MOTION_TASTES[S.mTaste]) S.mTaste = 'mix';
  if (!MOTION_HUD[S.mHud]) S.mHud = 'on';
  if (!MOTION_SOUND[S.mSound]) S.mSound = 'voice';
  if (!CAP_SIZES[S.capSize]) S.capSize = 'm';
  S.capTtl = CAP_TTLS[S.capTtl] ? +S.capTtl : 5;
  S.capLines = CAP_LINES[S.capLines] ? +S.capLines : 1;
  if (fromOld) saveSettings(S); // 別窓が読む保存値も新しい形に
}

// ---- 書体テーマ（標準 / プレミアム）と、無料プランの1日お試し ----
const FREE_THEMES = Object.fromEntries(Object.entries(THEMES).filter(([, d]) => !d.pro));
const PRO_THEMES = Object.fromEntries(Object.entries(THEMES).filter(([, d]) => d.pro));
function renderThemes() {
  segButtons('#themes', FREE_THEMES, 'theme');
  if (document.getElementById('fzColors').childElementCount) renderFzColors(); // 「標準」の色は書体テーマに合わせる
  segButtons('#proThemes', PRO_THEMES, 'theme');
  renderAccents();
  updateTrial();
}

// ---- アクセントカラー（無料プランでも選べる。canUse('accent:custom') はいつも true） ----
const plusLocked = (feature) => !canUse(feature) && trialRemainingMs() <= 0;
const accentLocked = () => plusLocked('accent:custom');
function pickAccent(c) {
  if (c && accentLocked()) { toast(L(`お試し期間（1日）は終わりました。アクセントカラーは${PLUS_LABEL}で変えられます`, `Your 1-day trial has ended. Accent colors are part of ${PLUS_LABEL}.`)); return; }
  S.accent = c;
  renderAccents();
  updateTrial();
  pushSettings();
}
function renderAccents() {
  const box = $('#accents');
  box.replaceChildren();
  box.classList.toggle('locked', accentLocked());
  const radio = (el, on, label) => { el.setAttribute('role', 'radio'); el.setAttribute('aria-checked', String(on)); el.setAttribute('aria-label', label); el.title = label; };
  const auto = document.createElement('button');
  auto.type = 'button';
  auto.className = 'acc fz-auto'; // 1列に収まるよう丸い見本に（名前はマウスを重ねると出る）
  auto.style.setProperty('--c', (THEMES[S.theme] || THEMES[DEFAULT_THEME]).accent);
  radio(auto, !S.accent, L('書体テーマ標準の色', 'The typeface theme’s own color'));
  auto.addEventListener('click', () => pickAccent(''));
  box.appendChild(auto);
  const known = ACCENTS.some((a) => a.c === S.accent);
  for (const a of ACCENTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'acc';
    b.style.setProperty('--c', a.c);
    radio(b, S.accent === a.c, tr(a));
    b.addEventListener('click', () => pickAccent(a.c));
    box.appendChild(b);
  }
  const custom = document.createElement('label');
  custom.className = 'acc-custom';
  radio(custom, !!S.accent && !known, L('好きな色を選ぶ', 'Pick any color'));
  if (S.accent && !known) custom.style.background = S.accent;
  const input = document.createElement('input');
  input.type = 'color';
  input.value = S.accent || '#3ddc84';
  input.addEventListener('click', (e) => { if (accentLocked()) { e.preventDefault(); toast(L(`お試し期間（1日）は終わりました。アクセントカラーは${PLUS_LABEL}で変えられます`, `Your 1-day trial has ended. Accent colors are part of ${PLUS_LABEL}.`)); } });
  input.addEventListener('change', () => pickAccent(input.value));
  custom.appendChild(input);
  box.appendChild(custom);
}
const usingPlusTrial = () => !canUse('theme:premium') && ((THEMES[S.theme] && THEMES[S.theme].pro) || !!S.bgImage || !!S.bgCamera || !!S.logo ||
  S.layout === 'vj' || S.speakerMode !== 'off');
function updateTrial() {
  const box = $('#trialBox');
  if (canUse('theme:premium')) { box.hidden = true; return; }
  const rem = trialRemainingMs();
  const active = usingPlusTrial();
  const h = Math.floor(rem / 3600000), m = Math.floor(rem / 60000) % 60;
  const left = h > 0 ? L(`${h}時間${m}分`, `${h}h ${m}m`) : L(`${m}分`, `${m}m`);
  $('#trialFill').style.transform = `scaleX(${(rem / PRO.trialMs).toFixed(4)})`;
  box.classList.toggle('active', trialStarted() && rem > 0);
  $('#trialNote').textContent = rem <= 0 ? L(`お試し期間（1日）は終わりました。${PLUS_LABEL}で続けて使えます`, `Your 1-day trial has ended. Keep using these with ${PLUS_LABEL}.`)
    : trialStarted() ? L(`お試し中　残り ${left}（終わると標準の見た目に戻ります）`, `Trial: ${left} left (then everything returns to the standard look)`)
    : L('お手軽プランの機能です。無料でも1日お試しできます', 'Plus plan features — try them free for a day');
}
let trialLast = performance.now();
setInterval(() => {
  const t = performance.now();
  const dt = t - trialLast;
  trialLast = t;
  if (usingPlusTrial()) {
    addTrialUsage(dt);
    if (trialRemainingMs() <= 0) {
      if (THEMES[S.theme] && THEMES[S.theme].pro) S.theme = DEFAULT_THEME;
      S.bgImage = '';
      S.bgCamera = false;
      S.logo = '';
      if (S.layout === 'vj') S.layout = 'compose';
      S.speakerMode = 'off';
      renderBg();
      renderLogo();
      renderCam();
      pushSettings();
      renderThemes();
      segButtons('#layouts', LAYOUTS, 'layout');
      renderSpeakers();
      toast(L('プレミアム機能のお試し期間（1日）が終わったので、標準の見た目に戻しました', 'Your 1-day trial of premium features has ended, so the standard look is back.'));
      return;
    }
  }
  updateTrial();
}, 1000);

// ---- 背景画像（お手軽プラン以上。無料プランは1日お試し）----
// 長い辺を1000px以下に縮小して JPEG にし、設定と一緒に表示ビューへ送る。表示側は窓に合わせて cover でトリミング。
const BG_MAX = 1000;
const bgLocked = () => !canUse('bg:image') && trialRemainingMs() <= 0;
async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('decode'));
      i.src = url;
    });
    const k = Math.min(1, BG_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * k)), h = Math.max(1, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#000';
    g.fillRect(0, 0, w, h); // 透過 PNG は黒地に
    g.drawImage(img, 0, 0, w, h);
    return { data: c.toDataURL('image/jpeg', 0.82), w, h };
  } finally {
    URL.revokeObjectURL(url);
  }
}
function renderBg() {
  const thumb = $('#bgThumb');
  thumb.style.backgroundImage = S.bgImage && !S.bgCamera ? `url("${S.bgImage}")` : '';
  thumb.classList.toggle('has', !!S.bgImage && !S.bgCamera);
  thumb.classList.toggle('cam', !!S.bgCamera); // カメラを映している間は、画像より手前にカメラが出る
  $('#bgRemove').hidden = !S.bgImage;
  $('#bgDimRow').hidden = !S.bgImage && !S.bgCamera;
  document.querySelector('.bg-pick').classList.toggle('locked', bgLocked());
}
$('#bgFile').addEventListener('click', (e) => {
  if (bgLocked()) { e.preventDefault(); toast(L(`お試し期間（1日）は終わりました。背景画像は${PLUS_LABEL}で使えます`, `Your 1-day trial has ended. Background images are part of ${PLUS_LABEL}.`)); }
});
$('#bgFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast('画像ファイルを選んでください'); return; }
  try {
    const { data, w, h } = await shrinkImage(file);
    S.bgImage = data;
    renderBg();
    updateTrial();
    pushSettings();
    toast(L(`背景画像を設定しました（${w}×${h}px に縮小）`, `Background set (resized to ${w}×${h}px)`));
  } catch {
    toast(L('この画像は読み込めませんでした。JPEG か PNG で試してください', 'Couldn’t read this image. Please try a JPEG or PNG.'));
  }
});
$('#bgRemove').addEventListener('click', () => { S.bgImage = ''; renderBg(); updateTrial(); pushSettings(); });

// ---- カスタムロゴ（お手軽プラン以上。無料プランは1日お試し）----
// 真ん中を正方形に切り抜き、一辺 320px 以下に縮小する。透明な部分はそのまま残す（WebP、使えなければ PNG）。
// 表示ビューは左上に出し、組版では言葉がロゴを避けて並ぶ。
const LOGO_MAX = 320;
const logoLocked = () => !canUse('logo:custom') && trialRemainingMs() <= 0;
async function squareLogo(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('decode'));
      i.src = url;
    });
    const w0 = img.naturalWidth || LOGO_MAX, h0 = img.naturalHeight || LOGO_MAX; // SVG は大きさがないことがある
    const side = Math.min(w0, h0);
    const n = Math.max(1, Math.min(LOGO_MAX, Math.round(side)));
    const c = document.createElement('canvas');
    c.width = c.height = n;
    c.getContext('2d').drawImage(img, (w0 - side) / 2, (h0 - side) / 2, side, side, 0, 0, n, n);
    const webp = c.toDataURL('image/webp', 0.92);
    return { data: webp.startsWith('data:image/webp') ? webp : c.toDataURL('image/png'), n, cropped: w0 !== h0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}
function renderLogo() {
  const thumb = $('#logoThumb');
  thumb.replaceChildren();
  if (S.logo) { const i = document.createElement('img'); i.src = S.logo; i.alt = ''; thumb.appendChild(i); }
  $('#logoRemove').hidden = !S.logo;
  $('#logoSizeRow').hidden = !S.logo;
  document.querySelector('.logo-pick').classList.toggle('locked', logoLocked());
  segButtons('#logoSizes', LOGO_SIZES, 'logoSize');
}
$('#logoFile').addEventListener('click', (e) => {
  if (logoLocked()) { e.preventDefault(); toast(L(`お試し期間（1日）は終わりました。カスタムロゴは${PLUS_LABEL}で使えます`, `Your 1-day trial has ended. Custom logos are part of ${PLUS_LABEL}.`)); }
});
$('#logoFile').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (!file) return;
  if (!/^image\//.test(file.type)) { toast(L('画像ファイルを選んでください', 'Please choose an image file')); return; }
  try {
    const { data, cropped } = await squareLogo(file);
    S.logo = data;
    renderLogo();
    updateTrial();
    pushSettings();
    toast(cropped ? L('ロゴを設定しました（真ん中を正方形に切り抜きました）', 'Logo set (cropped to a square from the center)') : L('ロゴを設定しました', 'Logo set'));
  } catch {
    toast(L('この画像は読み込めませんでした。PNG か JPEG で試してください', 'Couldn’t read this image. Please try a PNG or JPEG.'));
  }
});
$('#logoRemove').addEventListener('click', () => { S.logo = ''; renderLogo(); updateTrial(); pushSettings(); });

// ---- 背景にカメラの映像（お手軽プラン以上。無料プランは1日お試し）----
// 許可はここ（コンソール）で一度だけ取る。映像を映すのは表示ビュー側で、同じサイトなので許可を引き継ぐ。
// 映像はこの端末の中だけで使い、どこにも送らない。OBS のブラウザソースではカメラを開けないので映らない。
const CAN_CAM = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
const camLocked = () => !canUse('bg:camera') && trialRemainingMs() <= 0;
async function listCameras() {
  const sel = $('#bgCamSel');
  try {
    const cams = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'videoinput' && d.deviceId);
    sel.replaceChildren(...cams.map((d, i) => {
      const o = document.createElement('option');
      o.value = d.deviceId;
      o.textContent = d.label || L(`カメラ ${i + 1}`, `Camera ${i + 1}`);
      return o;
    }));
    if (S.bgCameraId && cams.some((d) => d.deviceId === S.bgCameraId)) sel.value = S.bgCameraId;
    sel.hidden = !S.bgCamera || cams.length < 2; // カメラが1台なら選ぶ必要はない
  } catch { sel.hidden = true; }
}
function renderCam() {
  const b = $('#bgCam');
  b.hidden = !CAN_CAM;
  b.setAttribute('aria-pressed', String(!!S.bgCamera));
  b.textContent = S.bgCamera ? L('カメラを止める', 'Stop camera') : L('カメラを映す', 'Show camera');
  b.classList.toggle('on', !!S.bgCamera);
  b.classList.toggle('locked', !S.bgCamera && camLocked());
  $('#bgMirrorRow').hidden = !S.bgCamera;
  $('#bgMirror').checked = !!S.bgMirror;
  if (!S.bgCamera) $('#bgCamSel').hidden = true;
}
$('#bgCam').addEventListener('click', async () => {
  if (S.bgCamera) { S.bgCamera = false; renderCam(); renderBg(); updateTrial(); pushSettings(); return; }
  if (camLocked()) { toast(L(`お試し期間（1日）は終わりました。背景のカメラは${PLUS_LABEL}で使えます`, `Your 1-day trial has ended. The camera background is part of ${PLUS_LABEL}.`)); return; }
  try {
    const st = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    st.getTracks().forEach((t) => t.stop());
  } catch (e) {
    toast(e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')
      ? L('カメラの使用が許可されていません。アドレスバーのカメラアイコンから許可してください', 'Camera access is blocked. Allow it from the camera icon in the address bar.')
      : L('カメラが見つかりませんでした。接続を確認してください', 'No camera was found. Check that one is connected.'));
    return;
  }
  S.bgCamera = true;
  renderCam(); renderBg(); updateTrial(); pushSettings();
  listCameras();
  toast(IS_MOBILE
    ? L('カメラを背景に映しました。スマホではカメラを使うと音声認識が止まることがあります。止まる場合はカメラを止めてください', 'The camera is now the background. On phones the camera can stop speech recognition; if it does, turn the camera off.')
    : L('カメラを背景に映しました（映像はこの端末の中だけで使います）', 'The camera is now the background (the video stays on this device).'));
});
$('#bgCamSel').addEventListener('change', () => { S.bgCameraId = $('#bgCamSel').value; pushSettings(); });
$('#bgMirror').addEventListener('change', () => { S.bgMirror = $('#bgMirror').checked; pushSettings(); });

function bindRange(id, label, fmt) {
  const input = $('#' + id);
  input.value = S[id];
  const show = () => {
    $('#' + label).textContent = fmt(S[id]);
    input.style.setProperty('--p', `${((S[id] - input.min) / (input.max - input.min)) * 100}%`);
  };
  show();
  input.addEventListener('input', () => { S[id] = +input.value; show(); pushSettings(); });
}
function bindCheck(id) {
  const input = $('#' + id);
  input.checked = !!S[id];
  input.addEventListener('change', () => { S[id] = input.checked; pushSettings(); });
}
function bindText(id, after) {
  const input = $('#' + id);
  input.value = S[id] || '';
  let tm = 0;
  input.addEventListener('input', () => {
    clearTimeout(tm);
    tm = setTimeout(() => { S[id] = input.value; after && after(); pushSettings(); }, 250);
  });
}

migrateSettings();
if (!THEMES[S.theme] || (THEMES[S.theme].pro && !canUse('theme:premium') && trialRemainingMs() <= 0)) S.theme = DEFAULT_THEME;
if (S.accent && accentLocked()) S.accent = '';
if (S.bgImage && accentLocked()) S.bgImage = '';
if (S.bgCamera && (camLocked() || !CAN_CAM)) S.bgCamera = false;
if (S.logo && logoLocked()) S.logo = '';
if (!LOGO_SIZES[S.logoSize]) S.logoSize = 'm';
if (S.layout === 'vj' && plusLocked('layout:vj')) S.layout = 'compose';
if (!LAYOUTS[S.layout]) S.layout = 'compose';
if (S.speakerMode !== 'off' && plusLocked('speaker:labels')) S.speakerMode = 'off';
if (!VJ_STYLES[S.vjStyle]) S.vjStyle = 'micro';
if (!VJ_FONTS[S.vjFont]) S.vjFont = 'gothic';
// ドットの細かさ・演出の強さは画面から外したので、いつも標準にする（動きは「動きを控えめに」で止める）
S.vjDetail = 'mid';
S.vjFx = 'mid';
renderThemes();
segButtons('#layouts', LAYOUTS, 'layout');
segButtons('#vjStyles', VJ_STYLES, 'vjStyle');
segButtons('#vjFonts', VJ_FONTS, 'vjFont');
renderCapOpts();
bindRange('bgDim', 'vBgDim', (v) => `${Math.round(v * 100)}%`);
renderBg();
renderCam();
renderLogo();
if (S.bgCamera) listCameras();
bindCheck('caption');
$('#caption').addEventListener('change', () => { renderCapOpts(); send({ t: 'capPeek' }); });
// 字幕ラインの設定に近づいたら、プレビューの最下部（字幕の出る場所）を示す
$('#capCard').addEventListener('pointerenter', () => send({ t: 'capPeek' }));
$('#capCard').addEventListener('focusin', (e) => { if (e.target.matches(':focus-visible')) send({ t: 'capPeek' }); });
bindCheck('reduceMotion');
bindCheck('fusion');
$('#fusion').addEventListener('change', () => { if (S.fusion) { fuseAt = performance.now() - FUSE_GAP + 2500; toast(L('新語ミックスをオンにしました。画面に言葉が2つ以上出ると、ときどき掛け合わさって新しい言葉が生まれます', 'Word mix is on. Once two or more words are on screen, they’ll now and then combine into a new word.')); } });
bindText('registered', () => ex.setDict(S));
bindText('ng', () => ex.setDict(S));

// ------------------------------------------------------------ 使い方ガイド（ヘルプ）とシーン別のおすすめ設定
function applyPreset(p) {
  const theme0 = S.theme;
  Object.assign(S, p.s);
  // お手軽プランの書体（透過など）で、お試しも終わっているときは、いまの書体のまま
  if (THEMES[S.theme] && THEMES[S.theme].pro && plusLocked('theme:premium')) S.theme = theme0;
  renderThemes();
  migrateSettings();
  segButtons('#layouts', LAYOUTS, 'layout');
  renderCapOpts();
  for (const id of ['caption', 'fusion']) $('#' + id).checked = !!S[id];
  updateTrial();
  pushSettings();
  showTab(S.fusion ? 'feat' : 'look'); // 選んだ設定が見えるタブへ（ブレスト会議なら機能タブのブレストモード）
  toast(L(`「${p.label}」向けの設定にしました`, `Switched to settings for: ${p.label}`));
}
const help = initHelp({ onPreset: applyPreset, onGuide: () => guide.start(), onDev: devUnlock });
// 開発者モード（ヘルプの一番下）：パスワードが合えば全機能のライセンスを受け取る。返り値はヘルプに出す一言
async function devUnlock(password) {
  try {
    await activateDev(password);
    applyPlanUI();
    toast(L('開発者モード：有料版のすべての機能が使えます', 'Developer mode: every paid feature is unlocked'));
    return L('有効にしました。このブラウザで、有料版のすべての機能が使えます（右上のプランのボタンから外せます）。', 'Unlocked. Every paid feature works in this browser (remove it from the plan button at the top right).');
  } catch (e) {
    if (e.code === 'bad_password') return L('パスワードが違います', 'Wrong password');
    if (e.code === 'not_configured' || e.code === 'http_404' || e.code === 'http_405') return L('このサイトでは、開発者モードがまだ設定されていません', 'Developer mode isn’t set up on this site yet');
    return payError(e);
  }
}

// ------------------------------------------------------------ サイドメニューのタブ（表示・機能・設定）
// 表示：見た目と文字の出かた ／ 機能：ブレストモード・話者（配信中に使うもの）／ 設定：背景・ロゴ・辞書・OBS（前もって整えるもの）
// 最後に開いていたタブはこの端末に覚えておく。← → で隣のタブへ（Home / End で端へ）
const TABKEY = 'kanpe.tab.v1';
const OLD_TABS = { coin: 'feat', more: 'set' }; // 以前のタブの名前（ブレストモード・詳細）
const sideTabs = [...document.querySelectorAll('.side-tab')];
function showTab(id, focus = false) {
  const cur = document.querySelector('.side-tab[aria-selected="true"]');
  if (!cur || cur.dataset.tab !== id) {
    for (const t of sideTabs) {
      const on = t.dataset.tab === id;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      $('#' + t.getAttribute('aria-controls')).hidden = !on;
    }
    const panes = $('.side-panes');
    if (panes) panes.scrollTop = 0;
    try { localStorage.setItem(TABKEY, id); } catch { /* 保存できない環境 */ }
  }
  if (focus) { const t = sideTabs.find((x) => x.dataset.tab === id); if (t) t.focus(); }
}
sideTabs.forEach((t, i) => {
  t.addEventListener('click', () => showTab(t.dataset.tab));
  t.addEventListener('keydown', (e) => {
    const n = sideTabs.length;
    const j = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (j === undefined) return;
    e.preventDefault();
    showTab(sideTabs[j].dataset.tab, true);
  });
});
{
  let t0 = 'look';
  try { t0 = localStorage.getItem(TABKEY) || t0; } catch { /* noop */ }
  t0 = OLD_TABS[t0] || t0;
  showTab(sideTabs.some((t) => t.dataset.tab === t0) ? t0 : 'look');
}
// 「詳細」タブの見出しに、いまの状態を小さく出す（閉じたままでも、何が効いているかわかるように）
function updateMore() {
  const st = (id, text) => { const e = document.getElementById(id); if (e) { e.textContent = text; e.hidden = !text; } };
  st('stBg', S.bgCamera ? L('カメラ', 'Camera') : S.bgImage ? L('画像', 'Image') : '');
  st('stLogo', S.logo ? L('オン', 'On') : '');
  const words = (S.registered || '').split(/[、,，\n]/).map((w) => w.trim()).filter(Boolean).length;
  st('stDict', words ? L(`${words}語`, `${words} words`) : '');
  st('stObs', obs ? L('接続', 'On') : '');
}
updateMore();


// ------------------------------------------------------------ 話者のラベルと色分け（お手軽プラン以上。無料プランは1日お試し）
// 手動：ボタンかキーボードの 1〜4 で「いま話している人」を切り替える
// 声で自動：登録した声の高さから推定する（PC のみ・簡易）。おトクプランではクラウド認識の話者分離で自動化する（近日公開）
const SPEAKER_MODES = {
  off: { label: 'オフ', labelEn: 'Off', note: '話している人ごとに、名前のラベルと色を付けられます', noteEn: 'Give each speaker a name label and a color.' },
  manual: { label: '手動', labelEn: 'Manual', note: 'いま話している人を、下のボタンかキーボードの 1〜4 で切り替えます。いちばん確実です', noteEn: 'Switch the current speaker with the buttons below or keys 1–4. The most reliable option.' },
  auto: { label: '声で自動', labelEn: 'By voice', note: '登録した声の高さから自動で切り替えます（PC のみ・簡易）。声の高さが近い人どうしは、ボタンで直してください', noteEn: 'Switches automatically by voice pitch (desktop only, basic). Correct it with the buttons when voices are similar.' },
};
const SPEAKER_COUNTS = { 2: { label: '2人', labelEn: '2' }, 3: { label: '3人', labelEn: '3' }, 4: { label: '4人', labelEn: '4' } };
S.speakers = DEFAULT_SPEAKERS.map((d, i) => ({ ...d, ...((Array.isArray(S.speakers) && S.speakers[i]) || {}) }));
// 名前が初期値のままなら、表示中の言語の初期値にそろえる
S.speakers.forEach((sp, i) => { const d = DEFAULT_SPEAKERS[i]; if (sp.name === d.name || sp.name === d.nameEn) sp.name = EN ? d.nameEn : d.name; });
S.speakerCount = Math.min(MAX_SPEAKERS, Math.max(2, +S.speakerCount || 2));
if (!SPEAKER_MODES[S.speakerMode]) S.speakerMode = 'off';
if (S.speakerMode === 'auto' && IS_MOBILE) S.speakerMode = 'manual';
let curSp = 0;
const tracker = new SpeakerTracker();
const speakersOn = () => S.speakerMode !== 'off' && !plusLocked('speaker:labels');
function speakerInfo() {
  if (!speakersOn()) return {};
  const sp = S.speakers[curSp] || S.speakers[0];
  return { sp: curSp, spn: (sp.name || '').trim() || L(`話者${curSp + 1}`, `Speaker ${curSp + 1}`), spc: sp.color };
}
function syncProfiles() { tracker.setProfiles(S.speakers.slice(0, S.speakerCount).map((x) => x.f0 || 0)); }
function setSpeaker(i, fromAuto = false) {
  if (i < 0 || i >= S.speakerCount) return;
  curSp = i;
  if (!fromAuto) tracker.set(i);
  for (const b of document.querySelectorAll('#spNow button')) b.setAttribute('aria-pressed', String(+b.dataset.i === i));
}
function renderSpeakers() {
  segButtons('#spModes', SPEAKER_MODES, 'speakerMode');
  segButtons('#spCounts', SPEAKER_COUNTS, 'speakerCount');
  $('#spModeNote').textContent = tr(SPEAKER_MODES[S.speakerMode], 'note');
  $('#spBody').hidden = S.speakerMode === 'off';
  $('#speakerSec').classList.toggle('locked', plusLocked('speaker:labels'));
  if (curSp >= S.speakerCount) curSp = 0;
  const list = $('#spList');
  list.replaceChildren();
  const now = $('#spNow');
  now.replaceChildren();
  S.speakers.slice(0, S.speakerCount).forEach((sp, i) => {
    const li = document.createElement('li');
    li.className = 'sp-item';
    const sw = document.createElement('label');
    sw.className = 'sp-color';
    sw.style.setProperty('--c', sp.color);
    sw.title = L('色を変える', 'Change color');
    const ci = document.createElement('input');
    ci.type = 'color';
    ci.value = sp.color;
    ci.setAttribute('aria-label', L(`${i + 1}人目の色`, `Color for speaker ${i + 1}`));
    ci.addEventListener('input', () => { sp.color = ci.value; sw.style.setProperty('--c', ci.value); renderNow(); pushSettings(); });
    sw.appendChild(ci);
    const name = document.createElement('input');
    name.className = 'sp-name';
    name.maxLength = 12;
    name.value = sp.name;
    name.placeholder = L(`話者${i + 1}`, `Speaker ${i + 1}`);
    name.setAttribute('aria-label', L(`${i + 1}人目の名前`, `Name for speaker ${i + 1}`));
    name.addEventListener('input', () => { sp.name = name.value; renderNow(); pushSettings(); });
    li.append(sw, name);
    if (S.speakerMode === 'auto') {
      const reg = document.createElement('button');
      reg.type = 'button';
      reg.className = 'btn small sp-reg';
      reg.textContent = sp.f0 ? `${sp.f0}Hz` : L('声を登録', 'Record voice');
      reg.title = sp.f0 ? L('登録し直す', 'Record again') : L('3秒ほど話して声の高さを登録します', 'Talk for about 3 seconds to record your voice pitch');
      reg.classList.toggle('done', !!sp.f0);
      reg.addEventListener('click', () => registerVoice(i, reg));
      li.appendChild(reg);
    }
    list.appendChild(li);
  });
  renderNow();
  syncProfiles();
}
function renderNow() {
  const now = $('#spNow');
  now.replaceChildren();
  S.speakers.slice(0, S.speakerCount).forEach((sp, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.dataset.i = String(i);
    b.style.setProperty('--c', sp.color);
    b.setAttribute('aria-pressed', String(i === curSp));
    b.innerHTML = '<kbd></kbd><span></span>';
    b.firstChild.textContent = String(i + 1);
    b.lastChild.textContent = (sp.name || '').trim() || L(`話者${i + 1}`, `Speaker ${i + 1}`);
    b.addEventListener('click', () => setSpeaker(i));
    now.appendChild(b);
  });
}
let registering = false;
async function registerVoice(i, btn) {
  if (registering) return;
  if (IS_MOBILE) { toast(L('スマホでは「声で自動」は使えません。手動で切り替えてください', 'Voice-based switching isn’t available on phones. Please switch speakers manually.')); return; }
  registering = true;
  let an = meterAnalyser, temp = null;
  try {
    if (!an) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const ctx = new AudioContext();
      an = ctx.createAnalyser();
      an.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(an);
      temp = { stream, ctx };
    }
    const rate = (temp ? temp.ctx : meterCtx).sampleRate;
    const f0 = await calibrate(an, rate, 3000, (k) => { btn.textContent = L(`話してください… ${Math.max(1, Math.ceil(3 - k * 3))}`, `Keep talking… ${Math.max(1, Math.ceil(3 - k * 3))}`); });
    if (f0 > 0) {
      S.speakers[i].f0 = Math.round(f0);
      pushSettings();
      toast(L(`${S.speakers[i].name || `話者${i + 1}`}の声を登録しました（${Math.round(f0)}Hz）`, `Voice recorded for ${S.speakers[i].name || `Speaker ${i + 1}`} (${Math.round(f0)}Hz)`));
    } else {
      toast(L('声をうまく拾えませんでした。マイクに近づいて、ふだんの声で3秒ほど話してください', 'Couldn’t pick up your voice. Move closer to the mic and talk normally for about 3 seconds.'));
    }
  } catch {
    toast(L('マイクを使えませんでした。ブラウザのマイクの許可を確認してください', 'Couldn’t use the microphone. Check your browser’s microphone permission.'));
  } finally {
    if (temp) { temp.stream.getTracks().forEach((t) => t.stop()); temp.ctx.close(); }
    registering = false;
    renderSpeakers();
  }
}
renderSpeakers();

// ------------------------------------------------------------ 新語ミックス（ブレスト）
// 最近画面に出た言葉を2つ選んで掛け合わせ、新しい言葉を表示ビューへ送る。生まれた言葉は「生まれた新語」に残す。
const FUSE_GAP = 14000;            // 自動で混ぜる間隔の目安
const seenWords = new Map();       // 言葉 → 最後に出た時刻
const coined = [];                 // 生まれた新語 { text, a, b }
let fuseAt = 0, wordsSinceFuse = 0, lastHeard = 0;
function remember(e) {
  if (!e || !e.text || e.kind === 'number') return;
  if (!seenWords.has(e.text)) wordsSinceFuse++;
  seenWords.delete(e.text);
  seenWords.set(e.text, performance.now());
  lastHeard = performance.now();
  if (seenWords.size > 60) seenWords.delete(seenWords.keys().next().value);
}
function fusePool() {
  const t = performance.now(), keep = lifeSec() * 1000 * 1.4; // 画面に残っていそうな言葉だけ
  return [...seenWords].filter(([, at]) => t - at < keep).reverse().map(([w]) => w);
}
// 新語の見た目を1回ぶん決める（「ランダム」はここで1つ選ぶので、プレビューと別窓で同じ見た目になる）
const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
function fusionLook() {
  const motions = Object.keys(FUSION_MOTIONS).filter((k) => k !== 'random');
  const motion = S.fusionMotion === 'random' ? pickOne(motions) : (FUSION_MOTIONS[S.fusionMotion] ? S.fusionMotion : 'collide');
  let color = S.fusionColor || '';
  if (color === 'random') color = pickOne(FUSION_COLORS.map((x) => x.c).filter((c) => c && c !== 'random'));
  const k = (FUSION_SPEEDS[S.fusionSpeed] || FUSION_SPEEDS.mid).k;
  return { motion, color, k };
}
function fuse(manual = false) {
  if (paused) { if (manual) toast(L('表示を一時停止中です', 'The display is paused')); return; }
  const r = coinWord(fusePool(), coined.map((c) => c.text));
  if (!r) {
    if (manual) toast(L('混ぜられる言葉がまだ足りません。画面に言葉が2つ以上出てから押してください', 'Not enough words yet. Press this once two or more words are on screen.'));
    return;
  }
  fuseAt = performance.now();
  wordsSinceFuse = 0;
  send({ t: 'fuse', text: r.text, a: r.a, b: r.b, how: r.how, ...fusionLook() });
  coined.unshift({ text: r.text, a: r.a, b: r.b });
  if (coined.length > 40) coined.pop();
  renderCoins();
}
function renderCoins() {
  $('#coinMemo').hidden = !coined.length;
  const ul = $('#coins');
  ul.replaceChildren(...coined.slice(0, 12).map((c) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button';
    b.title = L(`${c.a} × ${c.b}（押すとコピー）`, `${c.a} × ${c.b} (click to copy)`);
    b.innerHTML = '<b></b><small></small>';
    b.firstChild.textContent = c.text;
    b.lastChild.textContent = `${c.a}×${c.b}`;
    b.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(c.text); toast(L(`「${c.text}」をコピーしました`, `Copied “${c.text}”`)); } catch { /* noop */ }
    });
    li.appendChild(b);
    return li;
  }));
}
$('#btnFuse').addEventListener('click', () => fuse(true));
// 新語の色：標準・各色・虹・ランダム
function renderFzColors() {
  const box = $('#fzColors');
  box.replaceChildren();
  for (const x of FUSION_COLORS) {
    const b = document.createElement('button');
    b.type = 'button';
    const on = (S.fusionColor || '') === x.c;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(on));
    b.setAttribute('aria-label', tr(x));
    b.title = tr(x);
    // 1列に収まるよう、「標準」と「ランダム」も丸い見本にする（名前はマウスを重ねると出る）
    if (!x.c) { b.className = 'acc fz-auto'; b.style.setProperty('--c', (THEMES[S.theme] || THEMES[DEFAULT_THEME]).accent2); }
    else if (x.c === 'rainbow') { b.className = 'acc fz-rainbow'; }
    else if (x.c === 'random') { b.className = 'acc fz-random'; b.innerHTML = '<b aria-hidden="true">?</b>'; }
    else { b.className = 'acc'; b.style.setProperty('--c', x.c); }
    b.addEventListener('click', () => { S.fusionColor = x.c; renderFzColors(); pushSettings(); setTimeout(() => fuse(false), 150); });
    box.appendChild(b);
  }
}
if (!FUSION_COLORS.some((x) => x.c === (S.fusionColor || ''))) S.fusionColor = '';
S.fusionMotion = { bloom: 'converge', glitch: 'scan', type: 'decode', drop: 'shutter' }[S.fusionMotion] || S.fusionMotion; // 以前の出かたは近いものへ
if (!FUSION_MOTIONS[S.fusionMotion]) S.fusionMotion = 'collide';
if (!FUSION_SPEEDS[S.fusionSpeed]) S.fusionSpeed = 'mid';
renderFzColors();
segButtons('#fzMotions', FUSION_MOTIONS, 'fusionMotion');
segButtons('#fzSpeeds', FUSION_SPEEDS, 'fusionSpeed');
if (!ECHO_SPANS[S.echo]) S.echo = DEFAULTS.echo;
$('#fzMotionNote').textContent = tr(FUSION_MOTIONS[S.fusionMotion], 'note');
setInterval(() => { // 話している間だけ、ときどき自動で混ぜる
  const t = performance.now();
  if (S.fusion && !paused && t - fuseAt > FUSE_GAP && t - lastHeard < 6000 && wordsSinceFuse >= 2) fuse(false);
}, 1000);

// ------------------------------------------------------------ 認識エンジン（無料＝ブラウザ / おトクプラン＝高精度クラウド）
const engineSel = $('#engine');
engineSel.value = 'browser';
engineSel.addEventListener('change', () => {
  if (engineSel.value === 'cloud' && !canUse('engine:cloud')) {
    engineSel.value = 'browser';
    $('#proNote').hidden = false;
    toast(currentPlan() === 'free'
      ? L(`高精度クラウド認識は${PLANS.pro.label}（${PLANS.pro.price}・月${PRO.includedHours}時間つき）の機能です（近日公開）`, `High-accuracy cloud recognition comes with the ${PLANS.pro.labelEn} plan (${PLANS.pro.yen}/mo, ${PRO.includedHours} hours a month). Coming soon.`)
      : L(`高精度クラウド認識は${PLANS.pro.label}の機能です（近日公開）`, `High-accuracy cloud recognition comes with the ${PLANS.pro.labelEn} plan. Coming soon.`));
    return;
  }
  $('#proNote').hidden = true;
});
// ------------------------------------------------------------ プランとお支払い（Stripe）
const LANG2 = EN ? 'en' : 'ja';
const fmtDate = (sec) => new Date(sec * 1000).toLocaleDateString(EN ? 'en-US' : 'ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
function payError(e) {
  const code = e && e.code;
  if (code === 'not_configured' || code === 'price_missing' || code === 'http_404' || code === 'http_405')
    return L('お申し込みの受付を準備しています。もうしばらくお待ちください', 'Sign-ups are being prepared. Please check back soon.');
  if (code === 'plan_unavailable') return L('このプランはまだお申し込みいただけません', 'This plan isn’t available yet.');
  if (code === 'bad_license' || code === 'not_found') return L('ライセンスコードを確認できませんでした', 'That license code couldn’t be verified.');
  if (code === 'incomplete') return L('お支払いがまだ完了していません', 'The payment hasn’t completed yet.');
  return L('通信できませんでした。少し待ってからもう一度お試しください', 'Couldn’t connect. Please try again in a moment.');
}
// プランが変わったら、鍵のかかった機能や「KANPE」表示を最新の状態にする
function applyPlanUI() {
  const plan = currentPlan();
  document.documentElement.dataset.plan = plan; // 有料プランなら UI 内の価格表示を隠す（console.css）
  const badge = $('#planBadge');
  badge.innerHTML = plan === 'free'
    ? `<b>${tr(PLANS.free)}</b><span>${L('アップグレード', 'Upgrade')}</span>`
    : `<b>${(licenseInfo() || {}).status === 'dev' ? L('開発者モード', 'Developer') : tr(PLANS[plan])}</b><span>${L('管理', 'Manage')}</span>`;
  badge.classList.toggle('paid', plan !== 'free');
  renderThemes();
  segButtons('#layouts', LAYOUTS, 'layout');
  renderSpeakers();
  renderBg();
  renderCam();
  renderLogo();
  updateTrial();
  pushSettings(false);
}

let planDlg = null;
function planDialog() {
  if (planDlg) return planDlg;
  planDlg = document.createElement('dialog');
  planDlg.className = 'lang-dialog plan-dialog';
  planDlg.setAttribute('aria-labelledby', 'planDlgTitle');
  planDlg.addEventListener('click', (e) => { if (e.target === planDlg) planDlg.close(); });
  document.body.appendChild(planDlg);
  return planDlg;
}
function busy(btn, on, text) { btn.disabled = on; if (text) btn.textContent = text; }
function renderPlanDialog() {
  const d = planDialog();
  const plan = currentPlan();
  const lic = licenseInfo();
  const box = document.createElement('div');
  box.className = 'lang-box';
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  box.append(h('p', 'lang-icon', 'K'));
  const title = h('h2', null, L('プラン', 'Your plan')); title.id = 'planDlgTitle'; box.append(title);
  const dev = plan !== 'free' && lic && lic.status === 'dev';
  box.append(h('p', 'plan-now', dev ? L('開発者モード', 'Developer mode') : tr(PLANS[plan])));
  if (dev) {
    box.append(h('p', 'lang-body', L(`有料版のすべての機能が使えます。${fmtDate(lic.expires)} まで（このページを開いていると自動で延びます）`, `Every paid feature is unlocked until ${fmtDate(lic.expires)} (extends automatically while you use KANPE).`)));
  } else if (plan !== 'free' && lic) {
    box.append(h('p', 'lang-body', lic.cancelAtPeriodEnd
      ? L(`解約済みです。${fmtDate(lic.expires - 3 * 86400)} まで使えます`, `Cancelled — available until ${fmtDate(lic.expires - 3 * 86400)}`)
      : L(`次回の更新日：${fmtDate(lic.expires - 3 * 86400)}（${lic.interval === 'year' ? '年払い' : '月払い'}）`, `Renews on ${fmtDate(lic.expires - 3 * 86400)} (${lic.interval === 'year' ? 'yearly' : 'monthly'})`)));
  } else if (lic && lic.plan !== 'free' && lic.expires * 1000 <= Date.now()) {
    box.append(h('p', 'lang-body', L('ご契約の期限が切れています。更新するとまた使えます', 'Your subscription has ended. Renew to keep using paid features.')));
  } else {
    box.append(h('p', 'lang-body', L('お手軽プラン（月¥480・税込）で、VJ モード・話者の色分け・プレミアム書体・背景画像・カスタムロゴが使え、「KANPE」表示を消せます。いつでも解約できます。',
      'Plus (¥480/mo incl. tax) unlocks VJ mode, speaker colors, premium typefaces, background images and a custom logo, and removes the “KANPE” mark. Cancel any time.')));
  }
  const actions = h('div', 'plan-actions');
  const msg = h('p', 'plan-msg'); msg.setAttribute('aria-live', 'polite');
  const btn = (text, cls, fn) => { const b = h('button', cls, text); b.type = 'button'; b.addEventListener('click', () => fn(b)); actions.append(b); return b; };
  if (plan === 'free') {
    btn(L('お手軽プランにする　月¥480', 'Get Plus — ¥480/mo'), 'lang-ok', async (b) => {
      busy(b, true, L('お支払いページへ…', 'Opening checkout…'));
      try { await startCheckout('plus', 'month', LANG2); } catch (e) { msg.textContent = payError(e); busy(b, false, L('お手軽プランにする　月¥480', 'Get Plus — ¥480/mo')); }
    });
    btn(L('年払い　¥4,800（2か月分おトク）', 'Yearly — ¥4,800 (2 months free)'), 'lang-cancel', async (b) => {
      busy(b, true, L('お支払いページへ…', 'Opening checkout…'));
      try { await startCheckout('plus', 'year', LANG2); } catch (e) { msg.textContent = payError(e); busy(b, false, L('年払い　¥4,800（2か月分おトク）', 'Yearly — ¥4,800 (2 months free)')); }
    });
  } else if (!dev) {
    btn(L('支払い方法・解約・領収書', 'Billing, cancel, receipts'), 'lang-ok', async (b) => {
      busy(b, true, L('開いています…', 'Opening…'));
      try { await openPortal(LANG2); } catch (e) { msg.textContent = payError(e); busy(b, false, L('支払い方法・解約・領収書', 'Billing, cancel, receipts')); }
    });
    btn(L('ライセンスコードを表示・保存', 'View or save license code'), 'lang-cancel', () => { d.close(); showLicenseDialog(false); });
  }
  box.append(actions, msg);
  // 別の端末で買った人：コードで復元
  const det = h('details', 'plan-restore');
  det.append(h('summary', null, plan === 'free' ? L('ライセンスコードで復元（別の端末で購入した方・ブラウザのデータを消した方）', 'Restore with a license code (bought on another device, or cleared this browser)') : L('このブラウザから外す', 'Remove from this browser')));
  if (plan === 'free') {
    const row = h('form', 'plan-code');
    const input = h('input'); input.placeholder = 'kanpe1.…'; input.autocomplete = 'off'; input.setAttribute('aria-label', L('ライセンスコード', 'License code'));
    const go = h('button', 'btn', L('復元', 'Restore')); go.type = 'submit';
    row.append(input, go);
    row.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      busy(go, true);
      try { const l = await activateFromCode(input.value); applyPlanUI(); renderPlanDialog();
        toast(l.plan === 'free' ? L('有効なご契約が見つかりませんでした', 'No active subscription was found') : L(`${tr(PLANS[l.plan])}を有効にしました`, `${tr(PLANS[l.plan])} is now active`)); }
      catch (err) { msg.textContent = payError(err); busy(go, false); }
    });
    det.append(row);
    // コードをなくした人：お申し込みのメールアドレスに送り直す
    const mrow = h('form', 'plan-code plan-mail');
    const mailIn = h('input'); mailIn.type = 'email'; mailIn.placeholder = L('お申し込みのメールアドレス', 'Email you subscribed with'); mailIn.autocomplete = 'email';
    mailIn.setAttribute('aria-label', L('お申し込みのメールアドレス', 'Email you subscribed with'));
    const send = h('button', 'btn', L('メールで送る', 'Email it')); send.type = 'submit';
    mrow.append(mailIn, send);
    const mmsg = h('p', 'hint lic-msg'); mmsg.setAttribute('aria-live', 'polite');
    mrow.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = mailIn.value.trim();
      if (!v) return;
      busy(send, true); mmsg.textContent = '';
      try {
        await requestLicenseEmail(v, LANG2);
        mmsg.textContent = L(`ご契約が見つかった場合は、お申し込みのメールアドレスにライセンスコードを送りました。数分たっても届かないときは、迷惑メールのフォルダと、入力したアドレスをご確認ください。`,
          'If we found a subscription, we’ve emailed the license code to the address you subscribed with. If nothing arrives in a few minutes, check your spam folder and the address you entered.');
      } catch (err) {
        mmsg.textContent = err.code === 'bad_email' ? L('メールアドレスを確認してください', 'Please check the email address.')
          : err.code === 'mail_not_configured' || err.code === 'not_configured' ? L('メールでの送り直しは準備中です。お手数ですが、特定商取引法に基づく表記の連絡先までお問い合わせください。', 'Email resend isn’t available yet. Please contact us via the address in the Legal notice.')
          : payError(err);
      }
      busy(send, false);
    });
    const mhint = h('p', 'hint plan-mail-hint', L('コードをなくした場合は、お申し込みのメールアドレスに送り直せます。', 'Lost your code? We can email it to the address you subscribed with.'));
    // メールで送れる設定になっているときだけ出す
    for (const el of [mhint, mrow]) el.hidden = true;
    fetch('/api/license-email', { credentials: 'same-origin' }).then((r) => (r.ok ? r.json() : {})).then((x) => { if (x.enabled) for (const el of [mhint, mrow]) el.hidden = false; }).catch(() => {});
    det.append(mhint, mrow, mmsg);
  } else {
    const p = h('p', 'hint', dev ? L('このブラウザで開発者モードを終え、無料プランに戻ります。', 'Ends developer mode in this browser and goes back to Free.')
      : L('この端末では無料プランに戻ります。ご契約は続くので、ライセンスコードでいつでも戻せます（解約は「支払い方法・解約・領収書」から）。', 'This browser goes back to Free. Your subscription continues — restore it any time with your license code (cancel from “Billing, cancel, receipts”).'));
    const rm = h('button', 'btn', L('外す', 'Remove')); rm.type = 'button';
    rm.addEventListener('click', () => { clearLicense(); applyPlanUI(); renderPlanDialog(); });
    det.append(p, rm);
  }
  box.append(det);
  const foot = h('p', 'plan-foot');
  const a1 = h('a', null, L('料金を比べる', 'Compare plans')); a1.href = 'index.html#pricing';
  const a2 = h('a', null, L('特定商取引法に基づく表記', 'Legal notice')); a2.href = 'legal/tokushoho.html';
  const a3 = h('a', null, L('利用規約', 'Terms')); a3.href = 'legal/terms.html';
  const close = h('button', 'plan-close', L('閉じる', 'Close')); close.type = 'button'; close.addEventListener('click', () => d.close());
  foot.append(a1, a2, a3, close);
  box.append(foot);
  d.replaceChildren(box);
}
// ライセンスコードを控えてもらう窓。コードはメールでは届かないので、申し込み直後に必ず見せる。
// 保存したコードは、署名が正しければ期限が切れても復元に使える（復元のたびに Stripe で契約を確かめ直す）。
let licDlg = null;
function showLicenseDialog(afterPurchase) {
  const lic = licenseInfo();
  if (!lic || !lic.token) return;
  if (!licDlg) {
    licDlg = document.createElement('dialog');
    licDlg.className = 'lang-dialog plan-dialog license-dialog';
    licDlg.setAttribute('aria-labelledby', 'licDlgTitle');
    document.body.appendChild(licDlg);
  }
  const d = licDlg;
  const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const planName = tr(PLANS[lic.plan] || PLANS.free);
  const box = h('div', 'lang-box');
  box.append(h('p', 'lang-icon', afterPurchase ? '✓' : 'K'));
  if (afterPurchase) box.append(h('p', 'lic-thanks', L(`ありがとうございます！${planName}が有効になりました`, `Thank you! ${planName} is now active.`)));
  const title = h('h2', null, L('ライセンスコードを控えてください', 'Save your license code')); title.id = 'licDlgTitle';
  box.append(title);
  const mailed = lic.mail && lic.email;
  box.append(h('p', 'lang-body', mailed ? L(
    `このコードがあれば、別の端末で使うときや、ブラウザのデータを消したあとでも、プランを復元できます。同じコードをお申し込みのメールアドレス（${lic.email}）にもお送りしました。念のため、コピーかファイルに保存しておくと安心です。`,
    `With this code you can restore your plan on another device, or after clearing this browser’s data. We’ve also emailed it to ${lic.email}. To be safe, copy it or save it to a file too.`) : L(
    'このコードがあれば、別の端末で使うときや、ブラウザのデータを消したあとでも、プランを復元できます。コードはメールでは届かないので、いまコピーするかファイルに保存してください。',
    'With this code you can restore your plan on another device, or after clearing this browser’s data. It is not sent by email, so please copy it or save it to a file now.')));
  if (mailed) box.append(h('p', 'hint', L('メールが見当たらないときは、迷惑メールのフォルダもご確認ください。', 'If you can’t find the email, check your spam folder.')));
  const code = h('textarea', 'lic-code');
  code.readOnly = true; code.rows = 4; code.value = lic.token; code.spellcheck = false;
  code.setAttribute('aria-label', L('ライセンスコード', 'License code'));
  code.addEventListener('focus', () => code.select());
  box.append(code);
  const msg = h('p', 'plan-msg lic-msg'); msg.setAttribute('aria-live', 'polite');
  const actions = h('div', 'lic-actions');
  const mk = (text, cls, fn) => { const b = h('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); actions.append(b); return b; };
  const done = () => { try { localStorage.setItem('kanpe.licenseSaved', '1'); } catch { /* noop */ } };
  const copyBtn = mk(L('コピー', 'Copy'), 'lang-ok', async () => {
    try { await navigator.clipboard.writeText(lic.token); msg.textContent = L('コピーしました。メモアプリなど、なくさない場所に貼り付けておいてください', 'Copied. Paste it somewhere safe, like a notes app.'); }
    catch { code.focus(); code.select(); msg.textContent = L('コードを選択しました。長押しかショートカットでコピーしてください', 'The code is selected — copy it with a long press or shortcut.'); }
    done();
  });
  mk(L('ファイルに保存', 'Save to file'), 'lang-cancel', () => {
    const lines = EN ? [
      'KANPE license code', '',
      `Plan: ${planName}`,
      lic.email ? `Email used to subscribe: ${lic.email}` : '',
      `Saved on: ${new Date().toLocaleDateString('en-US')}`, '',
      lic.token, '',
      'How to restore: open the KANPE console, press the “Free / Upgrade” button at the top right,',
      'open “Restore with a license code” and paste the code above.',
      `${location.origin}/en/app`,
    ] : [
      'KANPE ライセンスコード', '',
      `プラン：${planName}`,
      lic.email ? `お申し込みのメールアドレス：${lic.email}` : '',
      `保存日：${new Date().toLocaleDateString('ja-JP')}`, '',
      lic.token, '',
      '復元のしかた：KANPE のコンソール右上の「無料プラン／アップグレード」のボタンを押し、',
      '「ライセンスコードで復元」を開いて、上のコードを貼り付けてください。',
      `${location.origin}/app`,
    ];
    download('kanpe-license.txt', lines.filter((x, i) => x !== '' || lines[i - 1] !== '').join('\n') + '\n');
    msg.textContent = L('「kanpe-license.txt」を保存しました', 'Saved “kanpe-license.txt”.');
    done();
  });
  box.append(actions, msg);
  box.append(h('p', 'hint lic-later', L('あとからでも、右上のプランのボタン →「ライセンスコードを表示・保存」でいつでも確認できます。', 'You can always find it again under the plan button at the top right → “View or save license code”.')));
  const foot = h('p', 'plan-foot');
  const close = h('button', 'plan-close', L('閉じる', 'Close')); close.type = 'button'; close.addEventListener('click', () => d.close());
  foot.append(close);
  box.append(foot);
  d.replaceChildren(box);
  // 申し込み直後は、窓の外を押しただけで閉じないようにする（見逃し防止）。閉じるボタンと Esc では閉じられる
  d.onclick = afterPurchase ? null : (e) => { if (e.target === d) d.close(); };
  copyBtn.autofocus = true; // 開いたときはコピーのボタンに（スマホでコード欄の選択が出ないように）
  $('#toast').classList.remove('on');
  if (!d.open) d.showModal();
}

$('#planBadge').addEventListener('click', (e) => {
  e.preventDefault();
  renderPlanDialog();
  const d = planDialog();
  if (!d.open) d.showModal();
});

// 決済から戻ってきたとき / 顧客ポータルから戻ってきたとき（ファイルの最後で呼ぶ）
async function handlePaymentReturn() {
  const q = new URLSearchParams(location.search);
  const clean = () => history.replaceState(null, '', location.pathname + location.hash);
  if (q.get('checkout') === 'success' && q.get('session_id')) {
    clean();
    toast(L('お支払いを確認しています…', 'Confirming your payment…'));
    for (let i = 0; i < 4; i++) { // 決済直後はまれに完了の反映が遅れるので、数回だけ待つ
      try {
        const l = await activateFromSession(q.get('session_id'));
        applyPlanUI();
        if (l.plan === 'free') toast(L('ご契約を確認できませんでした。少し待ってから「プラン」から確認してください', 'Couldn’t confirm the subscription yet. Check again from “Your plan” shortly.'));
        else showLicenseDialog(true);
        return;
      } catch (e) {
        if (e.code !== 'incomplete' || i === 3) { toast(payError(e)); return; }
        await new Promise((r) => setTimeout(r, 1500));
      }
    }
  }
  if (q.get('portal') === 'return') { clean(); await refreshLicense(true); applyPlanUI(); return; }
  const before = currentPlan();
  await refreshLicense(false);
  if (currentPlan() !== before) applyPlanUI();
}

$('#lang').value = S.lang;
$('#lang').addEventListener('change', () => {
  S.lang = $('#lang').value;
  S.langChosen = true;
  ex.setLang(S.lang);
  rec.setLang(S.lang);
  pushSettings();
});

// ------------------------------------------------------------ 操作
function togglePause() {
  paused = !paused;
  $('#btnPause').classList.toggle('on', paused);
  $('#btnPause').firstChild.textContent = paused ? L('再開 ', 'Resume ') : L('一時停止 ', 'Pause ');
  toast(paused ? L('表示を一時停止しました（文字起こしは続きます）', 'Display paused (the transcript keeps going)') : L('表示を再開しました', 'Display resumed'));
}
function clearAll() { send({ t: 'clear' }); }
$('#btnPause').addEventListener('click', togglePause);
$('#btnClear').addEventListener('click', clearAll);
window.addEventListener('keydown', (e) => {
  if (help.isOpen() || document.querySelector('dialog[open]')) return; // 窓が開いている間の Esc は窓を閉じるだけ
  const tag = (e.target && e.target.tagName) || '';
  if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
  if (e.key === '?') { e.preventDefault(); help.open(); return; }
  if (e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); }
  if (e.key === 'Escape') { e.preventDefault(); clearAll(); }
  if (/^[1-4]$/.test(e.key) && speakersOn() && +e.key <= S.speakerCount) { e.preventDefault(); setSpeaker(+e.key - 1); }
  if (e.key === 'm' || e.key === 'M') { e.preventDefault(); fuse(true); }
});

// ------------------------------------------------------------ 表示ビュー
const base = new URL(ROOT || './', location.href).href; // 表示ビューのある場所（英語版は1つ上）
$('#openKanpe').addEventListener('click', () => window.open(`${ROOT}display.html?layout=kanpe${HL ? '&' + HL : ''}`, 'kanpe-kanpe', 'width=1280,height=720'));
$('#openStage').addEventListener('click', () => window.open(`${ROOT}display.html${HL ? '?' + HL : ''}`, 'kanpe-stage', 'width=1280,height=720'));

$('#obsUrl').value = S.obsUrl;
$('#obsPassword').value = S.obsPassword;
function obsLabel(st) {
  return { connecting: L('接続中…', 'Connecting…'), connected: L('接続済み', 'Connected'), disconnected: L('未接続（再試行中）', 'Disconnected (retrying)'), 'auth-failed': L('パスワードが違います', 'Wrong password') }[st] || st;
}
$('#obsConnect').addEventListener('click', () => {
  if (obs) { obs.close(); unlinkObs && unlinkObs(); obs = null; $('#obsConnect').textContent = L('接続', 'Connect'); $('#obsStatus').textContent = L('未接続', 'Not connected'); updateMore(); return; }
  S.obsUrl = $('#obsUrl').value.trim() || DEFAULTS.obsUrl;
  S.obsPassword = $('#obsPassword').value;
  saveSettings(S);
  obs = connectObs({
    url: S.obsUrl, password: S.obsPassword,
    onMessage: bus.receive,
    onStatus: (st) => { $('#obsStatus').textContent = obsLabel(st); if (st === 'connected') pushSettings(false); updateMore(); },
  });
  unlinkObs = bus.link(obs);
  $('#obsConnect').textContent = L('切断', 'Disconnect');
});
$('#obsCopy').addEventListener('click', async () => {
  // 接続先とパスワードは # 以降に入れる（ブラウザはこの部分をサーバーへ送らない）
  // 透過はお手軽プランの書体。使えないとき（お試しも終わったとき）は、コンソールで選んだ書体のまま重ねる
  const clearOk = !plusLocked('theme:premium');
  const url = `${base}display.html?${clearOk ? 'theme=clear' : ''}${HL ? (clearOk ? '&' : '') + HL : ''}#obs=${encodeURIComponent($('#obsUrl').value.trim() || DEFAULTS.obsUrl)}` +
    ($('#obsPassword').value ? `&pw=${encodeURIComponent($('#obsPassword').value)}` : '');
  try {
    await navigator.clipboard.writeText(url);
    toast(clearOk ? L('OBS 用の URL をコピーしました', 'OBS URL copied')
      : L('OBS 用の URL をコピーしました（背景なしの「透過」はお手軽プランの書体なので、いまの書体のまま重なります）', 'OBS URL copied (the background-free “Clear” typeface is a Plus feature, so the overlay uses your current typeface)'));
  } catch { prompt(L('この URL を OBS のブラウザソースに貼ってください', 'Paste this URL into an OBS Browser Source'), url); }
});

// ------------------------------------------------------------ 文字起こし
const TXKEY = 'kanpe.transcript.v1';
const fmt = (s) => { const m = Math.floor(s / 60), x = Math.floor(s % 60); return `${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };
const srtTime = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60), ms = Math.round((s % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};
// 画面の一覧に出すのは新しいものから TX_SHOW 件まで（全部は transcript に残り、TXT・SRT に入る）。
// 一覧が長くなるほど、話している途中の文が変わるたびに一覧ぜんぶを組み直すことになり、
// 1時間ほど話し続けるとコンソールが重くなって固まっていたため
const TX_SHOW = 200;
function trimTx() {
  const ol = $('#tx');
  while (ol.childElementCount > TX_SHOW) ol.lastElementChild.remove();
  let more = $('#txMore');
  const hiddenN = transcript.length - ol.childElementCount;
  if (hiddenN <= 0) { if (more) more.hidden = true; return; }
  if (!more) {
    more = document.createElement('p');
    more.id = 'txMore';
    more.className = 'hint tx-more';
    ol.after(more);
  }
  more.hidden = false;
  more.textContent = L(`これより前の ${hiddenN} 件は一覧から省いています（TXT・SRT にはすべて入ります）`, `${hiddenN} earlier lines are hidden here (TXT and SRT include everything)`);
}
function appendTx(item) {
  const li = document.createElement('li');
  li.innerHTML = `<time>${fmt(item.start)}</time><span></span>`;
  const body = li.lastChild;
  if (item.spn) {
    const chip = document.createElement('b');
    chip.className = 'tx-sp';
    chip.style.setProperty('--c', item.spc || '#999');
    chip.textContent = item.spn;
    body.append(chip, document.createTextNode(item.clean));
  } else {
    body.textContent = item.clean;
  }
  $('#tx').prepend(li);
  trimTx();
}
const who = (t) => (t.spn ? `${t.spn}：` : '');
// 言語を切り替えて開き直したときだけ、直前の文字起こしを引き継ぐ（時刻も続きから数える）
function restoreCarry() {
  try {
    if (sessionStorage.getItem('kanpe.carry') !== '1') return;
    sessionStorage.removeItem('kanpe.carry');
    const arr = JSON.parse(localStorage.getItem(TXKEY) || '[]');
    for (const it of arr) { transcript.push(it); appendTx(it); }
    if (arr.length) t0 = performance.now() - arr[arr.length - 1].end * 1000;
  } catch { /* noop */ }
}
// 保存は数秒ぶんまとめて行う（話すたびに大きな文字列を書き込むと、長く話すほど重くなるため）
let saveTxTimer = 0;
function saveTranscript() {
  clearTimeout(saveTxTimer); saveTxTimer = 0;
  try { localStorage.setItem(TXKEY, JSON.stringify(transcript.slice(-2000))); } catch { /* noop */ }
}
function saveTranscriptSoon() { if (!saveTxTimer) saveTxTimer = setTimeout(saveTranscript, 15000); }
window.addEventListener('pagehide', () => { if (saveTxTimer) saveTranscript(); });
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
$('#dlTxt').addEventListener('click', () => download(`kanpe-${stamp()}.txt`, transcript.map((t) => `[${fmt(t.start)}] ${who(t)}${t.clean}`).join('\n') +
  (coined.length ? `\n\n${L('■ 生まれた新語', '■ New words')}\n` + coined.slice().reverse().map((c) => `${c.text}（${c.a} × ${c.b}）`).join('\n') : '')));
$('#dlSrt').addEventListener('click', () => download(`kanpe-${stamp()}.srt`,
  transcript.map((t, i) => `${i + 1}\n${srtTime(t.start)} --> ${srtTime(t.end)}\n${who(t)}${t.clean}\n`).join('\n')));
$('#clrTx').addEventListener('click', () => { transcript.length = 0; $('#tx').replaceChildren(); trimTx(); saveTranscript(); ex.reset(); coined.length = 0; seenWords.clear(); renderCoins(); });

// ------------------------------------------------------------ 表示まわりの小物
function setStatus(kind, text) { $('#dot').className = 'dot ' + kind; $('#statusText').textContent = text; }
let toastTm = 0;
function toast(msg, ms) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTm);
  toastTm = setTimeout(() => t.classList.remove('on'), ms || Math.max(3600, String(msg).length * 70)); // 長い案内は長めに出す
}

// プレビューは読み込み完了後に設定を受け取る
restoreCarry();
$('#preview').addEventListener('load', () => pushSettings(false));
if (!Recognizer.supported()) setStatus('err', L('音声認識非対応のブラウザ（デモとテキスト入力は使えます）', 'No speech recognition here (demo and typing still work)'));
pushSettings(false);
// 言語を切り替える直前（src/ui/lang.js から呼ばれる）：聞き取りとデモを止め、設定と文字起こしを保存する
window.__kanpeBeforeLeave = () => {
  try { if (rec.wanted) { rec.stop(); setMic(false); stopMeter(); releaseWake(); } } catch { /* noop */ }
  stopDemo();
  saveSettings(S);
  saveTranscript();
};
// ------------------------------------------------------------ はじめての人向けの 3 ステップのガイド
// 「無料ではじめる」から初めて開いたとき（設定がまだ何も保存されていないか ?welcome=1）に一度だけ出す。ヘルプの「はじめかた」からも開ける
let guideDemo = false;
const guide = createGuide({
  steps: [
    {
      target: () => $('.mic-row'),
      title: L('ボタンを押して、話す', 'Press the button and talk'),
      body: L('緑のマイクボタンを押して話すと、拾ったキーワードがその場で文字になります。最初にブラウザがマイクの使用を聞いてくるので「許可」を選んでください。', 'Press the green mic button and talk — keywords turn into type as you speak. Your browser will ask for the microphone the first time; choose “Allow”.'),
      note: L('マイクがなくても「デモを流す」や文章の入力で試せます', 'No mic? Try “Play demo” or type a sentence.'),
    },
    {
      target: () => [$('.preview'), $('.preview-foot')],
      title: L('言葉が、ここに組まれる', 'Your words are set here'),
      body: L('話した言葉が、日本語の文字組みでプレビューに並びます。何度も出た言葉ほど大きく育ちます。いま、デモを流しています。', 'What you say is laid out as typography in the preview. Words you repeat grow bigger. A demo is playing now.'),
      enter: () => { if (!demoRunning && !rec.wanted) { guideDemo = true; $('#btnDemo').click(); } },
    },
    {
      target: () => { showTab('look'); return $('#themes').closest('.field'); },
      title: L('見た目を選んで、映す', 'Pick a look, then put it on screen'),
      body: L('書体テーマで雰囲気が変わります（その下のレイアウトでは、言葉の置き方を選べます）。決まったら、プレビュー右下の「組版を別窓で」で大きな画面を開き、モニターや配信に映します。', 'Typeface themes change the mood (and the layout just below changes how words are placed). When you’re happy, open a big window with “Open compose view” at the bottom right of the preview and show it on a monitor or your stream.'),
    },
  ],
  onEnd: () => {
    if (guideDemo && demoRunning) { stopDemo(); clearAll(); }
    guideDemo = false;
    // 終わったらページの先頭（マイクのボタン）に戻る。PC は左の設定欄も中でスクロールするので両方戻す
    const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    for (const el of [document.scrollingElement, $('.controls'), $('.right')]) if (el) el.scrollTo({ top: 0, behavior });
    $('#btnMic').focus({ preventScroll: true });
  },
});
{
  const q = new URLSearchParams(location.search);
  const welcome = q.get('welcome') === '1';
  if (welcome) { q.delete('welcome'); history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); }
  const fresh = !Object.keys(saved0).length;
  if (!guideSeen() && (welcome || fresh) && !q.get('checkout') && !location.hash.startsWith('#help')) setTimeout(() => { if (!help.isOpen()) guide.start(); }, 700);
}

// ------------------------------------------------------------ 更新情報（バージョンの更新履歴）
// 新しいバージョンを初めて見たときは1時間「NEW」を出し、1回だけお知らせする
initNews({
  fresh: !Object.keys(saved0).length,
  onUpdated: (v) => setTimeout(() => toast(L(`KANPE が v${v} になりました。右上の「更新情報」で新しい機能を見られます`, `KANPE has been updated to v${v}. See “What’s new” at the top right.`), 6500), 1200),
});

applyPlanUI();
handlePaymentReturn();
window.__kanpeConsole = { onInterim, onFinal, get settings() { return S; } };

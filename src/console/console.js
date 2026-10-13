// 操作コンソール：音声認識 → キーワード抽出 → 表示イベント送信、設定と文字起こしの管理。
import { THEMES, LAYOUTS, DEFAULTS, DEFAULT_THEME, ACCENTS, VJ_STYLES, SPEAKER_COLORS, MAX_SPEAKERS, DEFAULT_SPEAKERS, loadSettings, saveSettings } from '../core/settings.js?v=202610131824';
import { EN, L, tr } from '../core/i18n.js?v=202610131824';
import { detectPitch, SpeakerTracker, calibrate } from './speakers.js?v=202610131824';
import { createBus } from '../core/bus.js?v=202610131824';
import { connectObs } from '../core/obs.js?v=202610131824';
import { Extractor, cleanCaption, maskNg } from '../core/extract.js?v=202610131824';
import { Recognizer, IS_MOBILE, IS_IOS, IS_ANDROID, ONE_SHOT } from './recognizer.js?v=202610131824';
import { simulateSpeech } from './demo.js?v=202610131824';
import { initHelp } from './help.js?v=202610131824';
import { PRO, PLANS, canUse, currentPlan, trialRemainingMs, addTrialUsage, trialStarted, licenseInfo, clearLicense, activateFromSession, activateFromCode, requestLicenseEmail, refreshLicense, startCheckout, openPortal } from '../core/plan.js?v=202610131824';

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
const bus = createBus((m) => { if (m.t === 'hello') { try { obs && obs.resetBg(); } catch { /* noop */ } pushSettings(false); } });
let obs = null, unlinkObs = null;

let paused = false;
let t0 = null;
const transcript = [];
const uttStart = new Map();
const clock = () => { if (t0 === null) t0 = performance.now(); return (performance.now() - t0) / 1000; };

// ------------------------------------------------------------ 送信
function send(m) { bus.send(m); }
function pushSettings(save = true) {
  if (save) saveSettings(S);
  // OBS の接続先・パスワードは表示ビューに不要なので送らない
  const { obsPassword, obsUrl, ...pub } = S; // eslint-disable-line no-unused-vars
  send({ t: 'settings', s: { ...pub, credit: !canUse('credit:hide') } });
}
function deliverWords(events) {
  if (paused) return;
  const sp = speakerInfo();
  for (const e of events) send({ t: 'word', ...e, ...sp });
}
function deliverCaption(raw, final) {
  if (paused) return;
  const t = maskNg(cleanCaption(raw), ex.ng);
  if (t) send({ t: 'caption', text: t, final, ...speakerInfo() });
}

function onInterim(id, text) {
  if (!uttStart.has(id)) uttStart.set(id, clock());
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
  saveTranscript();
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
$('#btnMic').addEventListener('click', async () => {
  if (rec.wanted) { rec.stop(); setMic(false); stopMeter(); releaseWake(); stopDiag(); return; }
  if (!Recognizer.supported()) { rec.onError('unsupported'); return; }
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

// 聞き取りの自己診断：「聞き取り中」なのに文字が出ないとき、原因を推定して直す・知らせる
//  - 声はマイクに届いているのに、認識側には音が届いていない → レベル表示用のマイクとの取り合い。
//    レベル表示を止め（この端末では以後開かない）、認識を開き直す
//  - 認識側にも声が届いているのに結果が返らない → 認識を作り直して再開。それでもだめなら言語設定・ブラウザを案内
//  - マイクの音がほとんど届いていない → 入力デバイスを案内
const METER_OFF_KEY = 'kanpe.meter.off';
function meterOff() { try { return localStorage.getItem(METER_OFF_KEY) === '1'; } catch { return false; } }
const diag = { since: 0, voiceMs: 0, peak: 0, step: 0, silentWarned: false, timer: 0, last: 0, guided: false };
function startDiag() {
  stopDiag();
  Object.assign(diag, { since: 0, voiceMs: 0, peak: 0, step: 0, silentWarned: false, last: performance.now(), guided: false });
  diag.timer = setInterval(checkDiag, 1000);
}
function stopDiag() { clearInterval(diag.timer); diag.timer = 0; diag.since = 0; }
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
    // マイクの取り合い：レベル表示を止めて、認識だけにマイクを渡す
    try { localStorage.setItem(METER_OFF_KEY, '1'); } catch { /* noop */ }
    stopMeter();
    Object.assign(diag, { since: now, voiceMs: 0, peak: 0, step: 1 });
    rec.reset();
    toast(L('音声認識にマイクの音が届いていなかったため、レベル表示を止めて聞き取りを開き直しました。もう一度話してみてください', 'Your mic sound wasn’t reaching speech recognition, so the level meter was turned off and listening restarted. Please try speaking again.'), 7000);
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
    const src = meterCtx.createMediaStreamSource(meterStream);
    const an = meterCtx.createAnalyser();
    an.fftSize = 2048; // 声の高さ（話者の推定）にも使うので長めに取る
    src.connect(an);
    meterAnalyser = an;
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
      if (S.layout === 'vj' && t - lvlAt > 50 && !paused) { lvlAt = t; send({ t: 'lvl', v: Math.min(1, v * 1.6) }); }
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
  try { meterStream && meterStream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
  try { meterCtx && meterCtx.close(); } catch { /* noop */ }
  meterStream = meterCtx = meterAnalyser = null;
  $('#meter').style.transform = 'scaleX(0)';
}

// ------------------------------------------------------------ デモとテキスト入力
let demoRunning = false;
function stopDemo() { demoRunning = false; $('#btnDemo').textContent = L('デモを流す', 'Play demo'); }
$('#btnDemo').addEventListener('click', async () => {
  if (demoRunning) { stopDemo(); return; }
  if (rec.wanted) { rec.stop(); setMic(false); stopMeter(); }
  demoRunning = true;
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
    }
    if (def.pro && plusLocked(key === 'layout' ? 'layout:vj' : 'theme:premium')) b.classList.add('locked');
    if (def.pro && key === 'layout') { const t = document.createElement('em'); t.className = 'seg-tag'; t.textContent = '+'; b.appendChild(t); }
    b.addEventListener('click', () => pick(container, entries, key, id, def));
    box.appendChild(b);
  }
  if (key === 'layout') {
    $('#layoutNote').textContent = entries[S[key]] ? tr(entries[S[key]], 'note') : '';
    $('#vjOpts').hidden = S.layout !== 'vj';
  }
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
  if (key === 'speakerCount') { S[key] = +id; renderSpeakers(); pushSettings(); return; }
  if (key === 'speakerMode') { S[key] = id; renderSpeakers(); updateTrial(); pushSettings(); return; }
  S[key] = id;
  if (key === 'theme') renderThemes(); else segButtons(container, entries, key);
  if (key === 'vjStyle') $('#vjStyleNote').textContent = tr(VJ_STYLES[id], 'note');
  updateTrial();
  pushSettings();
}

// ---- 書体テーマ（標準 / プレミアム）と、無料プランの1日お試し ----
const FREE_THEMES = Object.fromEntries(Object.entries(THEMES).filter(([, d]) => !d.pro));
const PRO_THEMES = Object.fromEntries(Object.entries(THEMES).filter(([, d]) => d.pro));
function renderThemes() {
  segButtons('#themes', FREE_THEMES, 'theme');
  segButtons('#proThemes', PRO_THEMES, 'theme');
  renderAccents();
  updateTrial();
}

// ---- アクセントカラー（お手軽プラン以上。無料プランは書体と同じ1日のお試し） ----
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
  auto.className = 'acc-auto';
  auto.style.setProperty('--c', (THEMES[S.theme] || THEMES[DEFAULT_THEME]).accent);
  auto.innerHTML = `<i></i>${L('標準', 'Default')}`;
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
const usingPlusTrial = () => !canUse('theme:premium') && ((THEMES[S.theme] && THEMES[S.theme].pro) || !!S.accent || !!S.bgImage || !!S.bgCamera ||
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
    : L('プレミアム書体・アクセントカラー・背景画像・VJ モード・話者の色分けは、無料プランでも1日（24時間）お試しできます。使い始めた時から数えます', 'Premium typefaces, accent colors, background images, VJ mode and speaker colors can be tried free for one day (24 hours), counted from first use.');
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
      S.accent = '';
      S.bgImage = '';
      S.bgCamera = false;
      if (S.layout === 'vj') S.layout = 'compose';
      S.speakerMode = 'off';
      renderBg();
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

if (!THEMES[S.theme] || (THEMES[S.theme].pro && !canUse('theme:premium') && trialRemainingMs() <= 0)) S.theme = DEFAULT_THEME;
if (S.accent && accentLocked()) S.accent = '';
if (S.bgImage && accentLocked()) S.bgImage = '';
if (S.bgCamera && (camLocked() || !CAN_CAM)) S.bgCamera = false;
if (S.layout === 'vj' && plusLocked('layout:vj')) S.layout = 'compose';
if (!LAYOUTS[S.layout]) S.layout = 'compose';
if (S.speakerMode !== 'off' && plusLocked('speaker:labels')) S.speakerMode = 'off';
if (!VJ_STYLES[S.vjStyle]) S.vjStyle = 'led';
renderThemes();
segButtons('#layouts', LAYOUTS, 'layout');
segButtons('#vjStyles', VJ_STYLES, 'vjStyle');
$('#vjStyleNote').textContent = tr(VJ_STYLES[S.vjStyle], 'note');
bindRange('baseSize', 'vSize', (v) => `${v}`);
bindRange('ttl', 'vTtl', (v) => L(`${v}秒`, `${v}s`));
bindRange('maxWords', 'vMax', (v) => L(`${v}語`, `${v} words`));
bindRange('bgDim', 'vBgDim', (v) => `${Math.round(v * 100)}%`);
renderBg();
renderCam();
if (S.bgCamera) listCameras();
bindCheck('vertical');
bindCheck('caption');
bindCheck('reduceMotion');
bindText('registered', () => ex.setDict(S));
bindText('ng', () => ex.setDict(S));

// ------------------------------------------------------------ 使い方ガイド（ヘルプ）とシーン別のおすすめ設定
function applyPreset(p) {
  Object.assign(S, p.s);
  renderThemes();
  segButtons('#layouts', LAYOUTS, 'layout');
  for (const id of ['baseSize', 'ttl', 'maxWords']) { const r = $('#' + id); r.value = S[id]; r.dispatchEvent(new Event('input')); }
  for (const id of ['vertical', 'caption']) $('#' + id).checked = !!S[id];
  updateTrial();
  pushSettings();
  toast(L(`「${p.label}」向けの設定にしました`, `Switched to settings for: ${p.label}`));
}
const help = initHelp({ onPreset: applyPreset });


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
    : `<b>${tr(PLANS[plan])}</b><span>${L('管理', 'Manage')}</span>`;
  badge.classList.toggle('paid', plan !== 'free');
  renderThemes();
  segButtons('#layouts', LAYOUTS, 'layout');
  renderSpeakers();
  renderBg();
  renderCam();
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
  box.append(h('p', 'plan-now', tr(PLANS[plan])));
  if (plan !== 'free' && lic) {
    box.append(h('p', 'lang-body', lic.cancelAtPeriodEnd
      ? L(`解約済みです。${fmtDate(lic.expires - 3 * 86400)} まで使えます`, `Cancelled — available until ${fmtDate(lic.expires - 3 * 86400)}`)
      : L(`次回の更新日：${fmtDate(lic.expires - 3 * 86400)}（${lic.interval === 'year' ? '年払い' : '月払い'}）`, `Renews on ${fmtDate(lic.expires - 3 * 86400)} (${lic.interval === 'year' ? 'yearly' : 'monthly'})`)));
  } else if (lic && lic.plan !== 'free' && lic.expires * 1000 <= Date.now()) {
    box.append(h('p', 'lang-body', L('ご契約の期限が切れています。更新するとまた使えます', 'Your subscription has ended. Renew to keep using paid features.')));
  } else {
    box.append(h('p', 'lang-body', L('お手軽プラン（月¥480・税込）で、VJ モード・話者の色分け・プレミアム書体・背景画像が使え、「KANPE」表示を消せます。いつでも解約できます。',
      'Plus (¥480/mo incl. tax) unlocks VJ mode, speaker colors, premium typefaces and background images, and removes the “KANPE” mark. Cancel any time.')));
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
  } else {
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
    const p = h('p', 'hint', L('この端末では無料プランに戻ります。ご契約は続くので、ライセンスコードでいつでも戻せます（解約は「支払い方法・解約・領収書」から）。', 'This browser goes back to Free. Your subscription continues — restore it any time with your license code (cancel from “Billing, cancel, receipts”).'));
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
  if (obs) { obs.close(); unlinkObs && unlinkObs(); obs = null; $('#obsConnect').textContent = L('接続', 'Connect'); $('#obsStatus').textContent = L('未接続', 'Not connected'); return; }
  S.obsUrl = $('#obsUrl').value.trim() || DEFAULTS.obsUrl;
  S.obsPassword = $('#obsPassword').value;
  saveSettings(S);
  obs = connectObs({
    url: S.obsUrl, password: S.obsPassword,
    onMessage: bus.receive,
    onStatus: (st) => { $('#obsStatus').textContent = obsLabel(st); if (st === 'connected') pushSettings(false); },
  });
  unlinkObs = bus.link(obs);
  $('#obsConnect').textContent = L('切断', 'Disconnect');
});
$('#obsCopy').addEventListener('click', async () => {
  // 接続先とパスワードは # 以降に入れる（ブラウザはこの部分をサーバーへ送らない）
  const url = `${base}display.html?theme=clear${HL ? '&' + HL : ''}#obs=${encodeURIComponent($('#obsUrl').value.trim() || DEFAULTS.obsUrl)}` +
    ($('#obsPassword').value ? `&pw=${encodeURIComponent($('#obsPassword').value)}` : '');
  try { await navigator.clipboard.writeText(url); toast(L('OBS 用の URL をコピーしました', 'OBS URL copied')); } catch { prompt(L('この URL を OBS のブラウザソースに貼ってください', 'Paste this URL into an OBS Browser Source'), url); }
});

// ------------------------------------------------------------ 文字起こし
const TXKEY = 'kanpe.transcript.v1';
const fmt = (s) => { const m = Math.floor(s / 60), x = Math.floor(s % 60); return `${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}`; };
const srtTime = (s) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = Math.floor(s % 60), ms = Math.round((s % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
};
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
function saveTranscript() { try { localStorage.setItem(TXKEY, JSON.stringify(transcript.slice(-2000))); } catch { /* noop */ } }
function download(name, text) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
$('#dlTxt').addEventListener('click', () => download(`kanpe-${stamp()}.txt`, transcript.map((t) => `[${fmt(t.start)}] ${who(t)}${t.clean}`).join('\n')));
$('#dlSrt').addEventListener('click', () => download(`kanpe-${stamp()}.srt`,
  transcript.map((t, i) => `${i + 1}\n${srtTime(t.start)} --> ${srtTime(t.end)}\n${who(t)}${t.clean}\n`).join('\n')));
$('#clrTx').addEventListener('click', () => { transcript.length = 0; $('#tx').replaceChildren(); saveTranscript(); ex.reset(); });

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
applyPlanUI();
handlePaymentReturn();
window.__kanpeConsole = { onInterim, onFinal, get settings() { return S; } };

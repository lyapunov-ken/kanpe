// 操作コンソール：音声認識 → キーワード抽出 → 表示イベント送信、設定と文字起こしの管理。
import { THEMES, LAYOUTS, DEFAULTS, DEFAULT_THEME, ACCENTS, loadSettings, saveSettings } from '../core/settings.js?v=202610110918';
import { createBus } from '../core/bus.js?v=202610110918';
import { connectObs } from '../core/obs.js?v=202610110918';
import { Extractor, cleanCaption, maskNg } from '../core/extract.js?v=202610110918';
import { Recognizer, IS_MOBILE, IS_IOS, IS_ANDROID } from './recognizer.js?v=202610110918';
import { simulateSpeech } from './demo.js?v=202610110918';
import { PRO, PLANS, canUse, currentPlan, trialRemainingMs, addTrialUsage, trialStarted } from '../core/plan.js?v=202610110918';

const $ = (s) => document.querySelector(s);
let S = { ...DEFAULTS, ...loadSettings() };

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
  send({ t: 'settings', s: { ...S, credit: !canUse('credit:hide') } });
}
function deliverWords(events) {
  if (paused) return;
  for (const e of events) send({ t: 'word', ...e });
}
function deliverCaption(raw, final) {
  if (paused) return;
  const t = maskNg(cleanCaption(raw), ex.ng);
  if (t) send({ t: 'caption', text: t, final });
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
  const item = { start, end: Math.max(start + 0.8, clock()), raw: text, clean };
  transcript.push(item);
  appendTx(item);
  saveTranscript();
}

// ------------------------------------------------------------ 音声認識
const rec = new Recognizer({
  lang: S.lang, onInterim, onFinal,
  onState: (st) => {
    if (st === 'listening') setStatus('on', '聞き取り中');
    else if (st === 'restarting') setStatus('on', '聞き取り中');
    else if (st === 'stopped') { setStatus('', '待機中'); setMic(false); stopMeter(); releaseWake(); }
  },
  onError: (err) => {
    const msg = {
      unsupported: IS_IOS ? 'このブラウザでは音声認識を使えません。iPhone は Safari で開いてください（アプリ内ブラウザは非対応です）'
        : IS_ANDROID ? 'このブラウザでは音声認識を使えません。Android は Chrome で開いてください（アプリ内ブラウザは非対応です）'
        : 'このブラウザは音声認識に対応していません。Chrome / Edge / Safari で開いてください',
      'not-allowed': IS_IOS ? 'マイクか音声認識が許可されていません。「設定」→「Safari」→「マイク」を許可し、「設定」→「Siri」で Siri（または音声入力）をオンにしてください'
        : IS_MOBILE ? 'マイクが許可されていません。ブラウザのサイト設定でマイクを許可してください'
        : 'マイクの使用が許可されていません。アドレスバーのマイクアイコンから許可してください',
      'service-not-allowed': IS_IOS ? '音声認識を使えません。「設定」→「Siri」で Siri（または「一般」→「キーボード」→「音声入力」）をオンにしてください'
        : '音声認識サービスを使えません（Chrome / Edge / Safari と https で開いてください）',
      'audio-capture': 'マイクが見つかりません',
      network: '音声認識サービスに接続できません。ネットワークを確認してください',
    }[err] || `音声認識エラー：${err}`;
    toast(msg);
    if (err !== 'network') { setStatus('err', 'エラー'); setMic(false); stopMeter(); releaseWake(); }
  },
});

function setMic(on) {
  $('#btnMic').classList.toggle('on', on);
  $('#btnMic').setAttribute('aria-pressed', String(on));
  $('#btnMic').setAttribute('aria-label', on ? '聞き取りを止める' : '話しはじめる');
  $('#micLabel').textContent = on ? '聞き取り中' : '話しはじめる';
  $('#micHint').textContent = on ? 'もう一度押すと止まります' : '押すとマイクで聞き取りを始めます';
}
$('#btnMic').addEventListener('click', async () => {
  if (rec.wanted) { rec.stop(); setMic(false); stopMeter(); releaseWake(); return; }
  if (!Recognizer.supported()) { rec.onError('unsupported'); return; }
  stopDemo();
  clock();
  if (rec.start()) {
    setMic(true); setStatus('on', '準備中');
    // スマホはマイクを2つ同時に開くと音声認識が止まるので、レベル表示は PC のみ
    if (!IS_MOBILE) startMeter();
    keepAwake();
  }
});

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
let meterCtx = null, meterStream = null, meterRaf = 0;
async function startMeter() {
  try {
    meterStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    meterCtx = new AudioContext();
    const src = meterCtx.createMediaStreamSource(meterStream);
    const an = meterCtx.createAnalyser();
    an.fftSize = 512;
    src.connect(an);
    const buf = new Uint8Array(an.fftSize);
    const bar = $('#meter');
    const loop = () => {
      an.getByteTimeDomainData(buf);
      let sum = 0;
      for (const v of buf) { const d = (v - 128) / 128; sum += d * d; }
      const rms = Math.sqrt(sum / buf.length);
      bar.style.transform = `scaleX(${Math.min(1, rms * 4).toFixed(3)})`;
      meterRaf = requestAnimationFrame(loop);
    };
    loop();
  } catch { /* メーターは任意 */ }
}
function stopMeter() {
  cancelAnimationFrame(meterRaf);
  try { meterStream && meterStream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
  try { meterCtx && meterCtx.close(); } catch { /* noop */ }
  meterStream = meterCtx = null;
  $('#meter').style.transform = 'scaleX(0)';
}

// ------------------------------------------------------------ デモとテキスト入力
let demoRunning = false;
function stopDemo() { demoRunning = false; $('#btnDemo').textContent = 'デモを流す'; }
$('#btnDemo').addEventListener('click', async () => {
  if (demoRunning) { stopDemo(); return; }
  if (rec.wanted) { rec.stop(); setMic(false); stopMeter(); }
  demoRunning = true;
  $('#btnDemo').textContent = 'デモを止める';
  setStatus('demo', 'デモ再生中');
  await simulateSpeech({ lang: S.lang, onInterim, onFinal, shouldStop: () => !demoRunning, loop: true });
  stopDemo();
  setStatus('', '待機中');
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
    b.setAttribute('aria-checked', String(S[key] === id));
    b.title = def.note;
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
      name.textContent = def.label;
      b.append(tile, name);
    } else {
      b.textContent = def.label;
    }
    if (key === 'theme' && def.pro && !canUse('theme:premium') && trialRemainingMs() <= 0) b.classList.add('locked');
    b.addEventListener('click', () => pick(container, entries, key, id, def));
    box.appendChild(b);
  }
  if (key === 'layout') $('#layoutNote').textContent = entries[S[key]] ? entries[S[key]].note : '';
}
function pick(container, entries, key, id, def) {
  if (key === 'theme' && def.pro && !canUse('theme:premium') && trialRemainingMs() <= 0) {
    toast('お試し期間（1日）は終わりました。プレミアム書体はお手軽プラン（月¥100）で続けて使えます');
    return;
  }
  S[key] = id;
  if (key === 'theme') renderThemes(); else segButtons(container, entries, key);
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
const accentLocked = () => !canUse('accent:custom') && trialRemainingMs() <= 0;
function pickAccent(c) {
  if (c && accentLocked()) { toast('お試し期間（1日）は終わりました。アクセントカラーはお手軽プラン（月¥100）で変えられます'); return; }
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
  auto.innerHTML = '<i></i>標準';
  radio(auto, !S.accent, '書体テーマ標準の色');
  auto.addEventListener('click', () => pickAccent(''));
  box.appendChild(auto);
  const known = ACCENTS.some((a) => a.c === S.accent);
  for (const a of ACCENTS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'acc';
    b.style.setProperty('--c', a.c);
    radio(b, S.accent === a.c, a.label);
    b.addEventListener('click', () => pickAccent(a.c));
    box.appendChild(b);
  }
  const custom = document.createElement('label');
  custom.className = 'acc-custom';
  radio(custom, !!S.accent && !known, '好きな色を選ぶ');
  if (S.accent && !known) custom.style.background = S.accent;
  const input = document.createElement('input');
  input.type = 'color';
  input.value = S.accent || '#ffd23f';
  input.addEventListener('click', (e) => { if (accentLocked()) { e.preventDefault(); toast('お試し期間（1日）は終わりました。アクセントカラーはお手軽プラン（月¥100）で変えられます'); } });
  input.addEventListener('change', () => pickAccent(input.value));
  custom.appendChild(input);
  box.appendChild(custom);
}
const usingPlusTrial = () => !canUse('theme:premium') && ((THEMES[S.theme] && THEMES[S.theme].pro) || !!S.accent || !!S.bgImage);
function updateTrial() {
  const box = $('#trialBox');
  if (canUse('theme:premium')) { box.hidden = true; return; }
  const rem = trialRemainingMs();
  const active = usingPlusTrial();
  const h = Math.floor(rem / 3600000), m = Math.floor(rem / 60000) % 60;
  const left = h > 0 ? `${h}時間${m}分` : `${m}分`;
  $('#trialFill').style.transform = `scaleX(${(rem / PRO.trialMs).toFixed(4)})`;
  box.classList.toggle('active', trialStarted() && rem > 0);
  $('#trialNote').textContent = rem <= 0 ? `お試し期間（1日）は終わりました。お手軽プラン（月¥100）で続けて使えます`
    : trialStarted() ? `お試し中　残り ${left}（終わると標準の書体と色に戻り、背景画像は外れます）`
    : 'プレミアム書体・アクセントカラー・背景画像は、無料プランでも1日（24時間）お試しできます。使い始めた時から数えます';
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
      renderBg();
      pushSettings();
      renderThemes();
      toast('プレミアム機能のお試し期間（1日）が終わったので、標準の書体・色・背景に戻しました');
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
  thumb.style.backgroundImage = S.bgImage ? `url("${S.bgImage}")` : '';
  thumb.classList.toggle('has', !!S.bgImage);
  $('#bgRemove').hidden = !S.bgImage;
  $('#bgDimRow').hidden = !S.bgImage;
  document.querySelector('.bg-pick').classList.toggle('locked', bgLocked());
}
$('#bgFile').addEventListener('click', (e) => {
  if (bgLocked()) { e.preventDefault(); toast('お試し期間（1日）は終わりました。背景画像はお手軽プラン（月¥100）で使えます'); }
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
    toast(`背景画像を設定しました（${w}×${h}px に縮小）`);
  } catch {
    toast('この画像は読み込めませんでした。JPEG か PNG で試してください');
  }
});
$('#bgRemove').addEventListener('click', () => { S.bgImage = ''; renderBg(); updateTrial(); pushSettings(); });

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
renderThemes();
segButtons('#layouts', LAYOUTS, 'layout');
bindRange('baseSize', 'vSize', (v) => `${v}`);
bindRange('ttl', 'vTtl', (v) => `${v}秒`);
bindRange('maxWords', 'vMax', (v) => `${v}語`);
bindRange('bgDim', 'vBgDim', (v) => `${Math.round(v * 100)}%`);
renderBg();
bindCheck('vertical');
bindCheck('caption');
bindCheck('reduceMotion');
bindText('registered', () => ex.setDict(S));
bindText('ng', () => ex.setDict(S));

// ------------------------------------------------------------ 認識エンジン（無料＝ブラウザ / おトクプラン＝高精度クラウド）
const engineSel = $('#engine');
engineSel.value = 'browser';
engineSel.addEventListener('change', () => {
  if (engineSel.value === 'cloud' && !canUse('engine:cloud')) {
    engineSel.value = 'browser';
    $('#proNote').hidden = false;
    toast(`高精度クラウド認識は${PLANS.pro.label}（${PLANS.pro.price}・月${PRO.includedHours}時間つき）の機能です（近日公開）`);
    return;
  }
  $('#proNote').hidden = true;
});
if (currentPlan() !== 'free') {
  $('#planBadge').innerHTML = `<b>${PLANS[currentPlan()].label}</b>`;
}

$('#lang').value = S.lang;
$('#lang').addEventListener('change', () => {
  S.lang = $('#lang').value;
  ex.setLang(S.lang);
  rec.setLang(S.lang);
  pushSettings();
});

// ------------------------------------------------------------ 操作
function togglePause() {
  paused = !paused;
  $('#btnPause').classList.toggle('on', paused);
  $('#btnPause').firstChild.textContent = paused ? '再開 ' : '一時停止 ';
  toast(paused ? '表示を一時停止しました（文字起こしは続きます）' : '表示を再開しました');
}
function clearAll() { send({ t: 'clear' }); }
$('#btnPause').addEventListener('click', togglePause);
$('#btnClear').addEventListener('click', clearAll);
window.addEventListener('keydown', (e) => {
  const tag = (e.target && e.target.tagName) || '';
  if (/INPUT|TEXTAREA|SELECT/.test(tag)) return;
  if (e.key === 'p' || e.key === 'P') { e.preventDefault(); togglePause(); }
  if (e.key === 'Escape') { e.preventDefault(); clearAll(); }
});

// ------------------------------------------------------------ 表示ビュー
const base = location.href.replace(/[^/]*$/, '');
$('#openKanpe').addEventListener('click', () => window.open('display.html?layout=kanpe', 'kanpe-kanpe', 'width=1280,height=720'));
$('#openStage').addEventListener('click', () => window.open('display.html', 'kanpe-stage', 'width=1280,height=720'));

$('#obsUrl').value = S.obsUrl;
$('#obsPassword').value = S.obsPassword;
function obsLabel(st) {
  return { connecting: '接続中…', connected: '接続済み', disconnected: '未接続（再試行中）', 'auth-failed': 'パスワードが違います' }[st] || st;
}
$('#obsConnect').addEventListener('click', () => {
  if (obs) { obs.close(); unlinkObs && unlinkObs(); obs = null; $('#obsConnect').textContent = '接続'; $('#obsStatus').textContent = '未接続'; return; }
  S.obsUrl = $('#obsUrl').value.trim() || DEFAULTS.obsUrl;
  S.obsPassword = $('#obsPassword').value;
  saveSettings(S);
  obs = connectObs({
    url: S.obsUrl, password: S.obsPassword,
    onMessage: bus.receive,
    onStatus: (st) => { $('#obsStatus').textContent = obsLabel(st); if (st === 'connected') pushSettings(false); },
  });
  unlinkObs = bus.link(obs);
  $('#obsConnect').textContent = '切断';
});
$('#obsCopy').addEventListener('click', async () => {
  const url = `${base}display.html?theme=clear&obs=${encodeURIComponent($('#obsUrl').value.trim() || DEFAULTS.obsUrl)}` +
    ($('#obsPassword').value ? `&pw=${encodeURIComponent($('#obsPassword').value)}` : '');
  try { await navigator.clipboard.writeText(url); toast('OBS 用の URL をコピーしました'); } catch { prompt('この URL を OBS のブラウザソースに貼ってください', url); }
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
  li.lastChild.textContent = item.clean;
  $('#tx').prepend(li);
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
$('#dlTxt').addEventListener('click', () => download(`kanpe-${stamp()}.txt`, transcript.map((t) => `[${fmt(t.start)}] ${t.clean}`).join('\n')));
$('#dlSrt').addEventListener('click', () => download(`kanpe-${stamp()}.srt`,
  transcript.map((t, i) => `${i + 1}\n${srtTime(t.start)} --> ${srtTime(t.end)}\n${t.clean}\n`).join('\n')));
$('#clrTx').addEventListener('click', () => { transcript.length = 0; $('#tx').replaceChildren(); saveTranscript(); ex.reset(); });

// ------------------------------------------------------------ 表示まわりの小物
function setStatus(kind, text) { $('#dot').className = 'dot ' + kind; $('#statusText').textContent = text; }
let toastTm = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTm);
  toastTm = setTimeout(() => t.classList.remove('on'), 3600);
}

// プレビューは読み込み完了後に設定を受け取る
$('#preview').addEventListener('load', () => pushSettings(false));
if (!Recognizer.supported()) setStatus('err', '音声認識非対応のブラウザ（デモとテキスト入力は使えます）');
pushSettings(false);
window.__kanpeConsole = { onInterim, onFinal, get settings() { return S; } };

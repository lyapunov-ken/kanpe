// 操作コンソール：音声認識 → キーワード抽出 → 表示イベント送信、設定と文字起こしの管理。
import { THEMES, LAYOUTS, DEFAULTS, loadSettings, saveSettings } from '../core/settings.js';
import { createBus } from '../core/bus.js';
import { connectObs } from '../core/obs.js';
import { Extractor, cleanCaption, maskNg } from '../core/extract.js';
import { Recognizer } from './recognizer.js';
import { simulateSpeech } from './demo.js';
import { PRO, canUse, currentPlan } from '../core/plan.js';

const $ = (s) => document.querySelector(s);
let S = { ...DEFAULTS, ...loadSettings() };

const ex = new Extractor({ lang: S.lang, registered: S.registered, ng: S.ng });
const bus = createBus((m) => { if (m.t === 'hello') pushSettings(false); });
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
  send({ t: 'settings', s: S });
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
    else if (st === 'stopped') { setStatus('', '待機中'); setMic(false); stopMeter(); }
  },
  onError: (err) => {
    const msg = {
      unsupported: 'このブラウザは音声認識に対応していません。Chrome か Edge で開いてください',
      'not-allowed': 'マイクの使用が許可されていません。アドレスバーのマイクアイコンから許可してください',
      'service-not-allowed': '音声認識サービスを使えません（Chrome / Edge と https または localhost で開いてください）',
      'audio-capture': 'マイクが見つかりません',
      network: '音声認識サービスに接続できません。ネットワークを確認してください',
    }[err] || `音声認識エラー：${err}`;
    toast(msg);
    if (err !== 'network') { setStatus('err', 'エラー'); setMic(false); stopMeter(); }
  },
});

function setMic(on) {
  $('#btnMic').classList.toggle('on', on);
  $('#btnMic').setAttribute('aria-pressed', String(on));
  $('#micLabel').textContent = on ? '停止する' : '話しはじめる';
}
$('#btnMic').addEventListener('click', async () => {
  if (rec.wanted) { rec.stop(); setMic(false); stopMeter(); return; }
  if (!Recognizer.supported()) { rec.onError('unsupported'); return; }
  stopDemo();
  clock();
  if (rec.start()) { setMic(true); setStatus('on', '準備中'); startMeter(); }
});

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
    b.className = 'seg-btn' + (S[key] === id ? ' on' : '');
    b.innerHTML = `<b>${def.label}</b><small>${def.note}</small>`;
    if (key === 'theme') {
      b.style.setProperty('--sw-bg', def.bg === 'transparent' ? 'repeating-conic-gradient(#555 0 25%, #333 0 50%) 0 0/10px 10px' : def.bg);
      b.style.setProperty('--sw-ink', def.ink);
      b.style.setProperty('--sw-accent', def.accent);
      b.classList.add('swatch');
    }
    b.addEventListener('click', () => { S[key] = id; segButtons(container, entries, key); pushSettings(); });
    box.appendChild(b);
  }
}
function bindRange(id, label, fmt) {
  const input = $('#' + id);
  input.value = S[id];
  const show = () => { $('#' + label).textContent = fmt(S[id]); };
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

segButtons('#themes', THEMES, 'theme');
segButtons('#layouts', LAYOUTS, 'layout');
bindRange('baseSize', 'vSize', (v) => `${v}`);
bindRange('ttl', 'vTtl', (v) => `${v}秒`);
bindRange('maxWords', 'vMax', (v) => `${v}語`);
bindCheck('vertical');
bindCheck('caption');
bindCheck('reduceMotion');
bindText('registered', () => ex.setDict(S));
bindText('ng', () => ex.setDict(S));

// ------------------------------------------------------------ 認識エンジン（無料＝ブラウザ / Pro＝高精度クラウド）
const engineSel = $('#engine');
engineSel.value = 'browser';
engineSel.addEventListener('change', () => {
  if (engineSel.value === 'cloud' && !canUse('engine:cloud')) {
    engineSel.value = 'browser';
    $('#proNote').hidden = false;
    toast(PRO.available ? '高精度クラウド認識は Pro プランで使えます' : `高精度クラウド認識は Pro（${PRO.price}）で近日公開です`);
    return;
  }
  $('#proNote').hidden = true;
});
if (currentPlan() === 'pro') {
  $('#planBadge').innerHTML = '<b>PRO</b>';
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

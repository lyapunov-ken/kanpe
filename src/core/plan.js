// フリーミアムの設定。決済・ライセンス確認はサーバー側（今後）で行い、ここはその結果を受け取る窓口。
// プランは3つ：無料プラン → お手軽プラン（見た目）→ おトクプラン（見た目＋精度と賢さ）。
export const PLANS = {
  free: { label: '無料プラン', labelEn: 'Free', short: '無料',   price: '¥0',      yen: '¥0', rank: 0 },
  plus: { label: 'お手軽プラン', labelEn: 'Plus', short: 'お手軽', price: '¥480/月', yen: '¥480', rank: 1 },
  pro:  { label: 'おトクプラン', labelEn: 'Pro', short: 'おトク', price: '¥2,980/月', yen: '¥2,980', rank: 2 },
};

export const PRO = {
  // 想定：2時間の配信を週3回（月約26時間）。話している区間は6〜7割なので月17時間前後。
  includedHours: 20,         // おトクプランの高精度クラウド認識（月・話している区間のみ）。上の想定がまるごと収まる
  extraPrice: '¥200 / 1時間',
  available: false,          // おトクプランのクラウド機能（高精度認識・話者分離）が動き始めたら true
  trialMs: 24 * 60 * 60 * 1000, // 無料プランでプレミアム機能を試せる期間（最初に使ってから1日・1回だけ）
};

// ---- ライセンス（Stripe で申し込むと /api/license が発行する署名つきの札）----
// 端末のブラウザに保存し、半日に1回ほど /api/license で契約の最新の状態に更新する。
// 表示まわりの機能はブラウザの中で動くため、ここでの判定は使い勝手のためのもの。
// サーバーを使う機能（今後のクラウド認識など）は、サーバー側でライセンスを検証する。
const LICENSE_KEY = 'kanpe.license.v1';
const REFRESH_MS = 12 * 60 * 60 * 1000;
export function licenseInfo() {
  try {
    const l = JSON.parse(localStorage.getItem(LICENSE_KEY) || 'null');
    if (l && typeof l.token === 'string') return l;
  } catch { /* noop */ }
  return null;
}
function saveLicense(data) {
  const l = { token: data.token, plan: PLANS[data.plan] ? data.plan : 'free', expires: data.expires || 0, status: data.status || '',
    interval: data.interval || null, cancelAtPeriodEnd: !!data.cancelAtPeriodEnd, email: data.email || (licenseInfo() || {}).email || '', checkedAt: Date.now() };
  try { localStorage.setItem(LICENSE_KEY, JSON.stringify(l)); } catch { /* noop */ }
  return l;
}
export function clearLicense() { try { localStorage.removeItem(LICENSE_KEY); } catch { /* noop */ } }

// 現在のプラン。有効なライセンスがなければ無料プラン
export function currentPlan() {
  const l = licenseInfo();
  if (!l || !PLANS[l.plan] || l.plan === 'free') return 'free';
  return l.expires * 1000 > Date.now() ? l.plan : 'free';
}

async function post(path, body) {
  const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
  let data = {};
  try { data = await res.json(); } catch { /* noop */ }
  if (!res.ok) { const e = new Error((data.error && data.error.message) || `HTTP ${res.status}`); e.code = (data.error && data.error.code) || `http_${res.status}`; throw e; }
  return data;
}
// 決済直後：Checkout の結果からライセンスを受け取る
export async function activateFromSession(sessionId) { return saveLicense(await post('/api/license', { session_id: sessionId })); }
// 別の端末で使う：ライセンスコードを入れて復元する
export async function activateFromCode(code) { return saveLicense(await post('/api/license', { token: String(code || '').trim() })); }
// 契約の最新の状態に更新する（force でなければ半日に1回まで。通信できないときは手元の情報のまま）
export async function refreshLicense(force = false) {
  const l = licenseInfo();
  if (!l) return null;
  if (!force && Date.now() - (l.checkedAt || 0) < REFRESH_MS) return l;
  try { return saveLicense(await post('/api/license', { token: l.token })); }
  catch (e) { if (e.code === 'bad_license') clearLicense(); return licenseInfo(); }
}
// Stripe の支払いページへ
export async function startCheckout(plan, interval, lang) {
  const { url } = await post('/api/checkout', { plan, interval, lang });
  location.assign(url);
}
// Stripe の顧客ポータル（支払い方法の変更・解約・領収書）へ
export async function openPortal(lang) {
  const l = licenseInfo();
  if (!l) throw Object.assign(new Error('no license'), { code: 'no_license' });
  const { url } = await post('/api/portal', { token: l.token, lang });
  location.assign(url);
}
const atLeast = (plan) => PLANS[currentPlan()].rank >= PLANS[plan].rank;

// 機能ごとに必要なプラン
export const REQUIRES = {
  'theme:premium': 'plus',   // プレミアム書体（筆・ドット…）
  'credit:hide': 'plus',     // 配信画面の「KANPE」表示を消す
  'accent:custom': 'plus',   // アクセントカラーの変更
  'bg:image': 'plus',        // 背景画像のアップロード
  'bg:camera': 'plus',       // 背景にカメラの映像を映す
  'layout:vj': 'plus',       // ドットアートの VJ モード
  'speaker:labels': 'plus',  // 話者のラベルと色分け（手動切り替え・声の高さで自動）
  'speaker:diarize': 'pro',  // クラウド認識による話者の自動聞き分け
  'engine:cloud': 'pro',     // 高精度クラウド認識
  'ai:ideas': 'pro',         // AI の要点・アイデア抽出
};

export function canUse(feature) {
  const need = REQUIRES[feature];
  if (!need) return true;
  if ((feature === 'engine:cloud' || feature === 'speaker:diarize') && !PRO.available) return false;
  return atLeast(need);
}

// ---- プレミアム機能のお試し（無料プランは最初に使ってから1日＝24時間、1回だけ）----
// 記録はこの端末のブラウザにだけ残る。コンソールと別窓で共通にするため毎回ストレージから読む。
const TRIAL_KEY = 'kanpe.trial.v2';
function readTrial() {
  try {
    const t = JSON.parse(localStorage.getItem(TRIAL_KEY) || 'null');
    if (t && typeof t.startedAt === 'number') return t;
  } catch { /* noop */ }
  return { startedAt: 0 };
}
export function trialStarted() { return readTrial().startedAt > 0; }
export function trialRemainingMs() {
  const { startedAt } = readTrial();
  if (!startedAt) return PRO.trialMs;            // まだ始まっていない
  return Math.max(0, startedAt + PRO.trialMs - Date.now());
}
// プレミアム機能を使っている間に呼ぶ。初回だけお試し期間を開始する（引数は互換のため残す）
export function addTrialUsage() {
  if (trialStarted()) return;
  try { localStorage.setItem(TRIAL_KEY, JSON.stringify({ startedAt: Date.now() })); } catch { /* noop */ }
}

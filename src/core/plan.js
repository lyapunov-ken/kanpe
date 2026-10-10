// フリーミアムの設定。決済・ライセンス確認はサーバー側（今後）で行い、ここはその結果を受け取る窓口。
// プランは3つ：無料プラン → お手軽プラン（見た目）→ おトクプラン（見た目＋精度と賢さ）。
export const PLANS = {
  free: { label: '無料プラン',   short: '無料',   price: '¥0',      rank: 0 },
  plus: { label: 'お手軽プラン', short: 'お手軽', price: '¥100/月', rank: 1 },
  pro:  { label: 'おトクプラン', short: 'おトク', price: '¥1,980/月', rank: 2 },
};

export const PRO = {
  // 想定：2時間の配信を週3回（月約26時間）。話している区間は6〜7割なので月17時間前後。
  includedHours: 20,         // おトクプランの高精度クラウド認識（月・話している区間のみ）。上の想定がまるごと収まる
  extraPrice: '¥150 / 1時間',
  checkoutUrl: '',           // Stripe Payment Link 等を設定すると「アップグレード」から決済へ進む
  available: false,          // 有料プラン公開時に true
  trialMs: 24 * 60 * 60 * 1000, // 無料プランでプレミアム機能を試せる期間（最初に使ってから1日・1回だけ）
};

// 現在のプラン。ライセンス確認ができるまでは常に free。
export function currentPlan() {
  return 'free';
}
const atLeast = (plan) => PLANS[currentPlan()].rank >= PLANS[plan].rank;

// 機能ごとに必要なプラン
export const REQUIRES = {
  'theme:premium': 'plus',   // プレミアム書体（筆・ドット…）
  'credit:hide': 'plus',     // 配信画面の「KANPE」表示を消す
  'accent:custom': 'plus',   // アクセントカラーの変更
  'bg:image': 'plus',        // 背景画像のアップロード
  'engine:cloud': 'pro',     // 高精度クラウド認識
  'ai:ideas': 'pro',         // AI の要点・アイデア抽出
};

export function canUse(feature) {
  const need = REQUIRES[feature];
  if (!need) return true;
  if (feature === 'engine:cloud' && !PRO.available) return false;
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

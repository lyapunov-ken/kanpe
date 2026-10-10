// フリーミアムの設定。決済・ライセンス確認はサーバー側（今後）で行い、ここはその結果を受け取る窓口。
// プランは Free → Plus（見た目）→ Pro（精度と賢さ）→ Business（チーム）の順に上位。
export const PLANS = {
  free:     { label: 'Free',     price: '¥0',          rank: 0 },
  plus:     { label: 'Plus',     price: '¥100/月',     rank: 1 },
  pro:      { label: 'Pro',      price: '¥980/月',     rank: 2 },
  business: { label: 'Business', price: '¥4,980/月〜', rank: 3 },
};

export const PRO = {
  includedHours: 5,          // Pro の高精度クラウド認識（月・話している区間のみ）
  extraPrice: '¥200 / 1時間',
  checkoutUrl: '',           // Stripe Payment Link 等を設定すると「アップグレード」から決済へ進む
  available: false,          // 有料プラン公開時に true
  trialMs: 24 * 60 * 60 * 1000, // Free で Plus 機能を試せる期間（最初に使ってから1日・1回だけ）
};

// 現在のプラン。ライセンス確認ができるまでは常に free。
export function currentPlan() {
  return 'free';
}
const atLeast = (plan) => PLANS[currentPlan()].rank >= PLANS[plan].rank;

// 機能ごとに必要なプラン
export const REQUIRES = {
  'theme:premium': 'plus',   // Plus 書体（筆・ドット…）
  'credit:hide': 'plus',     // 配信画面の「KANPE」表示を消す
  'accent:custom': 'plus',   // アクセントカラーの変更
  'engine:cloud': 'pro',     // 高精度クラウド認識
  'ai:ideas': 'pro',         // AI の要点・アイデア抽出
};

export function canUse(feature) {
  const need = REQUIRES[feature];
  if (!need) return true;
  if (feature === 'engine:cloud' && !PRO.available) return false;
  return atLeast(need);
}

// ---- Plus 機能のお試し（Free は最初に使ってから1日＝24時間、1回だけ）----
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
// Plus 機能を使っている間に呼ぶ。初回だけお試し期間を開始する（引数は互換のため残す）
export function addTrialUsage() {
  if (trialStarted()) return;
  try { localStorage.setItem(TRIAL_KEY, JSON.stringify({ startedAt: Date.now() })); } catch { /* noop */ }
}

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
  trialMs: 5 * 60 * 1000,    // Free で Plus 書体を試せる時間（1日あたり）
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
  'engine:cloud': 'pro',     // 高精度クラウド認識
  'ai:ideas': 'pro',         // AI の要点・アイデア抽出
};

export function canUse(feature) {
  const need = REQUIRES[feature];
  if (!need) return true;
  if (feature === 'engine:cloud' && !PRO.available) return false;
  return atLeast(need);
}

// ---- Plus 書体のお試し（Free は1日5分）。記録はこの端末のブラウザにだけ残る ----
const TRIAL_KEY = 'kanpe.trial.v1';
const today = () => new Date().toLocaleDateString('sv-SE'); // YYYY-MM-DD（端末の日付）
function readTrial() {
  try {
    const t = JSON.parse(localStorage.getItem(TRIAL_KEY) || 'null');
    if (t && t.date === today()) return t;
  } catch { /* noop */ }
  return { date: today(), usedMs: 0 };
}
let trialMem = readTrial();
export function trialRemainingMs() {
  if (trialMem.date !== today()) trialMem = { date: today(), usedMs: 0 };
  return Math.max(0, PRO.trialMs - trialMem.usedMs);
}
export function addTrialUsage(ms) {
  if (trialMem.date !== today()) trialMem = { date: today(), usedMs: 0 };
  trialMem.usedMs = Math.min(PRO.trialMs, trialMem.usedMs + ms);
  try { localStorage.setItem(TRIAL_KEY, JSON.stringify(trialMem)); } catch { /* noop */ }
}

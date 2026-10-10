// フリーミアムの設定。Pro の決済・ライセンス確認はサーバー側（今後）で行い、ここはその結果を受け取る窓口。
export const PRO = {
  price: '¥100/月',
  includedMinutes: 60,      // 高精度クラウド認識の月間時間（話している区間のみ計上）
  extraPrice: '¥100 / 60分',
  checkoutUrl: '',          // Stripe Payment Link 等を設定すると「Pro にする」から決済へ進む
  available: false,         // Pro 公開時に true
  trialMs: 5 * 60 * 1000,   // 無料版で Pro 書体を試せる時間（1日あたり）
};

// 現在のプラン。ライセンス確認ができるまでは常に free。
export function currentPlan() {
  return 'free';
}

export function canUse(feature) {
  const pro = currentPlan() === 'pro';
  switch (feature) {
    case 'engine:browser': return true;
    case 'engine:cloud': return pro && PRO.available;
    case 'theme:pro': return pro;
    default: return true;
  }
}

// ---- Pro 書体のお試し（無料版は1日5分）。記録はこの端末のブラウザにだけ残る ----
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

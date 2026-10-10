// フリーミアムの設定。Pro の決済・ライセンス確認はサーバー側（今後）で行い、ここはその結果を受け取る窓口。
export const PRO = {
  price: '¥100/月',
  includedMinutes: 60,      // 高精度クラウド認識の月間時間（話している区間のみ計上）
  extraPrice: '¥100 / 60分',
  checkoutUrl: '',          // Stripe Payment Link 等を設定すると「Pro にする」から決済へ進む
  available: false,         // Pro 公開時に true
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
    default: return true;
  }
}

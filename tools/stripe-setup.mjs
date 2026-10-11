// KANPE の商品・価格・顧客ポータル設定を Stripe に用意する（何度実行しても重複しない）。
//   STRIPE_SECRET_KEY=sk_test_... node tools/stripe-setup.mjs            … おトクプランの価格も作る（申し込みは PRO_ENABLED まで受け付けない）
//   STRIPE_SECRET_KEY=sk_test_... node tools/stripe-setup.mjs --plus-only
// 作るもの（すべて metadata.project = "kanpe"。同じ Stripe アカウントの他プロジェクトと区別できる）
//   商品  KANPE お手軽プラン / KANPE おトクプラン（明細書の表記は KANPE）
//   価格  kanpe_plus_monthly ¥480 / kanpe_plus_yearly ¥4,800 / kanpe_pro_monthly ¥2,980 / kanpe_pro_yearly ¥29,800（税込）
//   顧客ポータルの設定（解約は期間の終わりに、支払い方法の変更、領収書、お手軽プランの月払い⇄年払い）
const KEY = process.env.STRIPE_SECRET_KEY;
const SITE = (process.env.SITE_URL || 'https://kanpe.yoneken.xyz').replace(/\/+$/, '');
const PLUS_ONLY = process.argv.includes('--plus-only');
// 税コード：txcd_10103000 = Software as a Service (SaaS) - Personal Use。業務利用が中心なら txcd_10103001（Business Use）に。
// 分類の最終判断はご自身（または税理士）で。KANPE_TAX_CODE で上書きできる。
const TAX_CODE = process.env.KANPE_TAX_CODE || 'txcd_10103000';
if (!KEY) { console.error('STRIPE_SECRET_KEY を設定してください'); process.exit(1); }
const LIVE = KEY.includes('_live_');

function encode(params, prefix = '', out = []) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (item !== null && typeof item === 'object') ? encode(item, `${key}[${i}]`, out) : out.push(`${encodeURIComponent(`${key}[]`)}=${encodeURIComponent(item)}`));
    else if (typeof v === 'object') encode(v, key, out);
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
  }
  return out;
}
async function api(method, path, params = {}) {
  const body = encode(params).join('&');
  const res = await fetch(`https://api.stripe.com/v1/${path}${method === 'GET' && body ? `?${body}` : ''}`, {
    method, headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2025-09-30.clover' },
    body: method === 'GET' ? undefined : body,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${data.error && data.error.message}`);
  return data;
}

const PLANS = [
  { plan: 'plus', name: 'KANPE お手軽プラン', description: 'VJ モード、話者の色分け、プレミアム書体、アクセントカラー、背景画像。KANPE 表示を消す。',
    prices: [{ interval: 'month', amount: 480, key: 'kanpe_plus_monthly' }, { interval: 'year', amount: 4800, key: 'kanpe_plus_yearly' }] },
  { plan: 'pro', name: 'KANPE おトクプラン', description: 'お手軽プランのすべて＋高精度クラウド認識 月20時間、話者の自動聞き分け、AI の要点抽出、配信後サマリー。',
    prices: [{ interval: 'month', amount: 2980, key: 'kanpe_pro_monthly' }, { interval: 'year', amount: 29800, key: 'kanpe_pro_yearly' }] },
];

async function ensureProduct(p) {
  const list = await api('GET', 'products', { limit: 100, active: 'true' });
  let prod = list.data.find((x) => x.metadata && x.metadata.project === 'kanpe' && x.metadata.plan === p.plan);
  if (!prod) {
    prod = await api('POST', 'products', { name: p.name, description: p.description, statement_descriptor: 'KANPE',
      tax_code: TAX_CODE, metadata: { project: 'kanpe', plan: p.plan } });
    console.log(`  + 商品を作成  ${prod.id}  ${p.name}`);
  } else {
    if (prod.tax_code !== TAX_CODE) prod = await api('POST', `products/${prod.id}`, { tax_code: TAX_CODE });
    console.log(`  = 商品あり    ${prod.id}  ${prod.name}`);
  }
  return prod;
}
async function ensurePrice(prod, p, pr) {
  const found = await api('GET', 'prices', { lookup_keys: [pr.key], limit: 1 });
  const cur = found.data[0];
  if (cur && cur.active && cur.unit_amount === pr.amount && cur.currency === 'jpy' && cur.product === prod.id) {
    console.log(`  = 価格あり    ${cur.id}  ${pr.key}  ¥${pr.amount.toLocaleString()}`);
    return cur;
  }
  const price = await api('POST', 'prices', {
    product: prod.id, currency: 'jpy', unit_amount: pr.amount, tax_behavior: 'inclusive',
    recurring: { interval: pr.interval }, lookup_key: pr.key, transfer_lookup_key: 'true',
    nickname: `${p.name}（${pr.interval === 'year' ? '年払い' : '月払い'}）`,
    metadata: { project: 'kanpe', plan: p.plan, interval: pr.interval },
  });
  console.log(`  + 価格を作成  ${price.id}  ${pr.key}  ¥${pr.amount.toLocaleString()}${cur ? '（古い価格から lookup_key を移しました）' : ''}`);
  return price;
}

async function ensurePortal(plusProduct, plusPrices) {
  const list = await api('GET', 'billing_portal/configurations', { limit: 100 });
  const params = {
    business_profile: { headline: 'KANPE のご契約の管理' },
    default_return_url: `${SITE}/app?portal=return`,
    features: {
      customer_update: { enabled: 'true', allowed_updates: ['email', 'name', 'address'] },
      invoice_history: { enabled: 'true' },
      payment_method_update: { enabled: 'true' },
      subscription_cancel: { enabled: 'true', mode: 'at_period_end' },
      subscription_update: { enabled: 'true', default_allowed_updates: ['price'], proration_behavior: 'create_prorations',
        products: [{ product: plusProduct.id, prices: plusPrices.map((x) => x.id) }] },
    },
    metadata: { project: 'kanpe' },
  };
  const cur = list.data.find((c) => c.metadata && c.metadata.project === 'kanpe' && c.active);
  const conf = cur ? await api('POST', `billing_portal/configurations/${cur.id}`, params) : await api('POST', 'billing_portal/configurations', params);
  console.log(`  ${cur ? '=' : '+'} 顧客ポータル ${conf.id}`);
  return conf;
}

console.log(`Stripe（${LIVE ? '本番' : 'テスト'}モード）に KANPE の商品を用意します`);
const out = {};
for (const p of PLANS) {
  if (PLUS_ONLY && p.plan !== 'plus') continue;
  const prod = await ensureProduct(p);
  out[p.plan] = { product: prod, prices: [] };
  for (const pr of p.prices) out[p.plan].prices.push(await ensurePrice(prod, p, pr));
}
const portal = await ensurePortal(out.plus.product, out.plus.prices);
console.log('\nCloudflare Pages の環境変数に設定してください：');
console.log(`  STRIPE_SECRET_KEY     = （このキー。KANPE 用の制限付きキーを推奨）`);
console.log(`  LICENSE_SECRET        = （32文字以上のランダムな文字列。例：openssl rand -base64 48）`);
console.log(`  STRIPE_PORTAL_CONFIG  = ${portal.id}`);
console.log('  PRO_ENABLED           = （おトクプランの機能が揃ったら 1）');
console.log('\nダッシュボードで確認してください：');
console.log('  Billing → 収益回収：Smart Retries・支払い失敗メール・カード情報の自動更新をオン（すべて設定のみ）');
console.log('  設定 → 税金：本社住所を登録し、しきい値のモニタリングを有効に（課税事業者なら日本の登録を追加）');
console.log('  設定 → 公開情報：明細書の表記（カナ・漢字）を KANPE に');

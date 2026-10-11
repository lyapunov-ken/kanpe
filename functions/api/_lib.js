// KANPE の決済 API（Cloudflare Pages Functions）で共通に使う部品。
// - データベースは持たない。契約の状態は毎回 Stripe に問い合わせ、端末にはライセンス（署名つきの札）だけを渡す
// - Stripe の同じアカウントに他のプロジェクトがあっても混ざらないよう、KANPE の商品・価格・契約には
//   必ず metadata.project = "kanpe" を付け、価格は lookup_key（kanpe_ で始まる）で探す
//
// 必要な環境変数（Cloudflare Pages → 設定 → 環境変数。どちらも「暗号化」にする）
//   STRIPE_SECRET_KEY   … sk_test_… / sk_live_…（KANPE 用の制限付きキー rk_… でもよい）
//   LICENSE_SECRET      … ライセンスに署名する長いランダム文字列（32文字以上）
// 任意
//   SITE_URL            … 例 https://kanpe.yoneken.xyz（未設定ならリクエスト元から決める）
//   STRIPE_PORTAL_CONFIG … 顧客ポータルの設定 ID（bpc_…）。未設定なら Stripe の既定の設定
//   PRO_ENABLED         … "1" でおトクプランの申し込みを受け付ける（機能が揃うまでは未設定のまま）

export const PROJECT = 'kanpe';
export const PRICES = {
  plus: { month: 'kanpe_plus_monthly', year: 'kanpe_plus_yearly' },
  pro: { month: 'kanpe_pro_monthly', year: 'kanpe_pro_yearly' },
};
const RANK = { free: 0, plus: 1, pro: 2 };
const ACTIVE = new Set(['active', 'trialing', 'past_due']); // past_due は支払い再試行中。猶予として使える
const GRACE = 3 * 24 * 3600; // 更新日から3日は猶予

// ---------------------------------------------------------------- 応答
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}
export const fail = (status, code, message) => json({ error: { code, message } }, status);

export function siteUrl(env, request) {
  const fromEnv = (env.SITE_URL || '').replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  const u = new URL(request.url);
  return `${u.protocol}//${u.host}`;
}

// 別のサイトから API を叩かれないよう、ブラウザからの呼び出しは同じオリジンだけ受け付ける
export function sameOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return true; // サーバー間・curl など（ライセンスがなければ何もできない）
  return origin === siteUrl(env, request) || origin === new URL(request.url).origin;
}

export async function readJson(request) {
  try {
    const t = await request.text();
    if (t.length > 8192) return null;
    return t ? JSON.parse(t) : {};
  } catch { return null; }
}

export function configured(env) {
  return !!(env.STRIPE_SECRET_KEY && env.LICENSE_SECRET && env.LICENSE_SECRET.length >= 32);
}

// ---------------------------------------------------------------- Stripe（SDK を使わず REST を直接呼ぶ）
function encode(params, prefix = '', out = []) {
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        if (item !== null && typeof item === 'object') encode(item, `${key}[${i}]`, out);
        else out.push(`${encodeURIComponent(`${key}[]`)}=${encodeURIComponent(item)}`);
      });
    } else if (typeof v === 'object') {
      encode(v, key, out);
    } else {
      out.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`);
    }
  }
  return out;
}

export async function stripe(env, method, path, params = {}) {
  const body = encode(params).join('&');
  const url = `https://api.stripe.com/v1/${path}` + (method === 'GET' && body ? `?${body}` : '');
  const res = await fetch(url, {
    method,
    headers: {
      authorization: `Bearer ${env.STRIPE_SECRET_KEY}`,
      'content-type': 'application/x-www-form-urlencoded',
      'stripe-version': '2025-09-30.clover',
    },
    body: method === 'GET' ? undefined : body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const e = new Error((data.error && data.error.message) || `Stripe ${res.status}`);
    e.status = res.status;
    e.stripe = data.error;
    throw e;
  }
  return data;
}

// lookup_key から有効な価格を探す（KANPE の価格であることも確かめる）
export async function findPrice(env, lookupKey) {
  const list = await stripe(env, 'GET', 'prices', { lookup_keys: [lookupKey], active: 'true', limit: 1 });
  const price = list.data && list.data[0];
  if (!price) return null;
  if (price.metadata && price.metadata.project && price.metadata.project !== PROJECT) return null;
  return price;
}

const planOfPrice = (price) => {
  const key = (price && price.lookup_key) || '';
  if (key.startsWith('kanpe_pro_')) return 'pro';
  if (key.startsWith('kanpe_plus_')) return 'plus';
  return (price && price.metadata && price.metadata.plan) || null;
};
const periodEnd = (sub) => sub.current_period_end || (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].current_period_end) || 0;

// 顧客の KANPE の契約を調べ、いちばん上のプランを返す（他プロジェクトの契約は無視する）
export async function planForCustomer(env, customerId) {
  const subs = await stripe(env, 'GET', 'subscriptions', { customer: customerId, status: 'all', limit: 20 });
  let best = { plan: 'free', periodEnd: 0, status: 'none', subscription: null, interval: null, cancelAtPeriodEnd: false };
  for (const sub of subs.data || []) {
    const isKanpe = (sub.metadata && sub.metadata.project === PROJECT) ||
      (sub.items && sub.items.data || []).some((it) => planOfPrice(it.price));
    if (!isKanpe || !ACTIVE.has(sub.status)) continue;
    const item = (sub.items && sub.items.data || []).find((it) => planOfPrice(it.price));
    const plan = item ? planOfPrice(item.price) : (sub.metadata && sub.metadata.plan) || 'plus';
    if (RANK[plan] > RANK[best.plan] || (RANK[plan] === RANK[best.plan] && periodEnd(sub) > best.periodEnd)) {
      best = { plan, periodEnd: periodEnd(sub), status: sub.status, subscription: sub.id,
        interval: item && item.price && item.price.recurring ? item.price.recurring.interval : null,
        cancelAtPeriodEnd: !!sub.cancel_at_period_end };
    }
  }
  return best;
}

// ---------------------------------------------------------------- ライセンス（HMAC-SHA256 で署名した札）
const b64u = {
  enc: (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0)),
};
async function hmacKey(env) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.LICENSE_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function signLicense(env, { customer, plan, periodEnd }) {
  const payload = { v: 1, c: customer, p: plan, e: periodEnd ? periodEnd + GRACE : 0, i: Math.floor(Date.now() / 1000) };
  const body = b64u.enc(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await hmacKey(env), new TextEncoder().encode(body));
  return { token: `kanpe1.${body}.${b64u.enc(sig)}`, payload };
}
// 署名だけを確かめる（期限切れでも顧客 ID は取り出せる。最新の状態は Stripe に聞き直す）
export async function verifyLicense(env, token) {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const m = /^kanpe1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(token.trim());
  if (!m) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(env), b64u.dec(m[2]), new TextEncoder().encode(m[1]));
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(b64u.dec(m[1])));
    if (payload.v !== 1 || !/^cus_[A-Za-z0-9]+$/.test(payload.c || '')) return null;
    return payload;
  } catch { return null; }
}

export async function licenseResponse(env, customer, extra = {}) {
  const info = await planForCustomer(env, customer);
  const { token, payload } = await signLicense(env, { customer, plan: info.plan, periodEnd: info.periodEnd });
  return json({ token, plan: info.plan, expires: payload.e, status: info.status, interval: info.interval,
    cancelAtPeriodEnd: info.cancelAtPeriodEnd, ...extra });
}

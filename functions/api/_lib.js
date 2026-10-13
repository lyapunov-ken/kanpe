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
// ライセンスコードをメールで送る（未設定ならメールは送らず、画面に表示するだけ）
//   STRIPE_WEBHOOK_SECRET … Stripe の Webhook の署名シークレット（whsec_…）。/api/stripe-webhook で使う
//   RESEND_API_KEY        … メール配信サービス Resend の API キー（re_…）
//   MAIL_FROM             … 差出人。例 KANPE <noreply@yoneken.xyz>（Resend で認証したドメインのアドレス）
//   MAIL_REPLY_TO         … 返信先（任意）。例 問い合わせ用のアドレス

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
    cancelAtPeriodEnd: info.cancelAtPeriodEnd, mail: mailConfigured(env), ...extra });
}

// ---------------------------------------------------------------- Stripe の Webhook の署名
// Stripe-Signature: t=時刻,v1=署名（HMAC-SHA256(シークレット, "時刻.本文") の16進）。古すぎる通知（既定5分）は受け付けない
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export async function verifyStripeSignature(secret, header, payload, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret || typeof header !== 'string') return false;
  let t = 0;
  const sigs = [];
  for (const part of header.split(',')) {
    const [k, v] = part.split('=');
    if (k === 't') t = Number(v);
    else if (k === 'v1' && v) sigs.push(v.trim());
  }
  if (!t || !sigs.length || Math.abs(nowSec - t) > toleranceSec) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)));
  return sigs.some((s) => safeEqual(s, expected));
}

// ---------------------------------------------------------------- メール（Resend）
export function mailConfigured(env) { return !!(env.RESEND_API_KEY && env.MAIL_FROM); }
export const isEmail = (s) => typeof s === 'string' && s.length <= 254 && /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/.test(s);

export async function sendMail(env, { to, subject, text, html, idempotencyKey }) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json',
      ...(idempotencyKey ? { 'idempotency-key': idempotencyKey.slice(0, 256) } : {}) },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [to], subject, text, html, ...(env.MAIL_REPLY_TO ? { reply_to: env.MAIL_REPLY_TO } : {}) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(data.message || `Resend ${res.status}`); e.status = res.status; throw e; }
  return data;
}

const PLAN_NAME = { ja: { plus: 'お手軽プラン', pro: 'おトクプラン' }, en: { plus: 'Plus', pro: 'Pro' } };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// ライセンスコードのお知らせメール（日本語 / 英語）。テキスト版と HTML 版を同じ文面から作る
export function licenseMail({ lang, plan, token, site }) {
  const en = lang === 'en';
  const name = (en ? PLAN_NAME.en : PLAN_NAME.ja)[plan] || (en ? 'KANPE' : 'KANPE の有料プラン');
  const app = `${site}${en ? '/en' : ''}/app`;
  const T = en ? {
    subject: `Your KANPE license code (${name})`,
    thanks: `Thank you for subscribing to KANPE ${name}.`,
    codeLabel: 'Your license code',
    keep: 'Keep this email. Use the code to restore your plan on another device or after clearing your browser’s data.',
    howTitle: 'How to restore',
    steps: ['Open the KANPE console', 'Press the “Free / Upgrade” button at the top right', 'Open “Restore with a license code” and paste the code'],
    billTitle: 'Billing, cancellation and receipts',
    bill: 'Press the plan button at the top right of the console → “Billing, cancel, receipts”.',
    ignore: 'If you didn’t expect this email, you can safely ignore it.',
  } : {
    subject: `【KANPE】ライセンスコードのお知らせ（${name}）`,
    thanks: `KANPE ${name}へのお申し込み、ありがとうございます。`,
    codeLabel: 'ライセンスコード',
    keep: 'このコードは、別の端末で使うときや、ブラウザのデータを消したときに、プランを復元するためのものです。このメールは大切に保管してください。',
    howTitle: '復元のしかた',
    steps: ['KANPE のコンソールを開く', '右上の「無料プラン／アップグレード」を押す', '「ライセンスコードで復元」を開き、上のコードを貼り付ける'],
    billTitle: 'ご契約の確認・解約・領収書',
    bill: 'コンソール右上のプランのボタン →「支払い方法・解約・領収書」から行えます。',
    ignore: 'このメールに心当たりがない場合は、お手数ですが破棄してください。',
  };
  const sep = en ? ': ' : '：';
  const text = [
    T.thanks, '', `${T.codeLabel}${sep}`, token, '', T.keep, '',
    `■ ${T.howTitle}`, `1. ${T.steps[0]}${sep}${app}`, `2. ${T.steps[1]}`, `3. ${T.steps[2]}`, '',
    `■ ${T.billTitle}`, T.bill, '', T.ignore, '', `KANPE  ${site}`,
  ].join('\n');
  const p = (inner, style = '') => `<p style="margin:0 0 14px;${style}">${inner}</p>`;
  const html = `<!doctype html><html lang="${en ? 'en' : 'ja'}"><body style="margin:0;padding:24px;background:#f3f3f0;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Sans','Yu Gothic',sans-serif;color:#17181a;line-height:1.7;font-size:15px">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px 26px">
${p('KANPE', 'font-weight:800;letter-spacing:.14em;margin-bottom:18px')}
${p(esc(T.thanks))}
${p(`<b>${esc(T.codeLabel)}</b>`, 'margin-bottom:6px')}
${p(esc(token), 'padding:12px 14px;background:#f4f4f1;border:1px solid #e6e6e1;border-radius:10px;font-family:Menlo,Consolas,monospace;font-size:12.5px;word-break:break-all')}
${p(esc(T.keep))}
${p(`<b>${esc(T.howTitle)}</b><br>1. ${esc(T.steps[0])}${sep}<a href="${esc(app)}">${esc(app)}</a><br>2. ${esc(T.steps[1])}<br>3. ${esc(T.steps[2])}`)}
${p(`<b>${esc(T.billTitle)}</b><br>${esc(T.bill)}`)}
${p(`${esc(T.ignore)}<br><a href="${esc(site)}" style="color:#8a8d94">${esc(site)}</a>`, 'margin:18px 0 0;font-size:12.5px;color:#8a8d94')}
</div></body></html>`;
  return { subject: T.subject, text, html };
}

// ライセンスコードをメールで送り、送った時刻を Stripe の顧客に残す（再送の間隔を守るため）
export async function sendLicenseMail(env, { customer, email, lang, site, idempotencyKey, info }) {
  const plan = info || await planForCustomer(env, customer);
  const { token } = await signLicense(env, { customer, plan: plan.plan, periodEnd: plan.periodEnd });
  await sendMail(env, { to: email, ...licenseMail({ lang, plan: plan.plan, token, site }), idempotencyKey });
  try { await stripe(env, 'POST', `customers/${customer}`, { metadata: { kanpe_mail_at: String(Math.floor(Date.now() / 1000)) } }); }
  catch { /* 書き込めない制限付きキーでも、メールは送れているので続ける */ }
  return plan;
}

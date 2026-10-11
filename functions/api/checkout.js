// POST /api/checkout  { plan: "plus" | "pro", interval: "month" | "year", lang: "ja" | "en" }
// → Stripe Checkout（Stripe がホストする支払いページ）の URL を返す。カード情報は KANPE を通らない。
import { PRICES, PROJECT, configured, fail, findPrice, json, readJson, sameOrigin, siteUrl, stripe } from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request, env)) return fail(403, 'forbidden', 'Cross-site request blocked');
  if (!configured(env)) return fail(503, 'not_configured', 'Payments are not set up yet');
  const body = await readJson(request);
  if (!body) return fail(400, 'bad_request', 'Invalid JSON');
  const plan = body.plan === 'pro' ? 'pro' : body.plan === 'plus' ? 'plus' : null;
  const interval = body.interval === 'year' ? 'year' : 'month';
  const en = body.lang === 'en';
  if (!plan) return fail(400, 'bad_plan', 'Unknown plan');
  if (plan === 'pro' && env.PRO_ENABLED !== '1') return fail(409, 'plan_unavailable', 'This plan is not available yet');

  try {
    const price = await findPrice(env, PRICES[plan][interval]);
    if (!price) return fail(503, 'price_missing', 'Price is not set up yet');
    const site = siteUrl(env, request);
    const base = en ? `${site}/en` : site;
    const session = await stripe(env, 'POST', 'checkout/sessions', {
      mode: 'subscription',
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: `${base}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/?checkout=cancel#pricing`,
      locale: en ? 'en' : 'ja',
      allow_promotion_codes: 'true',
      billing_address_collection: 'auto',
      // 他のプロジェクトの売上と分けて集計できるよう、すべてに目印を付ける
      metadata: { project: PROJECT, plan, interval },
      subscription_data: { metadata: { project: PROJECT, plan, interval } },
      client_reference_id: `kanpe-${plan}-${interval}`,
    });
    return json({ url: session.url });
  } catch (e) {
    return fail(502, 'stripe_error', e.message);
  }
}

// POST /api/portal { token, lang } → Stripe の顧客ポータル（支払い方法の変更・解約・領収書）の URL を返す
import { DEV_CUSTOMER, configured, fail, json, readJson, sameOrigin, siteUrl, stripe, verifyLicense } from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request, env)) return fail(403, 'forbidden', 'Cross-site request blocked');
  if (!configured(env)) return fail(503, 'not_configured', 'Payments are not set up yet');
  const body = await readJson(request);
  if (!body) return fail(400, 'bad_request', 'Invalid JSON');
  const lic = await verifyLicense(env, body.token);
  if (!lic) return fail(401, 'bad_license', 'Invalid license');
  if (lic.c === DEV_CUSTOMER) return fail(400, 'dev_license', 'Developer licenses have no billing');
  try {
    const site = siteUrl(env, request);
    const session = await stripe(env, 'POST', 'billing_portal/sessions', {
      customer: lic.c,
      return_url: `${body.lang === 'en' ? `${site}/en` : site}/app?portal=return`,
      locale: body.lang === 'en' ? 'en' : 'ja',
      configuration: env.STRIPE_PORTAL_CONFIG || undefined,
    });
    return json({ url: session.url });
  } catch (e) {
    return fail(502, 'stripe_error', e.message);
  }
}

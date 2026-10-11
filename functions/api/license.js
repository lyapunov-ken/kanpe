// POST /api/license
//   { session_id }  … 決済直後。Checkout の結果からライセンスを発行する
//   { token }       … ライセンスの更新・別の端末での復元。契約の最新の状態を Stripe に聞き直して出し直す
import { PROJECT, configured, fail, licenseResponse, readJson, sameOrigin, stripe, verifyLicense } from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request, env)) return fail(403, 'forbidden', 'Cross-site request blocked');
  if (!configured(env)) return fail(503, 'not_configured', 'Payments are not set up yet');
  const body = await readJson(request);
  if (!body) return fail(400, 'bad_request', 'Invalid JSON');

  try {
    if (typeof body.session_id === 'string') {
      if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(body.session_id)) return fail(400, 'bad_session', 'Invalid session');
      const s = await stripe(env, 'GET', `checkout/sessions/${body.session_id}`, {});
      if (!s.metadata || s.metadata.project !== PROJECT) return fail(404, 'not_found', 'Session not found');
      if (s.status !== 'complete' || !s.customer) return fail(409, 'incomplete', 'Checkout is not complete');
      return licenseResponse(env, s.customer, { email: (s.customer_details && s.customer_details.email) || '' });
    }
    if (typeof body.token === 'string') {
      const lic = await verifyLicense(env, body.token);
      if (!lic) return fail(401, 'bad_license', 'Invalid license');
      return licenseResponse(env, lic.c);
    }
    return fail(400, 'bad_request', 'session_id or token is required');
  } catch (e) {
    if (e.status === 404) return fail(404, 'not_found', 'Not found');
    return fail(502, 'stripe_error', e.message);
  }
}

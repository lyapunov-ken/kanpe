// POST /api/license
//   { session_id }  … 決済直後。Checkout の結果からライセンスを発行する
//   { token }       … ライセンスの更新・別の端末での復元。契約の最新の状態を Stripe に聞き直して出し直す
//                     開発者ライセンスは Stripe を通さず、いまのパスワードと照らし合わせて出し直す
import { DEV_CUSTOMER, PROJECT, configured, devLicenseResponse, devLicenseValid, fail, licenseResponse, readJson, sameOrigin, stripe, verifyLicense } from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request, env)) return fail(403, 'forbidden', 'Cross-site request blocked');
  const body = await readJson(request);
  if (body && typeof body.token === 'string' && env.LICENSE_SECRET) {
    const lic = await verifyLicense(env, body.token);
    if (lic && lic.c === DEV_CUSTOMER) {
      return (await devLicenseValid(env, lic)) ? devLicenseResponse(env) : fail(401, 'bad_license', 'Invalid license');
    }
  }
  if (!configured(env)) return fail(503, 'not_configured', 'Payments are not set up yet');
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

// POST /api/dev { password } → 開発者ライセンス（全機能）。ヘルプの一番下の「開発者」から使う。
// パスワードは Cloudflare Pages の環境変数 DEV_PASSWORD にだけ置く（リポジトリは公開なので、コードには書かない）。
import { devConfigured, devLicenseResponse, devPasswordOk, fail, readJson, sameOrigin } from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request, env)) return fail(403, 'forbidden', 'Cross-site request blocked');
  if (!devConfigured(env)) return fail(503, 'not_configured', 'Developer mode is not set up');
  const body = await readJson(request);
  if (!body || typeof body.password !== 'string') return fail(400, 'bad_request', 'password is required');
  if (!(await devPasswordOk(env, body.password))) {
    // 総当たりを遅くするため、間違えたときは少し待ってから返す
    const wait = Number.isFinite(+env.DEV_FAIL_DELAY_MS) ? +env.DEV_FAIL_DELAY_MS : 800;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    return fail(401, 'bad_password', 'Wrong password');
  }
  return devLicenseResponse(env);
}

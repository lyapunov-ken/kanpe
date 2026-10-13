// POST /api/license-email  { email, lang }  … ライセンスコードをなくした人向けに、メールで送り直す
//   入力されたアドレスで Stripe の顧客を探し、KANPE の有効な契約があれば、Stripe に登録されたアドレスへコードを送る。
//   契約があるかどうかは返さない（他人の契約の有無を調べられないように）。同じ顧客には10分に1通まで。
// GET  /api/license-email  … メールで送れる設定になっているか（画面の案内の出し分け用）
import { configured, fail, isEmail, json, mailConfigured, planForCustomer, readJson, sameOrigin, sendLicenseMail, siteUrl, stripe } from './_lib.js';

const GAP = 10 * 60; // 秒

export async function onRequestGet({ env }) {
  // 設定の確認用。値は返さず、入っているかどうかだけを返す
  return json({
    enabled: configured(env) && mailConfigured(env),
    payments: configured(env),
    stripeKey: !!env.STRIPE_SECRET_KEY,
    licenseSecret: !!(env.LICENSE_SECRET && env.LICENSE_SECRET.length >= 32),
    mail: mailConfigured(env),
    resendKey: !!env.RESEND_API_KEY,
    mailFrom: !!env.MAIL_FROM,
    webhook: !!env.STRIPE_WEBHOOK_SECRET,
  });
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request, env)) return fail(403, 'forbidden', 'Cross-site request blocked');
  if (!configured(env)) return fail(503, 'not_configured', 'Payments are not set up yet');
  if (!mailConfigured(env)) return fail(503, 'mail_not_configured', 'Email is not set up yet');
  const body = await readJson(request);
  if (!body) return fail(400, 'bad_request', 'Invalid JSON');
  const email = String(body.email || '').trim();
  if (!isEmail(email)) return fail(400, 'bad_email', 'Invalid email');
  const lang = body.lang === 'en' ? 'en' : 'ja';
  const now = Math.floor(Date.now() / 1000);

  try {
    // Stripe のメールアドレスの絞り込みは大文字・小文字を区別するので、入力どおりと小文字の両方で探す
    const found = new Map();
    for (const v of new Set([email, email.toLowerCase()])) {
      const list = await stripe(env, 'GET', 'customers', { email: v, limit: 10 });
      for (const c of list.data || []) found.set(c.id, c);
    }
    let checked = 0;
    for (const c of found.values()) {
      if (++checked > 5) break;
      const last = Number(c.metadata && c.metadata.kanpe_mail_at) || 0;
      if (now - last < GAP) continue;
      const info = await planForCustomer(env, c.id);
      if (info.plan === 'free') continue;
      await sendLicenseMail(env, { customer: c.id, email: c.email || email, lang, site: siteUrl(env, request), info,
        idempotencyKey: `kanpe-resend-${c.id}-${Math.floor(now / GAP)}` });
    }
  } catch (e) {
    return fail(502, 'mail_error', e.message);
  }
  return json({ ok: true }); // 見つかったかどうかは返さない
}

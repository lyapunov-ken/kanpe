// POST /api/stripe-webhook  … Stripe からの通知（checkout.session.completed）
// 申し込みが完了したら、お申し込みのメールアドレスにライセンスコードを送る。
// タブを閉じてしまってコンソールに戻れなかった人にもコードが届くようにするため。
// Stripe のダッシュボード → 開発者 → Webhook で、このURLとイベント checkout.session.completed を登録する（tools/stripe-setup.mjs でも作れる）。
import { PROJECT, fail, json, mailConfigured, sendLicenseMail, siteUrl, verifyStripeSignature } from './_lib.js';

export async function onRequestPost({ request, env }) {
  if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY || !env.LICENSE_SECRET) return fail(503, 'not_configured', 'Webhook is not set up');
  const payload = await request.text();
  if (payload.length > 512 * 1024) return fail(413, 'too_large', 'Payload too large');
  if (!(await verifyStripeSignature(env.STRIPE_WEBHOOK_SECRET, request.headers.get('stripe-signature'), payload))) {
    return fail(400, 'bad_signature', 'Invalid signature');
  }
  let event;
  try { event = JSON.parse(payload); } catch { return fail(400, 'bad_request', 'Invalid JSON'); }

  // ここから先は「受け取った」と返す（関係のない通知で Stripe に再送させない）
  if (event.type !== 'checkout.session.completed') return json({ received: true, ignored: event.type });
  const s = (event.data && event.data.object) || {};
  if (!s.metadata || s.metadata.project !== PROJECT) return json({ received: true, ignored: 'other_project' });
  if (s.mode !== 'subscription' || s.status !== 'complete' || !s.customer) return json({ received: true, ignored: 'incomplete' });
  const email = s.customer_details && s.customer_details.email;
  if (!email) return json({ received: true, ignored: 'no_email' });
  if (!mailConfigured(env)) return json({ received: true, skipped: 'mail_not_configured' });

  const lang = s.metadata.lang === 'en' || s.locale === 'en' ? 'en' : 'ja';
  try {
    // 同じ申し込みの通知が再送されても、同じキーなのでメールは二重に届かない（Resend が24時間まとめる）
    await sendLicenseMail(env, { customer: s.customer, email, lang, site: siteUrl(env, request), idempotencyKey: `kanpe-checkout-${s.id}` });
  } catch (e) {
    return fail(502, 'mail_error', e.message); // 失敗を返すと Stripe があとで送り直してくれる
  }
  return json({ received: true, mailed: true });
}

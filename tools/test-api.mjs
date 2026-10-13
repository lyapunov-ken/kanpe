// 決済 API（functions/api）のテスト。Stripe は手元の偽物で置き換えるので、通信もキーも不要。
//   node tools/test-api.mjs
import assert from 'node:assert/strict';
import { onRequestPost as checkout } from '../functions/api/checkout.js';
import { onRequestPost as license } from '../functions/api/license.js';
import { onRequestPost as portal } from '../functions/api/portal.js';
import { onRequestPost as webhook } from '../functions/api/stripe-webhook.js';
import { onRequestPost as licenseEmail, onRequestGet as licenseEmailGet } from '../functions/api/license-email.js';
import { signLicense, verifyLicense } from '../functions/api/_lib.js';
import { createHmac } from 'node:crypto';

const SITE = 'https://kanpe.example';
const env = { STRIPE_SECRET_KEY: 'sk_test_x', LICENSE_SECRET: 'x'.repeat(40), SITE_URL: SITE };
const now = Math.floor(Date.now() / 1000);

// ---- 偽の Stripe
const db = {
  prices: [
    { id: 'price_plus_m', lookup_key: 'kanpe_plus_monthly', active: true, metadata: { project: 'kanpe', plan: 'plus' }, recurring: { interval: 'month' } },
    { id: 'price_plus_y', lookup_key: 'kanpe_plus_yearly', active: true, metadata: { project: 'kanpe', plan: 'plus' }, recurring: { interval: 'year' } },
    { id: 'price_other', lookup_key: 'substack_monthly', active: true, metadata: { project: 'substack' }, recurring: { interval: 'month' } },
  ],
  sessions: {
    cs_test_ok: { id: 'cs_test_ok', status: 'complete', customer: 'cus_A', metadata: { project: 'kanpe' }, customer_details: { email: 'a@example.com' } },
    cs_test_open: { id: 'cs_test_open', status: 'open', customer: null, metadata: { project: 'kanpe' } },
    cs_test_other: { id: 'cs_test_other', status: 'complete', customer: 'cus_B', metadata: { project: 'substack' } },
  },
  subs: {
    cus_A: [{ id: 'sub_1', status: 'active', metadata: { project: 'kanpe' }, cancel_at_period_end: false,
      items: { data: [{ price: { lookup_key: 'kanpe_plus_monthly', recurring: { interval: 'month' } }, current_period_end: now + 20 * 86400 }] } },
      { id: 'sub_x', status: 'active', metadata: { project: 'substack' }, items: { data: [{ price: { lookup_key: 'substack_monthly' }, current_period_end: now + 99 * 86400 }] } }],
    cus_B: [{ id: 'sub_2', status: 'active', metadata: { project: 'substack' }, items: { data: [{ price: { lookup_key: 'substack_monthly' }, current_period_end: now + 9 * 86400 }] } }],
    cus_C: [{ id: 'sub_3', status: 'canceled', metadata: { project: 'kanpe' }, items: { data: [{ price: { lookup_key: 'kanpe_plus_monthly' }, current_period_end: now - 86400 }] } }],
  },
  created: [],
  customers: {
    cus_A: { id: 'cus_A', email: 'a@example.com', metadata: {} },
    cus_C: { id: 'cus_C', email: 'c@example.com', metadata: {} },
    cus_R: { id: 'cus_R', email: 'recent@example.com', metadata: { kanpe_mail_at: String(now) } },
  },
  mails: [],
  mailFail: false,
};
db.subs.cus_R = db.subs.cus_A;
globalThis.fetch = async (url, init = {}) => {
  const u = new URL(url);
  if (u.host === 'api.resend.com') { // 偽の Resend
    assert.equal(u.pathname, '/emails'); assert.equal(init.headers.authorization, 'Bearer re_test');
    if (db.mailFail) return new Response(JSON.stringify({ message: 'boom' }), { status: 500 });
    db.mails.push({ ...JSON.parse(init.body), key: init.headers['idempotency-key'] });
    return new Response(JSON.stringify({ id: 'email_1' }), { status: 200 });
  }
  assert.equal(u.host, 'api.stripe.com');
  assert.equal(init.headers.authorization, 'Bearer sk_test_x');
  const path = u.pathname.replace('/v1/', '');
  const q = init.method === 'GET' ? u.searchParams : new URLSearchParams(init.body || '');
  const ok = (data) => new Response(JSON.stringify(data), { status: 200 });
  if (path === 'prices' && init.method === 'GET') {
    const keys = q.getAll('lookup_keys[]');
    return ok({ data: db.prices.filter((p) => keys.includes(p.lookup_key) && p.active) });
  }
  if (path === 'checkout/sessions' && init.method === 'POST') {
    db.created.push(Object.fromEntries(q));
    return ok({ id: 'cs_test_new', url: 'https://checkout.stripe.com/c/pay/cs_test_new' });
  }
  if (path.startsWith('checkout/sessions/')) {
    const s = db.sessions[path.split('/')[2]];
    return s ? ok(s) : new Response(JSON.stringify({ error: { message: 'No such session' } }), { status: 404 });
  }
  if (path === 'subscriptions') return ok({ data: db.subs[q.get('customer')] || [] });
  if (path === 'customers' && init.method === 'GET') return ok({ data: Object.values(db.customers).filter((c) => c.email === q.get('email')) });
  if (path.startsWith('customers/') && init.method === 'POST') {
    const c = db.customers[path.split('/')[1]]; c.metadata.kanpe_mail_at = q.get('metadata[kanpe_mail_at]'); return ok(c);
  }
  if (path === 'billing_portal/sessions') { db.created.push(Object.fromEntries(q)); return ok({ url: 'https://billing.stripe.com/p/session/test_1' }); }
  return new Response(JSON.stringify({ error: { message: `unhandled ${path}` } }), { status: 400 });
};

const req = (path, body, origin = SITE) => new Request(`${SITE}${path}`, {
  method: 'POST', headers: { 'content-type': 'application/json', ...(origin ? { origin } : {}) }, body: JSON.stringify(body) });
const call = async (fn, path, body, opts = {}) => { const r = await fn({ request: req(path, body, opts.origin), env: opts.env || env }); return { status: r.status, data: await r.json() }; };

let n = 0;
const t = async (name, f) => { await f(); n++; console.log('PASS', name); };

await t('checkout: plus monthly → Stripe Checkout URL, tagged project=kanpe', async () => {
  const r = await call(checkout, '/api/checkout', { plan: 'plus', interval: 'month', lang: 'ja' });
  assert.equal(r.status, 200); assert.match(r.data.url, /^https:\/\/checkout\.stripe\.com\//);
  const c = db.created.at(-1);
  assert.equal(c.mode, 'subscription'); assert.equal(c['line_items[0][price]'], 'price_plus_m');
  assert.equal(c['metadata[project]'], 'kanpe'); assert.equal(c['subscription_data[metadata][project]'], 'kanpe');
  assert.equal(c.success_url, `${SITE}/app?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
  assert.equal(c.locale, 'ja');
  assert.equal(c['subscription_data[billing_mode][type]'], 'flexible');
});
await t('checkout: English yearly uses /en paths', async () => {
  const r = await call(checkout, '/api/checkout', { plan: 'plus', interval: 'year', lang: 'en' });
  assert.equal(r.status, 200);
  const c = db.created.at(-1);
  assert.equal(c['line_items[0][price]'], 'price_plus_y'); assert.ok(c.success_url.startsWith(`${SITE}/en/app`)); assert.equal(c.locale, 'en');
});
await t('checkout: pro is refused until PRO_ENABLED', async () => {
  const r = await call(checkout, '/api/checkout', { plan: 'pro', interval: 'month' });
  assert.equal(r.status, 409); assert.equal(r.data.error.code, 'plan_unavailable');
});
await t('checkout: missing price → 503 price_missing', async () => {
  const r = await call(checkout, '/api/checkout', { plan: 'pro', interval: 'month' }, { env: { ...env, PRO_ENABLED: '1' } });
  assert.equal(r.status, 503); assert.equal(r.data.error.code, 'price_missing');
});
await t('checkout: cross-site origin blocked', async () => {
  const r = await call(checkout, '/api/checkout', { plan: 'plus' }, { origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});
await t('checkout: not configured → 503', async () => {
  const r = await call(checkout, '/api/checkout', { plan: 'plus' }, { env: { SITE_URL: SITE } });
  assert.equal(r.status, 503); assert.equal(r.data.error.code, 'not_configured');
});
await t('checkout: bad plan / bad JSON', async () => {
  assert.equal((await call(checkout, '/api/checkout', { plan: 'gold' })).status, 400);
  const r = await checkout({ request: new Request(`${SITE}/api/checkout`, { method: 'POST', body: '{nope', headers: { origin: SITE } }), env });
  assert.equal(r.status, 400);
});

let token;
await t('license: completed session → plus license (ignores other projects’ subscriptions)', async () => {
  const r = await call(license, '/api/license', { session_id: 'cs_test_ok' });
  assert.equal(r.status, 200); assert.equal(r.data.plan, 'plus'); assert.equal(r.data.interval, 'month');
  assert.ok(r.data.expires > now + 20 * 86400); assert.equal(r.data.email, 'a@example.com');
  token = r.data.token; assert.match(token, /^kanpe1\./);
});
await t('license: incomplete session → 409', async () => {
  const r = await call(license, '/api/license', { session_id: 'cs_test_open' }); assert.equal(r.status, 409);
});
await t('license: other project’s session → 404', async () => {
  const r = await call(license, '/api/license', { session_id: 'cs_test_other' }); assert.equal(r.status, 404);
});
await t('license: malformed session id → 400', async () => {
  const r = await call(license, '/api/license', { session_id: 'abc' }); assert.equal(r.status, 400);
});
await t('license: refresh with token', async () => {
  const r = await call(license, '/api/license', { token }); assert.equal(r.status, 200); assert.equal(r.data.plan, 'plus');
});
await t('license: tampered token rejected', async () => {
  const parts = token.split('.');
  const forged = JSON.parse(Buffer.from(parts[1], 'base64url').toString()); forged.p = 'pro'; forged.c = 'cus_A';
  const bad = `kanpe1.${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${parts[2]}`;
  const r = await call(license, '/api/license', { token: bad }); assert.equal(r.status, 401);
});
await t('license: token signed with another secret rejected', async () => {
  const { token: other } = await signLicense({ LICENSE_SECRET: 'y'.repeat(40) }, { customer: 'cus_A', plan: 'pro', periodEnd: now + 999 });
  assert.equal(await verifyLicense(env, other), null);
});
await t('license: customer with only other-project subscription → free', async () => {
  const { token: tb } = await signLicense(env, { customer: 'cus_B', plan: 'plus', periodEnd: now });
  const r = await call(license, '/api/license', { token: tb }); assert.equal(r.data.plan, 'free');
});
await t('license: cancelled subscription → free', async () => {
  const { token: tc } = await signLicense(env, { customer: 'cus_C', plan: 'plus', periodEnd: now });
  const r = await call(license, '/api/license', { token: tc }); assert.equal(r.data.plan, 'free'); assert.equal(r.data.expires, 0);
});
await t('portal: valid license → portal URL with return_url', async () => {
  const r = await call(portal, '/api/portal', { token, lang: 'ja' });
  assert.equal(r.status, 200); assert.match(r.data.url, /billing\.stripe\.com/);
  const c = db.created.at(-1); assert.equal(c.customer, 'cus_A'); assert.equal(c.return_url, `${SITE}/app?portal=return`);
});
await t('portal: invalid license → 401', async () => {
  const r = await call(portal, '/api/portal', { token: 'kanpe1.abc.def' }); assert.equal(r.status, 401);
});

// ---------------------------------------------------------------- メール（Webhook と再送）
const menv = { ...env, STRIPE_WEBHOOK_SECRET: 'whsec_test', RESEND_API_KEY: 're_test', MAIL_FROM: 'KANPE <noreply@kanpe.example>' };
const event = (session, type = 'checkout.session.completed') => JSON.stringify({ id: 'evt_1', type, data: { object: session } });
const sign = (payload, t = Math.floor(Date.now() / 1000), secret = 'whsec_test') =>
  `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
const hook = async (payload, sig, e = menv) => {
  const r = await webhook({ request: new Request(`${SITE}/api/stripe-webhook`, { method: 'POST', headers: { 'stripe-signature': sig }, body: payload }), env: e });
  return { status: r.status, data: await r.json() };
};
const done = { id: 'cs_test_ok', mode: 'subscription', status: 'complete', customer: 'cus_A', locale: 'ja', metadata: { project: 'kanpe', plan: 'plus', lang: 'ja' }, customer_details: { email: 'a@example.com' } };

await t('checkout: session remembers the page language', async () => {
  await call(checkout, '/api/checkout', { plan: 'plus', interval: 'month', lang: 'en' });
  assert.equal(db.created.at(-1)['metadata[lang]'], 'en');
});
await t('license: response says whether email is set up', async () => {
  assert.equal((await call(license, '/api/license', { token })).data.mail, false);
  assert.equal((await call(license, '/api/license', { token }, { env: menv })).data.mail, true);
});
await t('webhook: not configured → 503', async () => {
  const pl = event(done); assert.equal((await hook(pl, sign(pl), env)).status, 503);
});
await t('webhook: bad or stale signature → 400, no mail', async () => {
  const pl = event(done);
  assert.equal((await hook(pl, sign(pl, undefined, 'whsec_other'))).status, 400);
  assert.equal((await hook(pl, sign(pl, Math.floor(Date.now() / 1000) - 3600))).status, 400);
  assert.equal((await hook(pl, 'garbage')).status, 400);
  assert.equal((await hook(pl.replace('a@example.com', 'evil@example.com'), sign(pl))).status, 400);
  assert.equal(db.mails.length, 0);
});
await t('webhook: completed checkout → license code mailed in Japanese, deduped by session', async () => {
  const pl = event(done);
  const r = await hook(pl, sign(pl));
  assert.equal(r.status, 200); assert.equal(r.data.mailed, true);
  const m = db.mails.at(-1);
  assert.deepEqual(m.to, ['a@example.com']); assert.equal(m.from, 'KANPE <noreply@kanpe.example>');
  assert.match(m.subject, /ライセンスコード/); assert.equal(m.key, 'kanpe-checkout-cs_test_ok');
  const code = m.text.match(/kanpe1\.[A-Za-z0-9_.-]+/)[0];
  const lic = await verifyLicense(menv, code); assert.equal(lic.c, 'cus_A'); assert.equal(lic.p, 'plus');
  assert.ok(m.html.includes(code)); assert.ok(m.text.includes(`${SITE}/app`));
  assert.ok(Number(db.customers.cus_A.metadata.kanpe_mail_at) > 0);
});
await t('webhook: English checkout → English mail with /en/app link', async () => {
  const pl = event({ ...done, id: 'cs_test_en', locale: 'en', metadata: { ...done.metadata, lang: 'en' } });
  await hook(pl, sign(pl));
  const m = db.mails.at(-1); assert.match(m.subject, /^Your KANPE license code \(Plus\)$/); assert.ok(m.text.includes(`${SITE}/en/app`));
});
await t('webhook: other projects, other events, incomplete sessions are acknowledged but not mailed', async () => {
  const before = db.mails.length;
  for (const pl of [event({ ...done, metadata: { project: 'substack' } }), event(done, 'invoice.paid'), event({ ...done, status: 'open' })]) {
    const r = await hook(pl, sign(pl)); assert.equal(r.status, 200); assert.equal(r.data.received, true);
  }
  assert.equal(db.mails.length, before);
});
await t('webhook: email not set up → acknowledged, skipped', async () => {
  const pl = event(done); const r = await hook(pl, sign(pl), { ...menv, RESEND_API_KEY: '' });
  assert.equal(r.status, 200); assert.equal(r.data.skipped, 'mail_not_configured');
});
await t('webhook: mail provider error → 502 so Stripe retries', async () => {
  db.mailFail = true; const pl = event(done); const r = await hook(pl, sign(pl)); db.mailFail = false;
  assert.equal(r.status, 502);
});
const resend = (body, opts = {}) => call(licenseEmail, '/api/license-email', body, { env: menv, ...opts });
await t('resend: GET tells the page whether email is available', async () => {
  assert.equal((await (await licenseEmailGet({ env: menv })).json()).enabled, true);
  assert.equal((await (await licenseEmailGet({ env })).json()).enabled, false);
});
await t('resend: paid customer (any letter case) gets the code at the Stripe address', async () => {
  db.customers.cus_A.metadata = {}; const before = db.mails.length;
  const r = await resend({ email: '  A@Example.com ', lang: 'ja' });
  assert.equal(r.status, 200); assert.deepEqual(r.data, { ok: true });
  assert.equal(db.mails.length, before + 1); assert.deepEqual(db.mails.at(-1).to, ['a@example.com']);
  assert.match(db.mails.at(-1).key, /^kanpe-resend-cus_A-\d+$/);
});
await t('resend: at most one mail per 10 minutes per customer', async () => {
  const before = db.mails.length;
  assert.equal((await resend({ email: 'a@example.com' })).status, 200);
  assert.equal((await resend({ email: 'recent@example.com' })).status, 200);
  assert.equal(db.mails.length, before);
});
await t('resend: unknown or cancelled customers get the same answer and no mail', async () => {
  const before = db.mails.length;
  for (const email of ['nobody@example.com', 'c@example.com']) assert.deepEqual((await resend({ email })).data, { ok: true });
  assert.equal(db.mails.length, before);
});
await t('resend: bad email 400, not set up 503, cross-site 403', async () => {
  assert.equal((await resend({ email: 'nope' })).status, 400);
  const r = await resend({ email: 'a@example.com' }, { env }); assert.equal(r.status, 503); assert.equal(r.data.error.code, 'mail_not_configured');
  assert.equal((await resend({ email: 'a@example.com' }, { origin: 'https://evil.example' })).status, 403);
});
console.log(`\n${n} tests passed`);

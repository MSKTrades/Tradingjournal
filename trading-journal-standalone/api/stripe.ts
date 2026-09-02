import type { VercelRequest, VercelResponse } from '@vercel/node';
import { db, withApi } from './_db.js';
import { requireUserId } from './_auth.js';
import { stripe, readRawBody } from './_stripe.js';

// Real billing, live behind three resources on this one file (?resource=
// checkout / portal / webhook) rather than three separate api/stripe/*.ts
// files - same "Vercel Hobby plan caps serverless functions at 12" reasoning
// as api/columns.ts's multi-resource comment (see api/trades/bulk.ts, merged
// for exactly this reason to free the slot this file now uses).
//
// The webhook resource needs Stripe's raw, unparsed request body to verify
// its signature (see _stripe.js's readRawBody for why a re-parsed/
// re-stringified body would fail that check), which means Vercel's default
// JSON body parsing has to be OFF for this whole file - `bodyParser` is a
// per-FILE setting, not per-route, so `checkout` and `portal` below also
// read and JSON.parse the raw body themselves instead of using req.body.
export const config = {
  api: { bodyParser: false },
};

// Same "prefer an explicit env var over trusting request headers" reasoning
// as getAppUrl in api/columns.ts (duplicated here rather than shared/
// imported, since these are two independent serverless function bundles -
// see that file's own copy for the OAuth redirect URI use case).
function getAppUrl(req: VercelRequest) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || 'https';
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  return `${proto}://${host}`;
}

// Duplicated from src/lib/promo.ts rather than imported - api/*.ts files are
// each bundled as their own independent serverless function, and nothing
// under api/ has ever imported from src/ (a frontend-only tree, pulled in by
// Vite, not Vercel's function bundler). If the launch promo's end date ever
// moves, update BOTH this constant and src/lib/promo.ts's PROMO_END_DATE -
// they drive two different things (this one delays the first real charge on
// a brand-new subscription; that one drives the Pricing page copy and the
// in-app reminder popups) but are meant to always describe the same date.
const PROMO_END_DATE = '2026-11-30';

async function readJsonBody(req: VercelRequest): Promise<any> {
  const raw = await readRawBody(req);
  if (raw.length === 0) return {};
  try {
    return JSON.parse(raw.toString('utf8'));
  } catch {
    return {};
  }
}

async function getOrCreateCustomer(sql: ReturnType<typeof db>, userId: number, email: string): Promise<string> {
  const rows = await sql.unsafe('SELECT stripe_customer_id FROM users WHERE id = $1', [userId]);
  const existing = rows[0]?.stripe_customer_id;
  if (existing) return existing;

  const customer = await stripe().customers.create({
    email,
    metadata: { pipecho_user_id: String(userId) },
  });
  await sql.unsafe('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customer.id, userId]);
  return customer.id;
}

// Creates a Stripe Checkout Session for the Pro plan (monthly or annual —
// see STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_PRO_ANNUAL in the deploy
// README) and returns its URL for the client to redirect to. This collects a
// real payment method now, but subscription_data.trial_end holds the actual
// first charge until the launch promo ends (PROMO_END_DATE above) - so
// someone who subscribes today keeps the exact "free through
// PROMO_END_LABEL" deal the Pricing page already promises, they just won't
// need to come back and re-enter card details once the promo winds down.
// If PROMO_END_DATE has already passed by the time this runs (the promo
// really has ended), trial_end is left off entirely and Stripe charges the
// card immediately instead — never a trial date in the past.
async function handleCheckout(req: VercelRequest, res: VercelResponse, sql: ReturnType<typeof db>, userId: number) {
  const userRows = await sql.unsafe('SELECT email FROM users WHERE id = $1', [userId]);
  const email = userRows[0]?.email;
  if (!email) { res.status(404).json({ error: 'Account not found' }); return; }

  const body = await readJsonBody(req);
  const interval = body.interval === 'annual' ? 'annual' : 'monthly';
  const priceId = interval === 'annual' ? process.env.STRIPE_PRICE_PRO_ANNUAL : process.env.STRIPE_PRICE_PRO_MONTHLY;
  if (!priceId) {
    res.status(500).json({ error: 'Billing is not fully configured yet — missing Stripe price id.' });
    return;
  }

  const customerId = await getOrCreateCustomer(sql, userId, email);
  const appUrl = getAppUrl(req);

  const trialEndUnix = Math.floor(new Date(`${PROMO_END_DATE}T23:59:59Z`).getTime() / 1000);
  const nowUnix = Math.floor(Date.now() / 1000);
  // Stripe requires trial_end to be far enough in the future to be usable —
  // comfortably true here since PROMO_END_DATE is months out, but guarding
  // it means this endpoint degrades gracefully (charge now instead of
  // erroring) rather than breaking checkout entirely once the promo date is
  // in the past and nobody's updated this constant yet.
  const trialEnd = trialEndUnix > nowUnix + 3600 ? trialEndUnix : undefined;

  const session = await stripe().checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    subscription_data: {
      metadata: { pipecho_user_id: String(userId) },
      ...(trialEnd ? { trial_end: trialEnd } : {}),
    },
    allow_promotion_codes: true,
    success_url: `${appUrl}/billing?checkout=success`,
    cancel_url: `${appUrl}/billing?checkout=cancelled`,
  });

  res.status(200).json({ url: session.url });
}

// Opens a Stripe Billing Portal session so an already-subscribed user can
// update their card, switch monthly/annual, or cancel — all on Stripe's own
// hosted page, no custom UI needed for any of that here.
async function handlePortal(req: VercelRequest, res: VercelResponse, sql: ReturnType<typeof db>, userId: number) {
  const rows = await sql.unsafe('SELECT stripe_customer_id FROM users WHERE id = $1', [userId]);
  const customerId = rows[0]?.stripe_customer_id;
  if (!customerId) {
    res.status(400).json({ error: 'No billing account yet — subscribe first.' });
    return;
  }

  const appUrl = getAppUrl(req);
  const session = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl}/billing`,
  });
  res.status(200).json({ url: session.url });
}

// Writes a Stripe subscription's current state onto the user row it belongs
// to (matched by stripe_customer_id, set once at checkout time). `plan` is
// the one column the rest of the app actually reads (see the schema.sql
// migration's comment) — trialing/active/past_due all count as Pro so a
// failed-card retry doesn't instantly lock someone out mid-dunning-cycle;
// everything else (canceled, unpaid, incomplete_expired, paused) is Free.
async function syncSubscriptionToUser(sql: ReturnType<typeof db>, subscription: any) {
  const status: string = subscription.status;
  const plan = ['trialing', 'active', 'past_due'].includes(status) ? 'pro' : 'free';
  // Stripe's "Basil" API version (2025-03-31.basil and later — this account
  // is on 2026-08-26.dahlia, well past that) REMOVED current_period_end
  // from the top-level Subscription object entirely and moved it onto each
  // subscription item instead (items.data[].current_period_end), since a
  // multi-item subscription can have items on different billing cycles.
  // Reading subscription.current_period_end directly (as this used to)
  // silently comes back undefined on any account created after that
  // version shipped — no error, just a permanently-null
  // plan_current_period_end and a Billing page stuck showing "first charge
  // on —." This checks the new item-level field first, the old top-level
  // one for safety on an older pinned API version, and finally trial_end
  // (which Basil did NOT remove) since for a trialing subscription that's
  // functionally the same date anyway.
  const periodEndUnix =
    subscription.items?.data?.[0]?.current_period_end
    ?? subscription.current_period_end
    ?? subscription.trial_end
    ?? null;
  const periodEnd = periodEndUnix
    ? new Date(periodEndUnix * 1000).toISOString()
    : null;
  await sql.unsafe(
    `UPDATE users SET plan = $1, stripe_subscription_id = $2, stripe_subscription_status = $3, plan_current_period_end = $4
     WHERE stripe_customer_id = $5`,
    [plan, subscription.id, status, periodEnd, subscription.customer]
  );
}

async function handleWebhook(req: VercelRequest, res: VercelResponse, sql: ReturnType<typeof db>) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const sig = req.headers['stripe-signature'];
  if (!secret || !sig || typeof sig !== 'string') {
    res.status(400).json({ error: 'Missing webhook signature or secret' });
    return;
  }

  const raw = await readRawBody(req);
  let event;
  try {
    event = stripe().webhooks.constructEvent(raw, sig, secret);
  } catch (err: any) {
    // A bad signature is a 400 (malformed/untrusted request), never a 500 —
    // Stripe retries 5xx responses on a backoff schedule, which would just
    // keep re-delivering the same never-going-to-verify event forever.
    console.error('Stripe webhook signature verification failed:', err.message);
    res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe().subscriptions.retrieve(session.subscription as string);
          await syncSubscriptionToUser(sql, subscription);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;
        await syncSubscriptionToUser(sql, subscription);
        break;
      }
      default:
        // Unhandled event types are acknowledged (200), not errored — Stripe
        // sends far more event types than this app needs to act on, and a
        // non-2xx response here would just cause pointless retries for
        // events we were never going to do anything with anyway.
        break;
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Stripe webhook handler error:', err);
    // A real failure while applying an event we DO care about should be a
    // 500 so Stripe retries it later, instead of silently losing the update.
    res.status(500).json({ error: 'Webhook handler failed' });
  }
}

export default withApi(async (req: VercelRequest, res: VercelResponse) => {
  const sql = db();
  const resource = req.query.resource;

  if (resource === 'webhook') {
    if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
    await handleWebhook(req, res, sql);
    return;
  }

  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }
  const userId = await requireUserId(req, res, sql);
  if (!userId) return;

  if (resource === 'checkout') { await handleCheckout(req, res, sql, userId); return; }
  if (resource === 'portal') { await handlePortal(req, res, sql, userId); return; }
  res.status(400).json({ error: 'Unknown resource — expected ?resource=checkout, portal, or webhook' });
});

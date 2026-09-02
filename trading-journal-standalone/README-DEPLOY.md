# PipEcho — real Stripe billing (checkout, webhook, portal)

18 files: 4 new, 12 changed, **2 deleted**. One dependency added (`stripe`).
One database migration (adds 5 columns to `users`). Needs real setup in
your Stripe Dashboard before it does anything — see below, this is the
part that only you can do.

## What this delivers

You asked to start adding a real payment method. This wires it in for
real:

- A logged-in user can go to **Billing** (new sidebar link) and click
  **Add payment method**. That opens a real Stripe Checkout page, collects
  a real card, and creates a real subscription.
- **Nobody gets charged today.** The subscription's trial is set to end
  exactly on the launch promo's end date (November 30, 2026 — the same
  date already on the Pricing page). Stripe holds the first real charge
  until then automatically; there's nothing to remember or come back and
  flip later.
- Once someone has a subscription (trialing or paid), the app actually
  knows it — `hasProAccess()` now checks it for real, not just the promo.
  A **Manage billing** button opens Stripe's own hosted portal (update
  card, switch monthly/annual, cancel).
- All of it is driven by Stripe webhook events, so it stays correct even
  if someone closes the tab mid-checkout, a card fails, or they cancel
  from the portal instead of from inside PipEcho.

## Required: set this up in your Stripe Dashboard first

Nothing above works until you do these steps once. Log into
[dashboard.stripe.com](https://dashboard.stripe.com) (use **Live mode**
when you're ready to actually launch this; **Test mode** first if you want
to try the whole flow with a fake card before going live — Stripe's docs
call this `4242 4242 4242 4242`, any future expiry, any CVC).

1. **Create two Price objects** under Product catalog → Add product:
   - One product, e.g. "PipEcho Pro", with two recurring prices attached to
     it: **$15.00/month** and **$12.00/month billed annually** (i.e. the
     annual price is $144.00/year — matches the "save 20%" on the Pricing
     page). Copy each price's ID (`price_...`).
2. **Get your secret key**: Developers → API keys → copy the **Secret
   key** (`sk_live_...` or `sk_test_...`).
3. **Create the webhook endpoint**: Developers → Webhooks → Add endpoint.
   - Endpoint URL: `https://<your-domain>/api/stripe?resource=webhook`
     (the query string is required — it's how this one file tells the three
     billing operations apart, see the code comments in `api/stripe.ts`).
   - Events to send: `checkout.session.completed`,
     `customer.subscription.updated`, `customer.subscription.deleted`.
   - After creating it, copy the **Signing secret** (`whsec_...`).
4. **Add these to Vercel** (Project Settings → Environment Variables):
   - `STRIPE_SECRET_KEY` = the secret key from step 2
   - `STRIPE_WEBHOOK_SECRET` = the signing secret from step 3
   - `STRIPE_PRICE_PRO_MONTHLY` = the monthly price id from step 1
   - `STRIPE_PRICE_PRO_ANNUAL` = the annual price id from step 1
   - `APP_URL` should already be set from the Google login setup — if not,
     set it to your real production URL (e.g. `https://pipecho.com`). Both
     Checkout's redirect back to `/billing` and the webhook URL above
     depend on this being correct.

Until these are set, clicking "Add payment method" fails with a clear
"Billing is not fully configured yet" error rather than a confusing
crash — safe to deploy the code before you've finished this part, nothing
breaks for existing users either way.

## Run the database migration

`schema.sql` has 5 new lines near the `users` table (search for "Billing
(Stripe)"). Run the whole file against your database the same way you've
applied every schema.sql change so far — it's idempotent (`ADD COLUMN IF
NOT EXISTS`), so re-running the entire file is always safe, not just the
new part.

## Important: two files are deleted, not just changed

`api/trades/bulk-add.ts` and `api/trades/bulk-delete.ts` are **replaced**
by the new `api/trades/bulk.ts` — delete the old two files when you apply
this, don't leave them alongside the new one. This isn't optional cleanup:
the Vercel Hobby plan caps serverless functions at 12, and this project
was already sitting exactly at that cap. Merging those two small,
related endpoints into one (dispatched by `?resource=add` /
`?resource=delete`, same pattern `api/columns.ts` already uses for tags/
tag groups/timeframes) freed the one slot `api/stripe.ts` needed —
without it, this delivery would fail to deploy on your current plan.
Excel import and bulk-delete-from-Journal both still work exactly as
before; only the URL they call internally changed
(`src/pages/Journal.tsx` and the demo-mode fake backend were both updated
to match).

## Files changed

**New:**
- `api/_stripe.js` — shared Stripe client + raw-body helper (webhook
  signature verification needs Stripe's exact original bytes, not
  re-parsed JSON)
- `api/stripe.ts` — the billing endpoint itself: `?resource=checkout`
  (start a subscription), `?resource=portal` (manage an existing one),
  `?resource=webhook` (Stripe → your database)
- `api/trades/bulk.ts` — replaces the two deleted files (see above)
- `src/pages/Billing.tsx` — the new Billing page (plan status, upgrade
  card, "Manage billing")

**Changed:**
- `schema.sql` — `users.plan` / `stripe_customer_id` /
  `stripe_subscription_id` / `stripe_subscription_status` /
  `plan_current_period_end`
- `api/_auth.js` — the session check now also returns `plan` and the two
  billing display fields
- `api/columns.ts` — signup/login responses now include those same fields
  (so a freshly logged-in user's plan is correct immediately, not just
  after the next page load)
- `src/lib/auth.tsx` — `User` type gained `plan` /
  `stripe_subscription_status` / `plan_current_period_end`; added
  `refreshUser()` (a quiet re-fetch, used once on returning from Stripe
  Checkout)
- `src/lib/proFeatures.ts` — `hasProAccess(plan)` is now the real check
  this file's own comment always said it would become: promo-active OR
  `plan === 'pro'`
- `src/components/ProBadge.tsx`, `src/components/ProNotice.tsx` — updated
  for `hasProAccess`'s new signature, plus slightly smarter copy for
  someone who's on a real paid plan rather than just riding the promo
- `src/components/Layout.tsx` — new "Billing" sidebar link (hidden inside
  the public demo sandbox, same as Backtest/Challenge Simulator)
- `src/App.tsx` — new `/billing` route
- `src/pages/Pricing.tsx` — a logged-in visitor clicking the Pro plan now
  goes straight to Billing instead of `/signup` (which would just bounce
  them, since they already have an account)
- `src/pages/Journal.tsx`, `src/lib/demoBackend.ts` — updated for the
  bulk-add/bulk-delete → bulk merge above
- `package.json` / `package-lock.json` — added `stripe` (^22.6.1)

**Deleted:**
- `api/trades/bulk-add.ts`, `api/trades/bulk-delete.ts` (see above)

## How to apply

`MSKTrades/Tradingjournal` → `trading-journal-standalone/` on GitHub:
replace the 12 changed files, add the 4 new ones, **delete** the 2 old
bulk files. Run the schema.sql migration against your database. Set the
4 new Stripe env vars in Vercel (see above). Commit to `main` — Vercel
auto-deploys. Until the env vars are set, everything except the "Add
payment method" / "Manage billing" buttons works exactly as before.

## Not part of this delivery

- Australian GST isn't handled here — worth a mention since PIP ECHO PTY
  LTD is now a registered Australian company. GST registration only
  becomes mandatory once turnover crosses AUD $75,000/year, so this isn't
  urgent; Stripe Tax (a Dashboard toggle, no code change) is the
  straightforward way to handle it once you're closer to that.
- No annual-vs-monthly switch UI beyond what's on the Billing page — an
  existing Pro subscriber changes that (and cancels) through the Stripe
  Billing Portal ("Manage billing"), not a custom in-app control.
- Free-plan feature limits (1 account, 1 strategy playbook) are still not
  actually enforced anywhere — same as before this delivery. `plan` is now
  real and correct, so wiring an actual limit in later is just a couple of
  `hasProAccess(user?.plan)` checks away, not a redesign.

## Verified before packaging

- `tsc --noEmit` clean for `src/` (the normal build check) and, separately,
  a one-off `tsc` pass scoped to `api/` (that folder isn't covered by the
  project's main tsconfig, so this needed its own check) — zero errors in
  any new or changed file. The handful of pre-existing errors it surfaced
  elsewhere (`api/backtest.ts`, an unrelated part of `api/columns.ts`) predate
  this delivery and aren't touched by it.
- `npm run build` succeeds.
- Confirmed `api/` still has exactly 12 function files (not 13) after this
  change — the Vercel Hobby cap this whole delivery had to work around.
- Loaded the built app and confirmed `/billing` correctly bounces a
  logged-out visitor to `/login` (same gate every other authenticated page
  uses), and that the Pricing page still renders correctly for a logged-out
  visitor.
- Full checkout → webhook → portal round trip could **not** be tested
  end-to-end here — that needs your real Stripe keys and a live database,
  neither of which exist in this sandbox. Test it with Stripe test-mode
  keys and a `4242 4242 4242 4242` card before flipping to live keys.

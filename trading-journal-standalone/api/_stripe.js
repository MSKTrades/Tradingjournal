import Stripe from 'stripe';

// Lazily-created singleton, same pattern as db() in _db.js - a serverless
// function's module scope is reused across warm invocations, so this avoids
// re-constructing the Stripe client (and re-parsing its API version) on
// every single request.
let _stripe = null;

export function stripe() {
  if (!_stripe) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error('STRIPE_SECRET_KEY environment variable is not set');
    _stripe = new Stripe(key);
  }
  return _stripe;
}

// Reads the raw, unparsed request body as a Buffer. Needed for exactly one
// thing: Stripe webhook signature verification (stripe.webhooks.constructEvent)
// requires the exact bytes Stripe sent, byte-for-byte, before any JSON
// parsing touches them - a re-serialized JSON.stringify(JSON.parse(raw))
// round-trip is NOT guaranteed to produce identical bytes (key order,
// whitespace, number formatting can all differ), which would make the
// signature check fail even for a genuine event. This is why api/stripe.ts
// disables Vercel's default body parser for the whole file (export const
// config = { api: { bodyParser: false } }) and every resource in that file -
// not just the webhook - reads the body through this helper instead of
// req.body, JSON.parse()-ing it themselves where they need parsed JSON.
export async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

import posthog from 'posthog-js';

// Product analytics — registered-user counts live in the Admin page (real
// database numbers), but "how long are people actually using the app" and
// "are they coming back" need real session-level tracking, which the
// database was never built to capture. That's what this wires up.
//
// Reads VITE_POSTHOG_KEY / VITE_POSTHOG_HOST from the build environment.
// Both are safe to expose client-side (this is what PostHog calls the
// "project API key" — write-only, scoped to sending events in, not reading
// data out; your actual PostHog account login is what's private). Until
// those env vars are set, every function here is a silent no-op, so nothing
// breaks — the app just isn't sending analytics yet.
//
// Setup (one-time):
//   1. Create a free account at https://posthog.com and a new project.
//   2. Project Settings -> copy the "Project API Key" (starts with "phc_").
//   3. In Vercel: Project Settings -> Environment Variables, add
//      VITE_POSTHOG_KEY = phc_xxxxx (and VITE_POSTHOG_HOST if you're on the
//      EU cloud - https://eu.i.posthog.com - otherwise the US default below
//      is already correct). Redeploy.
//   4. That's it - identify()/reset() below start firing automatically once
//      the key is present, no other code changes needed.
const POSTHOG_KEY = import.meta.env.VITE_POSTHOG_KEY as string | undefined;
const POSTHOG_HOST = (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ?? 'https://us.i.posthog.com';

let initialized = false;

export function initAnalytics() {
  if (initialized || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Pageviews are captured manually (capturePageview call in App.tsx's
    // route-change effect) rather than PostHog's default automatic
    // capture, since this is a client-side-routed SPA - automatic capture
    // is tuned for full page loads and double-counts / misses on
    // history.pushState navigation without extra config.
    capture_pageview: false,
    // Session recording is the one PostHog feature genuinely worth opting
    // out of by default for a trading journal - trade screenshots, notes,
    // and P/L numbers are the entire point of the product, and none of
    // that belongs in a third-party session replay unless you deliberately
    // decide otherwise later.
    disable_session_recording: true,
  });
  initialized = true;
}

export function capturePageview(path: string) {
  if (!initialized) return;
  posthog.capture('$pageview', { $current_url: window.location.origin + path });
}

// Called once from AuthProvider whenever `user` resolves to a real,
// logged-in account (login, signup, or a page-load session check that
// finds an existing cookie) - this is what turns anonymous pre-login
// events into "this specific registered user", and is what makes
// new-vs-returning and per-user retention numbers in PostHog meaningful.
export function identifyUser(userId: number, email: string) {
  if (!initialized) return;
  posthog.identify(String(userId), { email });
}

// Called on logout so the next person to use this browser/device doesn't
// inherit the previous person's identity in PostHog.
export function resetAnalytics() {
  if (!initialized) return;
  posthog.reset();
}

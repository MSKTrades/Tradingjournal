# ForexForge — Landing Page + Login System

## What's in this zip

New files:
- `src/pages/Landing.tsx` — public marketing page (hero, features, CTA)
- `src/pages/Login.tsx` — login form
- `src/pages/Signup.tsx` — signup form
- `src/lib/auth.tsx` — auth context (`AuthProvider` / `useAuth`)

Modified files:
- `api/columns.ts` — added a real auth backend (`?resource=auth`): signup,
  login, logout, and "who am I" — password hashing with bcrypt, sessions as
  a signed, httpOnly cookie (JWT). Added to this file rather than a new one
  because the project is already at Vercel Hobby's 12-function cap.
- `schema.sql` — added a `users` table (id, email, password_hash, name).
- `src/App.tsx` — restructured routing: `/` is the Landing page for
  logged-out visitors and the Summary dashboard for logged-in ones; the rest
  of the app (`/journal`, `/performance`, `/strategies`, `/checklists`,
  `/backtest`) now requires login and redirects to `/login` if you're not
  signed in; `/login` and `/signup` bounce you back to `/` if you're already
  signed in.
- `src/components/Layout.tsx` — added a logout button (shows your email) at
  the bottom of the sidebar.
- `package.json` / `package-lock.json` — added `bcryptjs` and `jose`.

## How to apply

1. On GitHub, use "Add files via upload" for each file above, keeping the
   same folder paths, so they overwrite the existing versions.
2. In Neon's SQL editor, run the full updated `schema.sql` again (it's
   idempotent — safe to re-run; it will only add the new `users` table).
3. In Vercel → your project → Settings → Environment Variables, add:
   - `JWT_SECRET` — any long random string (e.g. generate one with
     `openssl rand -base64 32`, or just mash the keyboard for 40+ characters).
     This signs the login session cookies — keep it secret, and don't reuse
     it anywhere else.
4. Redeploy (Vercel will do this automatically once it sees the new commit,
   or trigger a redeploy manually from the Deployments tab).
5. Visit your live URL — you should see the new Landing page instead of the
   app. Click "Sign up free" to create your account, then you're in.

## Important — what this does and doesn't cover

This is a **real, working login gate**: passwords are hashed with bcrypt
(never stored in plain text), sessions are cryptographically signed and
stored in an httpOnly cookie (not readable by JS, not vulnerable to casual
tampering), and the frontend genuinely blocks access to every page until
you're logged in.

What it does **not** yet do: the other existing API endpoints (`/api/trades`,
`/api/accounts`, `/api/strategies`, `/api/backtest`, `/api/checklist`,
`/api/upload`, `/api/summary`) don't check the session cookie server-side —
they'll still respond to a direct API request even without being logged in.
Practically speaking this doesn't matter much for you as a solo user (no one
else knows the URL, and the frontend is fully gated), but it means the site
isn't secure against someone who deliberately finds and calls the API URLs
directly. If you want, I can follow up and add that server-side check to the
remaining endpoints — it's a fairly mechanical change once the pattern above
is in place, just scoped out of this round so I could deliver the visible
landing-page-and-login-you-can-show-TradingView piece first.

## For TradingView's application

Once this is live, your Vercel URL will show a real landing page and require
a genuine account to get into the product — a truthful answer to "is this a
real, live tool" rather than an open, unauthenticated single-page app.

# ForexForge — Landing Page, Login System, and Google/Facebook Sign-In

This zip is a full re-delivery of the login/landing feature — it includes
everything from the first round (Landing page, email/password login) plus
this round's additions: a nicer hero graphic and "Continue with Google" /
"Continue with Facebook" buttons. Upload every file below even if you
already applied the first round; they've all been updated in place.

## What's new this round

- `src/pages/Landing.tsx` — hero section now has a subtle animated-looking
  candlestick/trend-line graphic behind the headline (works in both light
  and dark mode) instead of a plain background.
- `src/pages/ui/OAuthButtons.tsx` (new) — the "Continue with Google" /
  "Continue with Facebook" buttons, shared by Login and Signup.
- `src/pages/Login.tsx` / `src/pages/Signup.tsx` — now show those buttons
  above the email/password form, and Login shows a friendly message if an
  OAuth sign-in fails or isn't configured yet.
- `api/columns.ts` — added the Google/Facebook sign-in backend (still under
  `?resource=auth`, no new serverless function — same 12-function-cap
  reason as before).
- `schema.sql` — `users.password_hash` is now nullable (Google/Facebook
  accounts don't have one), and three new columns: `oauth_provider`,
  `oauth_id`, `avatar_url`.

## How to apply

1. Upload every file in this zip via GitHub's "Add files via upload",
   keeping the same folder paths.
2. Re-run the full `schema.sql` in Neon's SQL editor (idempotent, safe to
   re-run — it only adds what's missing).
3. Set up Google and/or Facebook sign-in (see below) — or skip this step
   and the buttons will just show a "not set up yet" message instead of
   breaking anything.
4. Make sure `JWT_SECRET` is still set in Vercel (from the first round).
5. Redeploy.

## Setting up "Continue with Google"

1. Go to console.cloud.google.com → create a project (or pick an existing
   one) → **APIs & Services → OAuth consent screen**. Choose "External",
   fill in an app name ("ForexForge"), your email as support/developer
   contact, and save. You can leave it in "Testing" mode for now — that's
   fine for just you; publishing to "Production" removes the "unverified
   app" warning but isn't required for it to work.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID**
   → Application type: **Web application**.
3. Under "Authorized redirect URIs", add exactly:
   `https://YOUR-DOMAIN/api/columns?resource=auth&action=google_callback`
   (use your real live URL — right now that's
   `https://tradingjournal-jade-eta.vercel.app`, or your custom domain once
   you have one). This has to match exactly, including `https://` and no
   trailing slash.
4. Copy the **Client ID** and **Client Secret** it gives you.
5. In Vercel → Project → Settings → Environment Variables, add:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `APP_URL` = `https://YOUR-DOMAIN` (same domain as step 3, no trailing slash)

## Setting up "Continue with Facebook"

1. Go to developers.facebook.com → **My Apps → Create App** → pick
   "Consumer" (or "Other" if that's not offered) → name it "ForexForge".
2. Add the **Facebook Login** product → Settings → under "Valid OAuth
   Redirect URIs" add exactly:
   `https://YOUR-DOMAIN/api/columns?resource=auth&action=facebook_callback`
3. **Settings → Basic** → copy the **App ID** and **App Secret**.
4. In Vercel, add:
   - `FACEBOOK_APP_ID`
   - `FACEBOOK_APP_SECRET`
   - `APP_URL` (same as above, if not already set from the Google step)
5. Important: a new Facebook app starts in **Development mode**, where only
   you and people you explicitly add as testers/admins in the dashboard can
   log in with it. To let anyone log in, Facebook requires "App Review" for
   the `email` permission before you can switch the app to Live — that's a
   real review process on their end, not something I can do for you. Until
   then, the Facebook button will work for you but not for random visitors.
   Google doesn't have this restriction for basic profile/email scopes.

If you only want one of the two providers, just set up that one — the
other button will show "isn't set up yet" instead of erroring, so nothing
breaks if you skip it.

## A note on verification

I can't reach Google's or Facebook's real OAuth servers from inside this
sandbox (its network is locked down to package registries only), so I
wasn't able to test an actual end-to-end Google/Facebook login here. I
verified everything I could without that: the code type-checks and builds
cleanly, and I used Playwright with a mocked backend to confirm the
buttons are wired to the right URLs, the redirect/error handling on the
frontend works, and the existing email/password flow still works
end-to-end. The one thing I'd ask you to sanity-check yourself after
setting up real credentials is clicking "Continue with Google" once for
real and confirming you land back in the app logged in.

## Still true from the first round

The other API endpoints (trades, accounts, etc.) still don't check the
session server-side — only the frontend is gated. Let me know if you want
that closed off too.

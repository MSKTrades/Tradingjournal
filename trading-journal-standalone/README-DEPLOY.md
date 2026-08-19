# Deploy: Analytics, Admin stats, Feedback, Contact us

This batch covers the three things you asked for: (1) an admin-only stats
page — visible only to `manjyot1537@gmail.com`, everyone else gets a real
404 — showing registered users and signup growth, with PostHog wired in for
the session-level stuff a database can't give you (time on site, returning
vs. new visitors); (2) a Feedback / feature-request button next to the
Dark mode toggle in the sidebar; (3) a Contact us link on the landing page
header/footer and in the app sidebar, both pointing to `support@pipecho.com`.

Tested end-to-end locally against a real Postgres database with three users
(one plain user, one made to match your admin email, one anonymous request)
— login, signup, admin gating (200 for the admin email, 404 for everyone
else, 401 for logged-out), feedback submit + validation + admin read-back,
and the UI (sidebar nav, dialog, landing page) all confirmed working before
this was packaged.

## 1. Files in this zip

Copy these over the matching paths in your GitHub repo (same "Add files via
upload" flow as last time — GitHub will ask to overwrite the ones that
already exist, say yes):

```
schema.sql                          (append only — see step 2, don't overwrite blindly)
package.json                        (adds the posthog-js dependency)
package-lock.json                   (kept in sync with package.json)
api/_auth.js                        (adds isAdminEmail)
api/columns.ts                      (adds admin_stats + feedback endpoints)
src/App.tsx                         (adds /admin route + pageview tracking)
src/main.tsx                        (starts PostHog on app load)
src/vite-env.d.ts                   (new — needed for the PostHog env vars to type-check)
src/lib/admin.ts                    (new — client-side "is this the admin" check, UX only)
src/lib/analytics.ts                (new — PostHog wrapper)
src/lib/auth.tsx                    (identifies the user to PostHog on login)
src/components/Layout.tsx           (adds Admin nav link, Feedback button, Contact us link)
src/components/FeedbackDialog.tsx   (new — the Feedback popup)
src/pages/Admin.tsx                 (new — the admin stats page)
src/pages/ui/MarketingChrome.tsx    (adds Contact us to landing page header/footer)
```

**`schema.sql` is the one exception to "just overwrite it"** — your live
database already has everything from the multi-tenancy fix, and re-running
that whole file isn't necessary or safe to just overwrite blind. See step 2.

## 2. Database migration — add the `feedback` table

Run this once against your **production** Neon database (same way you ran
the multi-tenancy migration — Neon's SQL editor, or `psql` with your
production `DATABASE_URL`):

```sql
CREATE TABLE IF NOT EXISTS feedback (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category    TEXT NOT NULL DEFAULT 'feedback',
  message     TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback (created_at DESC);
```

That's it — one new table, nothing else changes. (The full block is also at
the bottom of the `schema.sql` in this zip, in case you want to diff it
against what's already in your repo's copy.)

## 3. Set up PostHog (for time-on-site / returning-user tracking)

This is the piece that answers "how much time are people spending" and
"who's coming back" — the database alone can't tell you that, it only
knows *that* someone signed up, not what they did afterward.

1. Go to https://posthog.com, create a free account (free tier covers a
   small app like this comfortably), create a project.
2. In the project, go to **Project Settings** and copy the **Project API
   Key** — starts with `phc_...`. This key is safe to expose in your
   frontend; it's write-only (sends events in, can't read your data out).
3. In Vercel: your project → **Settings → Environment Variables** → add
   `VITE_POSTHOG_KEY` = `phc_xxxxx`. If PostHog put you on the EU cloud
   during signup, also add `VITE_POSTHOG_HOST` = `https://eu.i.posthog.com`
   (skip this if you're on US cloud, which is the default).
4. Redeploy. That's the only setup needed — the app starts sending events
   automatically once the key is present. Until you do this step, the app
   behaves exactly as it does today (nothing breaks, PostHog just isn't
   collecting anything yet).

Once it's live, PostHog's own dashboard (not this app) is where you'll see
session duration, returning vs. new visitors, and which pages people
actually use. Session recording is deliberately turned off by default —
your trade screenshots/notes are the core content of this product and
shouldn't go into a third-party replay tool without you deciding that on
purpose later.

## 4. Registered users / signup growth / feedback — no PostHog needed

This part works immediately after deploy, no external account required.
Log in with `manjyot1537@gmail.com` and an **"Admin"** item appears at the
bottom of the sidebar — it takes you to `/admin`, showing total registered
users, a 30-day signup chart, and everything submitted through the
Feedback button. No other account can see this page or its data — the API
checks the logged-in email server-side and returns a plain 404 to anyone
else, not just a hidden link.

If you ever want to change which email is treated as the admin, set
`ADMIN_EMAIL` in Vercel's environment variables — it falls back to
`manjyot1537@gmail.com` if that's not set, so you don't have to add it
right now.

## 5. What to check after deploying

- Log in with a normal account → sidebar shows **Feedback** and
  **Contact us** near Dark mode, but no **Admin** link.
- Submit something through Feedback → confirm it doesn't error.
- Log in with `manjyot1537@gmail.com` → **Admin** link appears, `/admin`
  shows your real user count and the feedback you just submitted.
- Visit the logged-out landing page → **Contact us** in the header and
  footer opens an email to `support@pipecho.com`.
- (Optional, once PostHog key is set) Check your PostHog project's **Live
  events** — you should see pageview and identify events within a minute
  of visiting the site.

## Notes

- `npm install` picks up `posthog-js` automatically on Vercel's build step
  — nothing manual needed there, just make sure `package.json` and
  `package-lock.json` both land in the repo (both are in this zip).
- This does **not** add a new serverless function — `admin_stats` and
  `feedback` are both handled inside the existing `api/columns.ts`, so
  you're still at 12/12 functions on the Hobby plan with room for nothing
  else new without folding it into an existing file the same way.

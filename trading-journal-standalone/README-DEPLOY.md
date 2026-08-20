# Deploy: Restrict Backtest to your account only

You said Backtest isn't ready to release to everyone yet — this locks it
down to just your account (`manjyot1537@gmail.com`), the same way `/admin`
already works, at three layers so it's actually not accessible to anyone
else, not just hidden:

1. **The sidebar link disappears** for every other user — same as the
   Admin link already does. Nobody sees a "Backtest" tab at all.
2. **The `/backtest` page itself** shows the existing "Coming soon" card
   (the one already in your codebase from before this feature was built)
   for anyone but you — so an old bookmark or a shared link doesn't show a
   half-finished feature either.
3. **The API itself** (`/api/backtest`) now 404s for anyone who isn't you —
   this is the part that actually matters. Before this change, the API had
   no access check at all: anyone who found the URL (logged in or not)
   could read your datasets/trades/drawings or write to them directly,
   regardless of what the UI showed. That's closed now.

Nothing about this touches your data or your real Backtest usage — you'll
see everything exactly as before, since the check is "is this
`manjyot1537@gmail.com`," which is you.

## 1. No database changes

Nothing new to run against Neon for this one — it's all application code.

## 2. Files in this zip

```
api/backtest.ts                 (the real gate — 404s the whole API for anyone but you)
src/App.tsx                     (shows the existing "Coming soon" page instead of the real one for anyone but you)
src/components/Layout.tsx       (hides the sidebar link for anyone but you)
```

The rest of the files in this zip (`ReplayChart.tsx`, `drawingPrimitives.ts`,
`TradeReplayTab.tsx`, `Backtest.tsx`, `types.ts`, `package.json`,
`schema.sql`) are the same drawing-tools delivery from before — included
again so this zip is safe to copy over regardless of whether you'd already
applied that one. If you already uploaded those, re-copying them is a
no-op; if you hadn't yet, this brings your repo fully up to date in one
step.

## 3. How it works

Both the UI check and the API check use the same `isAdminEmail()` helper
your `/admin` page already relies on (`ADMIN_EMAIL` — defaults to
`manjyot1537@gmail.com`, overridable via a Vercel env var if you ever want
to change which account this is). The UI hiding is just so other users
don't see a feature that isn't ready for them; the API check is the real
security boundary — even someone who knew the exact API URL and was logged
into their own account would get a 404, same as hitting a route that
doesn't exist.

## 4. Tested before sending this

Logged in locally as two different accounts against the same running app:

- **Your account**: sidebar shows Backtest, `/backtest` loads the real
  page, and `/api/backtest?resource=datasets` returns your data (200).
- **A different logged-in account**: no Backtest link in the sidebar,
  `/backtest` shows the "Coming soon" card instead of the real page, and
  both a GET and a POST straight to `/api/backtest` return 404 — confirmed
  the API rejects it, not just the UI hiding the button.
- **Logged out entirely**: visiting `/backtest` redirects to `/login`
  (existing behavior), and a direct API call also 404s.

`tsc --noEmit` and `npm run build` both clean.

## 5. What to check after deploying

- Log in as yourself, confirm Backtest still works exactly as before.
- If you have a second test account (or ask a friend/beta tester to check),
  confirm they don't see the Backtest tab and that `/backtest` shows
  "Coming soon" for them instead of the real page.

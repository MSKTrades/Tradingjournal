# delivery50 — Silk-ribbon wave, matching your reference photo

You sent a reference photo (glowing orange ribbon, silky flowing curve on
black) and said "I need something of this sort" — this replaces the simple
two-arc wave from delivery49 with something built the same way: a tapering
ribbon shape (not a fixed-width line) with a soft blurred glow underneath
and a bright highlight thread along its spine, so it actually reads like
silk catching light rather than a flat decorative stripe.

## What changed

**`src/pages/Landing.tsx`** — `SectionWave` rebuilt from scratch:

- **Two intertwined ribbon strands** — a bright main strand and a dimmer
  twin — each drawn as a variable-width filled shape that tapers to a
  point at both ends (computed from a smooth centerline + a width
  envelope, not a fixed stroke), which is what gives it that
  silk-catching-light look instead of a uniform wavy stripe.
- **Layered glow** — each strand has its own big, heavily-blurred glow
  shape sitting underneath the crisper ribbon fill, same trick as the
  ambient blur in your reference photo.
- **A bright highlight thread** — a thin near-white line traced along the
  main strand's spine, for the sheen along the ribbon's brightest edge.
- Same warm palette as before (`#f97316`/`#ea580c`/`#fed7aa`), just used
  with a real gradient wash along the ribbon's length instead of flat
  fills.
- Now spans the full section (`absolute inset-0` instead of a thin strip
  pinned to the bottom), so it flows behind the whole "Watch a rule change
  the numbers" block — headline, demo card, and the "Try it yourself"
  link all sit on top of it, unaffected.
- Opacity is `0.55` (light) / `0.42` (dark) — bold enough to actually read
  as the wave in your reference, while everything on top of it (white
  headline text, the demo card's own background) still has plenty of
  contrast. Checked in the screenshot below.

## Where this shows up

Same spot as before — the section right after the hero, above "See it
before you sign up." Nothing else on the landing page changed.

## Deploy steps

Copy this 1 file into your repo at the same path, commit, push. No new
files, no schema/env changes, no function-count impact (0 files in `api/`
touched — pure frontend/UI).

## Verified

- `tsc --noEmit` — clean
- `npm run build` — succeeds
- Playwright screenshot of the live section — wave reads clearly behind
  the demo card and headline, no text legibility issues, no overlap with
  interactive elements

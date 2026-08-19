# PipEcho — Technical SEO fix (per-page titles, sitemap, robots.txt, OG image)

This is the fix I flagged in the growth plan: every page was shipping the
same `<title>` and description, there was no sitemap/robots.txt, and shared
links had no preview image. Fixed below, verified end-to-end.

## How to apply
Upload these files via GitHub "Add files via upload," preserving folder
structure (the new `public/`, `scripts/`, and `src/lib/` paths already
exist from earlier deliveries, so this just adds/overwrites files inside
them):

- `index.html` (overwrite)
- `package.json` (overwrite — one line changed: `build` script now runs a
  sitemap-generation step first)
- `public/robots.txt` (new)
- `public/sitemap.xml` (new — also auto-regenerated on every `npm run
  build`, see below)
- `public/og-image.png` (new — the social-preview image)
- `scripts/generate-sitemap.mjs` (new)
- `src/lib/useDocumentMeta.ts` (new)
- `src/pages/Landing.tsx`, `Pricing.tsx`, `Blog.tsx`, `BlogPost.tsx`,
  `Login.tsx`, `Signup.tsx` (overwrite)

Commit, redeploy on Vercel. Nothing here touches `api/` — still exactly 12
serverless functions, no change to your Hobby-plan headroom.

## What was actually wrong (verified, not assumed)
I checked the live site's HTML before touching anything: every route —
Landing, Pricing, Blog, all three blog posts — served the identical
`<title>PipEcho</title>` and one generic description. No Open Graph or
Twitter Card tags at all, no `sitemap.xml`, no `robots.txt`.

Concretely, that meant: Google saw four+ pages with identical titles
(reads as duplicate/low-quality content, not four distinct useful
articles); any link to a blog post shared on Reddit/Discord/X showed no
preview at all — just a bare link; and there was nothing telling search
engines your blog posts exist beyond them stumbling onto internal links.

## What's fixed now

**Per-page titles and descriptions.** Every public page — Landing,
Pricing, Blog, each blog post, Login, Signup — now sets its own
`<title>` and meta description via a small shared hook
(`useDocumentMeta`), and restores the site default when you navigate away.
Verified this works both on a fresh page load and on in-app client-side
navigation (clicking between pages doesn't leave a stale title behind).

**Structured data (JSON-LD).** The homepage now carries `SoftwareApplication`
schema, and every blog post carries `Article` schema (headline, description,
publish date). This is what lets Google show richer results — an article
card with your date, for instance — instead of a bare blue link.

**Sitemap + robots.txt.** `robots.txt` points crawlers at the public pages
and explicitly tells them not to bother crawling the authenticated app
(nothing there is indexable behind a login anyway — no point wasting crawl
budget on it). `sitemap.xml` lists every public page and every blog post.

Importantly, the sitemap is **not hand-maintained** — `npm run build` now
runs `scripts/generate-sitemap.mjs` first, which reads the live list of
blog post slugs straight out of `blogPosts.ts` and regenerates
`sitemap.xml` from it automatically. Write your 5th blog post, run a
build, and it's in the sitemap with zero extra steps — no separate file to
remember to update.

**A real Open Graph image.** `public/og-image.png` — on-brand (dark
background, the actual PipEcho gradient mark, matching the site's now-dark
look), sized correctly for link previews (1200×630). Every shared link now
shows a proper branded card instead of nothing.

## One honest limitation, worth understanding
The per-page titles/descriptions above are set with client-side
JavaScript. Google renders JavaScript before indexing, so it sees these —
that part's fully fixed for search. But most link-preview bots (Twitter,
Discord, Slack, Facebook) do **not** run JavaScript — they only ever read
whatever's already in the raw HTML response. Since this is a single-page
app with one static `index.html`, that raw HTML is the same for every
route, which means: a shared link to a specific blog post will show the
new branded OG image and the site-wide title/description — a real
upgrade from showing nothing — but not yet that specific post's own title
and excerpt in the preview card.

Fixing that properly needs actual per-route HTML — either a small Vercel
Edge Middleware that rewrites the title/meta tags per-path before serving
(doesn't cost one of your 12 serverless function slots, since Middleware
is a separate Vercel primitive), or prerendering the public routes to
static HTML at build time. I didn't build either of those in this pass —
middleware in particular isn't something I can safely verify works
without a real Vercel deployment to test against, and shipping unverified
routing logic risks breaking the site rather than improving it. Worth
doing as a deliberate next step once you want it; flagging now so it's a
known, chosen gap rather than a surprise.

## Verified before sending
- `tsc --noEmit` and `npm run build` — clean, sitemap generation step runs
  correctly and produces valid XML
- Confirmed `robots.txt` and `sitemap.xml` serve correctly
- Headless-browser check of `/`, `/pricing`, `/blog`, a blog post, `/login`,
  `/signup` — each shows its own correct title/description/JSON-LD
- Confirmed titles update correctly on in-app navigation between pages, not
  just on a fresh page load, and restore properly when leaving a page

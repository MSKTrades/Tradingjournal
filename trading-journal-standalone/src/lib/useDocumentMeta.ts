import { useEffect } from 'react';

/**
 * Sets a per-route <title>/<meta name="description"> and restores the
 * site-wide default (from index.html) on unmount, plus an optional JSON-LD
 * <script type="application/ld+json"> block for structured data (e.g. the
 * Article schema on a blog post).
 *
 * Why this exists: this app is a client-rendered SPA with one static
 * index.html, so without this every route — Landing, Pricing, every blog
 * post — showed the exact same <title> and description to search engines,
 * which reads as duplicate/low-quality content rather than distinct pages.
 *
 * What this does and doesn't fix: Googlebot renders JavaScript before
 * indexing, so it sees the title/description this hook sets. Most link-
 * preview bots (Twitter, Discord, Slack, Facebook) do NOT execute
 * JavaScript — they only ever see whatever is already in the raw HTML
 * response, which is the static, shared Open Graph tags in index.html. So
 * this hook improves what Google indexes and what the browser tab shows,
 * but a link to a specific blog post will still show the site-wide preview
 * card, not that post's own title/image, until there's real per-route HTML
 * (see the comment in index.html for why that's a deliberate phase 2).
 */
export function useDocumentMeta(opts: { title: string; description: string; jsonLd?: Record<string, unknown> }) {
  useEffect(() => {
    const prevTitle = document.title;
    document.title = opts.title;

    const descTag = document.querySelector('meta[name="description"]');
    const prevDescription = descTag?.getAttribute('content') ?? null;
    if (descTag) descTag.setAttribute('content', opts.description);

    let jsonLdScript: HTMLScriptElement | null = null;
    if (opts.jsonLd) {
      jsonLdScript = document.createElement('script');
      jsonLdScript.type = 'application/ld+json';
      jsonLdScript.text = JSON.stringify(opts.jsonLd);
      document.head.appendChild(jsonLdScript);
    }

    return () => {
      document.title = prevTitle;
      if (descTag && prevDescription !== null) descTag.setAttribute('content', prevDescription);
      if (jsonLdScript) jsonLdScript.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opts.title, opts.description, opts.jsonLd]);
}

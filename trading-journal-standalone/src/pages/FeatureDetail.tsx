import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { Button } from '../lib/ui/button';
import { MarketingHeader, MarketingFooter } from './ui/MarketingChrome';
import { FEATURES } from './data/features';
import { FEATURE_DETAILS } from './data/featureDetails';
import { featureSlug } from '../lib/featureSlug';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import ProBadge from '../components/ProBadge';

/** One detail page per entry in FEATURES, reached from the Landing page's
 * feature grid and the header's Features mega-menu (both link to
 * /features/:slug). Looks the base icon/title/desc up in FEATURES and the
 * extended intro/highlights/screenshot-or-visual/CTA in FEATURE_DETAILS —
 * two separate files because FEATURES is also consumed by places that only
 * need the summary (the grid, the mega-menu), and duplicating the long-form
 * copy there just to get it here would make FEATURES far heavier than its
 * other two consumers need.
 *
 * "Prev/next feature" nav at the bottom walks FEATURES in the same order the
 * grid displays them, so a visitor reading through can keep going without
 * bouncing back to "/" between every page. */
export default function FeatureDetail() {
  const { slug } = useParams<{ slug: string }>();
  const index = slug ? FEATURES.findIndex(f => featureSlug(f.title) === slug) : -1;
  const feature = index >= 0 ? FEATURES[index] : undefined;
  const detail = slug ? FEATURE_DETAILS[slug] : undefined;

  useDocumentMeta({
    title: feature ? `${feature.title} — PipEcho` : 'PipEcho Features',
    description: feature ? feature.desc : 'Everything PipEcho does for every trader.',
    jsonLd: feature
      ? {
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          name: `${feature.title} — PipEcho`,
          description: feature.desc,
          url: `https://pipecho.com/features/${slug}`,
          isPartOf: { '@type': 'WebSite', name: 'PipEcho', url: 'https://pipecho.com/' },
        }
      : undefined,
  });

  if (!feature || !detail) return <Navigate to="/" replace />;

  const Icon = feature.icon;
  const prev = FEATURES[(index - 1 + FEATURES.length) % FEATURES.length];
  const next = FEATURES[(index + 1) % FEATURES.length];
  const Visual = detail.visual;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />

      <section className="px-6 pt-14 pb-4">
        <div className="max-w-4xl mx-auto">
          <Link to="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to all features
          </Link>
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <Icon className="w-6 h-6 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">{feature.title}</h1>
                {feature.pro && <ProBadge feature={feature.pro} />}
              </div>
              <p className="text-lg text-muted-foreground mt-3 max-w-2xl">{feature.desc}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-10">
        <div className="max-w-4xl mx-auto">
          {detail.screenshot ? (
            <div className="rounded-xl border border-border bg-card overflow-hidden">
              <img
                src={detail.screenshot.src}
                alt={detail.screenshot.alt}
                className="w-full h-auto"
                loading="lazy"
              />
            </div>
          ) : Visual ? (
            <Visual />
          ) : null}
        </div>
      </section>

      <section className="px-6 py-10">
        <div className="max-w-4xl mx-auto">
          <p className="text-[15px] leading-relaxed text-foreground/90 max-w-2xl">{detail.intro}</p>
        </div>
      </section>

      <section className="border-y border-border bg-card/50">
        <div className="max-w-4xl mx-auto px-6 py-14">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {detail.highlights.map(h => (
              <div key={h.title} className="rounded-lg border border-border bg-card p-5">
                <div className="w-7 h-7 rounded-md bg-primary/10 flex items-center justify-center mb-3">
                  <Check className="w-4 h-4 text-primary" />
                </div>
                <h3 className="font-semibold text-sm mb-1.5">{h.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{h.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="max-w-2xl mx-auto text-center">
          <h2 className="text-2xl font-semibold tracking-tight">Ready to try {feature.title.toLowerCase()}?</h2>
          <p className="text-muted-foreground mt-2">No credit card needed to get started.</p>
          <Link to={detail.ctaHref} className="inline-block mt-6">
            <Button size="default" className="h-11 px-6 text-base gap-1.5">
              {detail.ctaLabel} <ArrowRight className="w-4 h-4" />
            </Button>
          </Link>
        </div>
      </section>

      <section className="px-6 pb-16">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 border-t border-border pt-8">
          <Link
            to={`/features/${featureSlug(prev.title)}`}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground min-w-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{prev.title}</span>
          </Link>
          <Link
            to={`/features/${featureSlug(next.title)}`}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground min-w-0 text-right"
          >
            <span className="truncate">{next.title}</span>
            <ArrowRight className="w-3.5 h-3.5 shrink-0" />
          </Link>
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

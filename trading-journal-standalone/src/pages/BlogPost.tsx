import { Link, useParams, Navigate } from 'react-router-dom';
import { ArrowLeft, Clock3, ArrowRight } from 'lucide-react';
import { Badge } from '../lib/ui/form';
import { Button } from '../lib/ui/button';
import { MarketingHeader, MarketingFooter } from './ui/MarketingChrome';
import { getBlogPost } from './data/blogPosts';
import { useDocumentMeta } from '../lib/useDocumentMeta';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function BlogPost() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getBlogPost(slug) : undefined;

  // Called unconditionally (Rules of Hooks) even though the !post branch
  // below navigates away before ever rendering with these values — falls
  // back to the site default so there's nothing meaningful to set in that
  // case anyway.
  useDocumentMeta({
    title: post ? `${post.title} — PipEcho` : 'PipEcho Blog',
    description: post ? post.excerpt : 'Notes on strategy, risk management, and backtesting for forex traders.',
    jsonLd: post
      ? {
          '@context': 'https://schema.org',
          '@type': 'Article',
          headline: post.title,
          description: post.excerpt,
          datePublished: post.date,
          author: { '@type': 'Organization', name: 'PipEcho' },
          publisher: { '@type': 'Organization', name: 'PipEcho' },
          url: `https://pipecho.com/blog/${post.slug}`,
        }
      : undefined,
  });

  if (!post) return <Navigate to="/blog" replace />;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />

      <article className="px-6 py-16">
        <div className="max-w-2xl mx-auto">
          <Link to="/blog" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-8">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Blog
          </Link>

          <Badge variant="outline" className="mb-4">{post.tag}</Badge>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight leading-tight">{post.title}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground mt-4 pb-8 border-b border-border">
            <span>{fmtDate(post.date)}</span>
            <span className="flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" />{post.readTime}</span>
          </div>

          <div className="mt-8 space-y-5">
            {post.body.map((block, i) => {
              switch (block.type) {
                case 'h2':
                  return (
                    <h2 key={i} className="text-xl font-semibold tracking-tight pt-3">
                      {block.text}
                    </h2>
                  );
                case 'example':
                  return (
                    <div key={i} className="rounded-lg border border-border bg-card/60 p-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">{block.title}</p>
                      <p className="text-[15px] leading-relaxed text-foreground/90">{block.text}</p>
                    </div>
                  );
                case 'image':
                  return (
                    <figure key={i} className="pt-2">
                      <img
                        src={block.src}
                        alt={block.alt}
                        loading="lazy"
                        className="w-full rounded-lg border border-border shadow-sm"
                      />
                      <figcaption className="text-xs text-muted-foreground mt-2.5 text-center leading-relaxed">
                        {block.caption}
                      </figcaption>
                    </figure>
                  );
                case 'p':
                default:
                  return (
                    <p key={i} className="text-[15px] leading-relaxed text-foreground/90">
                      {block.text}
                    </p>
                  );
              }
            })}
          </div>

          <div className="mt-12 rounded-lg border border-border bg-card p-6">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Related feature</p>
            <h3 className="font-semibold mb-1.5">{post.relatedFeature.label}</h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">{post.relatedFeature.description}</p>
            <Link to="/signup">
              <Button size="sm" className="gap-1.5">
                Try it free <ArrowRight className="w-3.5 h-3.5" />
              </Button>
            </Link>
          </div>
        </div>
      </article>

      <MarketingFooter />
    </div>
  );
}

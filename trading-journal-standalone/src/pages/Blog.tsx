import { Link } from 'react-router-dom';
import { Clock3 } from 'lucide-react';
import { Badge } from '../lib/ui/form';
import { MarketingHeader, MarketingFooter } from './ui/MarketingChrome';
import { BLOG_POSTS } from './data/blogPosts';
import { useDocumentMeta } from '../lib/useDocumentMeta';

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function Blog() {
  useDocumentMeta({
    title: 'Blog — PipEcho',
    description: 'Notes on strategy, risk management, and backtesting for every trader, from the trader building PipEcho.',
  });
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />

      <section className="px-6 pt-16 pb-12 text-center">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-4xl font-bold tracking-tight">The PipEcho Blog</h1>
          <p className="text-lg text-muted-foreground mt-4">
            Notes on strategy, risk, and the process behind trading with data instead of guesswork.
          </p>
        </div>
      </section>

      <section className="px-6 pb-20">
        <div className="max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-2 gap-6">
          {BLOG_POSTS.slice().reverse().map(post => (
            <Link
              key={post.slug}
              to={`/blog/${post.slug}`}
              className="rounded-lg border border-border bg-card p-6 hover:border-primary/50 transition-colors flex flex-col"
            >
              <Badge variant="outline" className="w-fit mb-3">{post.tag}</Badge>
              <h2 className="font-semibold text-lg leading-snug mb-2">{post.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed flex-1">{post.excerpt}</p>
              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-5 pt-4 border-t border-border">
                <span>{fmtDate(post.date)}</span>
                <span className="flex items-center gap-1"><Clock3 className="w-3 h-3" />{post.readTime}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <MarketingFooter />
    </div>
  );
}

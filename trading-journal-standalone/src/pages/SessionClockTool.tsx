import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Mail, Clock3 } from 'lucide-react';
import { Button } from '../lib/ui/button';
import { Input } from '../lib/ui/form';
import { MarketingHeader, MarketingFooter } from './ui/MarketingChrome';
import { useDocumentMeta } from '../lib/useDocumentMeta';
import { useForceDarkTheme } from '../lib/theme';
import { api } from '../lib/api';
import SessionClockWidget from './ui/SessionClockWidget';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Free standalone lead-magnet page: the same live Trading Sessions clock
 * shown inside the real app's Summary page, given away here behind a quick
 * email capture. This is the growth-recommendation "free tool to capture
 * email leads before onboarding into the full app" — the tool itself is
 * genuinely useful (session opens/closes, London/NY overlap, weekend
 * closure) even for someone who never signs up for PipEcho, which is the
 * whole point of a lead magnet actually working.
 *
 * Email capture posts to a public resource=lead branch on api/columns.ts
 * (see that file), stored in a new `leads` table — no new serverless
 * function, since Vercel's Hobby plan is already at the 12-function cap. A
 * failed capture never blocks access to the tool itself; the point is to
 * *try* to get an email, not to gate a free tool behind a flaky network
 * call. */
export default function SessionClockTool() {
  useForceDarkTheme(); // matches the rest of the logged-out marketing site
  useDocumentMeta({
    title: 'Free Forex Session Clock — PipEcho',
    description: 'A free, live forex trading session clock — see at a glance whether Sydney, Tokyo, London, or New York is open, when the London/New York overlap starts, and when the weekend close hits.',
  });

  const [email, setEmail] = useState('');
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) { setError('Enter a valid email address.'); return; }
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/columns', { resource: 'lead', email: trimmed, source: 'session_clock_tool' });
    } catch (err) {
      // Best-effort, same as the contact form — never let a backend hiccup
      // block access to a tool we're deliberately giving away for free.
      console.error('Lead capture failed:', err);
    } finally {
      setSubmitting(false);
      setRevealed(true);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />

      <section className="px-6 pt-14 pb-16">
        <div className="max-w-2xl mx-auto text-center">
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase text-primary bg-accent px-3 py-1 rounded-full mb-6">
            <Clock3 className="w-3.5 h-3.5" /> Free tool, no account needed
          </span>
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Forex Session Clock</h1>
          <p className="text-muted-foreground mt-4">
            See at a glance whether Sydney, Tokyo, London, or New York is open right now, when the
            high-liquidity London/New York overlap starts, and a live countdown to the weekend
            close — all in your own local time.
          </p>

          {!revealed ? (
            <form onSubmit={handleSubmit} className="mt-8 max-w-sm mx-auto text-left">
              <label className="text-sm font-medium flex items-center gap-1.5 mb-1.5">
                <Mail className="w-3.5 h-3.5" /> Where should we send occasional trading tools like this?
              </label>
              <div className="flex gap-2">
                <Input
                  type="email"
                  required
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
                />
                <Button type="submit" disabled={submitting} className="shrink-0">
                  {submitting ? 'One sec…' : 'Show me the clock'}
                </Button>
              </div>
              {error && <p className="text-xs text-red-500 dark:text-red-400 mt-1.5">{error}</p>}
              <p className="text-xs text-muted-foreground mt-2">
                One email, no spam — this just unlocks the tool below.
              </p>
            </form>
          ) : (
            <div className="mt-8 max-w-2xl mx-auto text-left">
              <SessionClockWidget />
            </div>
          )}
        </div>
      </section>

      {revealed && (
        <section className="px-6 pb-20">
          <div className="max-w-2xl mx-auto rounded-xl border border-primary/30 bg-primary/5 px-6 py-6 text-center">
            <h2 className="font-semibold">This clock already lives on your Summary page in PipEcho</h2>
            <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto">
              Along with your trade journal, risk guardrails, and strategy playbooks — all in one
              place, free to start.
            </p>
            <Link to="/signup" className="inline-block mt-5">
              <Button size="default" className="h-11 px-6 text-base">
                Create your free account <ArrowRight className="w-4 h-4 ml-1.5" />
              </Button>
            </Link>
          </div>
        </section>
      )}

      <MarketingFooter />
    </div>
  );
}

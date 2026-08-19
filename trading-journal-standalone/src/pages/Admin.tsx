import { Users, MessageSquare } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../lib/ui/card';
import { Badge } from '../lib/ui/form';
import { useFetch } from '../lib/api';
import { useDocumentMeta } from '../lib/useDocumentMeta';

type AdminStats = {
  total_users: number;
  daily_signups: { day: string; signups: number }[];
  feedback: { id: number; category: string; message: string; created_at: string; email: string }[];
};

function fmtDay(iso: string) {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

/** Admin-only view — registered users, signup growth, and submitted
 * feedback. Gated two ways: the sidebar link only renders for the admin
 * email (Layout.tsx), and the API itself independently checks the same
 * email server-side (api/columns.ts, ?resource=admin_stats) and 404s
 * everyone else — the nav link being hidden is a UX nicety, not the actual
 * access control, since a hidden link is still just a client-side string.
 * This covers "how many users have registered" and "is that growing"
 * directly from the database. Session duration and returning-vs-new visitor
 * breakdowns aren't here on purpose — that needs real session-level
 * tracking (see the PostHog wiring in lib/analytics.ts), which this app's
 * database was never built to capture; that data lives in your PostHog
 * dashboard instead, not duplicated here. */
export default function Admin() {
  useDocumentMeta({ title: 'Admin — PipEcho', description: 'Internal stats.' });
  const { data, loading, error } = useFetch<AdminStats>('/columns?resource=admin_stats');

  if (loading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (error || !data) {
    return <div className="text-sm text-destructive">Couldn't load admin stats — {error ?? 'unknown error'}</div>;
  }

  const last7 = data.daily_signups.slice(-7).reduce((s, d) => s + d.signups, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Visible only to the admin account — everyone else gets a 404 on this page and its data.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Total registered users</p>
              <p className="text-2xl font-bold">{data.total_users}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg bg-primary/15 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">New signups, last 7 days</p>
              <p className="text-2xl font-bold">{last7}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Signups — last 30 days</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.daily_signups} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="day" tickFormatter={fmtDay} tick={{ fontSize: 10 }} interval={4} />
                <YAxis tick={{ fontSize: 10 }} width={30} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 11 }} labelFormatter={(v) => fmtDay(v as string)} />
                <Bar dataKey="signups" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" /> Feedback & feature requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.feedback.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {data.feedback.map(f => (
                <div key={f.id} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={f.category === 'feature_request' ? 'default' : 'outline'}>
                      {f.category === 'feature_request' ? 'Feature request' : 'Feedback'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{f.email}</span>
                    <span className="text-xs text-muted-foreground">· {fmtDateTime(f.created_at)}</span>
                  </div>
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">{f.message}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

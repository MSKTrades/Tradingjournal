import { Users, MessageSquare, Mail } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '../lib/ui/card';
import { Badge } from '../lib/ui/form';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../lib/ui/table';
import { useFetch } from '../lib/api';
import { useDocumentMeta } from '../lib/useDocumentMeta';

type AdminUser = {
  id: number;
  email: string;
  name: string | null;
  created_at: string;
  signup_country: string | null;
  signup_city: string | null;
  login_count: number;
  last_login_at: string | null;
  last_seen_at: string | null;
};

type AdminStats = {
  total_users: number;
  daily_signups: { day: string; signups: number }[];
  feedback: { id: number; category: string; message: string; created_at: string; email: string }[];
  users: AdminUser[];
  contact_messages: { id: number; email: string; message: string; created_at: string }[];
};

function fmtDay(iso: string) {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

// "3h ago" / "2d ago" / "just now" — used for last_seen_at, where relative
// recency ("still active recently?") reads faster than an absolute
// timestamp would.
function fmtAgo(iso: string | null) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function fmtLocation(u: AdminUser) {
  if (!u.signup_country) return '—';
  return u.signup_city ? `${u.signup_city}, ${u.signup_country}` : u.signup_country;
}

/** Admin-only view — registered users (with signup location and login
 * frequency), signup growth, submitted feedback, and contact-form
 * messages. Gated two ways: the sidebar link only renders for the admin
 * email (Layout.tsx), and the API itself independently checks the same
 * email server-side (api/columns.ts, ?resource=admin_stats) and 404s
 * everyone else — the nav link being hidden is a UX nicety, not the actual
 * access control, since a hidden link is still just a client-side string.
 *
 * The users table's "Location" column comes from Vercel's own geolocation
 * headers at signup/login time (zero third-party API calls — see
 * getRequestGeo in api/_auth.js), and "Logins" / "Last active" come from
 * real login events plus a throttled last-seen bump on each session check
 * (see the schema.sql comment on users.login_count etc. for the full
 * reasoning). Both are NULL for any account that registered before this
 * was added — there's no way to retroactively know where a signup that
 * already happened came from, so those rows just show "—".
 *
 * What's deliberately NOT here: true per-visit session duration ("how long
 * was this person actually using the app in one sitting"). A login-event
 * log can tell you IF and HOW OFTEN someone comes back, not how long they
 * stayed each time — that needs real client-side activity tracking, which
 * is exactly what PostHog (lib/analytics.ts) is for. Once that's set up,
 * session length and engagement live in your PostHog dashboard instead of
 * being duplicated here. */
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
            <Users className="w-4 h-4" /> Registered users
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table containerClassName="max-h-[420px]">
            <TableHeader>
              <TableRow>
                <TableHead className="bg-card">Email</TableHead>
                <TableHead className="bg-card">Signed up</TableHead>
                <TableHead className="bg-card">Location</TableHead>
                <TableHead className="bg-card text-right">Logins</TableHead>
                <TableHead className="bg-card">Last active</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.users.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.email}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtDateTime(u.created_at)}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtLocation(u)}</TableCell>
                  <TableCell className="text-right">{u.login_count}</TableCell>
                  <TableCell className="text-muted-foreground">{fmtAgo(u.last_seen_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-3">
            Location and login counts only track from when this was added — accounts registered before
            then show "—" until they log in again. Real session-length/engagement metrics live in
            PostHog once that's configured, not here.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4" /> Contact messages
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.contact_messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing submitted yet.</p>
          ) : (
            <div className="space-y-3">
              {data.contact_messages.map(m => (
                <div key={m.id} className="border-b border-border pb-3 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium">{m.email}</span>
                    <span className="text-xs text-muted-foreground">· {fmtDateTime(m.created_at)}</span>
                  </div>
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap">{m.message}</p>
                </div>
              ))}
            </div>
          )}
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

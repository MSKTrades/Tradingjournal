import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Input, Label, Badge } from '../../lib/ui/form';
import { Button } from '../../lib/ui/button';
import { Link2, Lock, RefreshCw, Unlink } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { PRO_FEATURES } from '../../lib/proFeatures';

type ConnectionStatus = {
  connected: boolean;
  platform?: string;
  login?: string;
  server?: string;
  state?: string;
  connection_status?: string;
  last_synced_at?: string | null;
  refresh_error?: string;
};

type FormState = { login: string; server: string; password: string };

function emptyForm(): FormState {
  return { login: '', server: '', password: '' };
}

/** Renders inside AccountDialog (only for an existing account) — connects
 * this PipEcho account to a real MT5 broker account via IndexNano's
 * pay-as-you-go API so trades sync in instead of being typed by hand, and
 * shows/manages that connection once it exists. See api/accounts.ts's
 * mt_connect/mt_status/mt_sync/mt_disconnect and api/_indexnano.js for the
 * server side of this. MT4 isn't offered here — IndexNano is MT5-only; an
 * MT4 account still goes through CSV/statement import (ImportTradesDialog).
 *
 * Pro-gated, but deliberately NOT through ProLocked/hasProAccess like every
 * other Pro badge in this app — real subscription only (user?.plan ===
 * 'pro'), even during the free launch promo, because every connected
 * account costs PipEcho real money via IndexNano. See the PRO_FEATURES
 * .broker_connect message in proFeatures.ts and requireRealProPlan in
 * api/accounts.ts (the real, server-side enforcement this UI check mirrors -
 * a request that skipped this component entirely would still be rejected
 * there). */
export default function BrokerConnect({ accountId }: { accountId: number }) {
  const { user } = useAuth();
  const isRealPro = user?.plan === 'pro';

  if (!isRealPro) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-input p-3">
        <div className="flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
          <Label>Connect Broker</Label>
        </div>
        <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3">
          <Lock className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">{PRO_FEATURES.broker_connect.message}</p>
            <Link to="/billing" className="text-xs font-semibold text-primary hover:underline w-fit">
              Upgrade to Pro
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return <BrokerConnectForm accountId={accountId} />;
}

function BrokerConnectForm({ accountId }: { accountId: number }) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const data: ConnectionStatus = await api.get(`/accounts?resource=mt_status&account_id=${accountId}`);
      setStatus(data);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to check broker connection status');
    } finally {
      setLoadingStatus(false);
    }
  }, [accountId]);

  useEffect(() => { loadStatus(); }, [loadStatus]);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(p => ({ ...p, [k]: v }));
  }

  async function handleConnect() {
    setError(null);
    setConnecting(true);
    try {
      await api.post('/accounts', {
        resource: 'mt_connect',
        account_id: accountId,
        platform: 'mt5',
        login: form.login.trim(),
        server: form.server.trim(),
        password: form.password,
      });
      setForm(emptyForm());
      await loadStatus();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to connect broker account');
    } finally {
      setConnecting(false);
    }
  }

  async function handleSync() {
    setError(null);
    setSyncResult(null);
    setSyncing(true);
    try {
      const result: { synced: number } = await api.post('/accounts', { resource: 'mt_sync', account_id: accountId });
      setSyncResult(
        result.synced === 0
          ? 'No new closed trades to import.'
          : `Imported ${result.synced} closed trade${result.synced === 1 ? '' : 's'}.`
      );
      await loadStatus();
    } catch (e: any) {
      setError(e?.message ?? 'Sync failed');
    } finally {
      setSyncing(false);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect this broker account? Trades already imported stay in your journal — this only stops future syncing.')) return;
    setError(null);
    setDisconnecting(true);
    try {
      await api.post('/accounts', { resource: 'mt_disconnect', account_id: accountId });
      await loadStatus();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to disconnect');
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border border-input p-3">
      <div className="flex items-center gap-2">
        <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
        <Label>Connect Broker</Label>
      </div>

      {loadingStatus ? (
        <p className="text-xs text-muted-foreground">Checking connection…</p>
      ) : status?.connected ? (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground">
            <Badge variant="outline">{(status.platform ?? '').toUpperCase()}</Badge>
            <span>{status.login}</span>
            <span>·</span>
            <span>{status.server}</span>
            <Badge variant={status.state === 'deployed' ? 'default' : 'secondary'}>{status.state}</Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {status.last_synced_at ? `Last synced ${new Date(status.last_synced_at).toLocaleString()}` : 'Never synced yet'}
          </p>
          {status.refresh_error && (
            <p className="text-xs text-amber-500">Couldn't refresh live status just now ({status.refresh_error}) — showing the last known state.</p>
          )}
          {syncResult && <p className="text-xs text-foreground">{syncResult}</p>}
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={handleSync} disabled={syncing || disconnecting}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1 ${syncing ? 'animate-spin' : ''}`} /> {syncing ? 'Syncing…' : 'Sync Now'}
            </Button>
            <Button type="button" variant="outline" onClick={handleDisconnect} disabled={syncing || disconnecting}>
              <Unlink className="w-3.5 h-3.5 mr-1" /> {disconnecting ? 'Disconnecting…' : 'Disconnect'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-muted-foreground">
            Pull closed trades in automatically from a real MT5 account (FTMO, The5ers, or any other broker/prop firm
            running MT5) instead of typing them in by hand. Use your account's investor (read-only) password, never
            the master one — PipEcho passes it once to set up the connection and never stores it. MT4 accounts aren't
            supported here yet — use CSV/statement import instead. You can connect up to 2 broker accounts.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Login (account number)</Label>
              <Input value={form.login} onChange={(e) => set('login', e.target.value)} placeholder="e.g. 12345678" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Server</Label>
              <Input value={form.server} onChange={(e) => set('server', e.target.value)} placeholder="e.g. FTMO-Server" />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Investor Password</Label>
            <Input type="password" value={form.password} onChange={(e) => set('password', e.target.value)} placeholder="Read-only password" />
          </div>
          <Button
            type="button"
            onClick={handleConnect}
            disabled={connecting || !form.login.trim() || !form.server.trim() || !form.password}
          >
            {connecting ? 'Connecting…' : 'Connect'}
          </Button>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

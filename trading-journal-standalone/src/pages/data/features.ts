// The single list of "what PipEcho does," shared by the Landing page's
// Features grid, the header's Features mega-menu (MarketingChrome.tsx),
// and each feature's own detail page (FeatureDetail.tsx). Used to live
// inline in Landing.tsx - pulled out here once a second consumer
// (MarketingChrome) and a third (FeatureDetail) needed the exact same list,
// so there's one place to add/rename/reorder a feature instead of three.
//
// SMC Analysis is deliberately never listed here - it's restricted to a
// single internal account (see App.tsx's SmcGate) and was never meant to
// be marketed publicly.
import {
  BookOpen, History, TrendingUp, Settings2, ListChecks, AlertTriangle, Layers,
  RefreshCw, Landmark, Mail, Compass, Globe, type LucideIcon,
} from 'lucide-react';
import { ProFeatureKey } from '../../lib/proFeatures';

export type FeatureSummary = {
  icon: LucideIcon;
  title: string;
  desc: string;
  pro?: ProFeatureKey;
  // Marketing-side "not available yet" flag — the real gate is the
  // /backtest route itself (App.tsx renders BacktestComingSoon there
  // instead of the real Backtest page; see that file's own doc comment for
  // why). This just tells every place FEATURES gets rendered (this grid,
  // MarketingChrome's mega-menu, FeatureDetail) to show a "Coming soon"
  // badge instead of quietly listing it as already usable.
  comingSoon?: boolean;
};

export const FEATURES: FeatureSummary[] = [
  {
    icon: BookOpen,
    title: 'Trade Journal',
    desc: 'Log every trade with full context — entry/exit, R:R, screenshots, and notes — and let PipEcho compute your running equity curve automatically.',
  },
  {
    icon: History,
    title: 'Chart Replay & Backtesting',
    desc: 'Pull real historical candle data and step through it bar-by-bar to rehearse a strategy before risking live capital.',
    comingSoon: true,
  },
  {
    icon: TrendingUp,
    title: 'Performance Analytics',
    desc: 'Win rate, average R, profit factor, and breakdowns by session, day, and setup — see what\'s actually working.',
  },
  {
    icon: Settings2,
    title: 'Strategy Playbooks',
    desc: 'Define your setups once, then track how each one performs over time so you know which edges to keep and which to drop.',
  },
  {
    icon: ListChecks,
    title: 'Pre-Trade Checklists',
    desc: 'Enforce your own rules before every entry — a simple guardrail against revenge trading and FOMO.',
  },
  {
    icon: AlertTriangle,
    title: 'Risk Guardrail',
    desc: 'A live warning the moment a daily or weekly loss limit is breached — visible on your dashboard, not just in your head.',
  },
  {
    icon: RefreshCw,
    title: 'MT4/MT5 Auto-Sync',
    desc: 'Connect a real broker or prop-firm account with your read-only investor login and let closed trades import themselves — nothing typed by hand.',
  },
  {
    icon: Landmark,
    title: 'Prop Firm Ledger & Challenge Simulator',
    desc: 'Track challenge fees and payouts separately from trade P/L, and stress-test a rule set against your own history before you pay for an evaluation.',
  },
  {
    icon: Mail,
    title: 'Weekly Digest',
    desc: 'A standing recap of the week\'s trading — win rate, R, and what changed — without having to go dig for it yourself.',
    pro: 'weekly_digest',
  },
  {
    icon: Compass,
    title: 'HTF Bias Alignment',
    desc: 'See how often your entries actually agreed with the higher-timeframe bias, so you catch a fade-the-trend habit before it costs another month.',
  },
  {
    icon: Globe,
    title: 'Public Track Record',
    desc: 'A shareable, read-only results page for a prop firm or investor — no login required, and you control whether dollar amounts are shown.',
    pro: 'public_track_record',
  },
  {
    icon: Layers,
    title: 'Custom Fields & Tags',
    desc: 'Track the specific things your strategy cares about — confirmation candles, liquidity swept, session structure — without fighting a rigid template.',
  },
];

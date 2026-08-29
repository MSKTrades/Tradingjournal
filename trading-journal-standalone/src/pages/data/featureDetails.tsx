// The extended content for each feature's own detail page
// (FeatureDetail.tsx) - intro copy, "why it matters" highlights, and either
// a real screenshot (for the 3 features that already have one, taken for
// the Landing page) or a small interactive visual component (for every
// other feature - see featureVisuals.tsx). Keyed by the same slug
// featureSlug() derives from that feature's title in features.ts, so a
// renamed title needs its key updated here too or the detail page 404s.
import type { ReactNode } from 'react';
import {
  ChecklistVisual, RiskGuardrailVisual, SyncVisual, LedgerVisual, DigestVisual,
  HtfBiasVisual, TrackRecordVisual, CustomFieldsVisual, BacktestVisual,
} from '../ui/featureVisuals';

export type FeatureDetailContent = {
  intro: string;
  highlights: { title: string; desc: string }[];
  screenshot?: { src: string; alt: string };
  visual?: () => ReactNode;
  ctaHref: string;
  ctaLabel: string;
};

export const FEATURE_DETAILS: Record<string, FeatureDetailContent> = {
  'trade-journal': {
    intro: "The Trade Journal is where every trade actually lives — entry and exit, R:R, screenshots, and freeform notes, all in one row you can filter by asset, side, outcome, tag, or date range. PipEcho computes your running capital and gain/loss automatically the moment you save a trade, so you're never doing that math by hand or trusting a spreadsheet formula you wrote six months ago.",
    highlights: [
      { title: 'One row, full context', desc: 'Entry, exit, R:R, screenshots, and notes together — no more cross-referencing a chart screenshot against a separate spreadsheet row.' },
      { title: 'Capital tracked automatically', desc: 'Starting balance, running balance, and gain/loss per trade recompute themselves in the correct order every time you add, edit, or delete a trade.' },
      { title: 'Built to filter', desc: 'Slice by asset, side, outcome, tag, or date range right in the table — the same filters Performance and Summary use.' },
    ],
    screenshot: { src: '/screenshots/journal.png', alt: 'PipEcho Trade Journal table showing 150 logged trades with P/L, RR, and running capital' },
    ctaHref: '/demo/app/journal',
    ctaLabel: 'Try the Journal in the demo',
  },
  'chart-replay-backtesting': {
    intro: "Chart Replay & Backtesting pulls real historical candle data and lets you step through it bar-by-bar, so you can rehearse a setup — and see exactly where you would have entered, where you'd have been stopped out, and where it would have run — before a single dollar of live capital is at risk. Free accounts get up to 6 months of history; Pro gets unlimited.",
    highlights: [
      { title: 'Real historical candles', desc: 'Not a synthetic chart — the same kind of price data you\'d pull from TradingView, MT4/5, or Dukascopy, replayed bar by bar.' },
      { title: 'Rehearse before you risk', desc: 'Mark up a chart, place a hypothetical entry, and see how it would have actually played out — no live capital involved.' },
      { title: 'Free gets 6 months, Pro gets unlimited', desc: 'Chart Replay & Backtesting itself is free for every account — the history window is the only thing the Pro plan extends.' },
    ],
    visual: () => <BacktestVisual />,
    ctaHref: '/signup',
    ctaLabel: 'Sign up free to try it',
  },
  'performance-analytics': {
    intro: 'Performance Analytics turns your logged trades into the numbers that actually tell you whether your edge is real: win rate, average R, profit factor, expectancy, drawdown, and win/loss streaks — broken down by month, weekday, session, and hour of day, so you can see exactly where your edge is strongest and where it quietly falls apart.',
    highlights: [
      { title: 'Every angle you\'d want', desc: 'Monthly, yearly, day-of-week, session, and hour-of-day breakdowns, plus expectancy and consecutive win/loss streaks — computed from the same trades you already logged.' },
      { title: 'Drawdown, not just P/L', desc: 'A running equity curve and a real drawdown chart, including how many days you spent underwater — the number most journals skip entirely.' },
      { title: 'Filter it the same way as the Journal', desc: 'Asset, side, outcome, tag, and date-range filters carry across so a question you have in the Journal is one click from an answer here.' },
    ],
    screenshot: { src: '/screenshots/performance.png', alt: 'PipEcho Performance page showing profit factor, drawdown chart, and win/loss breakdown' },
    ctaHref: '/demo/app/performance',
    ctaLabel: 'Try Performance in the demo',
  },
  'strategy-playbooks': {
    intro: "A Strategy Playbook is a saved definition of a setup — the filter conditions that qualify a trade, which days and time window it applies to, and its take-profit rules — so PipEcho can tell you automatically how that exact setup has performed, instead of you manually re-sorting a spreadsheet every time you want to check.",
    highlights: [
      { title: 'Define it once', desc: 'Filter conditions (any numeric field or tag), days traded, a time window, and TP1/TP2 split rules — saved once, evaluated automatically forever after.' },
      { title: 'Results computed for you', desc: 'Total trades, win rate, total R, and profit factor for that exact rule set, updating the moment a qualifying trade is logged.' },
      { title: 'Scope it to one account or all', desc: 'A playbook can apply everywhere or be restricted to a specific trading account — useful the moment you\'re running more than one.' },
    ],
    screenshot: { src: '/screenshots/strategies.png', alt: 'PipEcho Strategies page showing two defined strategy playbooks with filter rules' },
    ctaHref: '/demo/app/strategies',
    ctaLabel: 'Try Strategies in the demo',
  },
  'pre-trade-checklists': {
    intro: "Pre-Trade Checklists are your own rules, made impossible to quietly skip. Define a rule set for a setup — swept liquidity, confirmed structure, risk sized correctly — and grade any trade against it after the fact, so \"I know I should follow my rules\" turns into an actual, visible follow-rate number.",
    highlights: [
      { title: 'Your rules, not a generic template', desc: 'Write the exact checklist your own setup needs — as many rule sets as you want, each scoped to one account or all of them.' },
      { title: 'A real follow-rate number', desc: 'Checklist Compliance on the Summary page shows exactly how often each rule was actually followed, and how trades that followed every rule performed versus ones that didn\'t.' },
      { title: 'The honest kind of guardrail', desc: 'It won\'t stop you from placing a trade that breaks your own rules — but it will make sure you can never pretend you didn\'t.' },
    ],
    visual: () => <ChecklistVisual />,
    ctaHref: '/demo/app/checklists',
    ctaLabel: 'Try Checklists in the demo',
  },
  'risk-guardrail': {
    intro: "Risk Guardrail keeps your daily loss limit, max drawdown limit, and consistency rule visible on your dashboard at all times — not filed away in a prop firm's PDF you read once during onboarding. The moment a limit is reached, the gauge turns a deliberately unmissable dark orange.",
    highlights: [
      { title: 'Three limits, one glance', desc: 'Daily loss, max drawdown, and a consistency rule (no single day being too large a share of total profit) — all live on the Summary page.' },
      { title: 'A warning, not a lockout', desc: 'PipEcho never blocks a trade — the point is making sure a limit you\'ve already reached is something you actually see before placing the next one.' },
      { title: 'Set once per account', desc: 'Limits are configured per trading account, so a real account and a challenge account can carry completely different rules.' },
    ],
    visual: () => <RiskGuardrailVisual />,
    ctaHref: '/demo/app',
    ctaLabel: 'Try it in the demo',
  },
  'mt4-mt5-auto-sync': {
    intro: "MT4/MT5 Auto-Sync connects a real broker or prop-firm account using your read-only investor login, and pulls closed trades in automatically — no re-typing entries by hand, no copy-pasting a broker statement. PipEcho never stores your raw investor password.",
    highlights: [
      { title: 'Read-only, on purpose', desc: 'Your investor (read-only) login is all it ever asks for — there\'s no way for a sync connection to place or modify a trade on your account.' },
      { title: 'Works with any MT4/MT5 broker', desc: 'FTMO, The5ers, or any other prop firm or broker running MetaTrader — if it supports an investor login, it can sync.' },
      { title: 'Disconnect any time', desc: 'Already-imported trades stay in your journal if you disconnect — turning sync off only stops future trades from pulling in.' },
    ],
    visual: () => <SyncVisual />,
    ctaHref: '/signup',
    ctaLabel: 'Sign up to connect a broker',
  },
  'prop-firm-ledger-challenge-simulator': {
    intro: "The Prop Firm Ledger tracks challenge fees paid and payouts received as their own running total — completely separate from per-trade P/L, so \"am I actually ahead once I count what I paid to get here\" has a real answer. The Challenge Simulator lets you stress-test a rule set against your own trading history before you pay for an evaluation.",
    highlights: [
      { title: 'Fees and payouts, tracked honestly', desc: 'A simple running ledger on the Summary page — what you\'ve paid in, what you\'ve gotten back, and the net.' },
      { title: 'Test a rule set before you buy it', desc: 'Run a challenge\'s daily-loss, max-drawdown, and profit-target rules against trades you\'ve already logged to see if your current approach would actually pass.' },
      { title: 'No firm\'s rules hardcoded as gospel', desc: 'You enter the numbers for the rule set you\'re considering — PipEcho doesn\'t assume any one prop firm\'s current terms.' },
    ],
    visual: () => <LedgerVisual />,
    ctaHref: '/demo/app',
    ctaLabel: 'Try the ledger in the demo',
  },
  'weekly-digest': {
    intro: "Weekly Digest is a standing recap of the week that just happened — trades taken, win rate, total R, and what changed versus the week before — so you get the summary without having to go dig through the Journal and Performance pages yourself every Sunday night.",
    highlights: [
      { title: 'Delivered, not fetched', desc: 'Shows up right on the Summary page the moment a new week starts — nothing to remember to go check.' },
      { title: 'What changed, not just what happened', desc: 'Called out against the prior week, so a slump or a hot streak is obvious at a glance instead of buried in raw numbers.' },
      { title: 'A Pro feature', desc: 'Free for every account during the launch promo — afterward it\'s part of the Pro plan.' },
    ],
    visual: () => <DigestVisual />,
    ctaHref: '/demo/app',
    ctaLabel: 'See it in the demo',
  },
  'htf-bias-alignment': {
    intro: "HTF Bias Alignment cross-references your higher-timeframe read (tagged per trade) against the direction you actually traded, and shows you the win rate for each. It answers a specific, uncomfortable question directly: do you actually do better trading with your own HTF bias, or against it?",
    highlights: [
      { title: 'Three honest buckets', desc: 'With your bias, against it, or neutral — every trade lands in exactly one, based on its own tags and direction.' },
      { title: 'A pattern you can act on', desc: 'If trading against your own bias is quietly costing you 15 points of win rate, this is where that becomes impossible to ignore.' },
      { title: 'A Pro feature', desc: 'Free for every account during the launch promo — afterward it\'s part of the Pro plan.' },
    ],
    visual: () => <HtfBiasVisual />,
    ctaHref: '/demo/app',
    ctaLabel: 'See it in the demo',
  },
  'public-track-record': {
    intro: "Public Track Record generates a shareable, read-only results page — no PipEcho login required — for a prop firm, investor, or anyone else who wants to see your actual results. You control whether dollar amounts are shown or the page only reveals percentages.",
    highlights: [
      { title: 'A link, not an export', desc: 'One URL that always reflects your current results — no re-exporting a PDF every time someone asks for an update.' },
      { title: 'You control what\'s visible', desc: 'Toggle whether real dollar amounts show, or keep the page to percentages and ratios only.' },
      { title: 'Regenerate any time', desc: 'If a link\'s been shared somewhere you no longer want it, regenerate the token and the old link stops working immediately.' },
    ],
    visual: () => <TrackRecordVisual />,
    ctaHref: '/signup',
    ctaLabel: 'Sign up to create your page',
  },
  'custom-fields-tags': {
    intro: "Custom Fields & Tags let you track the specific things your own strategy actually cares about — a confirmation candle size, liquidity swept, session structure, whatever it is — without fighting a rigid template built for someone else's setup. Add a field once and it's available everywhere: the Journal table, strategy filter conditions, and Performance breakdowns.",
    highlights: [
      { title: 'No support ticket required', desc: 'Add a new numeric or text field from the Journal in seconds — it\'s immediately usable as a strategy filter condition too.' },
      { title: 'Tags and tag groups', desc: 'Flat tags for quick labeling, or grouped options (like an "HTF Bias" group with Bullish/Bearish/Neutral) when a field has a fixed set of choices.' },
      { title: 'Scoped how you need it', desc: 'A field can apply to one trading account or every account you have — matching how differently you might track a challenge account versus a live one.' },
    ],
    visual: () => <CustomFieldsVisual />,
    ctaHref: '/demo/app/journal',
    ctaLabel: 'Try it in the demo',
  },
};

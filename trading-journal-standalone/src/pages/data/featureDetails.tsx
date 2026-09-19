// The extended content for each feature's own detail page
// (FeatureDetail.tsx) - lead-in copy, a "how it works" walkthrough, a
// concrete worked example, "why it matters" highlights, and a carousel of
// slides (real product screenshots and/or one of featureVisuals.tsx's
// small interactive widgets). Keyed by the same slug featureSlug() derives
// from that feature's title in features.ts, so a renamed title needs its
// key updated here too or the detail page 404s.
//
// Every feature page carries real screenshots where the feature has a real
// page to screenshot (captured straight from the actual demo app, not
// mockups), paired with a genuinely interactive widget where one exists -
// see FeatureCarousel.tsx and featureVisuals.tsx's own header comment for
// why both together rather than either alone. Two features (Chart Replay,
// MT4/5 Auto-Sync/Connect Broker) don't have a real page to screenshot yet
// - the first isn't built, the second needs a live broker login the demo
// can't provide - so those stay widget-only until that changes.
import type { ReactNode } from 'react';
import {
  ChecklistVisual, RiskGuardrailVisual, SyncVisual, LedgerVisual, DigestVisual,
  HtfBiasVisual, TrackRecordVisual, CustomFieldsVisual, BacktestVisual,
} from '../ui/featureVisuals';
import type { FeatureSlide } from '../ui/FeatureCarousel';

export type FeatureDetailContent = {
  /** Opening paragraph, shown directly under the hero. */
  intro: string;
  /** Additional paragraphs of body copy, shown after the carousel - this is
   * the "more text, with examples" material: what problem this actually
   * solves day to day, not just what it technically does. */
  body: string[];
  /** A short numbered walkthrough of the feature in use. */
  howItWorks: { title: string; desc: string }[];
  /** One concrete, worked example grounded in a real SMC/ICT-style trading
   * scenario - PipEcho's actual target audience - so a visitor sees exactly
   * how this plays out rather than an abstract capability list. */
  example: { title: string; text: string };
  highlights: { title: string; desc: string }[];
  slides: FeatureSlide[];
  ctaHref: string;
  ctaLabel: string;
};

export const FEATURE_DETAILS: Record<string, FeatureDetailContent> = {
  'trade-journal': {
    intro: "The Trade Journal is where every trade actually lives — entry and exit, R:R, screenshots, and freeform notes, all in one row you can filter by asset, side, outcome, tag, or date range. PipEcho computes your running capital and gain/loss automatically the moment you save a trade, so you're never doing that math by hand or trusting a spreadsheet formula you wrote six months ago and haven't looked at since.",
    body: [
      "Most traders don't stop journaling because they lack discipline — they stop because the friction is too high. A spreadsheet needs a new formula every time you add a column; a notebook can't be filtered at all. The Journal is built around the opposite bet: logging a trade should take under a minute, and everything else — running balance, win/loss tagging, R multiple, profit factor inputs — should already be sitting there waiting the next time you open Performance or a Strategy Playbook.",
      "Every column is also a filter. That's the detail that makes the rest of PipEcho work: the same Assets/Side/Outcome/Tag/Date-range controls you use to sanity-check your own history are exactly what a Strategy Playbook uses behind the scenes to grade a setup, and what Performance uses to break results out by session or day. Learn the Journal's filters once and you already know how three other pages work.",
      "Import 70 trades from a CSV, an MT4/5 statement, or type them in one at a time — the table doesn't care which. Screenshots attach per trade, so a chart snapshot of the actual entry lives next to the number, not in a separate folder you'll lose track of by month two.",
    ],
    howItWorks: [
      { title: 'Log the trade', desc: 'Entry, exit, R:R, a screenshot, and a note — add it by hand, or bring a batch in from a CSV/MT4-5 export.' },
      { title: 'PipEcho does the math', desc: 'Running capital, gain/loss, and win/loss/breakeven all recompute instantly, in the correct order, every time a trade is added, edited, or deleted.' },
      { title: 'Filter to answer a question', desc: 'Asset, side, outcome, tag, or date range — the same table, sliced however the question in your head actually needs it sliced.' },
      { title: 'Everything downstream updates', desc: 'Performance, Strategy Playbooks, and Checklist Compliance all read from these same rows — log it once, use it everywhere.' },
    ],
    example: {
      title: 'In practice: a 70-trade London Reversal history',
      text: "Say you've logged 70 GBPUSD trades under a London Reversal tag — the screenshot below is a real one, not a mockup. Total P/L, win rate, and profit factor sit at the top of the table before you filter anything. Now say you want to know whether the setup actually needs the full Asia-sweep confirmation, or whether that's just a rule you added early on and never tested. Filter the Journal to \"Tag: London Reversal\" and \"Sub Tag: Asia Sweep Confirmed\" versus its inverse, and the win rate difference between the two groups is sitting right there — no pivot table, no manual re-count.",
    },
    highlights: [
      { title: 'One row, full context', desc: 'Entry, exit, R:R, screenshots, and notes together — no more cross-referencing a chart screenshot against a separate spreadsheet row.' },
      { title: 'Capital tracked automatically', desc: 'Starting balance, running balance, and gain/loss per trade recompute themselves in the correct order every time you add, edit, or delete a trade.' },
      { title: 'Built to filter', desc: 'Slice by asset, side, outcome, tag, or date range right in the table — the same filters Performance and Summary use.' },
    ],
    slides: [
      { kind: 'image', src: '/screenshots/journal.png', alt: 'PipEcho Trade Journal table showing 150 logged trades with P/L, RR, and running capital', caption: 'Every trade logged with full context — entry, exit, R:R, and notes in one filterable row.' },
      { kind: 'image', src: '/screenshots/journal-rows.png', alt: 'Close-up of Trade Journal rows showing per-trade P/L, RR, and running capital across 70 trades', caption: '70 trades in, and the running-capital column is still just math PipEcho does for you.' },
    ],
    ctaHref: '/demo/app/journal',
    ctaLabel: 'Try the Journal in the demo',
  },

  'chart-replay-backtesting': {
    intro: "Still being built — not available in the app yet, so here's what it'll do once it ships: pull real historical candle data and let you step through it bar-by-bar, so you can rehearse a setup and see exactly where you would have entered, where you'd have been stopped out, and where it would have run — before a single dollar of live capital is at risk.",
    body: [
      "Backtesting by scrolling a static chart has a quiet flaw: your eye already knows what happens next, so every entry looks obvious in hindsight. Bar-by-bar replay is the fix — the chart only reveals what a live trader would have actually seen at that moment, which is the only way a backtest result means anything.",
      "The plan is real historical candles (the same kind of price data you'd pull from TradingView, MT4/5, or Dukascopy), not a synthetic approximation, replayed at a pace you control. Free accounts will get up to 6 months of history to test against; Pro extends that to unlimited — Chart Replay & Backtesting itself will be free for every account once it ships, the history window is the only thing the Pro plan adds.",
      "Once it's live, a completed replay session will be able to save directly into the Journal as a logged trade — so a backtested setup and a live one sit in the exact same table, gradeable by the exact same Strategy Playbook.",
    ],
    howItWorks: [
      { title: 'Pick a pair and a starting point', desc: 'Real historical candle data, loaded from whatever point in the past you want to rehearse against.' },
      { title: 'Step forward bar by bar', desc: 'Advance one candle at a time — no peeking at what happens next, the same information a live trader would have had.' },
      { title: 'Mark a hypothetical entry', desc: 'Place where you would have entered and where you\'d have been stopped out, and watch it play out in real price action.' },
      { title: 'Log the result', desc: 'A finished replay session will save into the Journal like any other trade, so it\'s gradeable by a Strategy Playbook the same way.' },
    ],
    example: {
      title: 'Why this matters for a setup like London Reversal',
      text: "A strategy that depends on session timing — like waiting for an Asia liquidity sweep before a London entry — is exactly the kind of setup a static chart backtest quietly lies about, because it's easy to eyeball \"yes, that was the sweep\" once you already know price reversed afterward. Bar-by-bar replay removes that hindsight: you only see what's already printed, so a session-based rule actually gets tested under the same blind conditions it'll face live.",
    },
    highlights: [
      { title: 'Real historical candles', desc: 'Not a synthetic chart — the same kind of price data you\'d pull from TradingView, MT4/5, or Dukascopy, replayed bar by bar.' },
      { title: 'Rehearse before you risk', desc: 'Mark up a chart, place a hypothetical entry, and see how it would have actually played out — no live capital involved.' },
      { title: 'Free gets 6 months, Pro gets unlimited', desc: 'Chart Replay & Backtesting itself will be free for every account — the history window will be the only thing the Pro plan extends.' },
    ],
    slides: [
      { kind: 'component', render: () => <BacktestVisual />, caption: "A preview of the replay control once it ships — this feature isn't live in the app yet." },
    ],
    ctaHref: '/signup',
    ctaLabel: 'Sign up free for early access',
  },

  'performance-analytics': {
    intro: 'Performance Analytics turns your logged trades into the numbers that actually tell you whether your edge is real: win rate, average R, profit factor, expectancy, drawdown, and win/loss streaks — broken down by month, weekday, session, and hour of day, so you can see exactly where your edge is strongest and where it quietly falls apart.',
    body: [
      "A win rate on its own is close to meaningless — 40% wins with a 3R average winner beats 60% wins with a 0.8R average winner every time, and most traders never actually compute that comparison for their own history. Performance does it automatically: expectancy, profit factor, and the full winners-versus-losers breakdown (best win, average win, max consecutive wins, and the same three for losses) sit on the page the moment you have trades logged.",
      "The equity curve isn't just a P/L line — it's the same running-capital math the Journal already computes, charted, with a real drawdown reading: how far below peak equity you are right now, and how many days you've spent underwater. That second number is the one most journals skip entirely, and it's often the more honest read on how a strategy is actually holding up.",
      "Every breakdown here inherits the Journal's filters, so a question that starts in the Journal — \"how did GBPUSD shorts do specifically\" — is one click away from its Performance answer, not a re-export into a different tool.",
    ],
    howItWorks: [
      { title: 'Trades feed in automatically', desc: 'Nothing to configure — every trade logged in the Journal already has everything Performance needs to compute from.' },
      { title: 'Pick a breakdown', desc: 'Month, weekday, session, or hour of day — the same underlying numbers, sliced along whichever axis answers your actual question.' },
      { title: 'Read expectancy and profit factor together', desc: 'Win rate alone hides too much — expectancy (average $ per trade) and profit factor (gross win ÷ gross loss) are what actually separate a real edge from a lucky streak.' },
      { title: 'Watch the equity curve and drawdown', desc: 'A running balance chart plus days-underwater, so a losing stretch is something you see developing, not something you notice three weeks late.' },
    ],
    example: {
      title: 'In practice: finding the session that\'s actually costing you',
      text: "Take the 70-trade history in the screenshot below — a 2.82 profit factor and a $17,121 running balance overall look healthy. But that's an average across every session traded. Filter to \"Session: New York\" alone and it's common to find the number quietly drops below 1.0 — meaning the New York-session trades are, on their own, a net loser dragging down an otherwise strong London-session edge. That's not a finding a single blended win-rate number could ever have surfaced.",
    },
    highlights: [
      { title: 'Every angle you\'d want', desc: 'Monthly, yearly, day-of-week, session, and hour-of-day breakdowns, plus expectancy and consecutive win/loss streaks — computed from the same trades you already logged.' },
      { title: 'Drawdown, not just P/L', desc: 'A running equity curve and a real drawdown chart, including how many days you spent underwater — the number most journals skip entirely.' },
      { title: 'Filter it the same way as the Journal', desc: 'Asset, side, outcome, tag, and date-range filters carry across so a question you have in the Journal is one click from an answer here.' },
    ],
    slides: [
      { kind: 'image', src: '/screenshots/performance.png', alt: 'PipEcho Performance page showing profit factor, drawdown chart, and win/loss breakdown', caption: 'Win rate, profit factor, expectancy, and a full winners/losers breakdown — computed automatically.' },
      { kind: 'image', src: '/screenshots/performance-equity-curve.png', alt: 'PipEcho account balance equity curve chart climbing from $9,800 to $17,121 over 70 trades', caption: "The same running capital as the Journal, charted — so a drawdown is something you see, not something you reconstruct from memory." },
    ],
    ctaHref: '/demo/app/performance',
    ctaLabel: 'Try Performance in the demo',
  },

  'strategy-playbooks': {
    intro: "A Strategy Playbook is a saved definition of a setup — the filter conditions that qualify a trade, which days and time window it applies to, and its take-profit rules — so PipEcho can tell you automatically how that exact setup has performed, instead of you manually re-sorting a spreadsheet every time you want to check.",
    body: [
      "Most traders can describe their setup in a sentence but have never actually measured it, because measuring it means re-filtering a spreadsheet by hand every single time — so it doesn't happen, and the setup stays a belief instead of a tested rule. A Playbook exists to make that measurement free: define the rule once, and its total trades, win rate, total R, and profit factor update themselves the moment a qualifying trade gets logged.",
      "You can run more than one Playbook against the same underlying setup to test a single variable in isolation — the screenshot below shows exactly that: three separate London Reversal playbooks, identical entry logic, differing only in take-profit rule (a 1:3/1:5 split, a flat 1:2, and a flat 1:3). That's the direct answer to \"should I be taking partials or letting it run,\" computed from your own trade history instead of guessed at.",
      "A Playbook can also be scoped to one trading account or applied across all of them — useful the moment you're running a live account and a prop-firm challenge side by side and don't want one account's results quietly blending into the other's numbers.",
    ],
    howItWorks: [
      { title: 'Define the setup once', desc: 'Filter conditions on any numeric field or tag, which days it applies to, an optional time window, and its TP1/TP2 split rules.' },
      { title: 'Scope it', desc: 'Apply the playbook everywhere, or restrict it to a single trading account — a live account and a challenge account don\'t have to share results.' },
      { title: 'Trades qualify automatically', desc: 'Every trade in the Journal that matches the filter conditions counts toward the playbook — nothing to manually tag twice.' },
      { title: 'Read the results', desc: 'Total trades, win rate, total R, and profit factor for that exact rule set, recalculated the instant a qualifying trade is logged.' },
    ],
    example: {
      title: 'In practice: testing three exits against one setup',
      text: "The three playbooks below all use the identical filter (Risk:Reward ≥ 0, all days, all accounts) — the only thing that changes between them is the take-profit rule. \"London Reversal\" splits 50% off at 1:3 and lets the rest run to 1:5. \"London Reversal TP 1:2\" takes the full position off at a flat 1:2. \"London Reversal TP 1:3\" holds for a flat 1:3. Run all three against the same 70-trade history and you get a direct, apples-to-apples answer to \"am I leaving R on the table by taking profit too early\" — not a guess, a number.",
    },
    highlights: [
      { title: 'Define it once', desc: 'Filter conditions (any numeric field or tag), days traded, a time window, and TP1/TP2 split rules — saved once, evaluated automatically forever after.' },
      { title: 'Results computed for you', desc: 'Total trades, win rate, total R, and profit factor for that exact rule set, updating the moment a qualifying trade is logged.' },
      { title: 'Scope it to one account or all', desc: 'A playbook can apply everywhere or be restricted to a specific trading account — useful the moment you\'re running more than one.' },
    ],
    slides: [
      { kind: 'image', src: '/screenshots/strategies.png', alt: 'PipEcho Strategies page showing two defined strategy playbooks with filter rules', caption: 'Two saved playbooks for the same setup, each testing a different take-profit rule.' },
      { kind: 'image', src: '/screenshots/strategies-card.png', alt: 'Close-up of one PipEcho Strategy Playbook card showing filter conditions and take-profit rules', caption: 'One playbook, expanded — filter conditions, days traded, and TP rules, graded automatically.' },
    ],
    ctaHref: '/demo/app/strategies',
    ctaLabel: 'Try Strategies in the demo',
  },

  'pre-trade-checklists': {
    intro: "Pre-Trade Checklists are your own rules, made impossible to quietly skip. Define a rule set for a setup — swept liquidity, confirmed structure, risk sized correctly — and grade any trade against it after the fact, so \"I know I should follow my rules\" turns into an actual, visible follow-rate number.",
    body: [
      "Every discretionary trader has a version of the same rule list in their head, and almost nobody actually tracks how often they follow it — which means the moment that matters most, a slow news morning, a revenge-trade itch after two losses, is exactly the moment the rule gets skipped without anyone noticing it happened. A checklist that lives only in your memory can't catch that. One that lives in the app, gets graded per trade, and rolls up into a real compliance percentage can.",
      "You're not limited to one checklist. A \"Daily Routine\" list (pairs scanned, daily bias, anything worth remembering before the session opens) is a different kind of checklist from a per-setup \"Pre-Trade\" rule set with hard entry conditions — PipEcho supports both, and as many as you need, each scoped to one account or all of them.",
      "Checklist Compliance then shows up on the Summary page as a real number: how often each rule was actually followed, and — the part that changes behavior — how trades that followed every rule performed against ones that didn't. Seeing your own win rate split by \"followed the checklist\" versus \"didn't\" is a very different kind of motivating than a general reminder to be disciplined.",
    ],
    howItWorks: [
      { title: 'Write the rule set', desc: 'The exact checklist your setup needs — as many rules as it takes, as many checklists as you want, each scoped to one account or all of them.' },
      { title: 'Grade a trade against it', desc: 'After placing (or logging) a trade, check off which rules were actually followed — takes seconds, and there\'s no wrong answer, only an honest one.' },
      { title: 'Compliance rolls up automatically', desc: 'The Summary page\'s Checklist Compliance card tracks your real follow-rate over time, not just for one trade.' },
      { title: 'See the performance split', desc: 'Trades that followed every rule versus ones that didn\'t, compared side by side — this is where the number stops being abstract.' },
    ],
    example: {
      title: 'In practice: two checklists, two different jobs',
      text: "The screenshot below shows exactly this split: a \"Daily Routine\" checklist for what gets checked before the session even opens, sitting alongside a \"London Reversal Pre-Trade\" checklist with four hard entry rules — confirmed BOS on the 15m, Asia session liquidity swept, risking 1% or less, and a red-folder news check. Grade a trade against the second list every time you take a London Reversal entry, and after a month you have a real, specific answer to \"is skipping the news check actually costing me,\" instead of a feeling about it.",
    },
    highlights: [
      { title: 'Your rules, not a generic template', desc: 'Write the exact checklist your own setup needs — as many rule sets as you want, each scoped to one account or all of them.' },
      { title: 'A real follow-rate number', desc: 'Checklist Compliance on the Summary page shows exactly how often each rule was actually followed, and how trades that followed every rule performed versus ones that didn\'t.' },
      { title: 'The honest kind of guardrail', desc: 'It won\'t stop you from placing a trade that breaks your own rules — but it will make sure you can never pretend you didn\'t.' },
    ],
    slides: [
      { kind: 'component', render: () => <ChecklistVisual />, caption: 'Click a rule to toggle it — this is exactly how grading a trade against a checklist feels in the app.' },
      { kind: 'image', src: '/screenshots/checklists.png', alt: 'PipEcho Checklists page showing a Daily Routine checklist and a London Reversal Pre-Trade checklist with four rules', caption: 'Two real checklists — a daily routine and a per-setup pre-trade rule set, each with its own rules.' },
    ],
    ctaHref: '/demo/app/checklists',
    ctaLabel: 'Try Checklists in the demo',
  },

  'risk-guardrail': {
    intro: "Risk Guardrail keeps your daily loss limit, max drawdown limit, and consistency rule visible on your dashboard at all times — not filed away in a prop firm's PDF you read once during onboarding. The moment a limit is reached, the gauge turns a deliberately unmissable dark orange.",
    body: [
      "Every prop firm challenge and most personal risk plans share the same failure mode: the limit is written down somewhere, everyone agrees to it in the abstract, and then it gets blown through anyway on the one day it actually mattered — not from ignorance, but because nothing was actually in front of the trader's eyes in the moment. A rule that only exists in a document you read once isn't a guardrail, it's a memory test.",
      "Risk Guardrail keeps daily loss and max drawdown as live bars on the Summary page, the same page you already open every session, with the exact dollar amount used and remaining spelled out underneath. Nothing is hidden behind a settings menu you have to remember to check.",
      "It's a warning, not a lockout — PipEcho will never block you from placing a trade. The point isn't to take the decision out of your hands, it's to make sure that when you make it, you're making it with the actual number in front of you instead of a rough sense of \"I think I'm still okay today.\"",
    ],
    howItWorks: [
      { title: 'Set your limits once per account', desc: 'Daily loss, max drawdown, and a consistency rule (no single day too large a share of total profit) — configured per trading account.' },
      { title: 'It tracks live, automatically', desc: 'Every trade you log updates the day\'s and account\'s totals against those limits — nothing to manually recalculate.' },
      { title: 'Color signals distance to the limit', desc: 'Green, yellow, orange, and a deliberately unmissable dark orange once a limit is actually reached.' },
      { title: 'You decide what happens next', desc: 'PipEcho surfaces the breach clearly; it never blocks a trade — the decision stays yours, made with the real number in view.' },
    ],
    example: {
      title: 'In practice: a $10,000 account with real room to spare',
      text: "The screenshot below is a genuine account state: $0 of a $500 daily loss limit used, and $217 of a $1,000 max-drawdown limit used — 22%, still solidly green. That's the state you want to glance at and move on from in two seconds. The value is on the day it isn't green — a string of three losses that pushes daily loss past 75% is exactly the moment a trader most wants to \"just take one more to get it back,\" and exactly the moment this bar is designed to be impossible to miss.",
    },
    highlights: [
      { title: 'Three limits, one glance', desc: 'Daily loss, max drawdown, and a consistency rule (no single day being too large a share of total profit) — all live on the Summary page.' },
      { title: 'A warning, not a lockout', desc: 'PipEcho never blocks a trade — the point is making sure a limit you\'ve already reached is something you actually see before placing the next one.' },
      { title: 'Set once per account', desc: 'Limits are configured per trading account, so a real account and a challenge account can carry completely different rules.' },
    ],
    slides: [
      { kind: 'image', src: '/screenshots/risk-guardrail-real.png', alt: 'PipEcho Risk Guardrail card showing 0% daily loss used and 22% max drawdown used for a $10,000 account', caption: 'Daily loss and max drawdown, both live on the Summary page for this account.' },
      { kind: 'component', render: () => <RiskGuardrailVisual />, caption: 'Drag to simulate a losing day and watch the bar change color in real time.' },
    ],
    ctaHref: '/demo/app',
    ctaLabel: 'Try it in the demo',
  },

  'mt4-mt5-auto-sync': {
    intro: "MT4/MT5 Auto-Sync connects a real broker or prop-firm account using your read-only investor login, and pulls closed trades in automatically — no re-typing entries by hand, no copy-pasting a broker statement. PipEcho never stores your raw investor password.",
    body: [
      "Manually re-typing a broker statement into a journal is exactly the kind of tedious, error-prone step that quietly causes people to stop journaling three weeks in — a missed row, a fat-fingered price, a week you just didn't get around to. Auto-sync exists to remove that step entirely: connect once, and every closed trade after that shows up in the Journal on its own.",
      "This is a Pro feature and, deliberately, one that stays Pro-only even during PipEcho's free launch promo — unlike every other Pro feature on this site, a live broker connection costs PipEcho real money per connected account, so it's the one place a genuinely paid subscription is required rather than opened up for everyone. Pro accounts can connect up to 2 broker accounts.",
      "In the meantime — and as a permanently supported option even after auto-sync ships — CSV and MT4/5 statement import covers the same need: export your closed trades and bring them into the Journal in one batch, without hand-typing a single row.",
    ],
    howItWorks: [
      { title: 'Enter your investor login', desc: 'The read-only login your broker or prop firm issues alongside your trading login — the same one they give you specifically because it can\'t place or modify trades.' },
      { title: 'PipEcho connects, never stores the password', desc: 'Your credentials are used once, to establish the connection — after that, only a connection reference is kept, never the raw password.' },
      { title: 'Closed trades sync in', desc: 'Trigger a sync and every closed position pulls into the Journal automatically, mapped into the same rows a manually-logged trade would use.' },
      { title: 'Already-imported trades are yours to keep', desc: 'Disconnecting only stops future trades from syncing — everything already imported stays exactly where it is.' },
    ],
    example: {
      title: 'Why read-only matters here specifically',
      text: "A trading journal asking for your broker credentials is a legitimate thing to be cautious about — which is exactly why this only ever asks for the investor (read-only) login, never the trading login that could place or modify a position. If a sync connection were ever compromised, there is no possible action it could take on the account beyond reading history that's already closed. That's not a policy PipEcho promises to follow; it's what the credential type itself makes physically possible.",
    },
    highlights: [
      { title: 'Read-only, on purpose', desc: 'Your investor (read-only) login is all it ever asks for — there\'s no way for a sync connection to place or modify a trade on your account.' },
      { title: 'Works with any MT5 broker', desc: 'FTMO, The5ers, or any other prop firm or broker running MetaTrader 5 — if it supports an investor login, it can sync.' },
      { title: 'A capped Pro feature', desc: 'Up to 2 connected broker accounts per Pro subscriber — and unlike every other Pro feature, it\'s not opened up during the free promo, since a live connection costs PipEcho real money to run.' },
    ],
    slides: [
      { kind: 'component', render: () => <SyncVisual />, caption: 'Click "Sync now" to see closed trades pull in automatically — this is what a sync feels like.' },
    ],
    ctaHref: '/signup',
    ctaLabel: 'Sign up to connect a broker',
  },

  'prop-firm-ledger-challenge-simulator': {
    intro: "The Prop Firm Ledger tracks challenge fees paid and payouts received as their own running total — completely separate from per-trade P/L, so \"am I actually ahead once I count what I paid to get here\" has a real answer. The Challenge Simulator lets you stress-test a rule set against your own trading history before you pay for an evaluation.",
    body: [
      "Trade P/L and challenge economics are two different questions that get blurred together constantly. A trader can be genuinely profitable inside a challenge — green day after green day in the Journal — while still being net negative overall once phase fees, resets, and a still-unpaid first payout are counted. The Ledger exists specifically to keep those two numbers honest and separate: trade performance lives in the Journal and Performance pages, challenge economics live here.",
      "Every fee and payout is its own line item, with a note, so \"what did I actually pay to get this funded account, and what have I gotten back so far\" is a number you can read at a glance instead of reconstructing from bank statements and old emails months later.",
      "The Challenge Simulator side of this answers a question before you spend money on it: given a firm's actual daily-loss, max-drawdown, and profit-target rules, would your trading history — the one already sitting in your Journal — have passed? PipEcho doesn't hardcode any one firm's current terms as gospel, since those change; you enter the specific numbers for the challenge you're considering and test against your own real results.",
    ],
    howItWorks: [
      { title: 'Log fees and payouts as they happen', desc: 'A challenge fee, a reset cost, a profit split payout — each one added as its own line item with a note.' },
      { title: 'See the net position', desc: 'Total fees paid, total payouts received, and the net — updated automatically as new lines are added.' },
      { title: 'Enter a challenge\'s rules to simulate it', desc: 'Daily-loss limit, max drawdown, and profit target for the specific firm and challenge type you\'re considering.' },
      { title: 'Test it against your real history', desc: 'The simulator checks your own logged trades against those rules — a real pass/fail read before you pay for the actual evaluation.' },
    ],
    example: {
      title: 'In practice: a real ledger with a real net',
      text: "The screenshot below is a genuine ledger state: a $99 Phase 1 fee paid in June, an $850 first profit-split payout in August, and a $620 second payout in September — net position, $1,371 positive. That single number answers the question a raw trade P/L never could: yes, the challenge has actually paid for itself and then some, not just \"the trades have been green lately.\"",
    },
    highlights: [
      { title: 'Fees and payouts, tracked honestly', desc: 'A simple running ledger on the Summary page — what you\'ve paid in, what you\'ve gotten back, and the net.' },
      { title: 'Test a rule set before you buy it', desc: 'Run a challenge\'s daily-loss, max-drawdown, and profit-target rules against trades you\'ve already logged to see if your current approach would actually pass.' },
      { title: 'No firm\'s rules hardcoded as gospel', desc: 'You enter the numbers for the rule set you\'re considering — PipEcho doesn\'t assume any one prop firm\'s current terms.' },
    ],
    slides: [
      { kind: 'image', src: '/screenshots/prop-ledger-real.png', alt: 'PipEcho Prop P&L ledger showing $99 in fees paid, $1,470 in payouts received, and a $1,371 net position', caption: 'Fees and payouts tracked as their own running ledger — separate from per-trade P/L.' },
      { kind: 'component', render: () => <LedgerVisual />, caption: 'Add a fee or payout and watch the net position update immediately.' },
    ],
    ctaHref: '/demo/app',
    ctaLabel: 'Try the ledger in the demo',
  },

  'weekly-digest': {
    intro: "Weekly Digest is a standing recap of the week that just happened — trades taken, win rate, total R, and what changed versus the week before — so you get the summary without having to go dig through the Journal and Performance pages yourself every Sunday night.",
    body: [
      "A weekly review is one of the most commonly recommended trading habits and one of the least consistently practiced ones, largely because doing it properly means opening three different pages, remembering last week's numbers, and manually comparing. Weekly Digest removes the remembering and the comparing — it shows up already written, already comparing this week to last, sitting on the Summary page the moment a new week starts.",
      "It's not just the headline numbers. Checklist compliance and average trade rating for the week are pulled in too, along with a short, specific narrative — \"win rate dipped to 25% from 100% last week,\" \"your best day was Thursday\" — so a slump or a hot streak reads as a sentence, not a number you have to interpret yourself.",
      "This is a Pro feature, free for every account during the launch promo through December 31, 2026 — afterward it becomes part of the Pro plan.",
    ],
    howItWorks: [
      { title: 'It appears on its own', desc: 'No setup — the moment a new week starts, that week\'s digest is sitting on the Summary page.' },
      { title: 'Trades and rates roll up automatically', desc: 'Trade count, win rate, net $, checklist compliance, and average trade rating for the week, computed from what\'s already in the Journal.' },
      { title: 'This week versus last', desc: 'Every headline number is shown against the prior week\'s, so a change is something you see immediately, not something you\'d have to notice yourself.' },
      { title: 'Step back through past weeks', desc: 'Use the arrows to page backward and compare any two weeks, not just the current one.' },
    ],
    example: {
      title: 'In practice: a real, honest weekly readout',
      text: "The digest below isn't a highlight reel — it's a genuinely rough week: 5 trades, a 25% win rate (down from 100% the week before), net −$217, and checklist compliance at just 20%, with the note spelling out plainly that 4 of 5 graded trades didn't fully follow the checklist. That's exactly the kind of week a trader is tempted to quietly skip reviewing. The digest doesn't let it be skipped — it's already written and already on the page.",
    },
    highlights: [
      { title: 'Delivered, not fetched', desc: 'Shows up right on the Summary page the moment a new week starts — nothing to remember to go check.' },
      { title: 'What changed, not just what happened', desc: 'Called out against the prior week, so a slump or a hot streak is obvious at a glance instead of buried in raw numbers.' },
      { title: 'A Pro feature', desc: 'Free for every account during the launch promo — afterward it\'s part of the Pro plan.' },
    ],
    slides: [
      { kind: 'image', src: '/screenshots/checklist-compliance-real.png', alt: 'PipEcho Weekly Digest card showing 5 trades, 25% win rate, -$217 net, and 20% checklist compliance for one week', caption: "A real week's digest — trades, win rate, net $, checklist compliance, and what changed." },
      { kind: 'component', render: () => <DigestVisual />, caption: 'Step back a week to compare — this is the same control as the real digest.' },
    ],
    ctaHref: '/demo/app',
    ctaLabel: 'See it in the demo',
  },

  'htf-bias-alignment': {
    intro: "HTF Bias Alignment cross-references your higher-timeframe read (tagged per trade) against the direction you actually traded, and shows you the win rate for each. It answers a specific, uncomfortable question directly: do you actually do better trading with your own HTF bias, or against it?",
    body: [
      "Almost every discretionary trader has an HTF bias — a daily or 4H read on where price wants to go — and almost nobody has ever actually measured whether they trade in agreement with their own read, or quietly fade it under pressure. HTF Bias Alignment exists to make that measurable instead of a vague sense of \"I probably follow my bias most of the time.\"",
      "Every trade lands in exactly one of three buckets based on its own tags and direction: with your bias, against it, or neutral/ranging when there wasn't a clear HTF read to begin with. Win rate and net $ are broken out for each bucket, side by side, so the comparison is immediate.",
      "It uses the same starter \"HTF Bias\" tag group that Custom Fields & Tags ships with by default, so there's no separate setup step — tag a trade's bias the way you'd tag anything else, and this page is already computing from it. It's also included on the Free plan; nothing to upgrade for.",
    ],
    howItWorks: [
      { title: 'Tag your HTF read per trade', desc: 'Bullish, Bearish, or Neutral — using the same "HTF Bias" tag group Custom Fields & Tags ships with by default.' },
      { title: 'Trade direction is already logged', desc: 'Long or Short, from the same Journal row — nothing extra to enter.' },
      { title: 'PipEcho sorts every trade into one of three buckets', desc: 'With your bias, against it, or neutral, based purely on the tag and direction already on the trade.' },
      { title: 'Compare win rate and net $ across buckets', desc: 'The gap between "with bias" and "against it" is the answer to whether you actually follow your own read.' },
    ],
    example: {
      title: 'In practice: a 25-point gap that\'s easy to miss otherwise',
      text: "The table below is real sample data: trades taken with the trader's own HTF bias won 75% of the time and netted $3,836; trades taken against it won only 42% and netted $1,632 — a 33-point win-rate gap sitting inside a single blended average that would otherwise hide it completely. If fading your own bias is quietly costing you that much, this is the page where it stops being deniable.",
    },
    highlights: [
      { title: 'Three honest buckets', desc: 'With your bias, against it, or neutral — every trade lands in exactly one, based on its own tags and direction.' },
      { title: 'A pattern you can act on', desc: 'If trading against your own bias is quietly costing you 15-30 points of win rate, this is where that becomes impossible to ignore.' },
      { title: 'Included on the Free plan', desc: 'Uses the same "HTF Bias" starter tag group as Custom Fields & Tags — no separate setup, and nothing to upgrade for.' },
    ],
    slides: [
      { kind: 'image', src: '/screenshots/htf-bias-real.png', alt: 'PipEcho HTF Bias Alignment table showing 75% win rate with bias versus 42% win rate against bias', caption: 'With bias, against it, or neutral — win rate and net $ broken out for each, from real tagged trades.' },
      { kind: 'component', render: () => <HtfBiasVisual />, caption: 'Toggle between win rate and trade count.' },
    ],
    ctaHref: '/demo/app',
    ctaLabel: 'See it in the demo',
  },

  'public-track-record': {
    intro: "Public Track Record generates a shareable, read-only results page — no PipEcho login required — for a prop firm, investor, or anyone else who wants to see your actual results. You control whether dollar amounts are shown or the page only reveals percentages.",
    body: [
      "Proving a track record usually means exporting a PDF, sending it, and then doing it again a month later when someone asks for an update — and the PDF is stale the moment it's sent. A Public Track Record page is the opposite: one URL, generated once, that always reflects current results, because it's reading live from the same Journal every other PipEcho page reads from.",
      "You control the framing before you ever share the link. Toggle whether real dollar amounts show, or keep the page to percentages and ratios only — useful when you want to prove a win rate and profit factor to a prospective investor without disclosing account size.",
      "If a link's been shared somewhere you no longer want it circulating, regenerate the token from your account and the old link stops working immediately — nothing to chase down or ask someone to delete on their end.",
    ],
    howItWorks: [
      { title: 'Generate your page', desc: 'One click creates a unique, read-only public URL tied to your results — no separate export or PDF to maintain.' },
      { title: 'Choose what\'s visible', desc: 'Show real dollar amounts, or keep the page to percentages and ratios only — your call, changeable any time.' },
      { title: 'Share the link', desc: 'A prop firm, investor, or anyone else opens it directly — no PipEcho account or login required on their end.' },
      { title: 'It stays current, or you can cut it off', desc: 'The page always reflects your latest results automatically; regenerate the token any time to invalidate a link you no longer want live.' },
    ],
    example: {
      title: 'Why a link beats a PDF here',
      text: "Picture sending a prop firm evaluator a track-record PDF in March, getting funded in April, and being asked for an updated one in July. With a static export, that's a repeat task done from memory of where the original file lives. With a Public Track Record link, it's the exact same URL — sent once, in March — and by July it's already showing four more months of real results with zero additional effort.",
    },
    highlights: [
      { title: 'A link, not an export', desc: 'One URL that always reflects your current results — no re-exporting a PDF every time someone asks for an update.' },
      { title: 'You control what\'s visible', desc: 'Toggle whether real dollar amounts show, or keep the page to percentages and ratios only.' },
      { title: 'Regenerate any time', desc: 'If a link\'s been shared somewhere you no longer want it, regenerate the token and the old link stops working immediately.' },
    ],
    slides: [
      { kind: 'component', render: () => <TrackRecordVisual />, caption: 'What a prop firm or investor sees at your public link — no login required.' },
    ],
    ctaHref: '/signup',
    ctaLabel: 'Sign up to create your page',
  },

  'custom-fields-tags': {
    intro: "Custom Fields & Tags let you track the specific things your own strategy actually cares about — a confirmation candle size, liquidity swept, session structure, whatever it is — without fighting a rigid template built for someone else's setup. Add a field once and it's available everywhere: the Journal table, strategy filter conditions, and Performance breakdowns.",
    body: [
      "Every trading journal ships with a fixed set of columns someone else decided mattered, and every real strategy has at least one detail that doesn't fit any of them — the exact liquidity level swept, a specific confirmation-candle pattern, a session-structure read that's genuinely idiosyncratic to how you trade. A rigid template forces you to either drop that detail or jam it into a notes field where it can never be filtered on.",
      "Custom fields fix this by being genuinely custom: add a numeric or text field from right inside the Journal in seconds, no separate settings page, no support request. The moment it exists, it's usable as a Strategy Playbook filter condition and shows up in Performance breakdowns — it's a first-class column, not an afterthought.",
      "Tags work alongside fields for anything with a fixed set of options — a flat tag for quick labeling, or a grouped set (like the built-in \"HTF Bias\" group with Bullish/Bearish/Neutral, the same one HTF Bias Alignment reads from) when a field naturally has a small number of valid values. Either kind can be scoped to one trading account or applied across all of them.",
    ],
    howItWorks: [
      { title: 'Add a field from the Journal', desc: 'Numeric or text, typed in directly — no schema migration, no separate settings screen, no support ticket.' },
      { title: 'Use tags for fixed options', desc: 'A flat tag for quick labeling, or a grouped set (like HTF Bias: Bullish/Bearish/Neutral) when the field has a small, defined set of values.' },
      { title: 'It\'s immediately usable everywhere', desc: 'The same field or tag becomes a Strategy Playbook filter condition and a Performance breakdown axis the moment it exists.' },
      { title: 'Scope it if you need to', desc: 'A field can apply to every trading account or just one — matching how differently you might track a challenge account versus a live one.' },
    ],
    example: {
      title: 'In practice: a field built for one specific setup',
      text: "Say your London Reversal setup only counts as valid confirmation when price sweeps a specific Asia session high or low by a minimum distance. That's too specific for any generic journal's fixed field list — so add a \"Distance from Asia High/Low\" numeric field directly from the Journal, log it on each trade for a month, and then use it as a Strategy Playbook filter condition to test whether a bigger sweep distance actually correlates with a higher win rate. That's a genuinely custom question, answered with a genuinely custom field.",
    },
    highlights: [
      { title: 'No support ticket required', desc: 'Add a new numeric or text field from the Journal in seconds — it\'s immediately usable as a strategy filter condition too.' },
      { title: 'Tags and tag groups', desc: 'Flat tags for quick labeling, or grouped options (like an "HTF Bias" group with Bullish/Bearish/Neutral) when a field has a fixed set of choices.' },
      { title: 'Scoped how you need it', desc: 'A field can apply to one trading account or every account you have — matching how differently you might track a challenge account versus a live one.' },
    ],
    slides: [
      { kind: 'component', render: () => <CustomFieldsVisual />, caption: 'Add a field your strategy actually needs — no schema migration, no support ticket.' },
      { kind: 'image', src: '/screenshots/journal-rows.png', alt: 'Close-up of PipEcho Trade Journal rows where custom fields and tags appear alongside built-in columns', caption: 'The same Journal table those custom fields and tags live in, right alongside everything else.' },
    ],
    ctaHref: '/demo/app/journal',
    ctaLabel: 'Try it in the demo',
  },
};

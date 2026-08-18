// Static blog content for the public-facing marketing site (/blog, /blog/:slug).
// Deliberately NOT database-backed: the Vercel Hobby plan's 12-serverless-function
// cap is already fully used by the app's real API routes, so adding a CMS/DB-backed
// blog would mean either exceeding that cap or displacing an existing endpoint.
// A plain data file costs zero functions and is trivial to add posts to later —
// just append another entry below.
//
// Every post follows the same shape on purpose: introduce the topic, explain why
// it actually matters, show where traders typically lose the thread, walk through
// a concrete (hypothetical, not a real user's trades) example, then show how a
// specific PipEcho feature — with a real screenshot from the app, not a mockup —
// addresses exactly that failure mode. `relatedFeature` backs the callout box at
// the bottom of each post; its `to` documents which route it's conceptually
// pointing at even though the actual CTA button in BlogPost.tsx always goes to
// /signup (see comment there).
//
// The two posts that would naturally point at Chart Replay & Backtesting instead
// point at Strategy Playbooks — Backtesting isn't live yet (see BacktestComingSoon),
// so linking a reader to a feature they can't use yet would be a bad first
// impression. Strategy Playbooks is live today and covers the same "define the
// process once, track it systematically" territory the posts are making the case
// for, so it's an honest, currently-usable next step instead.

export type BlogBlock =
  | { type: 'p'; text: string }
  | { type: 'h2'; text: string }
  | { type: 'example'; title: string; text: string }
  | { type: 'image'; src: string; alt: string; caption: string };

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO date, display-formatted at render time
  readTime: string;
  tag: string;
  body: BlogBlock[];
  relatedFeature: { label: string; to: string; description: string };
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'london-session-reversal-framework',
    title: 'The London Session Reversal: A Framework, Not a Hunch',
    excerpt:
      'Trading the London open reversal works when it\'s a repeatable process with defined invalidation — not a gut call made in the first five minutes of the session.',
    date: '2026-07-14',
    readTime: '9 min read',
    tag: 'Strategy',
    body: [
      { type: 'p', text: 'The London session reversal is one of the most talked-about setups in forex — price runs one direction into the Asian-to-London handoff, sweeps a liquidity pool, and reverses hard as London volume takes over. It works often enough to be worth building a process around. It also fails often enough that "I saw a reversal so I took it" is not a strategy, it\'s a coin flip with extra steps.' },
      { type: 'p', text: 'A framework version of this setup usually has three ingredients. First, a defined liquidity reference — the Asian session high or low, or a prior day\'s level — that price actually sweeps rather than just approaches. Second, a confirmation signal on a lower timeframe (a change in structure, a shift in delivery, a specific candle pattern) rather than trading the sweep itself. Third, an invalidation level defined before entry, not decided in the moment once the trade is already open and emotions are involved.' },

      { type: 'h2', text: 'Why this matters' },
      { type: 'p', text: 'A hunch-based reversal trade and a framework-based one can look identical on the chart after the fact — same entry candle, same direction. The difference only shows up in what happens when the setup doesn\'t play out cleanly. Without predefined criteria, every losing trade becomes a judgment call about whether the "idea" was still valid, which is exactly the kind of judgment call that keeps a losing position open ten pips past where it should have been cut.' },
      { type: 'p', text: 'The deeper cost is that a hunch can\'t be improved. If your entry criteria change slightly every session based on how confident you feel, you\'re never trading the same strategy twice — so there\'s nothing consistent to review, refine, or eventually trust under pressure. A defined framework is the only version of this setup you can actually get better at.' },

      { type: 'h2', text: 'Where traders get stuck' },
      { type: 'p', text: 'Most traders can describe their version of this setup out loud without much trouble. The gap shows up in live execution: the Asian high gets swept by two pips instead of a clean run-through, the confirmation candle is "close enough," and after two losing reversals in a row, the criteria quietly loosen because sitting on the sidelines during a session you\'re used to trading feels worse than taking a marginal setup.' },
      { type: 'p', text: 'The other common failure is backtesting the idea of "London reversals" in general — reading that the setup has a good win rate somewhere online — rather than backtesting your own specific, written-down ruleset. Someone else\'s London reversal, with different liquidity references and confirmation criteria, tells you nothing reliable about how your version performs.' },

      { type: 'example', title: 'A concrete example', text: 'Say GBPUSD sets an Asian range between 1.2680 and 1.2705 overnight. At the London open, price pushes up through 1.2705, sweeps the high by a few pips, then prints a clear shift in structure on the 5-minute chart. A framework trader shorts on that confirmation, with an invalidation just above the sweep high and a target at the Asian low — a clean, repeatable sequence. Now picture a session where price approaches 1.2705 but stalls three pips short, never actually sweeping it, and there\'s no clear structural shift — just a couple of red candles. A hunch-based version of the same trader takes the short anyway, because "it looks similar enough" to the setups that have worked before. That trade isn\'t a smaller version of the same edge; it\'s a different, undefined trade wearing the same setup\'s name.' },

      { type: 'h2', text: 'How PipEcho helps' },
      { type: 'image', src: '/screenshots/strategies.png', alt: 'PipEcho Strategy Playbooks page showing two saved strategies with filter conditions and take-profit rules', caption: 'A Strategy Playbook — the liquidity reference, confirmation criteria, and invalidation rule for a setup like this, saved once and reused every time.' },
      { type: 'p', text: 'This is exactly what a Strategy Playbook is for: you write down the rule set for "London Reversal" once — which liquidity level counts, what confirmation you require, where invalidation sits — and every trade you tag to that strategy rolls up into its own win rate, profit factor, and total R automatically. Nothing gets counted toward the strategy\'s track record unless it actually matched the rules, which is the enforcement mechanism a mental definition can\'t give you.' },
      { type: 'p', text: 'Custom fields let you go one level deeper — recording which liquidity reference triggered (Asian high vs. a prior day\'s level, say) or which confirmation type fired — so months later you\'re not just seeing "London Reversal is +2.4R this quarter," you\'re seeing exactly which variant of it is actually carrying that number. Chart Replay & Backtesting, currently in development, will let you build that same track record against historical data before a single dollar is at risk — until it ships, logging your live (or manually reviewed historical) trades against the Playbook gets you most of the way there today.' },
    ],
    relatedFeature: {
      label: 'Strategy Playbooks',
      to: '/strategies',
      description: 'Turn a framework like this into a saved Strategy Playbook — define the rules once and PipEcho tracks win rate, profit factor, and total R for every trade tagged to it automatically.',
    },
  },
  {
    slug: 'risk-management-needs-a-journal',
    title: 'Your Risk Management Plan Needs a Journal, Not Just Rules',
    excerpt:
      'Writing "risk 1% per trade" in a notes app doesn\'t enforce anything. The gap between your risk rules and what you actually do only shows up in the data.',
    date: '2026-07-21',
    readTime: '8 min read',
    tag: 'Risk Management',
    body: [
      { type: 'p', text: 'Almost every trader has a risk rule. Risk 1% per trade. Never more than 3R exposed across open positions. No trading after two consecutive losses. These rules are easy to write down and, it turns out, easy to quietly break when a setup "feels" too good to size normally.' },
      { type: 'p', text: 'The problem isn\'t that traders don\'t know their own rules. It\'s that a rule with no record of adherence is really just a hope. If you can\'t look back at the last 60 days and see your actual position sizing plotted against your stated risk limit, you don\'t actually know whether you\'re following your plan or gradually drifting away from it one "just this once" at a time.' },

      { type: 'h2', text: 'Why this matters' },
      { type: 'p', text: 'Risk rules don\'t fail all at once — they erode. A trader who sizes at 1.8% instead of 1% "just this once" during a losing streak, and it happens to work out, has just taught themselves that the rule is negotiable. That lesson compounds. One oversized loss during a bad week can undo the gains from a month of disciplined, correctly-sized trades, and it rarely feels like a single bad decision in the moment — it feels like a reasonable adjustment to how the session is going.' },
      { type: 'p', text: 'If you\'re trading a funded or prop-firm evaluation account with a hard daily or maximum drawdown limit, the stakes are sharper still: a breach isn\'t just a bad day, it can end the challenge outright, regardless of how the rest of the account has performed. The rule you wrote down matters far less than whether something actually stopped you the moment you were about to cross it.' },

      { type: 'h2', text: 'Where traders get stuck' },
      { type: 'p', text: 'Risk rules usually live somewhere passive — a sticky note, the first page of a trading plan document, memory. None of those show up in the moment that actually matters: mid-session, after a loss or two, when frustration or a sense of "making it back" is doing more of the decision-making than the plan is. Nobody consciously decides to break their own rule that day. They just don\'t have anything actively putting the number in front of them when it counts.' },
      { type: 'p', text: 'The other quiet failure is not tracking risk at the trade level at all — logging entry, exit, and P&L, but not the position size or dollar risk that produced that P&L. Without that, you can review outcomes forever and never actually answer the one question that matters: was I following my own risk rule, or getting lucky in spite of not following it?' },

      { type: 'example', title: 'A concrete example', text: 'A trader with a 1% max-risk-per-trade rule and a 3% daily loss limit starts a session with two losses at -1% and -1.2% (a bit of slippage on the second). Down 2.2% for the day and frustrated, they take a third setup sized at 1.8% instead of 1% — reasoning that a slightly bigger position will "make the day back faster." It loses too, landing the day at -4%, a full point past the 3% ceiling that was supposed to stop trading well before that. In isolation, it felt like one reasonable-sounding decision. Repeated over a month, that exact pattern — not the strategy itself — is often the actual difference between passing and failing a funding challenge.' },

      { type: 'h2', text: 'How PipEcho helps' },
      { type: 'image', src: '/screenshots/summary.png', alt: 'PipEcho Summary dashboard showing trading sessions, total journal trades, and strategy performance', caption: 'Your Summary dashboard — the page you already open every session. Risk Guardrail surfaces a live warning here the moment a limit is breached.' },
      { type: 'p', text: 'Risk Guardrail moves the risk rule out of memory and onto the dashboard you already open at the start of every session. Set a daily or weekly loss limit once, and it\'s checked automatically against your logged trades — the moment you\'re at or past that threshold, a visible warning shows up right on Summary, not buried in a spreadsheet you\'d have to remember to open and calculate by hand mid-session.' },
      { type: 'p', text: 'Pairing that with custom fields for position size and dollar risk per trade means the running numbers behind the warning are already there automatically, not mental math done under pressure after a losing streak — which is exactly the moment mental math is least reliable.' },
    ],
    relatedFeature: {
      label: 'Risk Guardrail',
      to: '/',
      description: 'A live warning the moment a daily or weekly loss limit is breached — visible on your Summary dashboard, not just in your head.',
    },
  },
  {
    slug: 'backtesting-before-real-capital',
    title: 'Backtesting Before You Risk Real Capital: A Practical Workflow',
    excerpt:
      'Backtesting isn\'t about proving a strategy is perfect. It\'s about finding out how it actually behaves before your own money is what\'s finding out.',
    date: '2026-07-29',
    readTime: '9 min read',
    tag: 'Backtesting',
    body: [
      { type: 'p', text: 'There\'s a version of backtesting that\'s mostly theater: scroll back through a chart, spot a few setups that would have worked, and conclude the strategy is good. This version tells you almost nothing, because you\'re pattern-matching with full hindsight and a strong bias toward finding what you\'re looking for.' },
      { type: 'p', text: 'A more honest workflow replays price bar-by-bar, the same way it actually unfolded — no seeing the outcome before you\'ve committed to the entry criteria. You mark where your setup\'s conditions are met using only the information that would have been available at that candle, take the trade in the replay, and record the result exactly like a real journal entry: entry, stop, target, and what actually happened.' },

      { type: 'h2', text: 'Why this matters' },
      { type: 'p', text: 'Backtesting isn\'t optional homework before "real" trading starts — it\'s the only realistic way to build a statistically meaningful sample size before risking capital on it. A setup that feels like it has an edge after five live trades could just as easily be five instances of ordinary variance. Thirty or fifty tracked instances, won or lost, start to actually mean something.' },
      { type: 'p', text: 'It also changes what the first losing streak in live trading feels like. If you\'ve already seen your setup go through several losing streaks in backtesting and come out net positive, a live losing streak reads as expected variance. If you haven\'t, the same losing streak reads as evidence the strategy is broken — and that\'s usually when traders abandon a setup right before it was due to work again.' },

      { type: 'h2', text: 'Where traders get stuck' },
      { type: 'p', text: 'The failure mode usually isn\'t skipping backtesting — it\'s doing it loosely. Scrolling forward through a chart with the outcome already visible introduces hindsight bias you can\'t fully correct for, even when you\'re trying to be objective. And it\'s easy to mentally register the instances that worked more vividly than the ones that didn\'t, which quietly inflates your own sense of the setup\'s win rate without any spreadsheet ever showing an inflated number.' },
      { type: 'p', text: 'The other common gap is treating a single backtest run as proof rather than as one data point. A strategy backtested once, with a good result, that never gets logged and revisited the way live trades are, isn\'t really being tracked — it\'s being remembered, and memory rounds up.' },

      { type: 'example', title: 'A concrete example', text: 'A trader scrolls back through three months of GBPUSD charts looking for London reversal setups, mentally tallying as they go: "that one worked, that one worked, that one didn\'t… roughly 12 out of 14, call it 85%." Confident in that number, they go live sizing more aggressively than they normally would for an unproven setup. In reality, a handful of ambiguous instances — the ones where the sweep was marginal or the confirmation was debatable — got unconsciously left out of the count, because they were harder to classify and less satisfying to include. Once every instance is actually logged going forward, live win rate settles closer to 55%, well below the 85% the trader had sized around, and the account carries risk it was never actually built to handle.' },

      { type: 'h2', text: 'How PipEcho helps' },
      { type: 'image', src: '/screenshots/journal.png', alt: 'PipEcho Trade Journal showing a filterable table of logged trades with entry, exit, R, and P&L columns', caption: 'The Trade Journal — every backtest or practice trade logged with the same rigor as a live one, so nothing gets rounded up in memory.' },
      { type: 'p', text: 'Chart Replay & Backtesting is currently in development — pulling real historical candle data and stepping through it bar-by-bar with no ability to peek ahead. Until it ships, the same discipline is available today: log every backtest or manually-reviewed historical instance into your Trade Journal exactly like a live trade — entry, stop, target, outcome — tagged to a Strategy Playbook, the same way described in the London Reversal framework post.' },
      { type: 'p', text: 'That removes the two failure modes above at the source. Nothing gets left out because it was ambiguous or inconvenient — if it met the criteria, it\'s a row in the table, win or lose. And because it\'s the same Journal and the same Strategy Playbook stats you\'ll use once you\'re live, the sample size you build during backtesting carries straight into your live track record instead of starting over from zero the day you go live.' },
    ],
    relatedFeature: {
      label: 'Strategy Playbooks',
      to: '/strategies',
      description: 'Chart Replay & Backtesting is on the way — until then, log every backtest trade in your Journal against a Strategy Playbook so the sample size is already building.',
    },
  },
  {
    slug: 'journaling-habit-that-changes-results',
    title: 'The Trading Journal Habit That Actually Changes Results',
    excerpt:
      'Most journals get abandoned within a month. The ones that stick — and actually move the needle — share one specific habit the others skip.',
    date: '2026-08-05',
    readTime: '8 min read',
    tag: 'Journaling',
    body: [
      { type: 'p', text: 'Almost every trader has started a journal at some point. A spreadsheet, a notebook, a notes app entry after a big loss. Most of them stop within a few weeks — not from laziness, but because logging trades after the fact, disconnected from any real review process, starts to feel like homework with no grade at the end.' },
      { type: 'p', text: 'The habit that separates journals people actually keep from the ones that quietly die in a Google Sheets tab isn\'t logging more fields. It\'s a weekly review loop: a fixed time each week where you actually look at what the last five, ten, or fifty trades are telling you — not just re-reading them, but checking them against your own strategy rules and win-rate expectations.' },

      { type: 'h2', text: 'Why this matters' },
      { type: 'p', text: 'A journal without a review loop is just data entry. The trades get logged, the entries pile up, and nothing about how you trade next week is different from how you traded this week — because nothing was actually learned from the log, only recorded by it. The value of journaling was never in the writing down; it\'s entirely in what changes because of what the numbers showed you.' },
      { type: 'p', text: 'This is also where a journal earns back the time it costs. A five-minute weekly review that changes one thing about how you trade the following week is worth more than fifty perfectly detailed trade entries that nobody ever looks back at in aggregate.' },

      { type: 'h2', text: 'Where traders get stuck' },
      { type: 'p', text: 'The review only survives if it\'s fast enough to actually happen every week. If pulling your win rate by session, or your profit factor by strategy, requires exporting a spreadsheet and building a pivot table, the review gets skipped the first busy week — and once it\'s skipped once, it\'s much easier to skip the second time. It rarely comes back on its own.' },
      { type: 'p', text: 'The other quiet failure is reviewing trades one at a time instead of in aggregate. Reading back through last week\'s ten trades individually feels productive, but it doesn\'t surface the pattern that only shows up across all ten at once — like a setup that\'s consistently profitable in one session and consistently a net loser in another, which is invisible until someone actually groups the data that way.' },

      { type: 'example', title: 'A concrete example', text: 'A trader logs every trade diligently for six weeks — entries, exits, notes, screenshots, all of it. But the review never happens, usually because Sunday evening is already spoken for by everything else the week didn\'t get to. Two months in, a friend asks how the New York session has been treating them, and they genuinely don\'t know — the honest answer would require filtering six weeks of a spreadsheet by session and recalculating win rate by hand, which is exactly the kind of task that never survives a Sunday night. The actual numbers, once someone finally pulls them, show -0.3R net during New York against +1.1R during London — a pattern that had been sitting in the data the entire time, just never surfaced.' },

      { type: 'h2', text: 'How PipEcho helps' },
      { type: 'image', src: '/screenshots/performance.png', alt: 'PipEcho Performance page showing profit factor, expectancy, drawdown chart, and winners/losers breakdown', caption: 'The Performance page — win rate, profit factor, and drawdown, already computed. The session-by-session comparison from the example above is a filter click away, not a pivot table.' },
      { type: 'p', text: 'The Performance page exists specifically to make that comparison a filter click instead of an evening project. Win rate, profit factor, and expectancy broken down by session, day of week, or Strategy Playbook are already computed the moment you open the page, since every trade was already logged with that context attached — nothing to export, nothing to recalculate by hand on a Sunday night.' },
      { type: 'p', text: 'Pre-trade checklists close the other half of the loop — rules a journal can\'t enforce after the fact, only before you enter. Together, a five-minute weekly review that actually happens and a checklist you check before clicking buy turn a journal from a guilt-inducing chore into the thing that quietly makes you a better trader six months from now.' },
    ],
    relatedFeature: {
      label: 'Performance Analytics + Pre-Trade Checklists',
      to: '/performance',
      description: 'Win rate, profit factor, and breakdowns by session/day/setup — computed automatically, so your weekly review takes minutes, not an evening.',
    },
  },
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find(p => p.slug === slug);
}

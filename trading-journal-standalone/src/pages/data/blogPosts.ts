// Static blog content for the public-facing marketing site (/blog, /blog/:slug).
// Deliberately NOT database-backed: the Vercel Hobby plan's 12-serverless-function
// cap is already fully used by the app's real API routes, so adding a CMS/DB-backed
// blog would mean either exceeding that cap or displacing an existing endpoint.
// A plain data file costs zero functions and is trivial to add posts to later —
// just append another entry below.
//
// Each post ends with a `relatedFeature` pointer so the post has a natural,
// honest reason to link back into the product rather than a generic "sign up"
// nag at the bottom of every article.

export type BlogPost = {
  slug: string;
  title: string;
  excerpt: string;
  date: string; // ISO date, display-formatted at render time
  readTime: string;
  tag: string;
  body: string[]; // paragraphs — kept as plain strings, rendered with whitespace-pre-line
  relatedFeature: { label: string; to: string; description: string };
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'london-session-reversal-framework',
    title: 'The London Session Reversal: A Framework, Not a Hunch',
    excerpt:
      'Trading the London open reversal works when it\'s a repeatable process with defined invalidation — not a gut call made in the first five minutes of the session.',
    date: '2026-07-14',
    readTime: '6 min read',
    tag: 'Strategy',
    body: [
      'The London session reversal is one of the most talked-about setups in forex — price runs one direction into the Asian-to-London handoff, sweeps a liquidity pool, and reverses hard as London volume takes over. It works often enough to be worth building a process around. It also fails often enough that "I saw a reversal so I took it" is not a strategy, it\'s a coin flip with extra steps.',
      'A framework version of this setup usually has three ingredients. First, a defined liquidity reference — the Asian session high or low, or a prior day\'s level — that price actually sweeps rather than just approaches. Second, a confirmation signal on a lower timeframe (a change in structure, a shift in delivery, a specific candle pattern) rather than trading the sweep itself. Third, an invalidation level defined before entry, not decided in the moment once the trade is already open and emotions are involved.',
      'The part traders skip is the fourth ingredient: knowing, with actual numbers, whether this setup makes money for you specifically. Two traders can watch the same London reversal and one has an edge because their confirmation criteria are tighter, and the other doesn\'t because they\'re entering on the sweep alone. You cannot tell which one you are by feel. You can only tell by logging every instance — the ones that worked and, just as importantly, the ones that didn\'t — and looking at the aggregate.',
      'This is also why backtesting the setup before trading it live matters more than most people give it credit for. Stepping through historical price bar-by-bar, marking where your specific entry criteria would have triggered, and recording what happened next builds the sample size you need to trust the setup under real pressure — long before you\'ve risked a single dollar on it.',
    ],
    relatedFeature: {
      label: 'Chart Replay & Backtesting',
      to: '/backtest',
      description: 'Step through historical candles bar-by-bar and log practice trades against a setup like this before you risk live capital.',
    },
  },
  {
    slug: 'risk-management-needs-a-journal',
    title: 'Your Risk Management Plan Needs a Journal, Not Just Rules',
    excerpt:
      'Writing "risk 1% per trade" in a notes app doesn\'t enforce anything. The gap between your risk rules and what you actually do only shows up in the data.',
    date: '2026-07-21',
    readTime: '5 min read',
    tag: 'Risk Management',
    body: [
      'Almost every trader has a risk rule. Risk 1% per trade. Never more than 3R exposed across open positions. No trading after two consecutive losses. These rules are easy to write down and, it turns out, easy to quietly break when a setup "feels" too good to size normally.',
      'The problem isn\'t that traders don\'t know their own rules. It\'s that a rule with no record of adherence is really just a hope. If you can\'t look back at the last 60 days and see your actual position sizing plotted against your stated risk limit, you don\'t actually know whether you\'re following your plan or gradually drifting away from it one "just this once" at a time.',
      'This is where a journal earns its keep beyond just tracking wins and losses. Every trade logged with its position size, its dollar risk, and the account\'s running balance at the time creates an audit trail — not to punish yourself after the fact, but to catch the drift early. A guardrail that flags when you\'ve breached a daily or weekly loss limit does something a mental rule can\'t: it shows you the number instead of asking you to remember it mid-session.',
      'None of this requires more discipline than you already have. It requires the discipline to be visible to you, in a format you\'ll actually look at, rather than sitting only in your head where it\'s easy to rationalize around.',
    ],
    relatedFeature: {
      label: 'Risk Guardrail',
      to: '/',
      description: 'A live warning the moment a daily or weekly loss limit is breached — visible on your Summary page, not just in your head.',
    },
  },
  {
    slug: 'backtesting-before-real-capital',
    title: 'Backtesting Before You Risk Real Capital: A Practical Workflow',
    excerpt:
      'Backtesting isn\'t about proving a strategy is perfect. It\'s about finding out how it actually behaves before your own money is what\'s finding out.',
    date: '2026-07-29',
    readTime: '7 min read',
    tag: 'Backtesting',
    body: [
      'There\'s a version of backtesting that\'s mostly theater: scroll back through a chart, spot a few setups that would have worked, and conclude the strategy is good. This version tells you almost nothing, because you\'re pattern-matching with full hindsight and a strong bias toward finding what you\'re looking for.',
      'A more honest workflow replays price bar-by-bar, the same way it actually unfolded — no seeing the outcome before you\'ve committed to the entry criteria. You mark where your setup\'s conditions are met using only the information that would have been available at that candle, take the trade in the replay, and record the result exactly like a real journal entry: entry, stop, target, and what actually happened.',
      'Do this across enough historical instances — ideally 30 to 50 at minimum — and patterns emerge that a handful of cherry-picked examples never show. Maybe your setup has a real edge on GBPUSD during London but not during the New York session. Maybe your stop placement is technically correct but consistently too tight, getting swept before the real move starts. You only find this by tracking outcomes systematically, not by remembering the wins.',
      'The payoff isn\'t a guarantee — no backtest perfectly predicts live performance, since live trading adds execution slippage, emotion, and real-time uncertainty that replay can\'t fully replicate. The payoff is entering live trading with a real sample size behind your setup instead of a feeling, so the first time you find out a strategy doesn\'t work isn\'t also the first time you\'ve paid for that lesson in real money.',
    ],
    relatedFeature: {
      label: 'Chart Replay & Backtesting',
      to: '/backtest',
      description: 'Pull real historical candle data and step through it bar-by-bar — no manual chart scrolling, no hindsight bias.',
    },
  },
  {
    slug: 'journaling-habit-that-changes-results',
    title: 'The Trading Journal Habit That Actually Changes Results',
    excerpt:
      'Most journals get abandoned within a month. The ones that stick — and actually move the needle — share one specific habit the others skip.',
    date: '2026-08-05',
    readTime: '5 min read',
    tag: 'Journaling',
    body: [
      'Almost every trader has started a journal at some point. A spreadsheet, a notebook, a notes app entry after a big loss. Most of them stop within a few weeks — not from laziness, but because logging trades after the fact, disconnected from any real review process, starts to feel like homework with no grade at the end.',
      'The habit that separates journals people actually keep from the ones that quietly die in a Google Sheets tab isn\'t logging more fields. It\'s a weekly review loop: a fixed time each week where you actually look at what the last five, ten, or fifty trades are telling you — not just re-reading them, but checking them against your own strategy rules and win-rate expectations.',
      'This only works if the review is fast enough to actually happen every week. If pulling your win rate by session, or your profit factor by strategy, requires exporting a spreadsheet and building a pivot table, the review gets skipped the first busy week, and then it never comes back. If the numbers are already sitting there — performance broken down by day, session, and setup, updated automatically as you log — the weekly review takes five minutes instead of an evening, and five-minute habits are the ones that actually survive contact with real life.',
      'Pre-trade checklists close the other half of the loop: rules a journal can\'t enforce after the fact, only before you enter. Together, a fast weekly review and a checklist you actually check before clicking buy turn a journal from a guilt-inducing chore into the thing that quietly makes you a better trader six months from now.',
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

import { Check, X, Clock } from 'lucide-react';
import { RuleCheck } from './types';

// Shared renderer for a strategy model's rule checklist - used both by
// StrategyPanel (live scan against the current market) and by the markup
// grading result (SmcAnalysis.tsx), which is exactly why it's a rule list
// and not something more setup-specific: "show which rules weren't met and
// give feedback" needs the exact same visual treatment whether it's the app
// scanning live or grading something the user drew themselves.
export default function RuleChecklist({ rules }: { rules: RuleCheck[] }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {rules.map(r => (
        <li key={r.id} className="flex items-start gap-2 text-xs">
          <span className={
            r.pass === true ? 'text-green-600 dark:text-green-400 mt-0.5 shrink-0'
              : r.pass === false ? 'text-red-400 dark:text-red-300 mt-0.5 shrink-0'
              : 'text-amber-500 mt-0.5 shrink-0'
          }>
            {r.pass === true ? <Check className="w-3.5 h-3.5" /> : r.pass === false ? <X className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
          </span>
          <span className="flex-1">
            <span className="font-medium text-foreground">{r.label}</span>
            <span className="block text-muted-foreground mt-0.5">{r.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

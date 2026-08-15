// Utility groups where two classes target the same CSS property and
// therefore silently conflict (e.g. `w-full` and `w-16` both set `width`).
// Plain string concatenation lets Tailwind's generated CSS order — not JSX
// class order — decide the winner, which caused two real bugs in this app:
// DialogContent's hardcoded `max-w-lg` beating a caller's `max-w-md`, and
// Select's default `w-full` beating a caller's `w-16` (squeezing the value
// input off the strategy-condition row down to an invisible sliver). Within
// each group below, the LAST class wins — matching what callers actually
// expect from `cn(defaultClasses, className)`.
const CONFLICT_GROUPS: RegExp[] = [
  /^w-/, /^min-w-/, /^max-w-/,
  /^h-/, /^min-h-/, /^max-h-/,
  /^shrink(-|$)/, /^grow(-|$)/,
  /^flex-(1|auto|initial|none)$/,
];

function conflictGroup(cls: string): number | null {
  for (let i = 0; i < CONFLICT_GROUPS.length; i++) {
    if (CONFLICT_GROUPS[i].test(cls)) return i;
  }
  return null;
}

export function cn(...classes: Array<string | false | null | undefined>): string {
  const tokens = classes.filter(Boolean).join(' ').split(/\s+/).filter(Boolean);
  const result: string[] = [];
  const groupPos = new Map<number, number>(); // group id -> index already placed in `result`
  for (const cls of tokens) {
    const group = conflictGroup(cls);
    if (group !== null && groupPos.has(group)) {
      result[groupPos.get(group)!] = cls; // later class in the same group overrides the earlier one
    } else {
      if (group !== null) groupPos.set(group, result.length);
      result.push(cls);
    }
  }
  return result.join(' ');
}

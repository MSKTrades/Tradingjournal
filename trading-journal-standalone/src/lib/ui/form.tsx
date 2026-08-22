import React from 'react';
import { cn } from '../utils';

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring',
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring',
        className
      )}
      {...props}
    />
  );
}

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('text-sm font-medium', className)} {...props} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        // bg-transparent (used elsewhere) lets the popup's native OS/browser
        // styling show through when the dropdown opens — usually an opaque
        // white, which reads as broken against the dark theme. An explicit
        // bg-background here (plus the `select option` rule in index.css)
        // keeps both the closed control and the open popup themed.
        'h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus:outline-none focus:ring-1 focus:ring-ring',
        className
      )}
      {...props}
    />
  );
}

export function Badge({
  className, variant = 'secondary', ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: 'secondary' | 'outline' | 'default' }) {
  const variantClasses = {
    secondary: 'bg-secondary text-secondary-foreground',
    outline: 'border border-border text-foreground',
    default: 'bg-primary text-primary-foreground',
  };
  // A caller passing its own bg-*/text-* color (every status/trend/bias
  // badge across Backtest and SMC Analysis does this - e.g. bg-green-600
  // text-white for a bullish trend) means to fully replace the variant's
  // own background/text, not blend with it. cn()'s conflict-group merge
  // (see lib/utils.ts) only covers sizing utilities on purpose, so two
  // bg-*/text-* classes both landing in the same class list left Tailwind's
  // generated stylesheet order - not JSX order - deciding the winner PER
  // UTILITY independently. In practice that meant background and text
  // color could each be won by a DIFFERENT side (e.g. the variant's
  // bg-secondary beating the caller's bg-green-600, while the caller's
  // text-white still beat the variant's text-secondary-foreground) -
  // producing washed-out, barely-readable badges instead of either
  // intended look. Dropping the variant's own bg-/text- tokens whenever the
  // caller supplies its own removes the ambiguity outright.
  const callerSetsBg = /(^|\s)bg-/.test(className ?? '');
  const callerSetsText = /(^|\s)text-/.test(className ?? '');
  const filteredVariant = variantClasses[variant]
    .split(' ')
    .filter(cls => !((callerSetsBg && cls.startsWith('bg-')) || (callerSetsText && cls.startsWith('text-'))))
    .join(' ');
  return (
    <span
      className={cn('inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium', filteredVariant, className)}
      {...props}
    />
  );
}

export function Switch({
  checked, onCheckedChange, className,
}: { checked: boolean; onCheckedChange: (v: boolean) => void; className?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-5 w-9 items-center rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-input',
        className
      )}
    >
      <span className={cn('inline-block h-4 w-4 transform rounded-full bg-white transition-transform', checked ? 'translate-x-4.5' : 'translate-x-0.5')} />
    </button>
  );
}

export function Checkbox({
  checked, onCheckedChange, className, ...rest
}: { checked: boolean; onCheckedChange: () => void; className?: string; 'aria-label'?: string }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={onCheckedChange}
      className={cn('h-4 w-4 rounded border-input accent-primary cursor-pointer', className)}
      {...rest}
    />
  );
}

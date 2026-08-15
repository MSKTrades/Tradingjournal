import React from 'react';
import { cn } from '../utils';

// The actual horizontally-scrollable element is THIS wrapper div, not
// whatever container a call site wraps around <Table> - a wide table
// (custom columns, lots of numeric fields) scrolls inside here on its own.
// scroll-visible-x (see index.css) forces a slim always-visible scrollbar,
// since the native one is an invisible overlay on several platforms
// (Windows' newer Fluent overlay scrollbars in particular ignore a page's
// own ::-webkit-scrollbar styling entirely once the OS is in overlay
// mode). scrollRef lets a page also drive its own custom scroll controls
// (buttons, a progress thumb) against this same element.
export function Table({ className, scrollRef, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { scrollRef?: React.Ref<HTMLDivElement> }) {
  return (
    <div ref={scrollRef} className="w-full overflow-auto scroll-visible-x">
      <table className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  );
}
export function TableHeader({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b border-border', className)} {...props} />;
}
export function TableBody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props} />;
}
export function TableRow({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-b border-border last:border-0 hover:bg-accent/50', className)} {...props} />;
}
export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('h-9 px-3 text-left align-middle text-xs font-medium text-muted-foreground', className)} {...props} />;
}
export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('p-2 px-3 align-middle', className)} {...props} />;
}

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
// containerClassName styles the actual scrolling div (e.g. a max-h-[...]
// to turn a long table into its own self-contained scroll region with a
// pinned header, instead of growing to fill the page). This matters for
// position: sticky specifically - a sticky descendant's reference frame is
// whichever ancestor is the real scroll container, and if that's this div,
// the header only stays correctly pinned when THIS div is the one with a
// bounded height that actually scrolls; without a max-height it just grows
// to fit its content and never scrolls on its own, so nothing here would
// ever visibly "stick". Left unset, tables behave exactly as before
// (grow with the page, no internal scroll, no sticky effect).
export function Table({ className, containerClassName, scrollRef, ...props }: React.TableHTMLAttributes<HTMLTableElement> & { scrollRef?: React.Ref<HTMLDivElement>; containerClassName?: string }) {
  return (
    <div ref={scrollRef} className={cn('w-full overflow-auto scroll-visible-x', containerClassName)}>
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
// sticky top-0 keeps column headers visible while the page scrolls past a
// long table - without a background of its own a stuck header would let
// row content show through underneath it, so any call site whose table
// can realistically grow tall (Journal's trades table in particular)
// should pass a solid bg-* class of its own via className.
export function TableHead({ className, ...props }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('h-9 px-3 text-left align-middle text-xs font-medium text-muted-foreground sticky top-0 z-10', className)} {...props} />;
}
export function TableCell({ className, ...props }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('p-2 px-3 align-middle', className)} {...props} />;
}

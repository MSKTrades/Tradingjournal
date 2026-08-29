// Shared between Landing.tsx (which stamps each feature card in the
// "Everything your trading log should do" grid with an id) and
// MarketingChrome.tsx's Features mega-menu (which deep-links to those same
// ids from the header, e.g. Link to="/#trade-journal"). Kept in its own tiny
// file rather than exported from Landing.tsx itself so the header layout
// component doesn't have to import from a page component - that would make
// Landing.tsx and MarketingChrome.tsx import each other, which bundlers
// tolerate but which is worth just not creating in the first place.
export function featureSlug(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

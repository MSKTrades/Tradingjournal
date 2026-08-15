import { useState } from 'react';
import { currencyCountryCode } from '../data/types';

// flagcdn.com is a long-standing free, no-key public flag-image CDN - used
// here instead of Unicode flag emoji because several platforms (notably
// Windows) don't render the regional-indicator emoji pairs as flags at
// all; they show the raw two-letter code as plain text instead, which is
// what was actually happening in the news widgets. An <img> renders
// identically everywhere. If the image fails to load (e.g. this sandbox's
// network, or an unusual currency code), it just quietly disappears rather
// than showing a broken-image icon.
export default function CurrencyFlag({ code, className }: { code: string | null | undefined; className?: string }) {
  const [failed, setFailed] = useState(false);
  const iso = currencyCountryCode(code);
  if (!iso || failed) return null;
  return (
    <img
      src={`https://flagcdn.com/24x18/${iso}.png`}
      srcSet={`https://flagcdn.com/48x36/${iso}.png 2x`}
      alt=""
      width={18}
      height={13}
      className={className ?? 'inline-block rounded-[2px] shrink-0'}
      onError={() => setFailed(true)}
    />
  );
}

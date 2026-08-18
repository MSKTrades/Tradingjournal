/** PipEcho brand mark: a rounded badge with three ascending bars (a minimal
 * candlestick/bar-chart glyph) on an amber gradient, paired with a two-tone
 * wordmark. Pure inline SVG + text - no image assets to manage, and it scales
 * cleanly at any size or theme. */
export function LogoMark({ size = 28 }: { size?: number }) {
  const id = 'pe-mark-grad';
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fbbf5c" />
          <stop offset="100%" stopColor="#e8790f" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${id})`} />
      <rect x="8" y="17" width="4" height="8" rx="1.2" fill="#2a1605" fillOpacity="0.88" />
      <rect x="14" y="11" width="4" height="14" rx="1.2" fill="#2a1605" />
      <rect x="20" y="6" width="4" height="19" rx="1.2" fill="#2a1605" fillOpacity="0.88" />
    </svg>
  );
}

export function Logo({ size = 28, collapsed = false, className = '' }: { size?: number; collapsed?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <LogoMark size={size} />
      {!collapsed && (
        <span className="font-bold tracking-tight text-[17px] leading-none whitespace-nowrap">
          <span className="text-sidebar-foreground">Pip</span>
          <span className="text-sidebar-active">Echo</span>
        </span>
      )}
    </div>
  );
}

export default Logo;

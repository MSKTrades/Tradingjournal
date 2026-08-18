/** "Continue with ___" buttons for Login/Signup. These are plain <a> tags
 * (not React Router Links, not fetch/onClick) on purpose — starting an
 * OAuth flow means the whole page has to navigate away to Google's own
 * consent screen and then back, so a real browser navigation is exactly
 * what's needed, not a client-side route change or an XHR. */

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.87 2.7-6.62Z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.84.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.95v2.33A9 9 0 0 0 9 18Z"/>
      <path fill="#FBBC05" d="M3.95 10.7A5.4 5.4 0 0 1 3.67 9c0-.59.1-1.16.28-1.7V4.97H.95A9 9 0 0 0 0 9c0 1.45.35 2.83.95 4.03l3-2.33Z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .95 4.97l3 2.33C4.66 5.17 6.65 3.58 9 3.58Z"/>
    </svg>
  );
}

const buttonClass =
  'flex items-center justify-center gap-2.5 w-full h-9 rounded-md border border-input bg-background text-sm font-medium hover:bg-accent transition-colors';

export function OAuthButtons() {
  return (
    <div className="space-y-2.5">
      <a href="/api/columns?resource=auth&action=google_start" className={buttonClass}>
        <GoogleIcon />
        Continue with Google
      </a>
    </div>
  );
}

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  oauth_cancelled: 'Sign-in was cancelled.',
  oauth_invalid_state: "That sign-in link expired or wasn't valid — please try again.",
  oauth_failed: 'Something went wrong signing you in. Please try again or use your email and password.',
  google_not_configured: 'Google sign-in isn\'t set up yet.',
};

export function oauthErrorMessage(code: string | null): string | null {
  if (!code) return null;
  return OAUTH_ERROR_MESSAGES[code] ?? 'Something went wrong signing you in. Please try again.';
}

export function Divider() {
  return (
    <div className="flex items-center gap-3 my-5">
      <div className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">OR</span>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}

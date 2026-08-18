import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';

type Theme = 'light' | 'dark';

const STORAGE_KEY = 'forexforge_theme';

const ThemeContext = createContext<{ theme: Theme; toggle: () => void; setTheme: (t: Theme) => void }>({
  theme: 'dark',
  toggle: () => {},
  setTheme: () => {},
});

function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'dark';
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === 'light' || stored === 'dark') return stored;
  // Default to dark - this is a charting-heavy, screen-all-day tool, and
  // that's the convention every trading platform (and our own reference,
  // FX Replay) ships with. Still respects the OS preference if it's light.
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    window.localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggle = () => setThemeState(t => (t === 'dark' ? 'light' : 'dark'));

  return <ThemeContext.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}

/** Everything a visitor sees before they're signed in — Landing, Pricing,
 * Blog, the blog posts, Login, and Signup — always renders dark. It's the
 * site's visual identity (same as every trading-tool marketing page and
 * the app's own dark-first default), not something that should flip to
 * light just because a visitor's OS/browser prefers light. Only the
 * authenticated app (Summary, Journal, etc.) respects a user's own
 * light/dark toggle.
 *
 * This forces the `dark` class onto <html> for as long as the calling page
 * is mounted, without touching ThemeProvider's own `theme` state — so it
 * never overwrites a logged-in user's real preference for the app itself
 * (important: Pricing/Blog aren't auth-gated, so a logged-in user with
 * "light" saved can land on one, and if we wrote through ThemeProvider's
 * state here it would persist "dark" to localStorage and could clobber
 * their real preference if they close the tab before this unmounts). On
 * unmount it puts the class back to whatever that real preference is.
 *
 * A single class-add isn't reliable on its own: ThemeProvider's own effect
 * (which reflects the real, possibly-light preference) sometimes mounts in
 * the very same commit as the calling page — e.g. Pricing renders
 * immediately, unlike Landing which mounts a beat later behind the
 * logged-in/out check — and React always runs an ancestor's effects after
 * its descendants', so ThemeProvider's effect can strip the class back off
 * right after this hook sets it. A MutationObserver re-asserts it the
 * instant that happens instead of relying on winning that ordering race. */
export function useForceDarkTheme() {
  const { theme } = useTheme();
  const themeRef = useRef(theme);
  themeRef.current = theme;

  useLayoutEffect(() => {
    const root = document.documentElement;
    const ensureDark = () => {
      if (!root.classList.contains('dark')) root.classList.add('dark');
    };
    ensureDark();

    const observer = new MutationObserver(ensureDark);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });

    return () => {
      observer.disconnect();
      if (themeRef.current === 'dark') root.classList.add('dark');
      else root.classList.remove('dark');
    };
  }, []);
}

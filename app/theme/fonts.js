import { Inter, JetBrains_Mono } from 'next/font/google';

/**
 * Self-hosted via next/font/google, so no request leaves the page for a font
 * and there is no layout shift on load.
 *
 * These expose CSS custom properties rather than family names directly, which
 * is what lets `theme.js` reference them without importing any Next.js runtime
 * and therefore stay testable under plain Node.
 */

export const fontSans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-sans',
});

// A grid of times, durations and balances needs figures of equal width.
export const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

/** Applied to <html> by the root layout. */
export const fontVariables = `${fontSans.variable} ${fontMono.variable}`;

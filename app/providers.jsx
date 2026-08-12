'use client';

import CssBaseline from '@mui/material/CssBaseline';
import { ThemeProvider } from '@mui/material/styles';
import { AppRouterCacheProvider } from '@mui/material-nextjs/v16-appRouter';
import { theme } from './theme/theme.js';

/**
 * The Emotion cache provider matched to Next 16's App Router, so MUI styles
 * are collected during the server render instead of flashing unstyled.
 *
 * This is the only client boundary in the root layout: everything above it
 * stays a server component so the session is read on the server and passed
 * down as a prop.
 */
export function Providers({ children }) {
  return (
    <AppRouterCacheProvider options={{ key: 'mui' }}>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}

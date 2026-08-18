import InitColorSchemeScript from '@mui/material/InitColorSchemeScript';
import { Providers } from './providers.jsx';
import { fontVariables } from './theme/fonts.js';

export const metadata = {
  title: 'Pulse',
  description: 'Attendance, leave, PTO and CTO management.',
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: next/font writes its class names onto <html>,
    // and InitColorSchemeScript writes the colour-scheme class alongside them.
    // React otherwise reports both as a server/client mismatch.
    <html lang='en' className={fontVariables} suppressHydrationWarning>
      <body>
        {/* Must run before anything renders. It reads the stored choice and
            sets the class on <html> ahead of the first paint, which is the
            whole of why switching to dark does not flash white first. */}
        <InitColorSchemeScript attribute='class' />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

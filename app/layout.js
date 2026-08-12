import { Providers } from './providers.jsx';
import { fontVariables } from './theme/fonts.js';

export const metadata = {
  title: 'Pulse',
  description: 'Attendance, leave, PTO and CTO management.',
};

export default function RootLayout({ children }) {
  return (
    // suppressHydrationWarning: next/font writes its class names onto <html>,
    // which React otherwise reports as a server/client mismatch.
    <html lang='en' className={fontVariables} suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}

import Paper from '@mui/material/Paper';
import Skeleton from '@mui/material/Skeleton';
import Stack from '@mui/material/Stack';

/**
 * What every authenticated screen shows while it is being read.
 *
 * One file for the whole shell rather than one per module. Next nests this
 * inside `(app)/layout.js` and wraps `page.js` — and every nested layout and
 * page below it — in a Suspense boundary, so a single skeleton covers all
 * eight modules and cannot drift away from any of them.
 *
 * **The reason it exists is the flash.** Without a boundary here, a click on
 * the navigation left the previous screen mounted until the next one had
 * finished reading from Mongo — so the roster's "New user" button sat on top
 * of a half-arrived Attendance page, and a second click landed on whichever
 * screen won. The fallback renders instantly, which makes the swap
 * unambiguous: what is on screen is either the old page or a skeleton, never
 * one page wearing another's controls.
 *
 * The shell itself does not blink. `layout.js` reads the session, and Next
 * keeps a shared layout mounted across a navigation between its children, so
 * the AppBar and the navigation rail stay put and stay interactive — which is
 * also what keeps a slow screen interruptible.
 *
 * Shaped like the pages rather than a spinner: the same `Stack spacing={3}`,
 * a title, a description line and a card. A spinner would say "something is
 * happening"; this says "the thing you clicked is arriving, and here is where
 * its parts will be", and the layout does not jump when they land.
 *
 * `aria-busy` with a label carries the same fact to a screen reader, which
 * cannot see a shimmer. `role='status'` announces it politely rather than
 * interrupting.
 */
export default function Loading() {
  return (
    <Stack spacing={3} role='status' aria-busy='true' aria-label='Loading'>
      <Stack spacing={1}>
        {/* Sized to `pageTitle` and `body2` so the real header lands where
            the skeleton stood, rather than shifting the card down. */}
        <Skeleton variant='text' width='40%' sx={{ fontSize: '1.5rem' }} />
        <Skeleton variant='text' width='65%' sx={{ fontSize: '0.875rem' }} />
      </Stack>

      <Paper variant='outlined'>
        <Stack spacing={2} sx={{ p: 3 }}>
          <Skeleton variant='text' width='30%' sx={{ fontSize: '1rem' }} />
          <Skeleton variant='rounded' height={220} />
        </Stack>
      </Paper>
    </Stack>
  );
}

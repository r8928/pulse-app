import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { endOfYear, format, startOfYear } from 'date-fns';
import { ExceptionCounts } from '../../components/home/ExceptionCounts.jsx';
import { OwnSnapshot } from '../../components/home/OwnSnapshot.jsx';
import { PageHeader } from '../../components/PageHeader.jsx';
import { PERMISSIONS } from '../../constants/index.js';
import { summariseAttendance, summariseBalances } from '../../database.js';
import { countExceptionQueues } from '../../engine/exceptions.js';
import { getSessionUser } from '../../session.js';

/**
 * S-04. The landing page for every role.
 *
 * **Self-service, not a menu.** The module tiles that used to sit at the
 * bottom are gone: the navigation rail is on screen at every width and
 * already lists exactly the modules a viewer's permissions reach, so the
 * tiles were a second door into the same rooms — and a second thing to keep
 * in step with `S-19`. What is left is what only this page can say, which is
 * how the person reading it is doing.
 *
 * Written for a colleague first. Most people signing in hold `EMPLOYEE`, and
 * for them this is the whole product: their year, their balances, and a way
 * to ask why each figure is what it is. "Needs your attention" is below the
 * snapshot rather than above it because only an administrator ever has one.
 *
 * `NFR-1`: each section is read independently and a failure in one is caught
 * where it happens, so one failing count does not blank the page.
 */
async function orNull(read) {
  try {
    return await read();
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const user = await getSessionUser();

  const now = new Date();
  const range = {
    from: format(startOfYear(now), 'yyyy-MM-dd'),
    to: format(endOfYear(now), 'yyyy-MM-dd'),
  };

  const [attendance, balances, counts] = await Promise.all([
    orNull(() => summariseAttendance({ userIds: [user.userId], ...range })),
    orNull(() => summariseBalances({ userIds: [user.userId], ...range })),
    user.permissions[PERMISSIONS.EXCEPTIONS_READ]
      ? orNull(() => countExceptionQueues(range))
      : null,
  ]);

  const mine = attendance?.rows?.[0] ?? null;
  const myBalances = balances?.rows ?? [];

  return (
    <Stack spacing={3}>
      <PageHeader
        title={`Welcome, ${user.name}`}
        description={`Your attendance and leave for ${format(now, 'yyyy')}, and what produced each figure.`}
      />

      <OwnSnapshot
        userId={user.userId}
        attendance={
          mine ?? { present: 0, absent: 0, wfh: 0, leave: 0, lateDays: 0 }
        }
        balances={myBalances.map((row) => ({
          leaveType: row.leaveType,
          balance: row.balance,
        }))}
        hasRecords={
          Boolean(mine) && myBalances.length + (mine?.present ?? 0) > 0
        }
      />

      {counts ? (
        <Stack spacing={2}>
          <Typography variant='sectionTitle'>Needs your attention</Typography>
          <ExceptionCounts counts={counts} />
        </Stack>
      ) : null}
    </Stack>
  );
}

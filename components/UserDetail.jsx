'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { RESTORE_CASE } from '../constants/index.js';
import { useUserMutations } from '../hooks/useUserMutations.js';
import { PageHeader } from './PageHeader.jsx';
import { ReasonDialog } from './ReasonDialog.jsx';
import { UserStatusChips } from './UserStatusChips.jsx';

const TABS = [
  'Overview',
  'Tenures',
  'Shift assignments',
  'Team assignments',
  'Attendance',
  'Leave and balances',
  'History',
];

const FIELD_LABELS = [
  ['fullName', 'Full name'],
  ['employeeCode', 'Employee code'],
  ['workEmail', 'Work email'],
  ['employmentType', 'Employment type'],
  ['role', 'Role'],
  ['dateOfJoining', 'Date of joining'],
  ['dateOfLeaving', 'Date of leaving'],
  ['deletedAt', 'Deleted at'],
];

/**
 * S-07. One user's whole record.
 *
 * Overview, Tenures and History are built; the remaining four tabs are named
 * so the shape of the screen is visible and say plainly that they are not
 * implemented.
 */
export function UserDetail({ user, history, canWrite }) {
  const [tab, setTab] = useState(0);
  const [softDeleteOpen, setSoftDeleteOpen] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [dateOfLeaving, setDateOfLeaving] = useState('');
  const [restoreCase, setRestoreCase] = useState(RESTORE_CASE.CORRECTION);
  const [rehireStart, setRehireStart] = useState('');

  const {
    softDeleteUser,
    restoreUser,
    pending,
    error,
    conflict,
    dismissConflict,
  } = useUserMutations();

  return (
    <Stack spacing={3}>
      <PageHeader
        title={user.fullName}
        description={`Employee code ${user.employeeCode}`}
        meta={<UserStatusChips user={user} />}
        actions={
          canWrite ? (
            user.deletedAt ? (
              <Button variant='contained' onClick={() => setRestoreOpen(true)}>
                Restore
              </Button>
            ) : (
              <Button
                variant='outlined'
                color='error'
                onClick={() => setSoftDeleteOpen(true)}
              >
                Soft delete
              </Button>
            )
          ) : null
        }
      />

      {user.deletedAt ? (
        <Alert severity='info'>
          This user is no longer active. Their records inside their employment
          period are untouched and still appear in every report, marked as such.
        </Alert>
      ) : null}

      {conflict ? (
        // P-47: two administrators on the same period is the normal case.
        <Alert severity='warning' onClose={dismissConflict}>
          This record changed since you loaded it, so your write was rejected
          rather than overwriting theirs. Reload to see the current state.
        </Alert>
      ) : null}

      <Tabs
        value={tab}
        onChange={(_event, next) => setTab(next)}
        variant='scrollable'
        scrollButtons='auto'
      >
        {TABS.map((label) => (
          <Tab key={label} label={label} />
        ))}
      </Tabs>

      {tab === 0 ? (
        <Paper variant='outlined'>
          <Table>
            <TableBody>
              {FIELD_LABELS.map(([field, label]) => (
                <TableRow key={field}>
                  <TableCell sx={{ width: '30%' }}>
                    <Typography variant='bodyStrong'>{label}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>{user[field] ?? '—'}</Typography>
                  </TableCell>
                </TableRow>
              ))}
              <TableRow>
                <TableCell>
                  <Typography variant='bodyStrong'>Tracked</Typography>
                </TableCell>
                <TableCell>{user.tracked ? 'Yes' : 'No'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <Typography variant='bodyStrong'>Login enabled</Typography>
                </TableCell>
                <TableCell>{user.loginEnabled ? 'Yes' : 'No'}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Paper>
      ) : null}

      {tab === 1 ? (
        <Stack spacing={2}>
          <Alert severity='info'>
            The employment period is every tenure below added together, worked
            out when needed and never stored. A date in a gap between two
            tenures carries no day record, exception or deduction.
          </Alert>
          <Paper variant='outlined'>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Start</TableCell>
                  <TableCell>End</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {user.tenures.map((tenure) => (
                  <TableRow key={tenure._id}>
                    <TableCell>
                      <Typography variant='mono'>{tenure.startDate}</Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='mono'>
                        {tenure.endDate ?? '— open'}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {tenure.deletedAt ? 'Soft deleted' : 'Active'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        </Stack>
      ) : null}

      {tab === 6 ? (
        <Paper variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Actor</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Reason</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>
                    <Typography variant='body2' color='text.secondary'>
                      No changes recorded yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                history.map((record) => (
                  <TableRow key={record._id}>
                    <TableCell>
                      {/* Relative time would hide the absolute one, which is
                          what an audit reader actually needs. */}
                      <Typography variant='mono' title={record.at}>
                        {record.at}
                      </Typography>
                    </TableCell>
                    <TableCell>{record.actorName ?? '—'}</TableCell>
                    <TableCell>{record.action}</TableCell>
                    <TableCell>{record.reason ?? '—'}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Paper>
      ) : null}

      {[2, 3, 4, 5].includes(tab) ? (
        <Alert severity='info'>
          {TABS[tab]} is not implemented yet. The collections behind it already
          exist, so it needs no migration when it ships.
        </Alert>
      ) : null}

      <ReasonDialog
        open={softDeleteOpen}
        onClose={() => setSoftDeleteOpen(false)}
        onConfirm={(reason) =>
          softDeleteUser(user._id, {
            dateOfLeaving,
            reason,
            version: user.version,
          })
        }
        title='Soft delete this user'
        description='This records their real last working day and closes their open tenure. Access is revoked immediately. Nothing is destroyed — every record is kept and the change can be undone.'
        confirmLabel='Soft delete'
        confirmColor='error'
        pending={pending}
        error={error}
      >
        <TextField
          label='Date of leaving'
          type='date'
          value={dateOfLeaving}
          onChange={(event) => setDateOfLeaving(event.target.value)}
          required
          fullWidth
          slotProps={{ inputLabel: { shrink: true } }}
          helperText='Their real last working day, which is usually a few days before today.'
        />
      </ReasonDialog>

      <ReasonDialog
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        onConfirm={(reason) =>
          restoreUser(user._id, {
            restoreCase,
            startDate: restoreCase === RESTORE_CASE.REHIRE ? rehireStart : null,
            reason,
            version: user.version,
          })
        }
        title='Restore this user'
        description='State which case applies. The two behave differently and the difference cannot be recovered afterwards.'
        confirmLabel='Restore'
        pending={pending}
        error={error}
      >
        <TextField
          select
          label='Case'
          value={restoreCase}
          onChange={(event) => setRestoreCase(event.target.value)}
          fullWidth
        >
          <MenuItem value={RESTORE_CASE.CORRECTION}>
            Correction — the soft delete was a mistake
          </MenuItem>
          <MenuItem value={RESTORE_CASE.REHIRE}>
            Re-hire — they have returned after a gap
          </MenuItem>
        </TextField>

        {restoreCase === RESTORE_CASE.REHIRE ? (
          <TextField
            label='New tenure start date'
            type='date'
            value={rehireStart}
            onChange={(event) => setRehireStart(event.target.value)}
            required
            fullWidth
            slotProps={{ inputLabel: { shrink: true } }}
            helperText='The gap stays outside their employment period. Their balance starts at zero and entitlement prorates from this date. The date of joining is unchanged.'
          />
        ) : (
          <Alert severity='info'>
            The most recent tenure reopens, leaving no gap. Records soft deleted
            for the re-covered dates come back, and the entries that reversed
            their balance are themselves reversed.
          </Alert>
        )}
      </ReasonDialog>
    </Stack>
  );
}

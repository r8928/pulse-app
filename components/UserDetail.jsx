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
import Link from 'next/link';
import { useState } from 'react';
import { RESTORE_CASE } from '../constants/index.js';
import { useUserMutations } from '../hooks/useUserMutations.js';
import { effective, hasOverride } from '../utils/dayRecord.js';
import { formatDuration } from '../utils/duration.js';
import { DayStatusChip } from './attendance/DayStatusChip.jsx';
import { PageHeader } from './PageHeader.jsx';
import { ReasonDialog } from './ReasonDialog.jsx';
import { UserFormDialog } from './UserFormDialog.jsx';
import { UserStatusChips } from './UserStatusChips.jsx';
import {
  AssignmentsPanel,
  SHIFT_ASSIGNMENTS,
  TEAM_ASSIGNMENTS,
} from './user/AssignmentsPanel.jsx';
import { TenuresPanel } from './user/TenuresPanel.jsx';
import {
  AssignShiftDialog,
  ChangeRoleDialog,
  MoveTeamDialog,
  ToggleFlagDialog,
} from './user/UserActionDialogs.jsx';

const TABS = [
  'Overview',
  'Tenures',
  'Shift assignments',
  'Team assignments',
  'Attendance',
  'Leave and balances',
  'History',
];

/**
 * Both tabs that were placeholders left this list in Phase 5: the engine now
 * produces the day records, and balances replay from the ledger.
 */
const NOT_YET = {};

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
 * S-07. One user's whole record and history.
 *
 * Role, team and shift are deliberately separate actions rather than fields on
 * the edit form: `FR-2.1` gives `IT` the user's own attributes but reserves a
 * role or team change for `OFFICE_ADMIN`, and each carries consequences an
 * ordinary edit does not.
 */
export function UserDetail({
  user,
  history,
  teams,
  shifts,
  colleagues,
  shiftAssignments,
  teamAssignments,
  dayRecords = [],
  canWrite,
}) {
  const [tab, setTab] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [dateOfLeaving, setDateOfLeaving] = useState('');
  const [restoreCase, setRestoreCase] = useState(RESTORE_CASE.CORRECTION);
  const [rehireStart, setRehireStart] = useState('');

  const mutations = useUserMutations();
  const {
    updateUser,
    softDeleteUser,
    restoreUser,
    changeRole,
    moveTeam,
    assignShift,
    setFlag,
    pending,
    error,
    conflict,
    dismissConflict,
  } = mutations;

  const close = () => setDialog(null);
  const open = (name) => () => setDialog(name);

  const currentTeam = teams.find((team) => team._id === user.teamId);
  const managesOutgoingTeam = currentTeam?.managerId === user._id;

  const nameById = (list) => (id) =>
    list.find((item) => item._id === id)?.name ?? null;

  return (
    <Stack spacing={3}>
      <PageHeader
        title={user.fullName}
        description={`Employee code ${user.employeeCode}`}
        meta={<UserStatusChips user={user} />}
        actions={
          canWrite ? (
            <Stack
              direction='row'
              spacing={1}
              sx={{ flexWrap: 'wrap', gap: 1 }}
            >
              {user.deletedAt ? (
                <Button variant='contained' onClick={open('restore')}>
                  Restore
                </Button>
              ) : (
                <>
                  <Button variant='contained' onClick={open('edit')}>
                    Edit
                  </Button>
                  <Button variant='outlined' onClick={open('role')}>
                    Change role
                  </Button>
                  <Button variant='outlined' onClick={open('team')}>
                    Move team
                  </Button>
                  <Button variant='outlined' onClick={open('shift')}>
                    Assign shift
                  </Button>
                  <Button variant='outlined' onClick={open('tracked')}>
                    {user.tracked ? 'Stop tracking' : 'Start tracking'}
                  </Button>
                  <Button variant='outlined' onClick={open('login')}>
                    {user.loginEnabled ? 'Disable login' : 'Enable login'}
                  </Button>
                  <Button
                    variant='outlined'
                    color='error'
                    onClick={open('softDelete')}
                  >
                    Soft delete
                  </Button>
                </>
              )}
            </Stack>
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
                  <Typography variant='bodyStrong'>Team</Typography>
                </TableCell>
                <TableCell>{currentTeam?.name ?? '—'}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>
                  <Typography variant='bodyStrong'>Shift</Typography>
                </TableCell>
                <TableCell>
                  {shifts.find((shift) => shift._id === user.shiftId)?.name ??
                    '—'}
                </TableCell>
              </TableRow>
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
        <TenuresPanel user={user} canWrite={canWrite} mutations={mutations} />
      ) : null}

      {tab === 2 ? (
        <AssignmentsPanel
          {...SHIFT_ASSIGNMENTS}
          assignments={shiftAssignments}
          nameOf={(assignment) => nameById(shifts)(assignment.shiftId)}
          action={
            canWrite ? (
              <Button variant='contained' onClick={open('shift')}>
                Assign shift
              </Button>
            ) : null
          }
        />
      ) : null}

      {tab === 3 ? (
        <AssignmentsPanel
          {...TEAM_ASSIGNMENTS}
          assignments={teamAssignments}
          nameOf={(assignment) => nameById(teams)(assignment.teamId)}
          action={
            canWrite ? (
              <Button variant='contained' onClick={open('team')}>
                Move team
              </Button>
            ) : null
          }
        />
      ) : null}

      {tab === 4 ? (
        <Paper variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Day type</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Worked</TableCell>
                <TableCell>Deduction</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {dayRecords.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5}>
                    <Typography color='text.secondary'>
                      No day records yet. One is created the first time
                      something touches a date — a punch, a day of leave, or an
                      administrator opening the daily grid.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                dayRecords.map((record) => (
                  <TableRow key={record._id}>
                    <TableCell>
                      <Link href={`/attendance/${user._id}/${record.date}`}>
                        {record.date}
                      </Link>
                    </TableCell>
                    <TableCell>{record.dayType}</TableCell>
                    <TableCell>
                      <DayStatusChip
                        status={effective(record, 'dayStatus')}
                        overridden={hasOverride(record, 'dayStatus')}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant='mono'>
                        {formatDuration(
                          effective(record, 'workedMinutes') ?? 0,
                        )}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='mono'>
                        {effective(record, 'deduction') || '—'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Paper>
      ) : null}

      {tab === 5 ? (
        <Paper variant='outlined' sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant='body2' color='text.secondary'>
              Balances are replayed from the ledger and never stored, so they
              live on their own screen with the movements that produced them.
            </Typography>
            <Stack direction='row'>
              <Button
                variant='outlined'
                component={Link}
                href={`/leave/${user._id}/ledger`}
              >
                Open balance history
              </Button>
            </Stack>
          </Stack>
        </Paper>
      ) : null}

      {NOT_YET[tab] ? (
        <Alert severity='info'>
          {NOT_YET[tab]} is not implemented yet. Its collections already exist
          and stay empty until the calculation engine and the ledger ship, so it
          needs no migration when it does.
        </Alert>
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

      <UserFormDialog
        open={dialog === 'edit'}
        onClose={close}
        onSubmit={(data) =>
          updateUser(user._id, { ...data, version: user.version })
        }
        pending={pending}
        error={error}
        employmentTypes={[user.employmentType]}
        initial={user}
      />

      <ChangeRoleDialog
        open={dialog === 'role'}
        onClose={close}
        user={user}
        teams={teams}
        onConfirm={(data) => changeRole(user._id, data)}
        pending={pending}
        error={error}
      />

      <MoveTeamDialog
        open={dialog === 'team'}
        onClose={close}
        user={user}
        teams={teams.filter((team) => team._id !== user.teamId)}
        colleagues={colleagues}
        managesOutgoingTeam={managesOutgoingTeam}
        onConfirm={(data) => moveTeam(user._id, data)}
        pending={pending}
        error={error}
      />

      <AssignShiftDialog
        open={dialog === 'shift'}
        onClose={close}
        user={user}
        shifts={shifts}
        onConfirm={(data) => assignShift(user._id, data)}
        pending={pending}
        error={error}
      />

      <ToggleFlagDialog
        open={dialog === 'tracked'}
        onClose={close}
        user={user}
        field='tracked'
        onConfirm={(data) => setFlag(user._id, data)}
        pending={pending}
        error={error}
      />

      <ToggleFlagDialog
        open={dialog === 'login'}
        onClose={close}
        user={user}
        field='loginEnabled'
        onConfirm={(data) => setFlag(user._id, data)}
        pending={pending}
        error={error}
      />

      <ReasonDialog
        open={dialog === 'softDelete'}
        onClose={close}
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
        open={dialog === 'restore'}
        onClose={close}
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

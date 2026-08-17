'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { DAY_TYPE } from '../../constants/index.js';
import { useAttendanceMutations } from '../../hooks/useAttendanceMutations.js';
import { effective, hasOverride } from '../../utils/dayRecord.js';
import { formatClock, formatDuration } from '../../utils/duration.js';
import { exceptionLabel } from '../../utils/exceptionLabels.js';
import { ReasonDialog } from '../ReasonDialog.jsx';
import { AdjustHoursDialog } from './AdjustHoursDialog.jsx';
import { DayStatusChip } from './DayStatusChip.jsx';
import { DayStatusDialog } from './DayStatusDialog.jsx';
import { PunchDialog } from './PunchDialog.jsx';
import { toInstant } from './punchPairs.js';
import { WaiveDeductionDialog } from './WaiveDeductionDialog.jsx';

/**
 * S-12. Everything the engine concluded about one user on one date, and why.
 *
 * The four sections `list-of-screens.md` names: the punches it read, the
 * values it computed, the deduction with the rule that produced it, and each
 * override beside the engine's own value. Together they are NFR-11 — "why is
 * this number what it is" — answered on one screen.
 */

const OVERRIDABLE = [
  { field: 'dayStatus', label: 'Day status' },
  { field: 'workedMinutes', label: 'Worked duration' },
  { field: 'lateMinutes', label: 'Late minutes' },
  { field: 'deduction', label: 'Deduction' },
];

const SIGNED = (amount) => (amount > 0 ? `+${amount}` : String(amount));

const READABLE_TYPE = (entryType) =>
  entryType.toLowerCase().replaceAll('_', ' ');

/**
 * FR-5.9: the fixed order, narrated. A reader who disagrees with the status
 * needs to see which step decided it, not just the answer.
 */
function classificationSteps(dayRecord, leaveRecord) {
  const overridden = hasOverride(dayRecord, 'dayStatus');
  const dayType = dayRecord.dayType;

  return [
    overridden
      ? `1. An administrator set this day's status, which outranks everything below.`
      : '1. No administrator override on the status.',
    leaveRecord
      ? `2. Authorised leave: ${leaveRecord.leaveType}, ${leaveRecord.amount} day. Leave outranks what the punches show.`
      : '2. No authorised leave for this date.',
    dayType === DAY_TYPE.WORKING
      ? '3. A working day, so the punches decide: any punch makes it worked, none makes it absent.'
      : `3. A ${dayType.toLowerCase().replace('_', ' ')}, so any punch at all makes it worked on a non-working day.`,
  ];
}

function Figure({ label, value, overridden }) {
  return (
    <Stack spacing={0.5}>
      <Typography variant='metricLabel' color='text.secondary'>
        {label}
      </Typography>
      <Typography variant='bodyStrong'>{value}</Typography>
      {overridden ? (
        <Typography variant='caption' color='text.secondary'>
          Set by an administrator
        </Typography>
      ) : null}
    </Stack>
  );
}

export function DayRecordDetail({
  user,
  dayRecord,
  punches,
  leaveRecord,
  ledgerEntries,
  shift,
  canWrite,
  leaveTypes,
}) {
  const [dialog, setDialog] = useState(null);
  const close = () => setDialog(null);

  const {
    createPunch,
    updatePunch,
    softDeletePunch,
    setDayOverride,
    clearDayOverride,
    recordLeave,
    pending,
    error,
  } = useAttendanceMutations();

  const timezone = shift?.timezone ?? 'UTC';
  const userId = String(user._id);

  const submitOverride = async (values) => {
    const ok = await setDayOverride(userId, dayRecord.date, values);
    if (ok) close();
  };

  return (
    <Stack spacing={3}>
      {error ? <Alert severity='error'>{error}</Alert> : null}

      {(dayRecord.exceptions ?? []).length > 0 ? (
        <Alert severity='warning'>
          <Stack spacing={0.5}>
            {dayRecord.exceptions.map((code) => (
              <span key={code}>{exceptionLabel(code)}</span>
            ))}
          </Stack>
        </Alert>
      ) : null}

      <Paper variant='outlined' sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Stack
            direction='row'
            spacing={2}
            sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
          >
            <Typography variant='h6'>Punches</Typography>
            {canWrite ? (
              <Button
                type='button'
                variant='outlined'
                onClick={() => setDialog({ kind: 'punch', punch: null })}
              >
                Add punch
              </Button>
            ) : null}
          </Stack>

          <Typography variant='body2' color='text.secondary'>
            Every punch recorded against this work date, including any excluded
            from the total. Multiple pairs on one day aggregate into a single
            duration (FR-4.6).
          </Typography>

          {punches.length === 0 ? (
            <Typography color='text.secondary'>
              No punches were recorded for this date.
            </Typography>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Time</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Work date</TableCell>
                  <TableCell>State</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {punches.map((punch) => (
                  <TableRow key={String(punch._id)}>
                    <TableCell>
                      <Typography variant='mono'>
                        {formatClock(toInstant(punch.at), timezone)}
                      </Typography>
                    </TableCell>
                    <TableCell>{READABLE_TYPE(punch.type)}</TableCell>
                    <TableCell>{READABLE_TYPE(punch.source)}</TableCell>
                    <TableCell>{punch.workDate ?? 'Not resolved'}</TableCell>
                    <TableCell>
                      {punch.deletedAt ? (
                        <Chip variant='statusNeutral' label='Removed' />
                      ) : punch.isDuplicate ? (
                        <Chip
                          variant='statusWarning'
                          label='Duplicate — excluded from the total'
                        />
                      ) : (
                        <Chip variant='statusSuccess' label='Counted' />
                      )}
                    </TableCell>
                    <TableCell align='right'>
                      {canWrite && !punch.deletedAt ? (
                        <Stack
                          direction='row'
                          spacing={1}
                          sx={{ justifyContent: 'flex-end' }}
                        >
                          <Button
                            type='button'
                            size='small'
                            onClick={() => setDialog({ kind: 'punch', punch })}
                          >
                            Correct
                          </Button>
                          <Button
                            type='button'
                            size='small'
                            color='error'
                            onClick={() =>
                              setDialog({ kind: 'removePunch', punch })
                            }
                          >
                            Remove
                          </Button>
                        </Stack>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </Paper>

      <Paper variant='outlined' sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant='h6'>What the engine computed</Typography>

          <Grid container spacing={3}>
            <Grid size={{ xs: 6, md: 3 }}>
              <Figure
                label='Worked'
                value={formatDuration(
                  effective(dayRecord, 'workedMinutes') ?? 0,
                )}
                overridden={hasOverride(dayRecord, 'workedMinutes')}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Figure label='Day type' value={dayRecord.dayType} />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Figure
                label='Late minutes'
                value={effective(dayRecord, 'lateMinutes') ?? 0}
                overridden={hasOverride(dayRecord, 'lateMinutes')}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 3 }}>
              <Figure
                label='Early departure'
                value={dayRecord.computed.earlyMinutes ?? 0}
              />
            </Grid>
          </Grid>

          <Stack spacing={1}>
            <Typography variant='metricLabel' color='text.secondary'>
              Day status
            </Typography>
            <DayStatusChip
              status={shift ? effective(dayRecord, 'dayStatus') : null}
              overridden={hasOverride(dayRecord, 'dayStatus')}
            />
          </Stack>

          <Stack spacing={0.5}>
            <Typography variant='metricLabel' color='text.secondary'>
              How that status was reached
            </Typography>
            {classificationSteps(dayRecord, leaveRecord).map((step) => (
              <Typography key={step} variant='body2' color='text.secondary'>
                {step}
              </Typography>
            ))}
          </Stack>

          {canWrite ? (
            <Stack direction='row' spacing={1}>
              <Button
                type='button'
                onClick={() => setDialog({ kind: 'status' })}
              >
                Set day status
              </Button>
              <Button
                type='button'
                onClick={() => setDialog({ kind: 'hours' })}
              >
                Adjust hours
              </Button>
            </Stack>
          ) : null}
        </Stack>
      </Paper>

      <Paper variant='outlined' sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant='h6'>Deduction</Typography>

          <Grid container spacing={3}>
            <Grid size={{ xs: 6, md: 4 }}>
              <Figure
                label='Deducted'
                value={effective(dayRecord, 'deduction') ?? 0}
                overridden={hasOverride(dayRecord, 'deduction')}
              />
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Stack spacing={0.5}>
                <Typography variant='metricLabel' color='text.secondary'>
                  Rule
                </Typography>
                <Typography variant='mono'>
                  {effective(dayRecord, 'deductionRule') ?? 'None applied'}
                </Typography>
              </Stack>
            </Grid>
            <Grid size={{ xs: 6, md: 4 }}>
              <Figure
                label='Short day'
                value={dayRecord.computed.isShortDay ? 'Yes' : 'No'}
              />
            </Grid>
          </Grid>

          {canWrite && (effective(dayRecord, 'deduction') ?? 0) > 0 ? (
            <Stack direction='row'>
              <Button
                type='button'
                onClick={() => setDialog({ kind: 'waive' })}
              >
                Waive deduction
              </Button>
            </Stack>
          ) : null}
        </Stack>
      </Paper>

      <Paper variant='outlined' sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant='h6'>Overrides</Typography>

          {dayRecord.override ? (
            <Stack spacing={2}>
              <Typography variant='body2' color='text.secondary'>
                Set by {dayRecord.override.actorName} —{' '}
                {dayRecord.override.reason}
              </Typography>

              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Value</TableCell>
                    <TableCell>The engine said</TableCell>
                    <TableCell>An administrator set</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {OVERRIDABLE.filter((entry) =>
                    hasOverride(dayRecord, entry.field),
                  ).map((entry) => (
                    <TableRow key={entry.field}>
                      <TableCell>{entry.label}</TableCell>
                      <TableCell>
                        <Typography variant='mono'>
                          {String(dayRecord.computed[entry.field])}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant='mono'>
                          {String(dayRecord.override[entry.field])}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {canWrite ? (
                <Stack direction='row'>
                  <Button
                    type='button'
                    onClick={() => setDialog({ kind: 'clearOverride' })}
                  >
                    Remove override
                  </Button>
                </Stack>
              ) : null}
            </Stack>
          ) : (
            <Typography color='text.secondary'>
              No override has been applied. Every figure above is the engine's
              own, and a recalculation refreshes it.
            </Typography>
          )}
        </Stack>
      </Paper>

      <Paper variant='outlined' sx={{ p: 3 }}>
        <Stack spacing={2}>
          <Typography variant='h6'>Ledger movements</Typography>

          {ledgerEntries.length === 0 ? (
            <Typography color='text.secondary'>
              This day moved no balance.
            </Typography>
          ) : (
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Movement</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell>Amount</TableCell>
                  <TableCell>Rule</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {ledgerEntries.map((entry) => (
                  <TableRow key={String(entry._id)}>
                    <TableCell>
                      {READABLE_TYPE(entry.entryType)}
                      {entry.reversalOf ? ' (cancels an earlier movement)' : ''}
                    </TableCell>
                    <TableCell>{entry.leaveType}</TableCell>
                    <TableCell>
                      <Typography variant='mono'>
                        {SIGNED(entry.amount)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='mono'>
                        {entry.rule ?? '—'}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Stack>
      </Paper>

      {dialog?.kind === 'punch' ? (
        <PunchDialog
          punch={dialog.punch}
          userName={user.fullName}
          timezone={timezone}
          workDate={dayRecord.date}
          open
          onClose={close}
          onSubmit={async (values) => {
            const ok = dialog.punch
              ? await updatePunch(String(dialog.punch._id), values)
              : await createPunch({ userId, ...values });
            if (ok) close();
          }}
          pending={pending}
          error={error}
        />
      ) : null}

      {dialog?.kind === 'removePunch' ? (
        <ReasonDialog
          open
          title='Remove punch'
          description='The punch is kept and marked removed, never destroyed, and this day is recalculated without it.'
          confirmLabel='Remove punch'
          confirmColor='error'
          pending={pending}
          error={error}
          onClose={close}
          onConfirm={(reason) =>
            softDeletePunch(String(dialog.punch._id), {
              reason,
              version: dialog.punch.version,
            })
          }
        />
      ) : null}

      {dialog?.kind === 'status' ? (
        <DayStatusDialog
          record={dayRecord}
          userName={user.fullName}
          leaveTypes={leaveTypes}
          open
          onClose={close}
          onSubmit={async (values) => {
            const ok = values.leaveType
              ? await recordLeave({
                  userId,
                  date: dayRecord.date,
                  leaveType: values.leaveType,
                  amount: values.amount,
                  halfDayPeriod: values.halfDayPeriod,
                  reason: values.reason,
                })
              : await setDayOverride(userId, dayRecord.date, values);
            if (ok) close();
          }}
          pending={pending}
          error={error}
        />
      ) : null}

      {dialog?.kind === 'hours' ? (
        <AdjustHoursDialog
          record={dayRecord}
          userName={user.fullName}
          open
          onClose={close}
          onSubmit={submitOverride}
          pending={pending}
          error={error}
        />
      ) : null}

      {dialog?.kind === 'waive' ? (
        <WaiveDeductionDialog
          record={dayRecord}
          userName={user.fullName}
          open
          onClose={close}
          onSubmit={submitOverride}
          pending={pending}
          error={error}
        />
      ) : null}

      {dialog?.kind === 'clearOverride' ? (
        <ReasonDialog
          open
          title='Remove override'
          description="Removing an administrator's decision is itself a decision, so it takes its own reason. The engine's value takes over and any movement the override posted is reversed."
          confirmLabel='Remove override'
          pending={pending}
          error={error}
          onClose={close}
          onConfirm={(reason) =>
            clearDayOverride(userId, dayRecord.date, {
              reason,
              version: dayRecord.version,
            })
          }
        />
      ) : null}
    </Stack>
  );
}

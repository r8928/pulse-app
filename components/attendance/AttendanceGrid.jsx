'use client';

import MoreVertOutlined from '@mui/icons-material/MoreVertOutlined';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import Alert from '@mui/material/Alert';
import IconButton from '@mui/material/IconButton';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useState } from 'react';
import { useAttendanceMutations } from '../../hooks/useAttendanceMutations.js';
import { effective, hasOverride } from '../../utils/dayRecord.js';
import { formatDuration } from '../../utils/duration.js';
import { exceptionLabel } from '../../utils/exceptionLabels.js';
import { EmptyState } from '../EmptyState.jsx';
import { AdjustHoursDialog } from './AdjustHoursDialog.jsx';
import { DayStatusChip } from './DayStatusChip.jsx';
import { DayStatusDialog } from './DayStatusDialog.jsx';
import { PunchDialog } from './PunchDialog.jsx';
import { punchPairLabels } from './punchPairs.js';
import { WaiveDeductionDialog } from './WaiveDeductionDialog.jsx';

/**
 * S-10. One team, one date — the write surface, built so a single day's
 * correction takes three clicks or fewer from S-04 (NFR-1).
 *
 * Dense by intent: an administrator correcting a day is comparing colleagues
 * against each other, so every figure stays on one row and the actions sit
 * behind that row's menu rather than spreading the table out.
 *
 * Untracked colleagues never appear — they receive no day records (FR-2.10) —
 * and the exclusion is stated rather than left silent.
 */
export function AttendanceGrid({
  rows,
  date,
  canWrite,
  leaveTypes,
  untrackedCount = 0,
}) {
  const [menu, setMenu] = useState(null);
  const [dialog, setDialog] = useState(null);

  const { createPunch, setDayOverride, recordLeave, pending, error } =
    useAttendanceMutations();

  const close = () => setDialog(null);

  const openFor = (kind) => {
    const row = menu.row;
    setMenu(null);
    setDialog({ kind, row });
  };

  /**
   * D-9: choosing LEAVE writes a leave RECORD, not a status override, and the
   * engine reaches LEAVE from it. Every other status is an override. The
   * dialog signals which by whether it sent a leave type.
   */
  const submitStatus = async (values) => {
    const { row } = dialog;
    const ok = values.leaveType
      ? await recordLeave({
          userId: String(row.user._id),
          date,
          leaveType: values.leaveType,
          amount: values.amount,
          halfDayPeriod: values.halfDayPeriod,
          reason: values.reason,
        })
      : await setDayOverride(String(row.user._id), date, values);

    if (ok) close();
  };

  const submitOverride = async (values) => {
    const ok = await setDayOverride(String(dialog.row.user._id), date, values);
    if (ok) close();
  };

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<WarningAmberOutlined fontSize='large' />}
        title='No tracked member has a record for this date'
        description='Either nobody on this team was employed on it, or the date falls outside every tenure. Untracked colleagues never receive day records.'
      />
    );
  }

  return (
    <Stack spacing={2}>
      {untrackedCount > 0 ? (
        <Alert severity='info'>
          {untrackedCount} untracked{' '}
          {untrackedCount === 1 ? 'colleague is' : 'colleagues are'} excluded
          from this grid. Untracked colleagues receive no day records at all.
        </Alert>
      ) : null}

      {error ? <Alert severity='error'>{error}</Alert> : null}

      <Paper variant='outlined'>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Employee</TableCell>
              <TableCell>Punches</TableCell>
              <TableCell>Worked</TableCell>
              <TableCell>Day type</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Late</TableCell>
              <TableCell>Deduction</TableCell>
              <TableCell>{canWrite ? 'Actions' : ''}</TableCell>
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row) => {
              const record = row.dayRecord;
              const timezone = row.shift?.timezone ?? 'UTC';
              const pairs = punchPairLabels(row.punches, timezone);
              const late = effective(record, 'lateMinutes') ?? 0;
              const deduction = effective(record, 'deduction') ?? 0;

              return (
                <TableRow key={String(row.user._id)}>
                  <TableCell>
                    <Stack spacing={0.25}>
                      <Link href={`/attendance/${row.user._id}/${date}`}>
                        {row.user.fullName}
                      </Link>
                      <Typography variant='caption' color='text.secondary'>
                        {row.user.employeeCode}
                      </Typography>
                    </Stack>
                  </TableCell>

                  <TableCell>
                    {pairs.length === 0 ? (
                      <Typography color='text.secondary'>—</Typography>
                    ) : (
                      <Stack spacing={0.25}>
                        {pairs.map((pair) => (
                          <Typography key={pair} variant='mono'>
                            {pair}
                          </Typography>
                        ))}
                      </Stack>
                    )}
                  </TableCell>

                  <TableCell>
                    <Typography variant='mono'>
                      {formatDuration(effective(record, 'workedMinutes') ?? 0)}
                    </Typography>
                  </TableCell>

                  <TableCell>{record.dayType}</TableCell>

                  <TableCell>
                    <DayStatusChip
                      status={row.shift ? effective(record, 'dayStatus') : null}
                      overridden={hasOverride(record, 'dayStatus')}
                    />
                  </TableCell>

                  <TableCell>
                    <Typography variant='mono'>
                      {late === 0 ? '—' : `${late}m`}
                    </Typography>
                  </TableCell>

                  <TableCell>
                    <Stack spacing={0.25}>
                      <Typography variant='mono'>
                        {deduction === 0 ? '—' : deduction}
                      </Typography>
                      {effective(record, 'deductionRule') ? (
                        <Typography variant='caption' color='text.secondary'>
                          {effective(record, 'deductionRule')}
                        </Typography>
                      ) : null}
                    </Stack>
                  </TableCell>

                  <TableCell>
                    <Stack
                      direction='row'
                      spacing={1}
                      sx={{ alignItems: 'center', justifyContent: 'flex-end' }}
                    >
                      {(record.exceptions ?? []).map((code) => (
                        <Typography
                          key={code}
                          variant='caption'
                          color='warning.main'
                        >
                          {exceptionLabel(code)}
                        </Typography>
                      ))}

                      {canWrite ? (
                        <IconButton
                          aria-label={`Actions for ${row.user.fullName}`}
                          onClick={(event) =>
                            setMenu({ anchor: event.currentTarget, row })
                          }
                        >
                          <MoreVertOutlined fontSize='small' />
                        </IconButton>
                      ) : null}
                    </Stack>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Paper>

      <Menu
        anchorEl={menu?.anchor ?? null}
        open={Boolean(menu)}
        onClose={() => setMenu(null)}
      >
        <MenuItem onClick={() => openFor('punch')}>Add punch</MenuItem>
        <MenuItem onClick={() => openFor('status')}>Set day status</MenuItem>
        <MenuItem onClick={() => openFor('hours')}>Adjust hours</MenuItem>
        <MenuItem onClick={() => openFor('waive')}>Waive deduction</MenuItem>
      </Menu>

      {dialog?.kind === 'punch' ? (
        <PunchDialog
          punch={null}
          userName={dialog.row.user.fullName}
          timezone={dialog.row.shift?.timezone ?? 'UTC'}
          workDate={date}
          open
          onClose={close}
          onSubmit={async (values) => {
            const ok = await createPunch({
              userId: String(dialog.row.user._id),
              ...values,
            });
            if (ok) close();
          }}
          pending={pending}
          error={error}
        />
      ) : null}

      {dialog?.kind === 'status' ? (
        <DayStatusDialog
          record={dialog.row.dayRecord}
          userName={dialog.row.user.fullName}
          leaveTypes={leaveTypes}
          open
          onClose={close}
          onSubmit={submitStatus}
          pending={pending}
          error={error}
        />
      ) : null}

      {dialog?.kind === 'hours' ? (
        <AdjustHoursDialog
          record={dialog.row.dayRecord}
          userName={dialog.row.user.fullName}
          open
          onClose={close}
          onSubmit={submitOverride}
          pending={pending}
          error={error}
        />
      ) : null}

      {dialog?.kind === 'waive' ? (
        <WaiveDeductionDialog
          record={dialog.row.dayRecord}
          userName={dialog.row.user.fullName}
          open
          onClose={close}
          onSubmit={submitOverride}
          pending={pending}
          error={error}
        />
      ) : null}
    </Stack>
  );
}

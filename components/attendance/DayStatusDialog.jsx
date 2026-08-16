'use client';

import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { DAY_STATUS, HALF_DAY_PERIOD } from '../../constants/index.js';
import { effective } from '../../utils/dayRecord.js';
import { DayStatusChip } from './DayStatusChip.jsx';
import { OverrideDialogShell } from './OverrideDialogShell.jsx';

/**
 * P-23. FR-5.2 and FR-5.4.
 *
 * Choosing LEAVE does not write a status: D-9 makes a leave fact a genuine
 * engine INPUT, so it writes a leave record and lets the engine reach LEAVE
 * on its own. Every other status is an override sitting beside the engine's
 * conclusion. The caller tells the two apart by the presence of `leaveType`.
 *
 * BR-11 and D-11: a half day carries the half it covers, because the ladder
 * still runs on the half that was worked and "late" is meaningless without
 * knowing which half that was.
 */
const OPTIONS = [
  { value: DAY_STATUS.WFO, label: 'Worked in office' },
  { value: DAY_STATUS.WFH, label: 'Worked from home' },
  { value: DAY_STATUS.LEAVE, label: 'On leave' },
  { value: DAY_STATUS.HOLIDAY_WORK, label: 'Worked a non-working day' },
  { value: DAY_STATUS.WEEKLY_OFF, label: 'Weekly off' },
  { value: DAY_STATUS.HOLIDAY, label: 'Holiday' },
  { value: DAY_STATUS.ABSENT, label: 'Absent' },
];

export function DayStatusDialog({
  record,
  userName,
  leaveTypes = [],
  open,
  onClose,
  onSubmit,
  pending,
  error,
}) {
  const [dayStatus, setDayStatus] = useState(DAY_STATUS.WFH);
  const [leaveType, setLeaveType] = useState(leaveTypes[0]?.name ?? '');
  const [amount, setAmount] = useState(1);
  const [halfDayPeriod, setHalfDayPeriod] = useState(HALF_DAY_PERIOD.MORNING);
  const [reason, setReason] = useState('');

  const isLeave = dayStatus === DAY_STATUS.LEAVE;

  const handleSubmit = () =>
    onSubmit({
      dayStatus,
      reason: reason.trim(),
      version: record.version,
      ...(isLeave
        ? {
            leaveType,
            amount,
            halfDayPeriod: amount === 0.5 ? halfDayPeriod : null,
          }
        : {}),
    });

  return (
    <OverrideDialogShell
      title='Set day status'
      description={`Setting the status of ${userName}'s ${record.date}. The engine's own
        conclusion is kept beside yours and refreshed whenever this day is
        recalculated.`}
      engineLabel='The engine concluded'
      engineValue={<DayStatusChip status={effective(record, 'dayStatus')} />}
      submitLabel='Save status'
      canSubmit={!isLeave || Boolean(leaveType)}
      open={open}
      onClose={onClose}
      onSubmit={handleSubmit}
      pending={pending}
      error={error}
      reason={reason}
      onReasonChange={setReason}
    >
      <TextField
        select
        label='New status'
        value={dayStatus}
        onChange={(event) => setDayStatus(event.target.value)}
        slotProps={{ inputLabel: { shrink: true } }}
      >
        {OPTIONS.map((option) => (
          <MenuItem key={option.value} value={option.value}>
            {option.label}
          </MenuItem>
        ))}
      </TextField>

      {isLeave ? (
        <TextField
          select
          label='Leave type'
          value={leaveType}
          onChange={(event) => setLeaveType(event.target.value)}
          helperText='Which balance this day spends. A leave record is written, not a status override.'
          slotProps={{ inputLabel: { shrink: true } }}
        >
          {leaveTypes.map((type) => (
            <MenuItem key={type.name} value={type.name}>
              {type.name}
            </MenuItem>
          ))}
        </TextField>
      ) : null}

      {isLeave ? (
        <TextField
          select
          label='Amount'
          value={amount}
          onChange={(event) => setAmount(Number(event.target.value))}
          slotProps={{ inputLabel: { shrink: true } }}
        >
          <MenuItem value={1}>Full day</MenuItem>
          <MenuItem value={0.5}>Half day</MenuItem>
        </TextField>
      ) : null}

      {isLeave && amount === 0.5 ? (
        <TextField
          select
          label='Which half'
          value={halfDayPeriod}
          onChange={(event) => setHalfDayPeriod(event.target.value)}
          helperText='The half taken as leave. Lateness is measured against the half that was worked.'
          slotProps={{ inputLabel: { shrink: true } }}
        >
          <MenuItem value={HALF_DAY_PERIOD.MORNING}>Morning</MenuItem>
          <MenuItem value={HALF_DAY_PERIOD.AFTERNOON}>Afternoon</MenuItem>
        </TextField>
      ) : null}
    </OverrideDialogShell>
  );
}

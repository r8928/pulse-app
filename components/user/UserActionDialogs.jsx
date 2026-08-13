'use client';

import Alert from '@mui/material/Alert';
import MenuItem from '@mui/material/MenuItem';
import TextField from '@mui/material/TextField';
import { useState } from 'react';
import { ROLES, UNASSIGNED } from '../../constants/index.js';
import { ReasonDialog } from '../ReasonDialog.jsx';

/**
 * P-10 to P-14. Five decisions that each change one thing about a user, and
 * each carry a mandatory reason into the audit log (`FR-4.10`).
 *
 * They share `ReasonDialog` rather than each inventing a confirm, so the
 * requirement is stated by a blocked button before the click rather than by a
 * validation message after it.
 */

/** P-10. FR-1.7: one role at a time, and MANAGER names the team. */
export function ChangeRoleDialog({
  open,
  onClose,
  user,
  teams,
  onConfirm,
  pending,
  error,
}) {
  const [role, setRole] = useState(user.role);
  const [teamId, setTeamId] = useState(user.teamId ?? UNASSIGNED);

  return (
    <ReasonDialog
      open={open}
      onClose={onClose}
      onConfirm={(reason) =>
        onConfirm({
          role,
          teamId: teamId === UNASSIGNED ? null : teamId,
          reason,
          version: user.version,
        })
      }
      title='Change role'
      description='A user holds exactly one role at a time. The change takes effect on their next request — they do not need to sign in again.'
      confirmLabel='Change role'
      pending={pending}
      error={error}
    >
      <TextField
        select
        label='Role'
        value={role}
        onChange={(event) => setRole(event.target.value)}
        fullWidth
        helperText='Changing employment type is a separate operation and changes no permission.'
      >
        {Object.values(ROLES).map((each) => (
          <MenuItem key={each} value={each}>
            {each}
          </MenuItem>
        ))}
      </TextField>

      {role === ROLES.MANAGER ? (
        <TextField
          select
          label='Team they will manage'
          value={teamId}
          onChange={(event) => setTeamId(event.target.value)}
          required
          fullWidth
          slotProps={{
            select: { displayEmpty: true },
            inputLabel: { shrink: true },
          }}
          helperText='Required. That team’s previous manager is replaced in the same action, so exactly one manager holds before and after.'
        >
          <MenuItem value={UNASSIGNED}>Choose a team</MenuItem>
          {teams.map((team) => (
            <MenuItem key={team._id} value={team._id}>
              {team.name}
            </MenuItem>
          ))}
        </TextField>
      ) : null}
    </ReasonDialog>
  );
}

/** P-11. FR-3.14: an effective date, and history is never rewritten. */
export function MoveTeamDialog({
  open,
  onClose,
  user,
  teams,
  colleagues,
  managesOutgoingTeam,
  onConfirm,
  pending,
  error,
}) {
  const [teamId, setTeamId] = useState(UNASSIGNED);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [replacementManagerId, setReplacementManagerId] = useState(UNASSIGNED);

  return (
    <ReasonDialog
      open={open}
      onClose={onClose}
      onConfirm={(reason) =>
        onConfirm({
          teamId: teamId === UNASSIGNED ? null : teamId,
          effectiveFrom,
          replacementManagerId:
            replacementManagerId === UNASSIGNED ? null : replacementManagerId,
          reason,
          version: user.version,
        })
      }
      title='Move to another team'
      description='This is an edit of the user’s assignment and changes neither team. The move is recorded with an effective date, so the team they held on any past date stays the team every past report resolves through.'
      confirmLabel='Move team'
      pending={pending}
      error={error}
    >
      <TextField
        select
        label='New team'
        value={teamId}
        onChange={(event) => setTeamId(event.target.value)}
        required
        fullWidth
        slotProps={{
          select: { displayEmpty: true },
          inputLabel: { shrink: true },
        }}
      >
        <MenuItem value={UNASSIGNED}>Choose a team</MenuItem>
        {teams.map((team) => (
          <MenuItem key={team._id} value={team._id}>
            {team.name}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        label='Effective from'
        type='date'
        value={effectiveFrom}
        onChange={(event) => setEffectiveFrom(event.target.value)}
        required
        fullWidth
        slotProps={{ inputLabel: { shrink: true } }}
        helperText='Everything before this date keeps the old team. Recalculation runs from here forward only.'
      />

      {managesOutgoingTeam ? (
        <TextField
          select
          label='Replacement manager for their current team'
          value={replacementManagerId}
          onChange={(event) => setReplacementManagerId(event.target.value)}
          required
          fullWidth
          slotProps={{
            select: { displayEmpty: true },
            inputLabel: { shrink: true },
          }}
          helperText='Required, because this user manages the team they are leaving and no team may be left without one.'
        >
          <MenuItem value={UNASSIGNED}>Choose a replacement</MenuItem>
          {colleagues.map((colleague) => (
            <MenuItem key={colleague._id} value={colleague._id}>
              {colleague.fullName}
            </MenuItem>
          ))}
        </TextField>
      ) : null}

      <Alert severity='info'>
        Where this user held their team’s default shift they take the new
        team’s; where they held a shift of their own they keep it.
      </Alert>
    </ReasonDialog>
  );
}

/** P-12. FR-3.6: an effective date range, so a mid-year change is kept. */
export function AssignShiftDialog({
  open,
  onClose,
  user,
  shifts,
  onConfirm,
  pending,
  error,
}) {
  const [shiftId, setShiftId] = useState(UNASSIGNED);
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');

  return (
    <ReasonDialog
      open={open}
      onClose={onClose}
      onConfirm={(reason) =>
        onConfirm({
          shiftId: shiftId === UNASSIGNED ? null : shiftId,
          effectiveFrom,
          effectiveTo: effectiveTo || null,
          reason,
          version: user.version,
        })
      }
      title='Assign a shift'
      description='Recorded with an effective date range, so a mid-year shift change is preserved historically rather than overwriting the past. A shift is required for a tracked user and optional for an untracked one.'
      confirmLabel='Assign shift'
      pending={pending}
      error={error}
    >
      <TextField
        select
        label='Shift'
        value={shiftId}
        onChange={(event) => setShiftId(event.target.value)}
        required
        fullWidth
        slotProps={{
          select: { displayEmpty: true },
          inputLabel: { shrink: true },
        }}
        helperText={
          shifts.length === 0
            ? 'This user’s team has no shift yet. One is created on the team’s configuration screen.'
            : 'The shifts belonging to this user’s team. Each carries its own timezone.'
        }
      >
        <MenuItem value={UNASSIGNED}>Choose a shift</MenuItem>
        {shifts.map((shift) => (
          <MenuItem key={shift._id} value={shift._id}>
            {shift.name} — {shift.timezone}
          </MenuItem>
        ))}
      </TextField>

      <TextField
        label='Effective from'
        type='date'
        value={effectiveFrom}
        onChange={(event) => setEffectiveFrom(event.target.value)}
        required
        fullWidth
        slotProps={{ inputLabel: { shrink: true } }}
      />

      <TextField
        label='Effective to'
        type='date'
        value={effectiveTo}
        onChange={(event) => setEffectiveTo(event.target.value)}
        fullWidth
        slotProps={{ inputLabel: { shrink: true } }}
        helperText='Leave empty while the assignment is open ended.'
      />
    </ReasonDialog>
  );
}

/**
 * P-13 and P-14. One dialog for the two independent booleans of `FR-2.5`,
 * because the only difference between them is which one is being set and what
 * that means.
 */
const FLAG_COPY = {
  tracked: {
    title: 'Change whether attendance is tracked',
    on: 'Turning this on starts producing day records from this point forward. It creates nothing for the past.',
    off: 'Turning this off keeps the user and every attendance record already made. They simply receive no new day records, need no shift, raise no exception and are excluded from attendance totals — with the exclusion stated rather than left silent.',
  },
  loginEnabled: {
    title: 'Change whether this user can sign in',
    on: 'They can sign in again, provided they hold a work email on an authorised Workspace domain.',
    off: 'Access is revoked without touching any history. The user and all their records stay exactly as they are.',
  },
};

export function ToggleFlagDialog({
  open,
  onClose,
  user,
  field,
  onConfirm,
  pending,
  error,
}) {
  const current = Boolean(user[field]);
  const copy = FLAG_COPY[field] ?? FLAG_COPY.tracked;

  return (
    <ReasonDialog
      open={open}
      onClose={onClose}
      onConfirm={(reason) =>
        onConfirm({ field, value: !current, reason, version: user.version })
      }
      title={copy.title}
      description={current ? copy.off : copy.on}
      confirmLabel={current ? 'Turn off' : 'Turn on'}
      confirmColor={current ? 'error' : 'primary'}
      pending={pending}
      error={error}
    />
  );
}

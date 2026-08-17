'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Tabs from '@mui/material/Tabs';
import TextField from '@mui/material/TextField';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { APPROVAL_STATUS } from '../../constants/index.js';
import { usePtoMutations } from '../../hooks/usePtoMutations.js';
import { EmptyState } from '../EmptyState.jsx';
import { ApproveDialog } from './ApproveDialog.jsx';
import { DeclineDialog } from './DeclineDialog.jsx';
import { OriginateDialog } from './OriginateDialog.jsx';
import { OverrideExpiryDialog } from './OverrideExpiryDialog.jsx';
import { PtoAwardsTable } from './PtoAwardsTable.jsx';

/**
 * S-15. Every PTO award and CTO application, at every stage.
 *
 * The two halves sit behind tabs rather than in one merged list: they are
 * decided differently (`BR-26` applies only to CTO) and expire differently
 * (only PTO expires), so a merged table would need a column that is blank for
 * half its rows.
 *
 * Range and team narrow the query on the server, because those decide which
 * records are fetched at all. Status filters what is already in hand, which
 * is what lets the empty state tell "nothing was ever raised" apart from
 * "everything raised has been decided" — two very different things to a
 * reader who came here expecting a queue.
 */
const KINDS = {
  PTO: {
    label: 'PTO award',
    tab: 'PTO awards',
    originate: 'Grant PTO manually',
  },
  CTO: {
    label: 'CTO application',
    tab: 'CTO applications',
    originate: 'Apply CTO manually',
  },
};

export function PtoCandidates({
  awards,
  applications,
  teams,
  people,
  filters,
  canApprove,
  today,
}) {
  const router = useRouter();
  const [kind, setKind] = useState('PTO');
  const [status, setStatus] = useState(APPROVAL_STATUS.PENDING);
  const [dialog, setDialog] = useState(null);

  const {
    approvePto,
    declinePto,
    originatePto,
    overrideExpiry,
    approveCto,
    declineCto,
    originateCto,
    pending,
    error,
    conflict,
    dismissConflict,
  } = usePtoMutations();

  const isCto = kind === 'CTO';
  const items = isCto ? applications : awards;
  const rows = status ? items.filter((item) => item.status === status) : items;

  const go = (next) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries({ ...filters, ...next })) {
      if (value) query.set(key, String(value));
    }
    router.push(`/pto?${query.toString()}`);
  };

  const close = () => setDialog(null);

  const submit = async (action) => {
    if (await action) close();
  };

  const emptyMessage = () => {
    if (items.length === 0) {
      return `No ${KINDS[kind].label} has been raised for this range. The engine proposes one only when a day's attendance data calls for it.`;
    }
    if (status === APPROVAL_STATUS.PENDING) {
      return `Every ${KINDS[kind].label} here has already been decided. Choose another status to read them.`;
    }
    return `No ${KINDS[kind].label} at this status.`;
  };

  return (
    <Stack spacing={2}>
      <Paper variant='outlined' sx={{ p: 2 }}>
        <Stack
          direction={{ xs: 'column', md: 'row' }}
          spacing={2}
          sx={{ alignItems: { md: 'center' } }}
        >
          <TextField
            label='From'
            type='date'
            value={filters.from}
            onChange={(event) => go({ from: event.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label='To'
            type='date'
            value={filters.to}
            onChange={(event) => go({ to: event.target.value })}
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            select
            label='Team'
            value={filters.teamId ?? ''}
            onChange={(event) => go({ teamId: event.target.value })}
            slotProps={{
              select: { displayEmpty: true },
              inputLabel: { shrink: true },
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value=''>Every team</MenuItem>
            {teams.map((team) => (
              <MenuItem key={team._id} value={team._id}>
                {team.name}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label='Status'
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            slotProps={{
              select: { displayEmpty: true },
              inputLabel: { shrink: true },
            }}
            sx={{ minWidth: 180 }}
          >
            <MenuItem value=''>Every status</MenuItem>
            <MenuItem value={APPROVAL_STATUS.PENDING}>Suggested</MenuItem>
            <MenuItem value={APPROVAL_STATUS.APPROVED}>Approved</MenuItem>
            <MenuItem value={APPROVAL_STATUS.DECLINED}>Declined</MenuItem>
          </TextField>

          {canApprove ? (
            <Button
              type='button'
              variant='outlined'
              onClick={() => setDialog({ action: 'originate' })}
            >
              {KINDS[kind].originate}
            </Button>
          ) : null}
        </Stack>
      </Paper>

      {error ? <Alert severity='error'>{error}</Alert> : null}

      {conflict ? (
        <Alert severity='warning' onClose={dismissConflict}>
          This candidate changed since you loaded it, so your decision was
          rejected rather than overwriting theirs. Reload to see it as it stands
          now.
        </Alert>
      ) : null}

      <Alert severity='info'>
        A suggested row has moved no balance at all. Only an approval reaches
        the ledger, and a decline posts nothing and states why.
      </Alert>

      <Tabs
        value={kind}
        onChange={(_event, next) => setKind(next)}
        variant='scrollable'
        scrollButtons='auto'
      >
        <Tab value='PTO' label={KINDS.PTO.tab} />
        <Tab value='CTO' label={KINDS.CTO.tab} />
      </Tabs>

      {rows.length === 0 ? (
        <EmptyState
          title={`Nothing to show for ${KINDS[kind].tab}`}
          description={emptyMessage()}
        />
      ) : (
        <PtoAwardsTable
          kind={kind}
          rows={rows}
          canApprove={canApprove}
          today={today}
          onAction={(action, row) => setDialog({ action, row })}
        />
      )}

      {dialog?.action === 'approve' ? (
        <ApproveDialog
          kind={kind}
          candidate={dialog.row}
          userName={dialog.row.fullName}
          open
          onClose={close}
          onSubmit={(data) =>
            submit(
              isCto
                ? approveCto(dialog.row._id, data)
                : approvePto(dialog.row._id, data),
            )
          }
          pending={pending}
          error={error}
        />
      ) : null}

      {dialog?.action === 'decline' ? (
        <DeclineDialog
          kind={kind}
          candidate={dialog.row}
          userName={dialog.row.fullName}
          open
          onClose={close}
          onSubmit={(data) =>
            submit(
              isCto
                ? declineCto(dialog.row._id, data)
                : declinePto(dialog.row._id, data),
            )
          }
          pending={pending}
          error={error}
        />
      ) : null}

      {dialog?.action === 'expiry' ? (
        <OverrideExpiryDialog
          award={dialog.row}
          userName={dialog.row.fullName}
          open
          onClose={close}
          onSubmit={(data) => submit(overrideExpiry(dialog.row._id, data))}
          pending={pending}
          error={error}
        />
      ) : null}

      {dialog?.action === 'originate' ? (
        <OriginateDialog
          kind={kind}
          people={people}
          open
          onClose={close}
          onSubmit={(data) =>
            submit(isCto ? originateCto(data) : originatePto(data))
          }
          pending={pending}
          error={error}
        />
      ) : null}
    </Stack>
  );
}

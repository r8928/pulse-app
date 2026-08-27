'use client';

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Tab from '@mui/material/Tab';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Tabs from '@mui/material/Tabs';
import Typography from '@mui/material/Typography';
import Link from 'next/link';
import { useState } from 'react';
import { useOrgMutations } from '../hooks/useOrgMutations.js';
import { EmptyState } from './EmptyState.jsx';
import { PageHeader } from './PageHeader.jsx';
import { AssignedCalendarPanel } from './team/AssignedCalendarPanel.jsx';
import { LaddersPanel } from './team/LaddersPanel.jsx';
import { LeavePolicyPanel } from './team/LeavePolicyPanel.jsx';
import { PolicyFieldsForm } from './team/PolicyFieldsForm.jsx';
import { ShiftsPanel } from './team/ShiftsPanel.jsx';

/**
 * Six, not seven. The holidays and the weekly off used to be two editable tabs
 * here; they are now one read-only tab, because a calendar is shared across
 * teams and `S-26` owns it (`FR-3.7`, `D-31`).
 */
const TABS = [
  'Members',
  'Shifts',
  'Holiday calendar',
  'Leave policy',
  'Ladders',
  'Thresholds & windows',
];

/**
 * P-38 and P-39. Every value states what it means, because a bare percentage
 * on this screen could be read two ways (`NFR-2`).
 *
 * The last two carry an explicit note: `spec.md` gives no value for either, so
 * they are unset on every team until somebody decides, and the engine cannot
 * resolve a crossing shift or flag a duplicate until they do (`DC-6`).
 */
const THRESHOLD_FIELDS = [
  {
    key: 'wfhQuotaDaysPerMonth',
    label: 'Work from home quota, in days per period',
    type: 'number',
    help: 'A team set to zero allows none, which is a decision rather than an unset value.',
  },
  {
    key: 'shortDayThresholdPercent',
    label: 'Short day threshold, %',
    type: 'number',
    help: 'A day clocking below this share of the shift’s required duration is a short day.',
  },
  {
    key: 'holidayWorkThresholdPercent',
    label: 'Holiday work threshold, %',
    type: 'number',
    help: 'Work on a non-working day counts as holiday work once it passes this share of the required duration.',
  },
  {
    key: 'midnightCrossingWindowHours',
    label: 'Midnight crossing punch window, in hours',
    type: 'number',
    help: 'How far past midnight a punch still belongs to the previous work date. Not seeded — the specification gives no value, so it is asked for rather than guessed. A crossing shift cannot resolve a work date until it is set.',
  },
  {
    key: 'duplicatePunchWindowMinutes',
    label: 'Duplicate punch window, in minutes',
    type: 'number',
    help: 'How close two punches of the same type must be to count as one. Not seeded, for the same reason. Duplicates cannot be flagged until it is set.',
  },
];

function MembersPanel({ members, managerName }) {
  return (
    <Stack spacing={2}>
      <Typography variant='body2' color='text.secondary'>
        Everyone currently assigned to this team. Manager:{' '}
        <Typography component='strong' variant='bodyStrong'>
          {managerName ?? 'not set'}
        </Typography>
        . Moving somebody between teams happens on their own record, and never
        rewrites the team they held on a past date.
      </Typography>

      {members.length === 0 ? (
        <EmptyState
          title='Nobody is assigned to this team'
          description='A team with no members can still be configured, and can be soft deleted without moving anybody.'
        />
      ) : (
        <Paper variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Employee code</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member._id} hover>
                  <TableCell>
                    <Link href={`/users/${member._id}`}>{member.fullName}</Link>
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>
                      {member.employeeCode}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}

/**
 * S-17. One team's complete policy.
 *
 * Two teams configured differently produce different results for the same
 * period, which is the whole point of the screen — every value here is data,
 * editable at runtime with no redeploy.
 *
 * Every outstanding value is named at the top rather than defaulted below
 * (`FR-3.13`, `I-5`), from the same `policyCompleteness` function that feeds
 * the `S-05` queue, so the two can never disagree.
 */
export function TeamConfiguration({ configuration, users, canWrite }) {
  const [tab, setTab] = useState(0);
  const mutations = useOrgMutations();
  const { conflict, dismissConflict, setPolicy, updateTeam, pending, error } =
    mutations;

  const {
    team,
    shifts,
    calendar,
    holidays,
    weeklyOffPattern,
    policy,
    gaps,
    members,
  } = configuration;

  return (
    <Stack spacing={3}>
      <PageHeader
        title={team.name}
        description='This team’s complete policy. Every value is data, editable at runtime with no redeploy, and every figure shown at setup is only a seed. Two teams configured differently produce different results for the same period.'
        meta={
          <Typography variant='body2' color='text.secondary'>
            Manager: {team.managerName ?? 'not set'} · {members.length} member
            {members.length === 1 ? '' : 's'}
          </Typography>
        }
      />

      {gaps.length === 0 ? (
        <Alert severity='success'>
          This team is fully configured. Every value the engine needs is set.
        </Alert>
      ) : (
        <Alert severity='warning'>
          <AlertTitle>
            {gaps.length} value{gaps.length === 1 ? '' : 's'} still to set
          </AlertTitle>
          Nothing here is guessed or defaulted, so each stays outstanding — and
          on the exceptions queue — until somebody decides it.
          <Stack component='ul' spacing={1} sx={{ pl: 3 }}>
            {gaps.map((gap) => (
              <Typography
                component='li'
                variant='body2'
                key={`${gap.entity}:${gap.field}`}
              >
                <Typography component='code' variant='mono'>
                  {gap.field}
                </Typography>{' '}
                on {gap.entity} — {gap.why}
              </Typography>
            ))}
          </Stack>
        </Alert>
      )}

      {conflict ? (
        <Alert severity='warning' onClose={dismissConflict}>
          This configuration changed since you loaded it, so your write was
          rejected rather than overwriting theirs. Reload to see the current
          state.
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
        <MembersPanel members={members} managerName={team.managerName} />
      ) : null}

      {tab === 1 ? (
        <ShiftsPanel
          shifts={shifts}
          defaultShiftId={team.defaultShiftId}
          canWrite={canWrite}
          mutations={mutations}
          onSetDefault={(shiftId) =>
            updateTeam(team._id, {
              defaultShiftId: shiftId,
              version: team.version,
            })
          }
        />
      ) : null}

      {tab === 2 ? (
        <AssignedCalendarPanel
          calendar={calendar}
          holidays={holidays}
          weeklyOffPattern={weeklyOffPattern}
        />
      ) : null}

      {tab === 3 ? (
        <LeavePolicyPanel
          policy={policy}
          canWrite={canWrite}
          mutations={mutations}
          teamId={team._id}
        />
      ) : null}

      {tab === 4 ? (
        <LaddersPanel
          policy={policy}
          canWrite={canWrite}
          mutations={mutations}
          teamId={team._id}
        />
      ) : null}

      {tab === 5 ? (
        <Stack spacing={2}>
          <Alert severity='info'>
            Saving these triggers recalculation from their effective date. Any
            override an administrator placed on an affected day survives it — a
            recalculation refreshes what the engine worked out and never
            discards a human decision.
          </Alert>
          <PolicyFieldsForm
            fields={THRESHOLD_FIELDS}
            policy={policy}
            canWrite={canWrite}
            pending={pending}
            error={error}
            saveLabel='Save thresholds and windows'
            onSave={(data) => setPolicy(team._id, data)}
          />
        </Stack>
      ) : null}

      {/* Referenced so the users prop is not silently unused: naming a manager
          happens on S-16, and this states where. */}
      {users.length === 0 && tab === 0 ? (
        <Alert severity='info'>
          A manager is named on the Teams screen, from anyone currently serving.
        </Alert>
      ) : null}
    </Stack>
  );
}

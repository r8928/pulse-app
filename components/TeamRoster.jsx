'use client';

import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import EditOutlined from '@mui/icons-material/EditOutlined';
import GroupsOutlined from '@mui/icons-material/GroupsOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
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
import { useOrgMutations } from '../hooks/useOrgMutations.js';
import { EmptyState } from './EmptyState.jsx';
import { PageHeader } from './PageHeader.jsx';
import { ReasonDialog } from './ReasonDialog.jsx';
import { TeamFormDialog } from './TeamFormDialog.jsx';
import { TeamStatusChip } from './TeamStatusChip.jsx';

/**
 * S-16. Every team, with its manager and member count.
 *
 * An unset manager or default shift reads as "Not set" rather than as a blank
 * cell: a blank is indistinguishable from a failure to load, and FR-3.13 wants
 * an outstanding value named rather than hidden.
 */
export function TeamRoster({ teams, users, canWrite }) {
  const [formTeam, setFormTeam] = useState(null);
  const [removing, setRemoving] = useState(null);

  const {
    createTeam,
    updateTeam,
    softDeleteTeam,
    pending,
    error,
    conflict,
    dismissConflict,
  } = useOrgMutations();

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Teams'
        description='Each team carries its own shifts, holiday calendar, weekly off pattern and policy, so two teams configured differently produce different results for the same period. Member counts exclude colleagues who are no longer active.'
        actions={
          canWrite ? (
            <Button variant='contained' onClick={() => setFormTeam({})}>
              New team
            </Button>
          ) : null
        }
      />

      {conflict ? (
        <Alert severity='warning' onClose={dismissConflict}>
          This team changed since you loaded it, so your write was rejected
          rather than overwriting theirs. Reload to see the current state.
        </Alert>
      ) : null}

      {teams.length === 0 ? (
        <EmptyState
          icon={<GroupsOutlined fontSize='large' />}
          title='No team yet'
          description='Nothing can be classified without one: a team carries the shifts, calendar and weekly off pattern every day record resolves through.'
          action={
            canWrite ? (
              <Button variant='contained' onClick={() => setFormTeam({})}>
                New team
              </Button>
            ) : null
          }
        />
      ) : (
        <Paper variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Team</TableCell>
                <TableCell>Manager</TableCell>
                <TableCell>Members</TableCell>
                <TableCell>Default shift</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {teams.map((team) => (
                <TableRow key={team._id} hover>
                  <TableCell>
                    <Link href={`/teams/${team._id}`}>{team.name}</Link>
                  </TableCell>
                  <TableCell>
                    {team.managerName ?? (
                      <Chip variant='statusWarning' label='Not set' />
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>{team.memberCount}</Typography>
                  </TableCell>
                  <TableCell>
                    {team.defaultShiftName ?? (
                      <Chip variant='statusWarning' label='Not set' />
                    )}
                  </TableCell>
                  <TableCell>
                    <TeamStatusChip team={team} />
                  </TableCell>
                  <TableCell>
                    {canWrite ? (
                      <Stack direction='row' spacing={1}>
                        <IconButton
                          aria-label={`Edit ${team.name}`}
                          onClick={() => setFormTeam(team)}
                        >
                          <EditOutlined fontSize='small' />
                        </IconButton>
                        <IconButton
                          aria-label={`Soft delete ${team.name}`}
                          disabled={Boolean(team.deletedAt)}
                          onClick={() => setRemoving(team)}
                        >
                          <DeleteOutlined fontSize='small' />
                        </IconButton>
                      </Stack>
                    ) : (
                      '—'
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <TeamFormDialog
        open={Boolean(formTeam)}
        onClose={() => setFormTeam(null)}
        onSubmit={(data) =>
          formTeam?._id
            ? updateTeam(formTeam._id, { ...data, version: formTeam.version })
            : createTeam(data)
        }
        initial={formTeam?._id ? formTeam : null}
        users={users}
        pending={pending}
        error={error}
      />

      <ReasonDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={(reason) =>
          softDeleteTeam(removing._id, { reason, version: removing.version })
        }
        title={`Soft delete ${removing?.name ?? 'this team'}`}
        description='Nothing is destroyed and nobody is moved. The team stays readable so past day records still resolve through the calendar, weekly off pattern and policy it held — it is simply no longer offered for assignment. The removal is refused while anyone is still assigned to it.'
        confirmLabel='Soft delete'
        confirmColor='error'
        pending={pending}
        error={error}
      />
    </Stack>
  );
}

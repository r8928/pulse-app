'use client';

import LockOutlined from '@mui/icons-material/LockOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';
import { ALL_PERMISSIONS, ROLES, SCOPES } from '../constants/index.js';
import { useConfigMutations } from '../hooks/useConfigMutations.js';
import { PageHeader } from './PageHeader.jsx';
import { ReasonDialog } from './ReasonDialog.jsx';

/**
 * S-19. Every permission the system defines, against every role, with the
 * scope each holds it at.
 *
 * A cell with no stored grant reads as `none` rather than being omitted: the
 * screen is the catalog, and a permission that appeared nowhere could never be
 * granted from here.
 *
 * The OFFICE_ADMIN column is locked at ALL (FR-1.3). That is a courtesy to
 * stop the attempt — the server validates the resulting grant set on every
 * write and would reject it anyway.
 */

const ROLE_COLUMNS = Object.values(ROLES);

/** The empty string is the select's stand-in for "no scope"; null is stored. */
const NO_SCOPE = '';

const key = (role, permission) => `${role}:${permission}`;

export function AccessMatrix({ grants, canWrite }) {
  const [editing, setEditing] = useState(null);
  const [scope, setScope] = useState(NO_SCOPE);

  const { setGrant, pending, error, conflict, dismissConflict } =
    useConfigMutations();

  const byCell = new Map(
    grants.map((grant) => [key(grant.role, grant.permission), grant]),
  );

  const open = (role, permission) => {
    const grant = byCell.get(key(role, permission));
    setScope(grant?.scope ?? NO_SCOPE);
    setEditing({ role, permission, grant: grant ?? null });
  };

  const confirm = (reason) =>
    setGrant({
      role: editing.role,
      permission: editing.permission,
      scope: scope === NO_SCOPE ? null : scope,
      reason,
      version: editing.grant?.version ?? null,
    });

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Access control'
        description='Every permission the system defines, against every role, with the scope each holds it at. A change here takes effect on the next request, with no redeploy and no restart.'
      />

      <Alert severity='info'>
        The OFFICE_ADMIN column is locked at ALL throughout. Any edit that would
        remove a permission from it or narrow its scope is rejected, and the
        four roles are the complete set — there is no way to add a fifth.
      </Alert>

      {conflict ? (
        // P-47: two administrators on the same matrix is the normal case.
        <Alert severity='warning' onClose={dismissConflict}>
          This grant changed since you loaded it, so your write was rejected
          rather than overwriting theirs. Reload to see the current state.
        </Alert>
      ) : null}

      <Paper variant='outlined'>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Permission</TableCell>
              {ROLE_COLUMNS.map((role) => (
                <TableCell key={role}>{role}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {ALL_PERMISSIONS.map((permission) => (
              <TableRow key={permission} hover>
                <TableCell>
                  <Typography variant='mono'>{permission}</Typography>
                </TableCell>

                {ROLE_COLUMNS.map((role) => {
                  const locked = role === ROLES.OFFICE_ADMIN;
                  const grant = byCell.get(key(role, permission));

                  return (
                    <TableCell key={role}>
                      <Button
                        variant='outlined'
                        aria-label={`${permission} for ${role}`}
                        disabled={locked || !canWrite}
                        title={
                          locked
                            ? 'OFFICE_ADMIN holds every permission at ALL and cannot be narrowed (FR-1.3).'
                            : undefined
                        }
                        startIcon={
                          locked ? <LockOutlined fontSize='small' /> : undefined
                        }
                        onClick={() => open(role, permission)}
                      >
                        {locked ? SCOPES.ALL : (grant?.scope ?? 'none')}
                      </Button>
                    </TableCell>
                  );
                })}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>

      <ReasonDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        onConfirm={confirm}
        title='Change this permission grant'
        description={
          editing
            ? `${editing.role} holds ${editing.permission} at ${editing.grant?.scope ?? 'no scope'}. The new scope takes effect on the next request, for every user of that role.`
            : ''
        }
        confirmLabel='Save grant'
        pending={pending}
        error={error}
      >
        <TextField
          select
          label='Scope'
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          fullWidth
          slotProps={{
            select: { displayEmpty: true },
            inputLabel: { shrink: true },
          }}
          helperText='SELF reaches only the user’s own records, TEAM only their team’s, ALL every record. None withholds the permission entirely.'
        >
          <MenuItem value={NO_SCOPE}>
            none — holds the permission at no scope
          </MenuItem>
          <MenuItem value={SCOPES.SELF}>{SCOPES.SELF}</MenuItem>
          <MenuItem value={SCOPES.TEAM}>{SCOPES.TEAM}</MenuItem>
          <MenuItem value={SCOPES.ALL}>{SCOPES.ALL}</MenuItem>
        </TextField>
      </ReasonDialog>
    </Stack>
  );
}

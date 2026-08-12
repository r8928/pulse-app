'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
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
import { useUserMutations } from '../hooks/useUserMutations.js';
import { PageHeader } from './PageHeader.jsx';
import { UserFormDialog } from './UserFormDialog.jsx';
import { UserStatusChips } from './UserStatusChips.jsx';

/**
 * S-06. Every user, with the whole lifecycle reachable from here.
 *
 * FR-2.4: a soft deleted user stays listed and is marked no longer active.
 * They are excluded from the active count and are never offered as the subject
 * of a new record — hiding them would break every historical report that has
 * to resolve their name.
 */
export function UserRoster({
  users,
  total,
  activeCount,
  canWrite,
  employmentTypes,
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { createUser, pending, error } = useUserMutations();

  return (
    <Stack spacing={3}>
      <PageHeader
        title='People'
        description='Every user, including those no longer active. Attendance history is retained in full and is never overwritten by a new joiner.'
        meta={
          <Typography variant='body2' color='text.secondary'>
            {activeCount} active · {total} in total
          </Typography>
        }
        actions={
          canWrite ? (
            <Button variant='contained' onClick={() => setDialogOpen(true)}>
              New user
            </Button>
          ) : null
        }
      />

      {users.length === 0 ? (
        <Alert severity='info'>
          No users yet. Run <code>npm run seed</code> to load the demo roster,
          or import the existing roster from the old workbook.
        </Alert>
      ) : (
        <Paper variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Employee code</TableCell>
                <TableCell>Role</TableCell>
                <TableCell>Employment type</TableCell>
                <TableCell>Date of joining</TableCell>
                <TableCell>Date of leaving</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user._id} hover>
                  <TableCell>
                    <Link href={`/users/${user._id}`}>{user.fullName}</Link>
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>{user.employeeCode}</Typography>
                  </TableCell>
                  <TableCell>{user.role}</TableCell>
                  <TableCell>{user.employmentType}</TableCell>
                  <TableCell>
                    <Typography variant='mono'>{user.dateOfJoining}</Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>
                      {user.dateOfLeaving ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <UserStatusChips user={user} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      <UserFormDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSubmit={createUser}
        pending={pending}
        error={error}
        employmentTypes={employmentTypes}
      />
    </Stack>
  );
}

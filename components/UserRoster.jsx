'use client';

import UploadFileOutlined from '@mui/icons-material/UploadFileOutlined';
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
import { hideBelow } from '../utils/columnPriority.js';
import { EmptyState } from './EmptyState.jsx';
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
  canImport,
  employmentTypes,
}) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { createUser, pending, error } = useUserMutations();

  /**
   * S-08 is routed and permission-gated but was linked from nowhere, which
   * made the go-live migration reachable only by typing its URL. It is offered
   * from the header and from the empty state, because the empty roster is
   * exactly when it is needed.
   */
  const importAction = (
    <Button
      component={Link}
      href='/users/import'
      variant='outlined'
      startIcon={<UploadFileOutlined />}
    >
      Import from workbook
    </Button>
  );

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
          <>
            {canImport ? importAction : null}
            {canWrite ? (
              <Button variant='contained' onClick={() => setDialogOpen(true)}>
                New user
              </Button>
            ) : null}
          </>
        }
      />

      {users.length === 0 ? (
        <EmptyState
          title='No people yet'
          description='The roster is empty. Import the existing people from the old workbook — it reads their code and name, then asks for everything the sheet cannot supply.'
          action={canImport ? importAction : null}
        />
      ) : (
        <Paper variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                {/* Name, code and status are never dropped: the first two
                    identify the row and the third is what the screen is read
                    for. Everything else leaves by priority. */}
                <TableCell>Name</TableCell>
                <TableCell>Employee code</TableCell>
                <TableCell sx={hideBelow('sm')}>Role</TableCell>
                {/* Administration, not a directory: the whole screen is
                    reachable only by a viewer whose user.read reaches every
                    record, so there is no per-column gate to add here. */}
                <TableCell sx={hideBelow('lg')}>Phone</TableCell>
                <TableCell sx={hideBelow('lg')}>Employment type</TableCell>
                <TableCell sx={hideBelow('md')}>Date of joining</TableCell>
                <TableCell sx={hideBelow('lg')}>Date of leaving</TableCell>
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
                  <TableCell sx={hideBelow('sm')}>{user.role}</TableCell>
                  <TableCell sx={hideBelow('lg')}>
                    {user.phone ? (
                      <Typography variant='mono'>{user.phone}</Typography>
                    ) : null}
                  </TableCell>
                  <TableCell sx={hideBelow('lg')}>
                    {user.employmentType}
                  </TableCell>
                  <TableCell sx={hideBelow('md')}>
                    <Typography variant='mono'>{user.dateOfJoining}</Typography>
                  </TableCell>
                  <TableCell sx={hideBelow('lg')}>
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

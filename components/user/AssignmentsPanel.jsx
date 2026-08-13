'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import { EmptyState } from '../EmptyState.jsx';

/**
 * `S-07`'s Shift assignments (`FR-3.6`) and Team assignments (`FR-3.14`) tabs.
 *
 * One component for both, because they are the same thing: a record with an
 * effective date range saying what the user held between two dates. Showing
 * them as history rather than as a current value is the whole point — the
 * engine resolves a past date through the row that covered it, not through
 * whatever the user holds today.
 */
export function AssignmentsPanel({
  assignments,
  nameOf,
  label,
  emptyTitle,
  emptyDescription,
  explanation,
  action,
}) {
  const today = new Date().toISOString().slice(0, 10);
  const isCurrent = (assignment) =>
    assignment.effectiveFrom <= today &&
    (!assignment.effectiveTo || assignment.effectiveTo >= today);

  return (
    <Stack spacing={2}>
      <Alert severity='info'>{explanation}</Alert>

      {action ? (
        <Stack direction='row' sx={{ justifyContent: 'flex-end' }}>
          {action}
        </Stack>
      ) : null}

      {assignments.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} />
      ) : (
        <Paper variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>{label}</TableCell>
                <TableCell>Effective from</TableCell>
                <TableCell>Effective to</TableCell>
                <TableCell>Status</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {assignments.map((assignment) => (
                <TableRow key={assignment._id} hover>
                  <TableCell>
                    {nameOf(assignment) ?? (
                      <Chip variant='statusWarning' label='No longer offered' />
                    )}
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>
                      {assignment.effectiveFrom}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Typography variant='mono'>
                      {assignment.effectiveTo ?? '— open'}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      variant={
                        isCurrent(assignment)
                          ? 'statusSuccess'
                          : 'statusNeutral'
                      }
                      label={isCurrent(assignment) ? 'In force today' : 'Past'}
                    />
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

/** The two configured uses, so `S-07` states what each tab means once. */
export const SHIFT_ASSIGNMENTS = {
  label: 'Shift',
  emptyTitle: 'No shift assignment recorded',
  emptyDescription:
    'A tracked user needs one — no day can be classified without a shift, and there is no company-wide default to fall back on.',
  explanation:
    'Each assignment carries an effective date range, so a mid-year shift change is preserved rather than overwriting the past. A date is judged by the shift that covered it, not by whichever shift the user holds today.',
};

export const TEAM_ASSIGNMENTS = {
  label: 'Team',
  emptyTitle: 'No team move recorded',
  emptyDescription:
    'This user has not moved teams since their record was created, so the team on their profile has applied throughout.',
  explanation:
    'A move never rewrites history. Working-day and holiday counts for a past date come from the calendar of the team the user held on that date, which is the row covering it here.',
};

export function AssignmentActionButton({ onClick, children }) {
  return (
    <Button variant='contained' onClick={onClick}>
      {children}
    </Button>
  );
}

'use client';

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
import Link from 'next/link';
import { EXCEPTION_QUEUE } from '../../constants/index.js';
import { exceptionLabel } from '../../utils/exceptionLabels.js';

/**
 * One queue's rows. Each shows what a reader needs in order to act on it and
 * nothing more, so the columns differ — but the envelope, the empty state and
 * the paging belong to the dashboard, not to each queue.
 *
 * `§27.3` says each row offers approve, approve with a changed amount, and
 * decline **where those apply**. Most of these twelve are not approvals at
 * all — a missing punch is fixed on `S-12`, a missing configuration value on
 * `S-17` — so those rows link to where the fix actually lives rather than
 * pretending at a decision they cannot make.
 */
const dash = (value) => (value === null || value === undefined ? '—' : value);

function Person({ row }) {
  return (
    <Stack spacing={0.25}>
      <Typography variant='bodyStrong'>{row.userName}</Typography>
      <Typography variant='caption' color='text.secondary'>
        {row.employeeCode}
      </Typography>
      {/* FR-2.4: a departed colleague's exceptions still surface, marked. */}
      {row.noLongerActive ? (
        <Chip variant='statusNeutral' label='No longer active' />
      ) : null}
    </Stack>
  );
}

const openTheDay = (row, label) => (
  <Button
    key='action'
    component={Link}
    href={`/attendance/${row.userId}/${row.date}`}
    variant='outlined'
  >
    {label}
  </Button>
);

const mono = (key, value) => (
  <Typography key={key} variant='mono'>
    {dash(value)}
  </Typography>
);

/**
 * The three day-code queues read identically — a person, a date, and what the
 * engine concluded — so they share one shape rather than three copies of it.
 */
const dayColumns = {
  headers: ['Employee', 'Date', 'What the engine found', 'Action'],
  cells: (row) => [
    <Person key='person' row={row} />,
    mono('date', row.date),
    <Stack key='codes' spacing={0.5}>
      {(row.codes ?? []).map((code) => (
        <Typography key={code} variant='body2'>
          {exceptionLabel(code)}
        </Typography>
      ))}
    </Stack>,
    openTheDay(row, 'Open the day'),
  ],
};

/** The two candidate queues differ only in which screen decides them. */
const candidateColumns = {
  headers: ['Employee', 'Date worked', 'Rule', 'Proposed', 'Action'],
  cells: (row) => [
    <Person key='person' row={row} />,
    mono('date', row.date),
    mono('rule', row.rule),
    mono('amount', row.proposedAmount),
    <Button key='action' component={Link} href='/pto' variant='outlined'>
      Decide it
    </Button>,
  ],
};

const COLUMNS = Object.freeze({
  [EXCEPTION_QUEUE.MISSING_PUNCH]: dayColumns,
  [EXCEPTION_QUEUE.IMPOSSIBLE_DURATION]: dayColumns,
  [EXCEPTION_QUEUE.NO_SHIFT]: dayColumns,
  [EXCEPTION_QUEUE.PTO_PENDING]: candidateColumns,
  [EXCEPTION_QUEUE.CTO_PENDING]: candidateColumns,

  [EXCEPTION_QUEUE.DUPLICATE_PUNCH]: {
    headers: ['Employee', 'Work date', 'Punch', 'Action'],
    cells: (row, { onAction, canDecide }) => [
      <Person key='person' row={row} />,
      mono('date', row.date),
      mono('type', row.type),
      canDecide ? (
        // P-07 decides it here rather than sending the reader to S-12: keeping
        // a flagged pair is a decision about the flag, not about the day.
        <Button
          key='action'
          type='button'
          variant='contained'
          onClick={() => onAction('duplicate', row)}
        >
          Keep or remove
        </Button>
      ) : (
        openTheDay(row, 'Open the day')
      ),
    ],
  },

  [EXCEPTION_QUEUE.CONFIGURATION]: {
    headers: ['Team', 'Outstanding value', 'Why it is needed', 'Action'],
    cells: (row, { onAction }) => [
      <Typography key='entity' variant='bodyStrong'>
        {row.entity}
      </Typography>,
      mono('field', row.field),
      <Typography key='why' variant='body2' color='text.secondary'>
        {row.why}
      </Typography>,
      <Button
        key='action'
        type='button'
        variant='outlined'
        onClick={() => onAction('configuration', row)}
      >
        What is missing
      </Button>,
    ],
  },

  [EXCEPTION_QUEUE.IMPORT_ROW]: {
    headers: [
      'Sheet row',
      'Employee code',
      'Name on the sheet',
      'Why',
      'Action',
    ],
    cells: (row, { onAction, canImport }) => [
      mono('sheetRow', row.sheetRow),
      mono('code', row.employeeCode),
      <Typography key='name'>{dash(row.fullName)}</Typography>,
      <Typography key='why' variant='body2' color='text.secondary'>
        {row.reason}
      </Typography>,
      canImport ? (
        <Button
          key='action'
          type='button'
          variant='outlined'
          onClick={() => onAction('dismiss', row)}
        >
          Dismiss
        </Button>
      ) : null,
    ],
  },

  [EXCEPTION_QUEUE.LATE_ARRIVAL]: {
    headers: ['Employee', 'Date', 'Late by', 'Cost', 'Rule', 'Action'],
    cells: (row) => [
      <Person key='person' row={row} />,
      mono('date', row.date),
      <Typography key='late' variant='mono'>
        {row.lateMinutes} min
      </Typography>,
      mono('deduction', row.deduction),
      mono('rule', row.rule),
      openTheDay(row, 'Waive or confirm'),
    ],
  },

  [EXCEPTION_QUEUE.EXHAUSTED_BALANCE]: {
    headers: ['Employee', 'Leave type', 'Balance', 'Action'],
    cells: (row) => [
      <Person key='person' row={row} />,
      <Typography key='type'>{row.leaveType}</Typography>,
      mono('balance', row.balance),
      <Button
        key='action'
        component={Link}
        href={`/leave/${row.userId}/ledger`}
        variant='outlined'
      >
        Trace it
      </Button>,
    ],
  },

  [EXCEPTION_QUEUE.PTO_EXPIRING]: {
    headers: ['Employee', 'Earned', 'Expires', 'Days', 'Action'],
    cells: (row) => [
      <Person key='person' row={row} />,
      mono('date', row.date),
      mono('expires', row.expiresAt),
      mono('amount', row.amount),
      <Button key='action' component={Link} href='/pto' variant='outlined'>
        Open the award
      </Button>,
    ],
  },

  [EXCEPTION_QUEUE.REDUCTION]: {
    headers: ['Employee', 'The change', 'Records at stake', 'Action'],
    cells: (row, { onAction, canDecide }) => [
      <Typography key='person' variant='bodyStrong'>
        {row.userName}
      </Typography>,
      <Typography key='change' variant='body2' color='text.secondary'>
        {row.change?.description ?? row.change?.kind}
      </Typography>,
      mono('records', row.records?.length ?? 0),
      canDecide ? (
        <Button
          key='action'
          type='button'
          variant='contained'
          onClick={() => onAction('reduction', row)}
        >
          Review
        </Button>
      ) : null,
    ],
  },
});

export function QueueTable({ queue, rows, onAction, canDecide, canImport }) {
  const shape = COLUMNS[queue];
  if (!shape) return null;

  const context = { onAction, canDecide, canImport };

  return (
    <Paper variant='outlined'>
      <Stack sx={{ overflowX: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              {shape.headers.map((header) => (
                <TableCell key={header}>{header}</TableCell>
              ))}
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id}>
                {shape.cells(row, context).map((cell, index) => (
                  <TableCell key={shape.headers[index]}>{cell}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Stack>
    </Paper>
  );
}

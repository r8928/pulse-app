'use client';

import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined';
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
import { APPROVAL_STATUS } from '../../constants/index.js';
import { ruleLabel } from '../../utils/candidateLabels.js';
import { CandidateStatusChip } from './CandidateStatusChip.jsx';

/**
 * S-15's table, for PTO awards and for CTO applications alike — they share
 * every column but two, so they share a component rather than drifting apart.
 *
 * The proposed figure stays beside the decided one for every row, however old:
 * a balance nobody can trace back to what produced it is a number to be
 * argued with (NFR-11).
 */
const dash = (value) =>
  value === null || value === undefined ? '—' : String(value);

/**
 * S-15 lists expired among the stages it shows, but no award document carries
 * an EXPIRED status — the ledger sweep is what makes expiry real (`D-24`). So
 * the stage is read off the date, against a `today` the server supplies: a
 * client that asked for its own clock would disagree with the ledger across a
 * timezone.
 */
const hasExpired = (row, today) =>
  row.status === APPROVAL_STATUS.APPROVED &&
  Boolean(row.expiresAt) &&
  row.expiresAt < today;

export function PtoAwardsTable({ kind, rows, canApprove, onAction, today }) {
  const isCto = kind === 'CTO';

  return (
    <Paper variant='outlined'>
      <Stack sx={{ overflowX: 'auto' }}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Employee</TableCell>
              <TableCell>Date worked</TableCell>
              <TableCell>Proposed</TableCell>
              <TableCell>{isCto ? 'Applied' : 'Approved'}</TableCell>
              <TableCell>Rule</TableCell>
              <TableCell>{isCto ? 'Balance' : 'Expiry'}</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Decided by</TableCell>
              {canApprove ? <TableCell>Actions</TableCell> : null}
            </TableRow>
          </TableHead>

          <TableBody>
            {rows.map((row) => (
              <TableRow key={row._id}>
                <TableCell>
                  <Stack spacing={0.25}>
                    <Typography variant='bodyStrong'>{row.fullName}</Typography>
                    <Typography variant='caption' color='text.secondary'>
                      {row.employeeCode}
                    </Typography>
                  </Stack>
                </TableCell>

                <TableCell>
                  <Typography variant='mono'>{row.date}</Typography>
                </TableCell>

                <TableCell>
                  <Typography variant='mono'>
                    {dash(row.proposedAmount)}
                  </Typography>
                </TableCell>

                <TableCell>
                  <Typography variant='mono'>
                    {dash(isCto ? row.appliedAmount : row.approvedAmount)}
                  </Typography>
                </TableCell>

                <TableCell>
                  <Typography variant='mono'>{ruleLabel(row.rule)}</Typography>
                </TableCell>

                <TableCell>
                  {isCto ? (
                    row.blockOverridden ? (
                      <Chip
                        variant='statusWarning'
                        label='Balance block overridden'
                      />
                    ) : (
                      <Typography color='text.secondary'>—</Typography>
                    )
                  ) : (
                    <Stack spacing={0.25}>
                      <Typography variant='mono'>
                        {dash(row.expiresAt)}
                      </Typography>
                      {row.expiryExtended ? (
                        <Chip variant='statusWarning' label='Extended' />
                      ) : null}
                      {hasExpired(row, today) ? (
                        <Chip
                          variant='statusNeutral'
                          icon={<EventBusyOutlined fontSize='small' />}
                          label='Expired'
                        />
                      ) : null}
                    </Stack>
                  )}
                </TableCell>

                <TableCell>
                  <CandidateStatusChip status={row.status} />
                </TableCell>

                <TableCell>
                  <Stack spacing={0.25}>
                    <Typography variant='body2'>
                      {dash(row.actorName)}
                    </Typography>
                    <Typography variant='caption' color='text.secondary'>
                      {dash(row.reason)}
                    </Typography>
                  </Stack>
                </TableCell>

                {canApprove ? (
                  <TableCell>
                    <Stack direction='row' spacing={1}>
                      {row.status === APPROVAL_STATUS.PENDING ? (
                        <>
                          <Button
                            type='button'
                            variant='contained'
                            onClick={() => onAction('approve', row)}
                          >
                            Approve
                          </Button>
                          <Button
                            type='button'
                            variant='outlined'
                            onClick={() => onAction('decline', row)}
                          >
                            Decline
                          </Button>
                        </>
                      ) : null}

                      {!isCto && row.status === APPROVAL_STATUS.APPROVED ? (
                        <Button
                          type='button'
                          variant='outlined'
                          onClick={() => onAction('expiry', row)}
                        >
                          Change expiry
                        </Button>
                      ) : null}
                    </Stack>
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Stack>
    </Paper>
  );
}

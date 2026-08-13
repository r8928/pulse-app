'use client';

import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
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

/**
 * P-35, P-36 and P-37 — the three ladders, which are the same shape: an
 * ordered list of bands, each row a set of numbers.
 *
 * One editor drives all three from a column spec rather than three
 * near-identical tables. Every band is data (`I-3`): not one of these numbers
 * may appear in a `.js` file.
 *
 * An empty cell is stored as null, which each ladder reads as "no bound on
 * this side" — the open-ended top band of the seeded profile is exactly that.
 */
function LadderEditor({
  title,
  description,
  columns,
  rows,
  canWrite,
  onChange,
}) {
  const set = (index, key) => (event) => {
    const raw = event.target.value;
    const next = rows.map((row, position) =>
      position === index
        ? { ...row, [key]: raw === '' ? null : Number(raw) }
        : row,
    );
    onChange(next);
  };

  const addBand = () =>
    onChange([
      ...rows,
      Object.fromEntries(columns.map((column) => [column.key, null])),
    ]);

  const removeBand = (index) =>
    onChange(rows.filter((_row, position) => position !== index));

  return (
    <Stack spacing={2}>
      <Stack spacing={1}>
        <Typography variant='sectionTitle'>{title}</Typography>
        <Typography variant='body2' color='text.secondary'>
          {description}
        </Typography>
      </Stack>

      <Paper variant='outlined'>
        <Table>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.key}>{column.label}</TableCell>
              ))}
              {canWrite ? <TableCell>Actions</TableCell> : null}
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (canWrite ? 1 : 0)}>
                  <Typography variant='body2' color='text.secondary'>
                    No band set. Until one is, this ladder produces nothing —
                    the engine proposes no amount rather than guessing one.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row, index) => (
                // Bands are ordered and have no identity of their own, so the
                // position is the key. Reordering is a deliberate re-entry.
                // biome-ignore lint/suspicious/noArrayIndexKey: a band is identified by its position
                <TableRow key={index} hover>
                  {columns.map((column) => (
                    <TableCell key={column.key}>
                      {canWrite ? (
                        <TextField
                          type='number'
                          value={row[column.key] ?? ''}
                          onChange={set(index, column.key)}
                          aria-label={`${column.label} for band ${index + 1}`}
                          placeholder='—'
                        />
                      ) : (
                        <Typography variant='mono'>
                          {row[column.key] ?? '—'}
                        </Typography>
                      )}
                    </TableCell>
                  ))}
                  {canWrite ? (
                    <TableCell>
                      <IconButton
                        aria-label={`Remove band ${index + 1}`}
                        onClick={() => removeBand(index)}
                      >
                        <DeleteOutlined fontSize='small' />
                      </IconButton>
                    </TableCell>
                  ) : null}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Paper>

      {canWrite ? (
        <Stack direction='row'>
          <Button variant='outlined' onClick={addBand}>
            Add a band
          </Button>
        </Stack>
      ) : null}
    </Stack>
  );
}

const LADDERS = [
  {
    key: 'leaveDeductionLadder',
    title: 'Leave Deduction Ladder',
    description:
      'How much leave a late or short day costs. The deduction is the worse of the two tests, and the bands are percentages of the scheduled shift rather than absolute hours — so they still mean something on a shift that is not nine hours.',
    columns: [
      { key: 'latenessFrom', label: 'Late from %' },
      { key: 'latenessTo', label: 'Late to %' },
      { key: 'clockedFrom', label: 'Clocked from %' },
      { key: 'clockedTo', label: 'Clocked to %' },
      { key: 'deduction', label: 'Deduction, in days' },
    ],
  },
  {
    key: 'ptoAwardLadder',
    title: 'PTO award ladder',
    description:
      'The bands the engine proposes an award from. The ladder decides what is proposed, never what may be approved — an approver may set any amount, including one no band produces.',
    columns: [
      { key: 'award', label: 'Award, in days' },
      { key: 'minimumExtraMinutes', label: 'Extra minutes worked, from' },
    ],
  },
  {
    key: 'ctoApplicationLadder',
    title: 'CTO application ladder',
    description:
      'The lateness bands and the CTO amount each proposes. Applying CTO spends unexpired PTO, and is blocked when there is not enough unless that block is explicitly overridden.',
    columns: [
      { key: 'latenessFrom', label: 'Late from %' },
      { key: 'latenessTo', label: 'Late to %' },
      { key: 'apply', label: 'CTO applied, in days' },
    ],
  },
];

/** P-35 to P-37, plus the PTO validity period that belongs beside them. */
export function LaddersPanel({ policy, canWrite, mutations, teamId }) {
  const [ladders, setLadders] = useState(() =>
    Object.fromEntries(
      LADDERS.map((ladder) => [ladder.key, policy?.[ladder.key] ?? []]),
    ),
  );
  const [validityDays, setValidityDays] = useState(
    policy?.ptoValidityDays ?? '',
  );

  const { setPolicy, pending, error } = mutations;

  const handleSubmit = async (event) => {
    event.preventDefault();

    await setPolicy(teamId, {
      ...ladders,
      ...(validityDays === '' ? {} : { ptoValidityDays: Number(validityDays) }),
      version: policy?.version ?? null,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack spacing={3}>
        {error ? <Alert severity='error'>{error}</Alert> : null}

        <Alert severity='info'>
          Saving a ladder recalculates every day it changes the answer for, from
          its effective date. An override an administrator put on one of those
          days survives the recalculation.
        </Alert>

        {LADDERS.map((ladder) => (
          <LadderEditor
            key={ladder.key}
            title={ladder.title}
            description={ladder.description}
            columns={ladder.columns}
            rows={ladders[ladder.key]}
            canWrite={canWrite}
            onChange={(rows) =>
              setLadders((current) => ({ ...current, [ladder.key]: rows }))
            }
          />
        ))}

        <Stack spacing={1}>
          <Typography variant='sectionTitle'>PTO validity period</Typography>
          <TextField
            label='Days an award stays valid'
            type='number'
            value={validityDays}
            onChange={(event) => setValidityDays(event.target.value)}
            disabled={!canWrite}
            sx={{ maxWidth: 320 }}
            helperText='An award approved after this has passed still posts, with its expiry extended and the extension visible on the award.'
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>

        {canWrite ? (
          <Stack direction='row'>
            <Button type='submit' variant='contained' loading={pending}>
              Save ladders
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </form>
  );
}

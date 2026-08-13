'use client';

import HistoryOutlined from '@mui/icons-material/HistoryOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TablePagination from '@mui/material/TablePagination';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { EmptyState } from './EmptyState.jsx';
import { PageHeader } from './PageHeader.jsx';
import { RecordHistoryDrawer } from './RecordHistoryDrawer.jsx';

/** The sentinel for "any", which is not the same as an empty filter value. */
const ANY = '__ANY__';

/**
 * S-22. Every change ever made, append only and retained indefinitely.
 *
 * Read only without exception — the screen offers no edit or delete because no
 * application endpoint provides one (`FR-9.3`). It covers creates, updates,
 * soft deletes, restores, approvals, rejections, overrides, corrections, and
 * every authentication event, successful or failed (`FR-1.6`).
 *
 * Filters live in the URL rather than in component state, so a filtered view
 * is a link somebody can send to a colleague, and the server does the paging
 * (`NFR-3`, `DC-10`).
 */
export function AuditLog({
  records,
  total,
  page,
  pageSize,
  actions,
  entityTypes,
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [detail, setDetail] = useState(null);

  const value = (key) => params.get(key) ?? '';

  const apply = (changes) => {
    const next = new URLSearchParams(params);

    for (const [key, raw] of Object.entries(changes)) {
      if (!raw || raw === ANY) next.delete(key);
      else next.set(key, raw);
    }

    // Any filter change invalidates the page number — page 4 of a narrower
    // result set is usually empty, which reads as "nothing found".
    if (!('page' in changes)) next.delete('page');

    router.push(`${pathname}?${next.toString()}`);
  };

  const set = (key) => (event) => apply({ [key]: event.target.value });

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Audit log'
        description='Every change ever made, append only and retained indefinitely. Read only without exception — this screen offers no edit or delete because no endpoint in the application provides one. Times are shown in UTC.'
        meta={
          <Typography variant='body2' color='text.secondary'>
            {total} record{total === 1 ? '' : 's'} match these filters
          </Typography>
        }
      />

      <Paper variant='outlined'>
        <Grid container spacing={2} sx={{ p: 3 }}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              label='Actor'
              value={value('actorName')}
              onChange={set('actorName')}
              fullWidth
              helperText='Matches part of a name.'
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField
              select
              label='Action'
              value={value('action') || ANY}
              onChange={set('action')}
              fullWidth
              slotProps={{
                select: { displayEmpty: true },
                inputLabel: { shrink: true },
              }}
            >
              <MenuItem value={ANY}>Any action</MenuItem>
              {actions.map((each) => (
                <MenuItem key={each} value={each}>
                  {each}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <TextField
              select
              label='Entity type'
              value={value('entityType') || ANY}
              onChange={set('entityType')}
              fullWidth
              slotProps={{
                select: { displayEmpty: true },
                inputLabel: { shrink: true },
              }}
            >
              <MenuItem value={ANY}>Any entity</MenuItem>
              {entityTypes.map((each) => (
                <MenuItem key={each} value={each}>
                  {each}
                </MenuItem>
              ))}
            </TextField>
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <TextField
              label='From'
              type='date'
              value={value('from')}
              onChange={set('from')}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
            />
          </Grid>

          <Grid size={{ xs: 12, sm: 6, md: 2 }}>
            <TextField
              label='To'
              type='date'
              value={value('to')}
              onChange={set('to')}
              fullWidth
              slotProps={{ inputLabel: { shrink: true } }}
              helperText='Inclusive of the whole day.'
            />
          </Grid>
        </Grid>
      </Paper>

      {records.length === 0 ? (
        <EmptyState
          icon={<HistoryOutlined fontSize='large' />}
          title='No record matches these filters'
          description='The log itself is never empty — the seed and every mutation write to it — so this means the filters are too narrow rather than that nothing has happened.'
          action={
            <Button variant='outlined' onClick={() => router.push(pathname)}>
              Clear the filters
            </Button>
          }
        />
      ) : (
        <Paper variant='outlined'>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Actor</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Entity type</TableCell>
                <TableCell>Identifier</TableCell>
                <TableCell>Reason</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {records.map((record) => (
                <TableRow key={record._id} hover>
                  <TableCell>
                    <Button
                      size='small'
                      onClick={() => setDetail(record)}
                      aria-label={`Open the record from ${record.at}`}
                    >
                      <Typography variant='mono'>{record.at}</Typography>
                    </Button>
                  </TableCell>
                  <TableCell>{record.actorName ?? 'System'}</TableCell>
                  <TableCell>{record.action}</TableCell>
                  <TableCell>{record.entityType}</TableCell>
                  <TableCell>
                    <Typography variant='mono'>
                      {record.entityId ?? '—'}
                    </Typography>
                  </TableCell>
                  <TableCell>{record.reason ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <TablePagination
            component='div'
            count={total}
            page={page - 1}
            rowsPerPage={pageSize}
            rowsPerPageOptions={[25, 50, 100]}
            onPageChange={(_event, next) => apply({ page: String(next + 1) })}
            onRowsPerPageChange={(event) =>
              apply({ pageSize: event.target.value, page: '1' })
            }
          />
        </Paper>
      )}

      <Alert severity='info'>
        Every authentication event is here too, successful or failed, which is
        why a sign-in nobody expected is visible without any other tooling.
      </Alert>

      <RecordHistoryDrawer
        open={Boolean(detail)}
        onClose={() => setDetail(null)}
        title='Audit record'
        records={detail ? [detail] : []}
      />
    </Stack>
  );
}

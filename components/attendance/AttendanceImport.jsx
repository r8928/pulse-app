'use client';

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
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DATE_FORMATS } from '../../utils/attendanceImport.js';

/**
 * S-11. The biometric export, loaded in bulk.
 *
 * Four steps in the order `list-of-screens.md` states them, and the order
 * matters: FR-4.11 requires the date format to be confirmed BEFORE validation
 * runs, so the validate button stays disabled until it is.
 *
 * FR-4.4: the preview shows accepted rows against rejected ones with a stated
 * reason for each, and nothing is written until the commit. A rejected file is
 * corrected and re-uploaded without leaving the page (NFR-1).
 */
export function AttendanceImport() {
  const router = useRouter();

  const [file, setFile] = useState(null);
  const [dateFormat, setDateFormat] = useState('');
  const [preview, setPreview] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);

  const send = async (action) => {
    setPending(true);
    setError(null);

    try {
      return await action();
    } catch (caught) {
      setError(caught.message);
      return null;
    } finally {
      setPending(false);
    }
  };

  const validate = () =>
    send(async () => {
      const form = new FormData();
      form.append('file', file);
      form.append('dateFormat', dateFormat);

      const response = await fetch('/api/attendance/import/validate', {
        method: 'POST',
        body: form,
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok)
        throw new Error(body.error ?? 'That file was rejected.');

      setPreview(body);
      setResult(null);
      return body;
    });

  const commit = () =>
    send(async () => {
      const response = await fetch('/api/attendance/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: preview.accepted }),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) throw new Error(body.error ?? 'The import failed.');

      setResult(body);
      setPreview(null);
      router.refresh();
      return body;
    });

  const acceptedCount = preview?.accepted.length ?? 0;
  const rejectedCount = preview?.rejected.length ?? 0;
  const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;

  return (
    <Stack spacing={3}>
      {error ? <Alert severity='error'>{error}</Alert> : null}

      {result ? (
        <Alert severity='success'>
          {plural(result.inserted, 'punch')} imported, and{' '}
          {plural(result.recalculated, 'day record')} recalculated from them.
        </Alert>
      ) : null}

      <Paper variant='outlined' sx={{ p: 3 }}>
        <Stack spacing={3}>
          <Stack spacing={1}>
            <Typography variant='h6'>1 · Choose the export</Typography>
            <Typography variant='body2' color='text.secondary'>
              The sheet the terminal produces: Sr No., Employee Code, Employee
              Name, Type, Date, Time.
            </Typography>
            <TextField
              type='file'
              label='Choose a file'
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setPreview(null);
                setResult(null);
              }}
              slotProps={{
                inputLabel: { shrink: true },
                htmlInput: { accept: '.xlsx,.xls' },
              }}
            />
          </Stack>

          <Stack spacing={1}>
            <Typography variant='h6'>2 · Confirm the date format</Typography>
            <Typography variant='body2' color='text.secondary'>
              03/04/2026 is the third of April under one format and the fourth
              of March under another. Pulse will not guess which the sheet
              means, so nothing is validated until this is confirmed.
            </Typography>
            <TextField
              select
              label='Date format'
              value={dateFormat}
              onChange={(event) => {
                setDateFormat(event.target.value);
                setPreview(null);
              }}
              slotProps={{
                select: { displayEmpty: true },
                inputLabel: { shrink: true },
              }}
              sx={{ maxWidth: 320 }}
            >
              <MenuItem value=''>Not confirmed</MenuItem>
              {Object.values(DATE_FORMATS).map((format) => (
                <MenuItem key={format.value} value={format.value}>
                  {format.label}
                </MenuItem>
              ))}
            </TextField>
          </Stack>

          <Stack direction='row'>
            <Button
              type='button'
              variant='contained'
              disabled={!file || !dateFormat || pending}
              onClick={validate}
            >
              Validate the file
            </Button>
          </Stack>
        </Stack>
      </Paper>

      {preview ? (
        <Paper variant='outlined' sx={{ p: 3 }}>
          <Stack spacing={2}>
            <Typography variant='h6'>3 · Preview</Typography>

            <Typography variant='body2'>
              {plural(acceptedCount, 'row')} accepted ·{' '}
              {plural(rejectedCount, 'row')} rejected. Nothing has been written
              yet.
            </Typography>

            {rejectedCount > 0 ? (
              <Stack spacing={1}>
                <Typography variant='metricLabel' color='text.secondary'>
                  Rejected rows — each with the reason it was refused
                </Typography>
                <Typography variant='caption' color='text.secondary'>
                  The employee name is shown so you can find the row. It is
                  never used to match a person; only the employee code is.
                </Typography>

                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Sheet row</TableCell>
                      <TableCell>Employee code</TableCell>
                      <TableCell>Name in the sheet</TableCell>
                      <TableCell>Reason</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {preview.rejected.map((row) => (
                      <TableRow key={`${row.sheetRow}-${row.employeeCode}`}>
                        <TableCell>
                          <Typography variant='mono'>{row.sheetRow}</Typography>
                        </TableCell>
                        <TableCell>
                          <Typography variant='mono'>
                            {row.employeeCode || '—'}
                          </Typography>
                        </TableCell>
                        <TableCell>{row.fullName || '—'}</TableCell>
                        <TableCell>{row.reason}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Stack>
            ) : null}

            <Stack direction='row' spacing={2} alignItems='center'>
              <Button
                type='button'
                variant='contained'
                disabled={acceptedCount === 0 || pending}
                onClick={commit}
              >
                Import {plural(acceptedCount, 'row')}
              </Button>
              <Typography variant='body2' color='text.secondary'>
                Every accepted row is written, or none is.
              </Typography>
            </Stack>
          </Stack>
        </Paper>
      ) : null}
    </Stack>
  );
}

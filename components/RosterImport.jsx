'use client';

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import MenuItem from '@mui/material/MenuItem';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UNASSIGNED } from '../constants/index.js';
import { outstandingDetails, readyToCommit } from '../utils/rosterImport.js';
import { PageHeader } from './PageHeader.jsx';

const STEPS = ['Upload', 'Complete missing details', 'Commit'];

/**
 * S-08. The one-time go-live migration of the roster (`FR-2.9`).
 *
 * It imports **people, not attendance** — historical attendance is
 * deliberately not migrated, so this screen creates users and their first
 * tenure and nothing else.
 *
 * Nothing is guessed. The sheet carries a code and a name; every other field
 * `FR-2.6` requires is asked for here, and the commit stays disabled until
 * every outstanding field is filled (`DC-6`).
 */
export function RosterImport({ teams, shifts, employmentTypes }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [committed, setCommitted] = useState(null);

  const upload = async (event) => {
    event.preventDefault();
    const file = event.currentTarget.elements.file.files?.[0];

    if (!file) {
      setError('Choose the Biometric ID sheet to upload.');
      return;
    }

    setPending(true);
    setError(null);

    try {
      const body = new FormData();
      body.append('file', file);

      const response = await fetch('/api/users/import', {
        method: 'POST',
        body,
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error ?? 'That file could not be read.');
        return;
      }

      setRows(
        payload.accepted.map((row) => ({
          ...row,
          workEmail: '',
          teamId: UNASSIGNED,
          employmentType: '',
          tracked: true,
          loginEnabled: false,
          dateOfJoining: '',
          shiftId: UNASSIGNED,
        })),
      );
      setRejected(payload.rejected);
      setStep(1);
    } catch (caught) {
      setError(caught.message);
    } finally {
      setPending(false);
    }
  };

  const set = (index, field) => (event) => {
    const value =
      field === 'tracked' || field === 'loginEnabled'
        ? event.target.checked
        : event.target.value;

    setRows((current) =>
      current.map((row, position) =>
        position === index ? { ...row, [field]: value } : row,
      ),
    );
  };

  /** The sentinel means "not chosen yet"; it must never be stored as an id. */
  const resolved = rows.map((row) => ({
    ...row,
    teamId: row.teamId === UNASSIGNED ? null : row.teamId,
    shiftId: row.shiftId === UNASSIGNED ? null : row.shiftId,
  }));

  const commit = async () => {
    setPending(true);
    setError(null);

    try {
      const response = await fetch('/api/users/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: resolved.map((row) => ({
            fullName: row.fullName,
            employeeCode: row.employeeCode,
            workEmail: row.workEmail.trim() || null,
            teamId: row.teamId,
            employmentType: row.employmentType,
            tracked: row.tracked,
            loginEnabled: row.loginEnabled,
            role: 'EMPLOYEE',
            shiftId: row.shiftId,
            dateOfJoining: row.dateOfJoining,
          })),
        }),
      });

      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload.error ?? 'The import failed. Nothing was written.');
        return;
      }

      setCommitted(payload.created);
      setStep(2);
      router.refresh();
    } catch (caught) {
      setError(caught.message);
    } finally {
      setPending(false);
    }
  };

  const canCommit = readyToCommit(resolved);

  return (
    <Stack spacing={3}>
      <PageHeader
        title='Roster import'
        description='One-time go-live migration from the old workbook’s Biometric ID sheet. It imports people, not attendance — historical attendance is deliberately not migrated. Nothing is guessed or defaulted, and the commit stays disabled until every outstanding field is filled.'
      />

      <Stepper activeStep={step}>
        {STEPS.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>

      {error ? <Alert severity='error'>{error}</Alert> : null}

      {step === 0 ? (
        <form onSubmit={upload}>
          <Paper variant='outlined'>
            <Stack spacing={2} sx={{ p: 3 }}>
              <Typography variant='body2' color='text.secondary'>
                The sheet supplies an employee code and a name. The code is the
                only thing used to match a person — a name never is.
              </Typography>
              <TextField
                name='file'
                type='file'
                required
                slotProps={{ inputLabel: { shrink: true } }}
                label='Biometric ID sheet'
                helperText='An .xlsx workbook. Nothing is written until you commit at step 3.'
              />
              <Stack direction='row'>
                <Button type='submit' variant='contained' loading={pending}>
                  Upload and validate
                </Button>
              </Stack>
            </Stack>
          </Paper>
        </form>
      ) : null}

      {step === 1 ? (
        <Stack spacing={3}>
          {rejected.length > 0 ? (
            <Alert severity='warning'>
              <AlertTitle>
                {rejected.length} row{rejected.length === 1 ? '' : 's'} rejected
              </AlertTitle>
              Each is listed with its reason. Correct the sheet and upload it
              again, or continue without them — nothing has been written yet.
              <Stack component='ul' sx={{ pl: 3 }}>
                {rejected.map((row) => (
                  <Typography
                    component='li'
                    variant='body2'
                    key={`${row.sheetRow}:${row.employeeCode}`}
                  >
                    Row {row.sheetRow} — {row.reason}
                  </Typography>
                ))}
              </Stack>
            </Alert>
          ) : null}

          <Alert severity='info'>
            Every field below is one the sheet does not carry. None is guessed:
            the commit is blocked until each is answered. A shift is required
            for a tracked user and optional for an untracked one; a work email
            is always optional, because support staff hold none and never sign
            in.
          </Alert>

          <Paper variant='outlined' sx={{ overflowX: 'auto' }}>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Employee code</TableCell>
                  <TableCell>Full name</TableCell>
                  <TableCell>Work email</TableCell>
                  <TableCell>Team</TableCell>
                  <TableCell>Employment type</TableCell>
                  <TableCell>Tracked</TableCell>
                  <TableCell>Login</TableCell>
                  <TableCell>Date of joining</TableCell>
                  <TableCell>Shift</TableCell>
                  <TableCell>Outstanding</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((row, index) => {
                  const missing = outstandingDetails(resolved[index]);

                  return (
                    <TableRow key={row.employeeCode} hover>
                      <TableCell>
                        <Typography variant='mono'>
                          {row.employeeCode}
                        </Typography>
                      </TableCell>
                      <TableCell>{row.fullName}</TableCell>
                      <TableCell>
                        <TextField
                          type='email'
                          value={row.workEmail}
                          onChange={set(index, 'workEmail')}
                          aria-label={`Work email for ${row.fullName}`}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          value={row.teamId}
                          onChange={set(index, 'teamId')}
                          aria-label={`Team for ${row.fullName}`}
                          sx={{ minWidth: 140 }}
                        >
                          <MenuItem value={UNASSIGNED}>Choose</MenuItem>
                          {teams.map((team) => (
                            <MenuItem key={team._id} value={team._id}>
                              {team.name}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          value={row.employmentType}
                          onChange={set(index, 'employmentType')}
                          aria-label={`Employment type for ${row.fullName}`}
                          sx={{ minWidth: 140 }}
                          slotProps={{
                            select: { displayEmpty: true },
                            inputLabel: { shrink: true },
                          }}
                        >
                          <MenuItem value=''>Choose</MenuItem>
                          {employmentTypes.map((type) => (
                            <MenuItem key={type} value={type}>
                              {type}
                            </MenuItem>
                          ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.tracked}
                          onChange={set(index, 'tracked')}
                          inputProps={{
                            'aria-label': `${row.fullName} is tracked`,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={row.loginEnabled}
                          onChange={set(index, 'loginEnabled')}
                          inputProps={{
                            'aria-label': `${row.fullName} may sign in`,
                          }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          type='date'
                          value={row.dateOfJoining}
                          onChange={set(index, 'dateOfJoining')}
                          aria-label={`Date of joining for ${row.fullName}`}
                          slotProps={{ inputLabel: { shrink: true } }}
                        />
                      </TableCell>
                      <TableCell>
                        <TextField
                          select
                          value={row.shiftId}
                          onChange={set(index, 'shiftId')}
                          aria-label={`Shift for ${row.fullName}`}
                          disabled={!row.tracked}
                          sx={{ minWidth: 160 }}
                        >
                          <MenuItem value={UNASSIGNED}>Choose</MenuItem>
                          {shifts
                            .filter(
                              (shift) =>
                                resolved[index].teamId === null ||
                                shift.teamId === resolved[index].teamId,
                            )
                            .map((shift) => (
                              <MenuItem key={shift._id} value={shift._id}>
                                {shift.name}
                              </MenuItem>
                            ))}
                        </TextField>
                      </TableCell>
                      <TableCell>
                        {missing.length === 0 ? (
                          <Chip variant='statusSuccess' label='Complete' />
                        ) : (
                          <Chip
                            variant='statusWarning'
                            label={`${missing.length} outstanding`}
                            title={missing.join(', ')}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Paper>

          <Stack direction='row' spacing={2}>
            <Button
              variant='contained'
              onClick={commit}
              disabled={!canCommit}
              loading={pending}
            >
              Commit {rows.length} user{rows.length === 1 ? '' : 's'}
            </Button>
            <Button variant='outlined' onClick={() => setStep(0)}>
              Start again
            </Button>
          </Stack>

          {canCommit ? null : (
            <Typography variant='body2' color='text.secondary'>
              The commit stays disabled until every row reads Complete.
            </Typography>
          )}
        </Stack>
      ) : null}

      {step === 2 ? (
        <Alert severity='success'>
          <AlertTitle>Imported {committed} users</AlertTitle>
          Each has their first tenure open from their date of joining. Every one
          is on the audit log. Attendance was deliberately not migrated — it
          starts accruing from the first punch recorded in Pulse.
        </Alert>
      ) : null}
    </Stack>
  );
}

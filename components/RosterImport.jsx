'use client';

import Alert from '@mui/material/Alert';
import AlertTitle from '@mui/material/AlertTitle';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Divider from '@mui/material/Divider';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Step from '@mui/material/Step';
import StepLabel from '@mui/material/StepLabel';
import Stepper from '@mui/material/Stepper';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { ROLES, UNASSIGNED } from '../constants/index.js';
import {
  outstandingDetails,
  readyToCommit,
  SHEET_COLUMNS,
  SHEET_EXAMPLE_ROWS,
  SHEET_NAME,
  SHEET_NOTES,
} from '../utils/rosterImport.js';
import { PageHeader } from './PageHeader.jsx';
import {
  namedOutstanding,
  ROSTER_DETAIL_FIELDS,
  ROSTER_SWITCH_FIELDS,
  RosterDetailControl,
  RosterSwitchControl,
} from './RosterDetailFields.jsx';
import { SheetFormatDialog } from './SheetFormatDialog.jsx';

const STEPS = ['Upload', 'Missing details', 'Commit'];

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
 *
 * Step 2 answers at two widths. Above `md` it is a table, because a roster is
 * read as a spreadsheet. Below it each person becomes a card, because a
 * ten-column table on a phone is answered by dragging sideways once per field.
 * `RosterDetailFields.jsx` holds the one definition both shapes render.
 */
export function RosterImport({ teams, shifts, employmentTypes }) {
  const router = useRouter();
  const headingId = useId();
  const [step, setStep] = useState(0);
  const [rows, setRows] = useState([]);
  const [rejected, setRejected] = useState([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [committed, setCommitted] = useState(null);
  /**
   * Open on arrival. A wrong column heading rejects the whole sheet at once,
   * and this screen is used once at go-live — so the cost of showing it
   * unasked is a click, and the cost of hiding it behind one is a re-upload.
   */
  const [formatOpen, setFormatOpen] = useState(true);

  /**
   * Nothing here is server-rendered — step 2 exists only after a client-side
   * upload — so the query has no first paint to disagree with.
   */
  const compact = useMediaQuery((activeTheme) =>
    activeTheme.breakpoints.down('md'),
  );

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

      /**
       * Whatever the sheet stated stands; whatever it left blank falls back to
       * the same default the create-user form offers, and is editable here.
       *
       * Team and shift are never on the sheet — `FR-2.1` makes each its own
       * operation — so both start unchosen and block the commit until answered.
       */
      setRows(
        payload.accepted.map((row) => ({
          ...row,
          workEmail: row.workEmail ?? '',
          phone: row.phone ?? '',
          employmentType: row.employmentType ?? '',
          dateOfJoining: row.dateOfJoining ?? '',
          role: row.role ?? ROLES.EMPLOYEE,
          tracked: row.tracked ?? true,
          loginEnabled: row.loginEnabled ?? false,
          teamId: UNASSIGNED,
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
            role: row.role,
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

  /** One control, wherever it is being drawn. */
  const controlFor = (field, index, layout) => (
    <RosterDetailControl
      field={field}
      row={rows[index]}
      layout={layout}
      onChange={set(index, field.key)}
      teams={teams}
      shifts={shifts}
      employmentTypes={employmentTypes}
      teamId={resolved[index].teamId}
    />
  );

  const switchFor = (field, index, layout) => (
    <RosterSwitchControl
      field={field}
      row={rows[index]}
      layout={layout}
      onChange={set(index, field.key)}
    />
  );

  /**
   * Complete, or how much is left. The names are the ones on the labels above,
   * never the field keys — a chip reading `teamId, shiftId` tells somebody
   * filling in a form nothing they can act on.
   */
  const outstandingChip = (missing, layout) => {
    if (missing.length === 0) {
      return <Chip variant='statusSuccess' label='Complete' />;
    }

    const names = namedOutstanding(missing);

    return (
      <Chip
        variant='statusWarning'
        // A card has the room to say which; a table cell has a title, and the
        // card beneath this width is what a touch reader gets instead.
        label={
          layout === 'card'
            ? `Still needs ${names.join(', ')}`
            : `${names.length} outstanding`
        }
        title={names.join(', ')}
      />
    );
  };

  return (
    <Stack spacing={3}>
      <SheetFormatDialog
        open={formatOpen}
        onClose={() => setFormatOpen(false)}
        sheetName={SHEET_NAME}
        columns={SHEET_COLUMNS}
        exampleRows={SHEET_EXAMPLE_ROWS}
        notes={SHEET_NOTES}
        templateHref='/api/users/import/template'
      />

      <PageHeader
        title='Roster import'
        description='One-time go-live migration from the old workbook’s Biometric ID sheet. It imports people, not attendance — historical attendance is deliberately not migrated. Nothing is guessed or defaulted, and the commit stays disabled until every outstanding field is filled.'
      />

      <Stepper activeStep={step} alternativeLabel={compact}>
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
                The sheet supplies an employee code and a name, and may supply
                the work email, employment type, role, date of joining and the
                two switches as well. The code is the only thing used to match a
                person — a name never is.
              </Typography>
              <Stack
                direction={{ xs: 'column', sm: 'row' }}
                spacing={1}
                sx={{ alignItems: { xs: 'stretch', sm: 'center' } }}
              >
                <Button type='button' onClick={() => setFormatOpen(true)}>
                  What the sheet must look like
                </Button>
                <Button
                  component='a'
                  href='/api/users/import/template'
                  download
                >
                  Download blank template
                </Button>
              </Stack>
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

          {compact ? (
            <Stack spacing={2}>
              {rows.map((row, index) => (
                <Paper
                  key={row.employeeCode}
                  variant='outlined'
                  component='section'
                  aria-labelledby={`${headingId}-${index}`}
                >
                  <Stack spacing={2} sx={{ p: 2 }}>
                    <Stack spacing={1}>
                      <Typography variant='mono'>{row.employeeCode}</Typography>
                      <Typography
                        id={`${headingId}-${index}`}
                        variant='bodyStrong'
                        component='h3'
                      >
                        {row.fullName}
                      </Typography>
                      <Stack direction='row'>
                        {outstandingChip(
                          outstandingDetails(resolved[index]),
                          'card',
                        )}
                      </Stack>
                    </Stack>

                    <Divider />

                    <Stack spacing={2}>
                      {ROSTER_DETAIL_FIELDS.map((field) => (
                        <div key={field.key}>
                          {controlFor(field, index, 'card')}
                        </div>
                      ))}
                    </Stack>

                    <Divider />

                    <Stack spacing={2}>
                      {ROSTER_SWITCH_FIELDS.map((field) => (
                        <div key={field.key}>
                          {switchFor(field, index, 'card')}
                        </div>
                      ))}
                    </Stack>
                  </Stack>
                </Paper>
              ))}
            </Stack>
          ) : (
            <Paper variant='outlined' sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Employee code</TableCell>
                    <TableCell>Full name</TableCell>
                    {ROSTER_DETAIL_FIELDS.map((field) => (
                      <TableCell key={field.key}>{field.label}</TableCell>
                    ))}
                    {ROSTER_SWITCH_FIELDS.map((field) => (
                      <TableCell key={field.key}>{field.label}</TableCell>
                    ))}
                    <TableCell>Outstanding</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row, index) => (
                    <TableRow key={row.employeeCode} hover>
                      <TableCell>
                        <Typography variant='mono'>
                          {row.employeeCode}
                        </Typography>
                      </TableCell>
                      <TableCell>{row.fullName}</TableCell>
                      {ROSTER_DETAIL_FIELDS.map((field) => (
                        <TableCell key={field.key}>
                          {controlFor(field, index, 'table')}
                        </TableCell>
                      ))}
                      {ROSTER_SWITCH_FIELDS.map((field) => (
                        <TableCell key={field.key}>
                          {switchFor(field, index, 'table')}
                        </TableCell>
                      ))}
                      <TableCell>
                        {outstandingChip(
                          outstandingDetails(resolved[index]),
                          'table',
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>
          )}

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
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

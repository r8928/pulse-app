'use client';

import FormControlLabel from '@mui/material/FormControlLabel';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { ROLES, UNASSIGNED } from '../constants/index.js';

/**
 * The fields `S-08` step 2 asks about, and the controls that answer them.
 *
 * One definition, two shapes. Above `md` the answers are a table, because a
 * roster is read as a spreadsheet and a hundred people have to be scanned
 * down a column. Below it the same answers are one card per person, because a
 * ten-column table on a phone is answered by dragging sideways once per field.
 * Both read in the same order and use the same words, so the screen is one
 * screen at any width, not two.
 *
 * The list is exported alongside the controls so the table's headings and the
 * card's labels come from the same place, and the outstanding chip can name a
 * missing field the way the person filling it in saw it named.
 */

/** The order both shapes present, and the words both use. */
export const ROSTER_DETAIL_FIELDS = Object.freeze([
  { key: 'workEmail', label: 'Work email' },
  /**
   * Answerable here, never outstanding. `REQUIRED_DETAILS` deliberately omits
   * it, so a blank phone number never holds the go-live commit open — it is a
   * contact detail nobody is required to hold, not a field the engine reads.
   */
  { key: 'phone', label: 'Phone' },
  { key: 'teamId', label: 'Team' },
  { key: 'employmentType', label: 'Employment type' },
  { key: 'role', label: 'Role' },
  { key: 'dateOfJoining', label: 'Date of joining' },
  { key: 'shiftId', label: 'Shift' },
]);

/**
 * The two switches, named for what they do rather than for the field behind
 * them. "Tracked" and "Login" were the column names in the old workbook, and
 * neither says what turning it off costs somebody.
 */
export const ROSTER_SWITCH_FIELDS = Object.freeze([
  {
    key: 'tracked',
    label: 'Track time punches',
    on: 'Punches are recorded and their attendance is calculated.',
    off: 'No attendance is kept for them at all.',
  },
  {
    key: 'loginEnabled',
    label: 'Can log in',
    on: 'They may sign in to Pulse with their work email.',
    off: 'They cannot sign in. Their records are kept for them by somebody else.',
  },
]);

/** Every field by the name the reader saw, for the outstanding chip to list. */
export const ROSTER_FIELD_LABELS = Object.freeze(
  Object.fromEntries(
    [...ROSTER_DETAIL_FIELDS, ...ROSTER_SWITCH_FIELDS].map((field) => [
      field.key,
      field.label,
    ]),
  ),
);

/** Outstanding fields, named as the screen names them rather than as the code does. */
export const namedOutstanding = (missing) =>
  missing.map((key) => ROSTER_FIELD_LABELS[key] ?? key);

/**
 * A card carries its own visible label per control; a table row is named by
 * the column heading above it, which a screen reader does not read out for a
 * form field — so there the person and the field are spelled into the control.
 */
const namingFor = (layout, field, fullName) =>
  layout === 'card'
    ? { label: field.label, fullWidth: true }
    : { 'aria-label': `${field.label} for ${fullName}` };

/** Widths that keep a table cell usable; a card control is always full width. */
const widthFor = (layout, minWidth) =>
  layout === 'card' ? undefined : { minWidth };

/**
 * One answer, in whichever shape the width calls for.
 *
 * @param {object} props
 * @param {{key: string, label: string}} props.field
 * @param {object} props.row the row being answered, as the sheet left it
 * @param {'table'|'card'} props.layout
 * @param {(event: object) => void} props.onChange
 * @param {string|null} props.teamId the resolved team, null when unchosen
 */
export function RosterDetailControl({
  field,
  row,
  layout,
  onChange,
  teams,
  shifts,
  employmentTypes,
  teamId,
}) {
  const naming = namingFor(layout, field, row.fullName);
  const shrink = { inputLabel: { shrink: true } };

  switch (field.key) {
    case 'workEmail':
      return (
        <TextField
          type='email'
          value={row.workEmail}
          onChange={onChange}
          placeholder='name@citrusbits.com'
          // The longest answer on the row, and the one that was cramped: an
          // address elides from the left, so a narrow box shows the domain and
          // hides the person.
          sx={widthFor(layout, 260)}
          slotProps={shrink}
          {...naming}
        />
      );

    case 'phone':
      return (
        <TextField
          value={row.phone}
          onChange={onChange}
          placeholder='+92 300 1234567'
          sx={widthFor(layout, 180)}
          slotProps={shrink}
          {...naming}
        />
      );

    case 'teamId':
      return (
        <TextField
          select
          value={row.teamId}
          onChange={onChange}
          sx={widthFor(layout, 160)}
          slotProps={shrink}
          {...naming}
        >
          <MenuItem value={UNASSIGNED}>Choose</MenuItem>
          {teams.map((team) => (
            <MenuItem key={team._id} value={team._id}>
              {team.name}
            </MenuItem>
          ))}
        </TextField>
      );

    case 'employmentType':
      return (
        <TextField
          select
          value={row.employmentType}
          onChange={onChange}
          sx={widthFor(layout, 170)}
          slotProps={{ select: { displayEmpty: true }, ...shrink }}
          {...naming}
        >
          <MenuItem value=''>Choose</MenuItem>
          {employmentTypes.map((type) => (
            <MenuItem key={type} value={type}>
              {type}
            </MenuItem>
          ))}
        </TextField>
      );

    case 'role':
      return (
        <TextField
          select
          value={row.role}
          onChange={onChange}
          sx={widthFor(layout, 170)}
          slotProps={shrink}
          {...naming}
        >
          {Object.values(ROLES).map((role) => (
            <MenuItem key={role} value={role}>
              {role}
            </MenuItem>
          ))}
        </TextField>
      );

    case 'dateOfJoining':
      return (
        <TextField
          type='date'
          value={row.dateOfJoining}
          onChange={onChange}
          sx={widthFor(layout, 170)}
          slotProps={shrink}
          {...naming}
        />
      );

    case 'shiftId':
      return (
        <TextField
          select
          value={row.shiftId}
          onChange={onChange}
          // FR-3.4: a shift belongs to a tracked user. Untracked, there is
          // nothing for a shift to be compared against.
          disabled={!row.tracked}
          // Only where there is room for it. A table is read as a spreadsheet
          // and an every-other-row helper line is what breaks that reading;
          // the info panel above the table says the same thing once.
          helperText={
            layout === 'card' && !row.tracked
              ? 'Only a tracked user has one.'
              : undefined
          }
          sx={widthFor(layout, 180)}
          slotProps={shrink}
          {...naming}
        >
          <MenuItem value={UNASSIGNED}>Choose</MenuItem>
          {shifts
            .filter((shift) => teamId === null || shift.teamId === teamId)
            .map((shift) => (
              <MenuItem key={shift._id} value={shift._id}>
                {shift.name}
              </MenuItem>
            ))}
        </TextField>
      );

    default:
      return null;
  }
}

/**
 * One switch. In a card it carries its own name and says what the position it
 * is in actually means, which is the whole reason a first-time reader can
 * answer it without asking somebody.
 */
export function RosterSwitchControl({ field, row, layout, onChange }) {
  const control = (
    <Switch
      checked={row[field.key]}
      onChange={onChange}
      slotProps={{
        input: {
          'aria-label':
            layout === 'card'
              ? undefined
              : `${field.label} for ${row.fullName}`,
        },
      }}
    />
  );

  if (layout !== 'card') return control;

  return (
    <Stack>
      <FormControlLabel control={control} label={field.label} />
      <Typography variant='body2' color='text.secondary'>
        {row[field.key] ? field.on : field.off}
      </Typography>
    </Stack>
  );
}

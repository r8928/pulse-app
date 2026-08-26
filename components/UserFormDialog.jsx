'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogTitle from '@mui/material/DialogTitle';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import MenuItem from '@mui/material/MenuItem';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import { useEffect, useState } from 'react';
import { ROLES } from '../constants/index.js';

const EMPTY = {
  fullName: '',
  employeeCode: '',
  workEmail: '',
  phone: '',
  employmentType: '',
  role: ROLES.EMPLOYEE,
  tracked: true,
  loginEnabled: true,
  dateOfJoining: '',
};

/**
 * P-08 and P-09. Creates a user and opens their first tenure from the date of
 * joining, or edits the `FR-2.6` fields of one that exists.
 *
 * Role, team and shift are deliberately absent from the edit case: `FR-2.1`
 * makes each a separate operation with its own consequences, and each has its
 * own dialog carrying its own mandatory reason.
 *
 * Enter submits and Esc cancels, via a real form element: the primary button
 * is type='submit' and every other button is type='button', so neither
 * keyboard path depends on a handler being wired correctly.
 */
export function UserFormDialog({
  open,
  onClose,
  onSubmit,
  pending,
  error,
  employmentTypes,
  initial,
}) {
  const [values, setValues] = useState(EMPTY);
  const editing = Boolean(initial);

  useEffect(() => {
    if (!open) return;

    setValues(
      initial
        ? {
            ...EMPTY,
            fullName: initial.fullName ?? '',
            employeeCode: initial.employeeCode ?? '',
            workEmail: initial.workEmail ?? '',
            phone: initial.phone ?? '',
            employmentType: initial.employmentType ?? '',
            role: initial.role ?? EMPTY.role,
            tracked: Boolean(initial.tracked),
            loginEnabled: Boolean(initial.loginEnabled),
            dateOfJoining: initial.dateOfJoining ?? '',
          }
        : EMPTY,
    );
  }, [open, initial]);

  const set = (field) => (event) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  const setChecked = (field) => (event) =>
    setValues((current) => ({ ...current, [field]: event.target.checked }));

  const handleSubmit = async (event) => {
    event.preventDefault();

    // Role is changed through P-10, never here, so an edit never carries one.
    const { role, tracked, loginEnabled, ...fields } = values;

    const created = await onSubmit({
      ...(editing ? fields : values),
      // FR-2.6: work email is optional. An empty field means "none", which is
      // not the same as an empty string and must not be stored as one.
      workEmail: values.workEmail.trim() ? values.workEmail.trim() : null,
      // Optional in exactly the same sense, and for the same reason.
      phone: values.phone.trim() ? values.phone.trim() : null,
    });

    if (created) {
      if (!editing) setValues(EMPTY);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>{editing ? 'Edit user' : 'New user'}</DialogTitle>

        <DialogContent dividers>
          <Stack spacing={3}>
            {error ? <Alert severity='error'>{error}</Alert> : null}

            <Grid container spacing={2}>
              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label='Full name'
                  value={values.fullName}
                  onChange={set('fullName')}
                  required
                  fullWidth
                  autoFocus
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label='Employee code'
                  value={values.employeeCode}
                  onChange={set('employeeCode')}
                  required
                  fullWidth
                  helperText='The code the biometric machine reports. Unique across all users, including those no longer active.'
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 7 }}>
                <TextField
                  label='Work email'
                  type='email'
                  value={values.workEmail}
                  onChange={set('workEmail')}
                  fullWidth
                  helperText='Optional. Support staff hold none and never sign in; their attendance is still tracked.'
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 5 }}>
                <TextField
                  label='Phone'
                  value={values.phone}
                  onChange={set('phone')}
                  fullWidth
                  placeholder='+92 300 1234567'
                  helperText='Optional. Stored exactly as written.'
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  select
                  label='Employment type'
                  value={values.employmentType}
                  onChange={set('employmentType')}
                  required
                  fullWidth
                  slotProps={{
                    select: { displayEmpty: true },
                    inputLabel: { shrink: true },
                  }}
                >
                  <MenuItem value=''>Select an employment type</MenuItem>
                  {employmentTypes.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid
                size={{ xs: 12, sm: 6 }}
                sx={{ display: editing ? 'none' : undefined }}
              >
                <TextField
                  select
                  label='Role'
                  value={values.role}
                  onChange={set('role')}
                  required
                  fullWidth
                  helperText='One role at a time.'
                >
                  {Object.values(ROLES).map((role) => (
                    <MenuItem key={role} value={role}>
                      {role}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <TextField
                  label='Date of joining'
                  type='date'
                  value={values.dateOfJoining}
                  onChange={set('dateOfJoining')}
                  required
                  fullWidth
                  slotProps={{ inputLabel: { shrink: true } }}
                  helperText='Opens their first tenure.'
                />
              </Grid>

              <Grid size={{ xs: 12, sm: 6 }}>
                <Stack>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.tracked}
                        onChange={setChecked('tracked')}
                      />
                    }
                    label='Attendance tracked'
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={values.loginEnabled}
                        onChange={setChecked('loginEnabled')}
                      />
                    }
                    label='Login enabled'
                  />
                </Stack>
              </Grid>
            </Grid>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button type='button' onClick={onClose}>
            Cancel
          </Button>
          <Button type='submit' variant='contained' loading={pending}>
            {editing ? 'Save changes' : 'Create user'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

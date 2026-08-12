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
import { useState } from 'react';
import { ROLES } from '../constants/index.js';

const EMPTY = {
  fullName: '',
  employeeCode: '',
  workEmail: '',
  employmentType: '',
  role: ROLES.EMPLOYEE,
  tracked: true,
  loginEnabled: true,
  dateOfJoining: '',
};

/**
 * P-08. Creates a user and opens their first tenure from the date of joining.
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
}) {
  const [values, setValues] = useState(EMPTY);

  const set = (field) => (event) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  const setChecked = (field) => (event) =>
    setValues((current) => ({ ...current, [field]: event.target.checked }));

  const handleSubmit = async (event) => {
    event.preventDefault();

    const created = await onSubmit({
      ...values,
      // FR-2.6: work email is optional. An empty field means "none", which is
      // not the same as an empty string and must not be stored as one.
      workEmail: values.workEmail.trim() ? values.workEmail.trim() : null,
    });

    if (created) {
      setValues(EMPTY);
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth='sm' fullWidth>
      <form onSubmit={handleSubmit}>
        <DialogTitle>New user</DialogTitle>

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

              <Grid size={12}>
                <TextField
                  label='Work email'
                  type='email'
                  value={values.workEmail}
                  onChange={set('workEmail')}
                  fullWidth
                  helperText='Optional. Support staff hold none and never sign in; their attendance is still tracked.'
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

              <Grid size={{ xs: 12, sm: 6 }}>
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
            Create user
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

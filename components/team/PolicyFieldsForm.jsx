'use client';

import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import FormControlLabel from '@mui/material/FormControlLabel';
import Grid from '@mui/material/Grid';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

/**
 * The scalar half of `FR-6.4`, driven by a field spec.
 *
 * The Leave policy and the Thresholds & windows tabs are the same form over
 * different fields, so they share this rather than being written twice. Each
 * field states what the number means, because `NFR-2` will not accept a bare
 * label on a figure that could be read two ways.
 *
 * An empty field is sent as `undefined`, never as zero — `DC-6` draws a hard
 * line between "not set" and "set to nothing", and `policyCompleteness` keeps
 * flagging the former until somebody decides.
 */
export function PolicyFieldsForm({
  fields,
  policy,
  canWrite,
  onSave,
  pending,
  error,
  saveLabel = 'Save',
}) {
  const [values, setValues] = useState(() =>
    Object.fromEntries(
      fields.map((field) => [
        field.key,
        field.type === 'boolean'
          ? Boolean(policy?.[field.key])
          : (policy?.[field.key] ?? ''),
      ]),
    ),
  );

  const set = (field) => (event) =>
    setValues((current) => ({
      ...current,
      [field.key]:
        field.type === 'boolean' ? event.target.checked : event.target.value,
    }));

  const handleSubmit = async (event) => {
    event.preventDefault();

    const patch = {};
    for (const field of fields) {
      const value = values[field.key];

      if (field.type === 'boolean') {
        patch[field.key] = value;
      } else if (field.type === 'number') {
        // An empty box means "still not decided", which is not zero.
        if (value !== '' && value !== null) patch[field.key] = Number(value);
      } else if (String(value).trim()) {
        patch[field.key] = String(value).trim();
      }
    }

    await onSave({ ...patch, version: policy?.version ?? null });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack spacing={2}>
        {error ? <Alert severity='error'>{error}</Alert> : null}

        <Paper variant='outlined'>
          <Grid container spacing={2} sx={{ p: 3 }}>
            {fields.map((field) => (
              <Grid key={field.key} size={{ xs: 12, sm: 6 }}>
                {field.type === 'boolean' ? (
                  <Stack>
                    <FormControlLabel
                      control={
                        <Switch
                          checked={Boolean(values[field.key])}
                          onChange={set(field)}
                          disabled={!canWrite}
                        />
                      }
                      label={field.label}
                    />
                    <Typography variant='body2' color='text.secondary'>
                      {field.help}
                    </Typography>
                  </Stack>
                ) : (
                  <TextField
                    label={field.label}
                    type={field.type === 'number' ? 'number' : 'text'}
                    value={values[field.key]}
                    onChange={set(field)}
                    disabled={!canWrite}
                    fullWidth
                    helperText={field.help}
                    slotProps={{ inputLabel: { shrink: true } }}
                  />
                )}
              </Grid>
            ))}
          </Grid>
        </Paper>

        {canWrite ? (
          <Stack direction='row'>
            <Button type='submit' variant='contained' loading={pending}>
              {saveLabel}
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </form>
  );
}

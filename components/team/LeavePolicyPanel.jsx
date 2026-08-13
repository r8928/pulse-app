'use client';

import DeleteOutlined from '@mui/icons-material/DeleteOutlined';
import Alert from '@mui/material/Alert';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import FormControlLabel from '@mui/material/FormControlLabel';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Switch from '@mui/material/Switch';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import TextField from '@mui/material/TextField';
import Typography from '@mui/material/Typography';
import { useState } from 'react';

const BLANK_TYPE = {
  name: '',
  annualEntitlement: 0,
  consumesStandardBalance: true,
};

/**
 * P-33 and P-34. Leave types and their annual entitlement, the accrual period,
 * carry forward, and the single type automatic deductions post to.
 *
 * `FR-6.9`: paternity and maternity are ordinary typed entries that do not
 * consume the standard balance, which is a per-type flag rather than a special
 * case anywhere in the engine.
 */
export function LeavePolicyPanel({ policy, canWrite, mutations, teamId }) {
  const [types, setTypes] = useState(policy?.leaveTypes ?? []);
  const [accrualPeriod, setAccrualPeriod] = useState(
    policy?.accrualPeriod ?? '',
  );
  const [carryForward, setCarryForward] = useState(
    Boolean(policy?.carryForward),
  );
  const [deductionType, setDeductionType] = useState(
    policy?.automaticDeductionLeaveType ?? '',
  );

  const { setPolicy, pending, error } = mutations;

  const setType = (index, field) => (event) => {
    const value =
      field === 'consumesStandardBalance'
        ? event.target.checked
        : field === 'annualEntitlement'
          ? Number(event.target.value)
          : event.target.value;

    setTypes((current) =>
      current.map((type, position) =>
        position === index ? { ...type, [field]: value } : type,
      ),
    );
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    await setPolicy(teamId, {
      leaveTypes: types.filter((type) => type.name.trim()),
      ...(accrualPeriod.trim() ? { accrualPeriod: accrualPeriod.trim() } : {}),
      carryForward,
      ...(deductionType.trim()
        ? { automaticDeductionLeaveType: deductionType.trim() }
        : {}),
      version: policy?.version ?? null,
    });
  };

  return (
    <form onSubmit={handleSubmit}>
      <Stack spacing={3}>
        {error ? <Alert severity='error'>{error}</Alert> : null}

        <Stack spacing={2}>
          <Stack spacing={1}>
            <Typography variant='sectionTitle'>Leave types</Typography>
            <Typography variant='body2' color='text.secondary'>
              Every leave states its type, so no consumption order between types
              is ever needed. A type that does not consume the standard balance
              — paternity and maternity — keeps its own.
            </Typography>
          </Stack>

          <Paper variant='outlined'>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Type</TableCell>
                  <TableCell>Annual entitlement, in days</TableCell>
                  <TableCell>Consumes the standard balance</TableCell>
                  {canWrite ? <TableCell>Actions</TableCell> : null}
                </TableRow>
              </TableHead>
              <TableBody>
                {types.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canWrite ? 4 : 3}>
                      <Typography variant='body2' color='text.secondary'>
                        No leave type set. Until one is, no leave can be
                        recorded at all — a leave without a type is rejected.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  types.map((type, index) => (
                    // A type has no id of its own; its position is its identity
                    // within the policy document.
                    // biome-ignore lint/suspicious/noArrayIndexKey: identified by position
                    <TableRow key={index} hover>
                      <TableCell>
                        {canWrite ? (
                          <TextField
                            value={type.name}
                            onChange={setType(index, 'name')}
                            aria-label={`Name of leave type ${index + 1}`}
                          />
                        ) : (
                          type.name
                        )}
                      </TableCell>
                      <TableCell>
                        {canWrite ? (
                          <TextField
                            type='number'
                            value={type.annualEntitlement}
                            onChange={setType(index, 'annualEntitlement')}
                            aria-label={`Annual entitlement for ${type.name || `leave type ${index + 1}`}`}
                          />
                        ) : (
                          <Typography variant='mono'>
                            {type.annualEntitlement}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        {canWrite ? (
                          <Switch
                            checked={type.consumesStandardBalance !== false}
                            onChange={setType(index, 'consumesStandardBalance')}
                            inputProps={{
                              'aria-label': `${type.name || `Leave type ${index + 1}`} consumes the standard balance`,
                            }}
                          />
                        ) : (
                          <Chip
                            variant={
                              type.consumesStandardBalance === false
                                ? 'statusNeutral'
                                : 'statusSuccess'
                            }
                            label={
                              type.consumesStandardBalance === false
                                ? 'Separate balance'
                                : 'Standard balance'
                            }
                          />
                        )}
                      </TableCell>
                      {canWrite ? (
                        <TableCell>
                          <IconButton
                            aria-label={`Remove leave type ${index + 1}`}
                            onClick={() =>
                              setTypes((current) =>
                                current.filter(
                                  (_type, position) => position !== index,
                                ),
                              )
                            }
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
              <Button
                variant='outlined'
                onClick={() => setTypes((current) => [...current, BLANK_TYPE])}
              >
                Add a leave type
              </Button>
            </Stack>
          ) : null}
        </Stack>

        <Stack spacing={2}>
          <Typography variant='sectionTitle'>
            Accrual and carry forward
          </Typography>

          <Paper variant='outlined'>
            <Stack spacing={2} sx={{ p: 3 }}>
              <TextField
                label='Accrual period'
                value={accrualPeriod}
                onChange={(event) => setAccrualPeriod(event.target.value)}
                disabled={!canWrite}
                helperText='The period the whole entitlement is credited at the start of. A joiner’s figure is prorated from their date of joining, or from a later tenure’s start.'
                slotProps={{ inputLabel: { shrink: true } }}
              />

              <Stack>
                <FormControlLabel
                  control={
                    <Switch
                      checked={carryForward}
                      onChange={(event) =>
                        setCarryForward(event.target.checked)
                      }
                      disabled={!canWrite}
                    />
                  }
                  label='Carry an unused balance forward'
                />
                <Typography variant='body2' color='text.secondary'>
                  Applies within one tenure only. When a tenure ends the balance
                  is brought to zero by a ledger entry marked as lapsed on
                  departure, so no balance ever needs a special case.
                </Typography>
              </Stack>

              <TextField
                label='Leave type automatic deductions post to'
                value={deductionType}
                onChange={(event) => setDeductionType(event.target.value)}
                disabled={!canWrite}
                helperText='The engine raises a deduction with no type stated, so exactly one type has to absorb it. Must match one of the names above.'
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Stack>
          </Paper>
        </Stack>

        {canWrite ? (
          <Stack direction='row'>
            <Button type='submit' variant='contained' loading={pending}>
              Save leave policy
            </Button>
          </Stack>
        ) : null}
      </Stack>
    </form>
  );
}

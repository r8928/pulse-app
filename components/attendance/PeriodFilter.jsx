'use client';

import ChevronLeft from '@mui/icons-material/ChevronLeft';
import ChevronRight from '@mui/icons-material/ChevronRight';
import IconButton from '@mui/material/IconButton';
import Stack from '@mui/material/Stack';
import TextField from '@mui/material/TextField';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import Typography from '@mui/material/Typography';
import { PERIOD_MODE } from '../../constants/index.js';
import { periodLabel, periodQuery, shiftPeriod } from '../../utils/period.js';

/**
 * The Weekly / Monthly / Custom filter both new pages share.
 *
 * The picker changes shape with the mode rather than sitting beside it: a week
 * picker for a week, a month picker for a month, two date fields only for the
 * range that genuinely needs two. A from–to pair left showing under "Weekly"
 * invites a reader to set a range the mode will then ignore.
 *
 * Pure presentation. It reports a period and never resolves one — that is
 * `utils/period.js`, so the screen and its tests agree on what "next week"
 * means without a browser.
 */
export function PeriodFilter({ period, onChange }) {
  const step = (delta) => onChange(periodQuery(shiftPeriod(period, delta)));

  const setMode = (mode) => {
    if (!mode || mode === period.mode) return;

    // Carrying the current range into a custom period means switching to it
    // starts from what the reader was already looking at, rather than from a
    // blank pair of fields they have to fill in twice.
    if (mode === PERIOD_MODE.CUSTOM) {
      onChange({ mode, from: period.from, to: period.to });
      return;
    }

    onChange({ mode, anchor: period.from });
  };

  return (
    <Stack
      direction={{ xs: 'column', md: 'row' }}
      spacing={2}
      sx={{ alignItems: { md: 'center' } }}
    >
      <ToggleButtonGroup
        exclusive
        size='small'
        value={period.mode}
        onChange={(_event, mode) => setMode(mode)}
        aria-label='Period'
      >
        <ToggleButton value={PERIOD_MODE.WEEKLY}>Weekly</ToggleButton>
        <ToggleButton value={PERIOD_MODE.MONTHLY}>Monthly</ToggleButton>
        <ToggleButton value={PERIOD_MODE.CUSTOM}>Custom</ToggleButton>
      </ToggleButtonGroup>

      {period.mode === PERIOD_MODE.CUSTOM ? (
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
          <TextField
            label='From'
            type='date'
            value={period.from}
            onChange={(event) =>
              onChange({
                mode: PERIOD_MODE.CUSTOM,
                from: event.target.value,
                to: period.to,
              })
            }
            slotProps={{ inputLabel: { shrink: true } }}
          />
          <TextField
            label='To'
            type='date'
            value={period.to}
            onChange={(event) =>
              onChange({
                mode: PERIOD_MODE.CUSTOM,
                from: period.from,
                to: event.target.value,
              })
            }
            slotProps={{ inputLabel: { shrink: true } }}
          />
        </Stack>
      ) : null}

      <Stack direction='row' spacing={1} sx={{ alignItems: 'center' }}>
        <IconButton
          onClick={() => step(-1)}
          aria-label={
            period.mode === PERIOD_MODE.WEEKLY ? 'Previous week' : 'Earlier'
          }
        >
          <ChevronLeft />
        </IconButton>

        <Typography variant='bodyStrong' sx={{ minWidth: 220 }} align='center'>
          {periodLabel(period)}
        </Typography>

        <IconButton
          onClick={() => step(1)}
          aria-label={
            period.mode === PERIOD_MODE.WEEKLY ? 'Next week' : 'Later'
          }
        >
          <ChevronRight />
        </IconButton>
      </Stack>
    </Stack>
  );
}

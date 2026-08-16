import BusinessOutlined from '@mui/icons-material/BusinessOutlined';
import CancelOutlined from '@mui/icons-material/CancelOutlined';
import CelebrationOutlined from '@mui/icons-material/CelebrationOutlined';
import EventBusyOutlined from '@mui/icons-material/EventBusyOutlined';
import HelpOutlineOutlined from '@mui/icons-material/HelpOutlineOutlined';
import HomeOutlined from '@mui/icons-material/HomeOutlined';
import WeekendOutlined from '@mui/icons-material/WeekendOutlined';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';
import Typography from '@mui/material/Typography';
import { DAY_STATUS } from '../../constants/index.js';

/**
 * FR-5.2. What the user actually did, read as words rather than as a code.
 *
 * Status is never colour alone (NFR-12, DC-11): each chip carries an icon and
 * a written label, and selects a theme variant rather than styling itself
 * (CLAUDE.md). This maps a domain value to one of those variants, the same
 * way `TeamStatusChip` does — it is a lookup, not a style map.
 */
const PRESENTATION = {
  [DAY_STATUS.WFO]: {
    variant: 'statusSuccess',
    icon: BusinessOutlined,
    label: 'Worked in office',
  },
  [DAY_STATUS.WFH]: {
    variant: 'statusInfo',
    icon: HomeOutlined,
    label: 'Worked from home',
  },
  [DAY_STATUS.LEAVE]: {
    variant: 'statusInfo',
    icon: EventBusyOutlined,
    label: 'On leave',
  },
  [DAY_STATUS.HOLIDAY_WORK]: {
    variant: 'statusWarning',
    icon: CelebrationOutlined,
    label: 'Worked a non-working day',
  },
  [DAY_STATUS.WEEKLY_OFF]: {
    variant: 'statusNeutral',
    icon: WeekendOutlined,
    label: 'Weekly off',
  },
  [DAY_STATUS.HOLIDAY]: {
    variant: 'statusNeutral',
    icon: CelebrationOutlined,
    label: 'Holiday',
  },
  [DAY_STATUS.ABSENT]: {
    variant: 'statusDanger',
    icon: CancelOutlined,
    label: 'Absent',
  },
};

/**
 * FR-3.12: a day whose shift is unknown reaches no status at all. Saying so
 * beats an empty cell, which is indistinguishable from a failure to load.
 */
const UNKNOWN = {
  variant: 'statusNeutral',
  icon: HelpOutlineOutlined,
  label: 'Not known yet',
};

export function DayStatusChip({ status, overridden = false }) {
  const { variant, icon: Icon, label } = PRESENTATION[status] ?? UNKNOWN;

  return (
    <Stack spacing={0.5} alignItems='flex-start'>
      <Chip variant={variant} icon={<Icon fontSize='small' />} label={label} />
      {overridden ? (
        <Typography variant='caption' color='text.secondary'>
          Set by an administrator
        </Typography>
      ) : null}
    </Stack>
  );
}

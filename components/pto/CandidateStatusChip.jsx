import CancelOutlined from '@mui/icons-material/CancelOutlined';
import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import HourglassEmptyOutlined from '@mui/icons-material/HourglassEmptyOutlined';
import Chip from '@mui/material/Chip';
import { APPROVAL_STATUS } from '../../constants/index.js';

/**
 * Where a candidate stands. `FR-7.1` in one glyph: only APPROVED has reached
 * the ledger — the other two are a proposal and a refusal, and neither moved a
 * balance.
 *
 * Never colour alone (`NFR-12`, `DC-11`): an icon and a written label, through
 * a theme variant rather than an sx map.
 */
const CHIPS = {
  [APPROVAL_STATUS.PENDING]: {
    variant: 'statusInfo',
    icon: <HourglassEmptyOutlined fontSize='small' />,
    label: 'Suggested',
  },
  [APPROVAL_STATUS.APPROVED]: {
    variant: 'statusSuccess',
    icon: <CheckCircleOutlined fontSize='small' />,
    label: 'Approved',
  },
  [APPROVAL_STATUS.DECLINED]: {
    variant: 'statusNeutral',
    icon: <CancelOutlined fontSize='small' />,
    label: 'Declined',
  },
};

export function CandidateStatusChip({ status }) {
  const chip = CHIPS[status];
  if (!chip) return null;

  return <Chip variant={chip.variant} icon={chip.icon} label={chip.label} />;
}

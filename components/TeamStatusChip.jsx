import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import RemoveCircleOutlineOutlined from '@mui/icons-material/RemoveCircleOutlineOutlined';
import Chip from '@mui/material/Chip';

/**
 * FR-3.2. A soft-deleted team is readable but no longer offered for
 * assignment, and the chip says which of the two applies.
 *
 * Never colour alone (`NFR-12`, `DC-11`): an icon and a written label, through
 * a theme variant rather than an sx map.
 */
export function TeamStatusChip({ team }) {
  return team.deletedAt ? (
    <Chip
      variant='statusNeutral'
      icon={<RemoveCircleOutlineOutlined fontSize='small' />}
      label='No longer offered for assignment'
    />
  ) : (
    <Chip
      variant='statusSuccess'
      icon={<CheckCircleOutlined fontSize='small' />}
      label='Active'
    />
  );
}

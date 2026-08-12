import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import PersonOffOutlined from '@mui/icons-material/PersonOffOutlined';
import RemoveCircleOutlineOutlined from '@mui/icons-material/RemoveCircleOutlineOutlined';
import Chip from '@mui/material/Chip';
import Stack from '@mui/material/Stack';

/**
 * Status is never conveyed by colour alone (NFR-12, DC-11): every chip below
 * carries an icon and a written label.
 *
 * The presets are theme variants selected by the `variant` prop, never an sx
 * map built here.
 */
export function UserStatusChips({ user }) {
  return (
    <Stack direction='row' spacing={1} sx={{ flexWrap: 'wrap', gap: 1 }}>
      {user.deletedAt ? (
        <Chip
          variant='statusNeutral'
          icon={<PersonOffOutlined fontSize='small' />}
          label='No longer active'
        />
      ) : (
        <Chip
          variant='statusSuccess'
          icon={<CheckCircleOutlined fontSize='small' />}
          label='Active'
        />
      )}

      {/* FR-2.10: an untracked user is marked as such wherever they appear. */}
      {user.tracked ? null : (
        <Chip
          variant='statusWarning'
          icon={<RemoveCircleOutlineOutlined fontSize='small' />}
          label='Not tracked'
        />
      )}

      {/* FR-1.5 and FR-2.5: sign-in follows from work email and the flag. */}
      {user.workEmail && user.loginEnabled ? null : (
        <Chip
          variant='statusNeutral'
          icon={<RemoveCircleOutlineOutlined fontSize='small' />}
          label={user.workEmail ? 'Login disabled' : 'No work email'}
        />
      )}
    </Stack>
  );
}

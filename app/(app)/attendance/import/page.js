import Stack from '@mui/material/Stack';
import { AttendanceImport } from '../../../../components/attendance/AttendanceImport.jsx';
import { PageHeader } from '../../../../components/PageHeader.jsx';

/**
 * S-11. `proxy.js` has already established that the viewer holds
 * `attendance.import` before this renders — no guard belongs here (CLAUDE.md),
 * and both endpoints behind the screen assert the permission again for
 * themselves.
 */
export default function AttendanceImportPage() {
  return (
    <Stack spacing={3}>
      <PageHeader
        title='Import attendance'
        description='Load punches in bulk from the biometric export. Nothing is written until you have seen what would be accepted and what would be refused, and then every accepted row is written or none is.'
      />
      <AttendanceImport />
    </Stack>
  );
}

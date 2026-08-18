'use client';

import CloseOutlined from '@mui/icons-material/CloseOutlined';
import Button from '@mui/material/Button';
import Dialog from '@mui/material/Dialog';
import DialogActions from '@mui/material/DialogActions';
import DialogContent from '@mui/material/DialogContent';
import DialogContentText from '@mui/material/DialogContentText';
import DialogTitle from '@mui/material/DialogTitle';
import IconButton from '@mui/material/IconButton';
import Paper from '@mui/material/Paper';
import Stack from '@mui/material/Stack';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import Typography from '@mui/material/Typography';
import {
  EMPLOYEE_CODE_COLUMN,
  EMPLOYEE_NAME_COLUMN,
} from '../utils/rosterImport.js';

/**
 * S-08's format guide, shown before a file is chosen.
 *
 * A wrong heading is the one mistake the screen cannot help with after the
 * fact: `readSheetRows` keys rows on the exact trimmed heading, so a sheet
 * naming its second column anything but `Employee Name` rejects every row at
 * once, and the reader is told 133 times that a row has no name while looking
 * at a column full of names.
 *
 * Drawn as a sheet rather than described in prose, and rendered from the
 * parser's own constants rather than a screenshot: a picture cannot be copied
 * from, reads at one width, carries one colour scheme, and goes stale in
 * silence the day a column changes.
 *
 * Presentational. Open state belongs to the screen that offers it.
 */

/** Invented. Nobody should read a real colleague into an example. */
const EXAMPLE_ROWS = [
  { employeeCode: 'CB-1042', fullName: 'Sana Iqbal' },
  { employeeCode: 'CB-1043', fullName: 'Daniyal Khan' },
  { employeeCode: 'CB-1044', fullName: 'Hira Siddiqui' },
];

/** The spreadsheet's own gutter: what Excel puts down the left-hand side. */
const gutter = {
  bgcolor: 'action.hover',
  color: 'text.secondary',
  textAlign: 'center',
};

export function SheetFormatDialog({ open, onClose }) {
  const handleSubmit = (event) => {
    event.preventDefault();
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} aria-labelledby='sheet-format-title'>
      {/* Enter acknowledges, Esc dismisses: a real form, as everywhere else. */}
      <form onSubmit={handleSubmit}>
        <DialogTitle
          id='sheet-format-title'
          sx={{ display: 'flex', alignItems: 'center', gap: 2 }}
        >
          <Typography variant='inherit' component='span' sx={{ flexGrow: 1 }}>
            What the sheet must look like
          </Typography>
          <IconButton type='button' onClick={onClose} aria-label='Close'>
            <CloseOutlined />
          </IconButton>
        </DialogTitle>

        <DialogContent dividers>
          <Stack spacing={3}>
            <DialogContentText>
              Two columns, with the headings in row 1 spelled exactly as below.
              The rows underneath are an example.
            </DialogContentText>

            <Paper variant='outlined' sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={gutter} />
                    <TableCell sx={gutter}>A</TableCell>
                    <TableCell sx={gutter}>B</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell sx={gutter}>1</TableCell>
                    <TableCell>
                      <Typography variant='bodyStrong'>
                        {EMPLOYEE_CODE_COLUMN}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Typography variant='bodyStrong'>
                        {EMPLOYEE_NAME_COLUMN}
                      </Typography>
                    </TableCell>
                  </TableRow>

                  {EXAMPLE_ROWS.map((row, index) => (
                    <TableRow key={row.employeeCode}>
                      <TableCell sx={gutter}>{index + 2}</TableCell>
                      <TableCell>
                        <Typography variant='mono'>
                          {row.employeeCode}
                        </Typography>
                      </TableCell>
                      <TableCell>{row.fullName}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>

            <Stack component='ul' spacing={1} sx={{ pl: 3, m: 0 }}>
              <Typography component='li' variant='body2'>
                Both headings must match character for character. Anything else
                in that cell leaves the column unread, and every row is rejected
                for the field it was carrying.
              </Typography>
              <Typography component='li' variant='body2'>
                Any other column is ignored, not rejected. Leave the rest of the
                old workbook in place if it is easier.
              </Typography>
              <Typography component='li' variant='body2'>
                A row with no code, or no name, is listed as rejected and
                skipped. Nothing is written until the last step.
              </Typography>
              <Typography component='li' variant='body2'>
                Team, employment type, tracked, login, date of joining and shift
                are not read from the sheet. The next step asks for each,
                because none of them is ever guessed.
              </Typography>
            </Stack>
          </Stack>
        </DialogContent>

        <DialogActions sx={{ justifyContent: 'center' }}>
          <Button type='submit' variant='contained'>
            Ok, I understand
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

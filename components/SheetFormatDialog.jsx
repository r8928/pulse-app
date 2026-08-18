'use client';

import CloseOutlined from '@mui/icons-material/CloseOutlined';
import DownloadOutlined from '@mui/icons-material/DownloadOutlined';
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
import { SHEET_COLUMNS, SHEET_NAME } from '../utils/rosterImport.js';

/**
 * S-08's format guide, shown before a file is chosen.
 *
 * A wrong heading is the one mistake the screen cannot help with after the
 * fact: `readSheetRows` keys rows on the exact trimmed heading, so a sheet
 * naming its second column anything but `Employee Name` rejects every row at
 * once, and the reader is told over and over that a row has no name while
 * looking at a column full of names.
 *
 * Drawn as a sheet rather than described in prose, and rendered from
 * `SHEET_COLUMNS` rather than a screenshot: a picture cannot be copied from,
 * reads at one width, carries one colour scheme, and goes stale in silence the
 * day a column changes.
 *
 * Presentational. Open state belongs to the screen that offers it.
 */

/** Excel's own column letters: A, B, C … for as many columns as there are. */
const columnLetter = (index) => String.fromCharCode(65 + index);

/**
 * Two example people, invented. Nobody should read a real colleague into an
 * example, and the pair between them shows every column both filled and left
 * blank — a support-staff row genuinely has no email and never signs in.
 */
const EXAMPLE_ROWS = [
  SHEET_COLUMNS.map((column) => column.example),
  [
    'CB-1043',
    'Daniyal Khan',
    '',
    'SUPPORT_STAFF',
    'EMPLOYEE',
    '2022-04-04',
    'TRUE',
    'FALSE',
  ],
];

/** The spreadsheet's own gutter: what Excel puts down the left-hand side. */
const gutter = {
  bgcolor: 'action.hover',
  color: 'text.secondary',
  textAlign: 'center',
};

/** Cells hold sheet content, so they read as cells rather than as prose. */
const cell = { whiteSpace: 'nowrap' };

export function SheetFormatDialog({ open, onClose }) {
  const handleSubmit = (event) => {
    event.preventDefault();
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth='lg'
      aria-labelledby='sheet-format-title'
    >
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
              Headings in row 1, spelled exactly as below, on a sheet named “
              {SHEET_NAME}” or the first sheet in the workbook. The rows
              underneath are an example.
            </DialogContentText>

            <Stack direction='row'>
              <Button
                component='a'
                href='/api/users/import/template'
                download
                variant='outlined'
                startIcon={<DownloadOutlined />}
              >
                Download blank template
              </Button>
            </Stack>

            <Paper variant='outlined' sx={{ overflowX: 'auto' }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell sx={gutter} />
                    {SHEET_COLUMNS.map((column, index) => (
                      <TableCell key={column.name} sx={gutter}>
                        {columnLetter(index)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell sx={gutter}>1</TableCell>
                    {SHEET_COLUMNS.map((column) => (
                      <TableCell key={column.name} sx={cell}>
                        <Typography variant='bodyStrong'>
                          {column.name}
                        </Typography>
                      </TableCell>
                    ))}
                  </TableRow>

                  {EXAMPLE_ROWS.map((values, row) => (
                    <TableRow key={values[0]}>
                      <TableCell sx={gutter}>{row + 2}</TableCell>
                      {values.map((value, index) => (
                        <TableCell key={SHEET_COLUMNS[index].name} sx={cell}>
                          {index === 0 ? (
                            <Typography variant='mono'>{value}</Typography>
                          ) : (
                            value
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Paper>

            <Stack spacing={1}>
              <Typography variant='bodyStrong' component='p'>
                What each column is for
              </Typography>
              <Stack component='dl' spacing={1} sx={{ m: 0 }}>
                {SHEET_COLUMNS.map((column) => (
                  <Stack
                    key={column.name}
                    direction={{ xs: 'column', sm: 'row' }}
                    spacing={1}
                  >
                    <Typography
                      component='dt'
                      variant='body2'
                      sx={{ minWidth: 180 }}
                    >
                      <Typography variant='bodyStrong' component='span'>
                        {column.name}
                      </Typography>
                      {column.required ? ' — required' : ''}
                    </Typography>
                    <Typography
                      component='dd'
                      variant='body2'
                      color='text.secondary'
                      sx={{ m: 0 }}
                    >
                      {column.note}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            </Stack>

            <Stack component='ul' spacing={1} sx={{ pl: 3, m: 0 }}>
              <Typography component='li' variant='body2'>
                Every heading must match character for character. Anything else
                in that cell leaves the column unread, and every row is rejected
                for the field it was carrying.
              </Typography>
              <Typography component='li' variant='body2'>
                Only the first two columns are required. Leave any other cell
                empty and the next step asks for it, one person at a time.
              </Typography>
              <Typography component='li' variant='body2'>
                A cell that is filled in but unreadable rejects that row and
                says why. Nothing is ever substituted for it — a mistyped role
                must not quietly become the wrong access.
              </Typography>
              <Typography component='li' variant='body2'>
                Team and shift are not on the sheet. Each is its own operation
                with its own history, so the next step asks for both.
              </Typography>
              <Typography component='li' variant='body2'>
                Any further column is ignored, not rejected. Leave the rest of
                the old workbook in place if it is easier.
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

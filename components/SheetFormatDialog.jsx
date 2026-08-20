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

/**
 * The format guide an import screen shows before a file is chosen.
 *
 * A wrong heading is the one mistake an import cannot help with after the
 * fact: `readSheetRows` keys rows on the exact trimmed heading, so a sheet
 * naming a column anything else rejects every row at once, and the reader is
 * told over and over that a row has no name while looking at a column full of
 * names.
 *
 * Drawn as a sheet rather than described in prose, and rendered from the
 * caller's column list rather than a screenshot: a picture cannot be copied
 * from, reads at one width, carries one colour scheme, and goes stale in
 * silence the day a column changes.
 *
 * Presentational, and shared by `S-08` and `S-11`. Every word specific to one
 * sheet arrives as a prop, so the two guides cannot drift into two designs.
 * Open state belongs to the screen that offers it.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {string} props.sheetName the worksheet the upload looks for first
 * @param {ReadonlyArray<{name: string, required: boolean, note: string}>} props.columns
 * @param {ReadonlyArray<ReadonlyArray<string>>} props.exampleRows one per drawn row
 * @param {ReadonlyArray<string>} props.notes what holds for the sheet as a whole
 * @param {string} props.templateHref the blank workbook to download
 */

/** Excel's own column letters: A, B, C … for as many columns as there are. */
const columnLetter = (index) => String.fromCharCode(65 + index);

/** The spreadsheet's own gutter: what Excel puts down the left-hand side. */
const gutter = {
  bgcolor: 'action.hover',
  color: 'text.secondary',
  textAlign: 'center',
};

/** Cells hold sheet content, so they read as cells rather than as prose. */
const cell = { whiteSpace: 'nowrap' };

export function SheetFormatDialog({
  open,
  onClose,
  sheetName,
  columns,
  exampleRows,
  notes,
  templateHref,
}) {
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
              {sheetName}” or the first sheet in the workbook. The rows
              underneath are an example.
            </DialogContentText>

            <Stack direction='row'>
              <Button
                component='a'
                href={templateHref}
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
                    {columns.map((column, index) => (
                      <TableCell key={column.name} sx={gutter}>
                        {columnLetter(index)}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell sx={gutter}>1</TableCell>
                    {columns.map((column) => (
                      <TableCell key={column.name} sx={cell}>
                        <Typography variant='bodyStrong'>
                          {column.name}
                        </Typography>
                      </TableCell>
                    ))}
                  </TableRow>

                  {exampleRows.map((values, row) => (
                    <TableRow key={values.join('|')}>
                      <TableCell sx={gutter}>{row + 2}</TableCell>
                      {values.map((value, index) => (
                        <TableCell key={columns[index].name} sx={cell}>
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
                {columns.map((column) => (
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
                      {column.required ? ' — required' : ' — optional'}
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
              {notes.map((note) => (
                <Typography component='li' variant='body2' key={note}>
                  {note}
                </Typography>
              ))}
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

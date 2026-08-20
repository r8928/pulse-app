import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../app/theme/theme.js';
import {
  ATTENDANCE_EXAMPLE_ROWS,
  ATTENDANCE_SHEET_COLUMNS,
  ATTENDANCE_SHEET_NAME,
  ATTENDANCE_SHEET_NOTES,
} from '../../utils/attendanceImport.js';
import {
  SHEET_COLUMNS,
  SHEET_EXAMPLE_ROWS,
  SHEET_NAME,
  SHEET_NOTES,
} from '../../utils/rosterImport.js';
import { SheetFormatDialog } from '../SheetFormatDialog.jsx';

/**
 * The dialog exists to state a sheet's headings exactly, so the assertions are
 * on those headings and on every way out of it.
 *
 * It reads them from the same constants the parser matches on, which is what
 * stops the guidance and the validator drifting apart — a test that hardcoded
 * the strings here would let both move together and still pass.
 *
 * One component serves `S-08` and `S-11`, so both configurations are asserted:
 * a guide that only worked for the roster would be found by whoever needed it
 * least.
 */

const ROSTER = {
  sheetName: SHEET_NAME,
  columns: SHEET_COLUMNS,
  exampleRows: SHEET_EXAMPLE_ROWS,
  notes: SHEET_NOTES,
  templateHref: '/api/users/import/template',
};

const ATTENDANCE = {
  sheetName: ATTENDANCE_SHEET_NAME,
  columns: ATTENDANCE_SHEET_COLUMNS,
  exampleRows: ATTENDANCE_EXAMPLE_ROWS,
  notes: ATTENDANCE_SHEET_NOTES,
  templateHref: '/api/attendance/import/template',
};

const renderDialog = (props = {}) => {
  const onClose = vi.fn();

  render(
    <ThemeProvider theme={theme} defaultMode='system'>
      <SheetFormatDialog open onClose={onClose} {...ROSTER} {...props} />
    </ThemeProvider>,
  );

  return { onClose };
};

describe('SheetFormatDialog', () => {
  it('spells out every heading the roster sheet may carry', () => {
    renderDialog();

    for (const column of SHEET_COLUMNS) {
      // Twice over: once as a cell in the drawn sheet, once in the glossary
      // that says what the column is for.
      expect(screen.getAllByText(column.name).length).toBeGreaterThan(0);
    }
  });

  it('spells out every heading the punch sheet may carry', () => {
    renderDialog(ATTENDANCE);

    for (const column of ATTENDANCE_SHEET_COLUMNS) {
      expect(screen.getAllByText(column.name).length).toBeGreaterThan(0);
    }
  });

  it('says which columns a sheet cannot be without', () => {
    renderDialog();

    const required = SHEET_COLUMNS.filter((column) => column.required);
    expect(screen.getAllByText(/— required/)).toHaveLength(required.length);
  });

  it('marks every other column optional rather than leaving it unsaid', () => {
    renderDialog();

    const optional = SHEET_COLUMNS.filter((column) => !column.required);
    expect(screen.getAllByText(/— optional/)).toHaveLength(optional.length);
  });

  it('shows example rows, so the reader sees what a filled sheet looks like', () => {
    renderDialog();

    expect(screen.getByText('CB-1042')).toBeInTheDocument();
    expect(screen.getByText('Sana Iqbal')).toBeInTheDocument();
  });

  it('names the sheet the upload looks for', () => {
    renderDialog(ATTENDANCE);

    expect(
      screen.getByText(new RegExp(ATTENDANCE_SHEET_NAME)),
    ).toBeInTheDocument();
  });

  it('offers the blank template, since a right heading beats a typed one', () => {
    renderDialog();

    expect(
      screen.getByRole('link', { name: /download blank template/i }),
    ).toHaveAttribute('href', '/api/users/import/template');
  });

  it('offers the punch template on the attendance sheet', () => {
    renderDialog(ATTENDANCE);

    expect(
      screen.getByRole('link', { name: /download blank template/i }),
    ).toHaveAttribute('href', '/api/attendance/import/template');
  });

  it('closes on the close button', async () => {
    const { onClose } = renderDialog();

    await userEvent.click(screen.getByRole('button', { name: /close/i }));

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on the acknowledgement', async () => {
    const { onClose } = renderDialog();

    await userEvent.click(
      screen.getByRole('button', { name: 'Ok, I understand' }),
    );

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape', async () => {
    const { onClose } = renderDialog();

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalled();
  });

  it('is absent until it is opened', () => {
    renderDialog({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

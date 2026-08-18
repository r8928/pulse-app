import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../app/theme/theme.js';
import { SHEET_COLUMNS } from '../../utils/rosterImport.js';
import { SheetFormatDialog } from '../SheetFormatDialog.jsx';

/**
 * The dialog exists to state two column headings exactly, so the assertions
 * are on those headings and on every way out of it.
 *
 * It reads them from the same constants the parser matches on, which is what
 * stops the guidance and the validator drifting apart — a test that hardcoded
 * the strings here would let both move together and still pass.
 */

const renderDialog = (props = {}) => {
  const onClose = vi.fn();

  render(
    <ThemeProvider theme={theme} defaultMode='system'>
      <SheetFormatDialog open onClose={onClose} {...props} />
    </ThemeProvider>,
  );

  return { onClose };
};

describe('SheetFormatDialog', () => {
  it('spells out every heading the sheet may carry', () => {
    renderDialog();

    for (const column of SHEET_COLUMNS) {
      // Twice over: once as a cell in the drawn sheet, once in the glossary
      // that says what the column is for.
      expect(screen.getAllByText(column.name).length).toBeGreaterThan(0);
    }
  });

  it('says which columns a sheet cannot be without', () => {
    renderDialog();

    const required = SHEET_COLUMNS.filter((column) => column.required);
    expect(screen.getAllByText(/— required/)).toHaveLength(required.length);
  });

  it('shows example rows, so the reader sees what a filled sheet looks like', () => {
    renderDialog();

    expect(screen.getByText('CB-1042')).toBeInTheDocument();
    expect(screen.getByText('Sana Iqbal')).toBeInTheDocument();
  });

  it('offers the blank template, since a right heading beats a typed one', () => {
    renderDialog();

    expect(
      screen.getByRole('link', { name: /download blank template/i }),
    ).toHaveAttribute('href', '/api/users/import/template');
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

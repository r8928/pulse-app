import { ThemeProvider } from '@mui/material/styles';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { theme } from '../../app/theme/theme.js';
import {
  EMPLOYEE_CODE_COLUMN,
  EMPLOYEE_NAME_COLUMN,
} from '../../utils/rosterImport.js';
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
  it('spells out both headings the sheet must carry', () => {
    renderDialog();

    expect(screen.getByText(EMPLOYEE_CODE_COLUMN)).toBeInTheDocument();
    expect(screen.getByText(EMPLOYEE_NAME_COLUMN)).toBeInTheDocument();
  });

  it('shows example rows, so the reader sees what a filled sheet looks like', () => {
    renderDialog();

    expect(screen.getByText('CB-1042')).toBeInTheDocument();
    expect(screen.getByText('Sana Iqbal')).toBeInTheDocument();
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

import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AttendanceImport } from '../AttendanceImport.jsx';

/**
 * S-11. Upload, confirm the date format, preview accepted against rejected,
 * then commit atomically — in that order, because FR-4.11 requires the format
 * to be confirmed BEFORE validation runs.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const preview = {
  accepted: [
    {
      sheetRow: 2,
      employeeCode: 'E-001',
      fullName: 'Aisha Khan',
      type: 'CHECK_IN',
      at: '2026-08-12T04:00:00.000Z',
      userId: 'u1',
    },
  ],
  rejected: [
    {
      sheetRow: 3,
      employeeCode: 'E-999',
      fullName: 'Nobody',
      reason: 'Employee code E-999 matches no user.',
    },
  ],
};

const aFile = () =>
  new File(['binary'], 'attendance.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

const chooseFile = async (user) => {
  await user.upload(screen.getByLabelText(/choose a file/i), aFile());
};

describe('AttendanceImport', () => {
  beforeEach(() => {
    global.fetch = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => preview });
  });

  it('will not validate until a date format is confirmed (FR-4.11)', async () => {
    const user = userEvent.setup();
    render(<AttendanceImport />);

    await chooseFile(user);

    expect(screen.getByRole('button', { name: /validate/i })).toBeDisabled();

    await user.click(screen.getByLabelText(/date format/i));
    await user.click(screen.getByRole('option', { name: /day first/i }));

    expect(screen.getByRole('button', { name: /validate/i })).toBeEnabled();
  });

  it('explains why the format has to be confirmed rather than inferred', () => {
    render(<AttendanceImport />);

    expect(screen.getByText(/03\/04\/2026/)).toBeInTheDocument();
  });

  it('shows accepted and rejected counts, and every rejection’s reason', async () => {
    const user = userEvent.setup();
    render(<AttendanceImport />);

    await chooseFile(user);
    await user.click(screen.getByLabelText(/date format/i));
    await user.click(screen.getByRole('option', { name: /day first/i }));
    await user.click(screen.getByRole('button', { name: /validate/i }));

    await waitFor(() =>
      expect(screen.getByText(/1 row accepted/i)).toBeInTheDocument(),
    );
    expect(screen.getByText(/1 row rejected/i)).toBeInTheDocument();
    expect(screen.getByText(/matches no user/i)).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument(); // the sheet row
  });

  it('shows the name for the reader while saying it is never used to match', async () => {
    const user = userEvent.setup();
    render(<AttendanceImport />);

    await chooseFile(user);
    await user.click(screen.getByLabelText(/date format/i));
    await user.click(screen.getByRole('option', { name: /day first/i }));
    await user.click(screen.getByRole('button', { name: /validate/i }));

    await waitFor(() => expect(screen.getByText('Nobody')).toBeInTheDocument());
    expect(screen.getByText(/never used to match/i)).toBeInTheDocument();
  });

  it('offers no commit until something has been accepted', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ accepted: [], rejected: preview.rejected }),
    });

    const user = userEvent.setup();
    render(<AttendanceImport />);

    await chooseFile(user);
    await user.click(screen.getByLabelText(/date format/i));
    await user.click(screen.getByRole('option', { name: /day first/i }));
    await user.click(screen.getByRole('button', { name: /validate/i }));

    await waitFor(() =>
      expect(screen.getByText(/0 rows accepted/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole('button', { name: /import 0 rows/i }),
    ).toBeDisabled();
  });

  it('commits the accepted rows and reports what was written', async () => {
    const user = userEvent.setup();
    render(<AttendanceImport />);

    await chooseFile(user);
    await user.click(screen.getByLabelText(/date format/i));
    await user.click(screen.getByRole('option', { name: /day first/i }));
    await user.click(screen.getByRole('button', { name: /validate/i }));

    await waitFor(() =>
      expect(screen.getByText(/1 row accepted/i)).toBeInTheDocument(),
    );

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ inserted: 1, recalculated: 1 }),
    });

    await user.click(screen.getByRole('button', { name: /import 1 row/i }));

    await waitFor(() =>
      expect(screen.getByText(/1 punch imported/i)).toBeInTheDocument(),
    );
  });

  it('shows a rejected file whole, so it can be corrected and re-uploaded (NFR-1)', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'That file has no readable sheet in it.' }),
    });

    const user = userEvent.setup();
    render(<AttendanceImport />);

    await chooseFile(user);
    await user.click(screen.getByLabelText(/date format/i));
    await user.click(screen.getByRole('option', { name: /day first/i }));
    await user.click(screen.getByRole('button', { name: /validate/i }));

    await waitFor(() =>
      expect(screen.getByText(/no readable sheet/i)).toBeInTheDocument(),
    );
    // Still on the same screen, ready for another file.
    expect(screen.getByLabelText(/choose a file/i)).toBeInTheDocument();
  });
});

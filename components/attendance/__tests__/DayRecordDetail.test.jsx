import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DayRecordDetail } from '../DayRecordDetail.jsx';

/**
 * S-12. Everything the engine concluded about one user on one date, and why —
 * the whole of NFR-11 ("why is this number what it is") on one screen.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

const shift = {
  _id: 's1',
  name: 'Days',
  timezone: 'Asia/Karachi',
  requiredDailyMinutes: 540,
  startTime: '09:00',
  endTime: '18:00',
};

const props = {
  user: { _id: 'u1', fullName: 'Aisha Khan', employeeCode: 'E-001' },
  shift,
  leaveRecord: null,
  leaveTypes: [{ name: 'Casual' }],
  ledgerEntries: [],
  canWrite: true,
  dayRecord: {
    _id: 'd1',
    date: '2026-08-12',
    version: 2,
    dayType: 'WORKING',
    computed: {
      dayStatus: 'WFO',
      workedMinutes: 360,
      lateMinutes: 120,
      earlyMinutes: 60,
      deduction: 0.25,
      deductionRule: 'BR-9:band1',
      isShortDay: true,
      isCompliant: false,
    },
    override: null,
    exceptions: [],
  },
  punches: [
    {
      _id: 'p1',
      type: 'CHECK_IN',
      at: '2026-08-12T06:00:00.000Z',
      source: 'IMPORT',
      workDate: '2026-08-12',
      isDuplicate: false,
      deletedAt: null,
      version: 1,
    },
    {
      _id: 'p2',
      type: 'CHECK_OUT',
      at: '2026-08-12T12:00:00.000Z',
      source: 'FORM',
      workDate: '2026-08-12',
      isDuplicate: false,
      deletedAt: null,
      version: 1,
    },
  ],
};

describe('DayRecordDetail', () => {
  it('lists every punch with its instant, source and work date', () => {
    render(<DayRecordDetail {...props} />);

    expect(screen.getByText('11:00')).toBeInTheDocument();
    expect(screen.getByText('17:00')).toBeInTheDocument();
    expect(screen.getByText(/import/i)).toBeInTheDocument();
    expect(screen.getAllByText('2026-08-12').length).toBeGreaterThan(0);
  });

  it('shows a duplicate punch as excluded rather than hiding it (I-1, FR-4.7)', () => {
    const punches = [
      ...props.punches,
      {
        _id: 'p3',
        type: 'CHECK_IN',
        at: '2026-08-12T06:04:00.000Z',
        source: 'IMPORT',
        workDate: '2026-08-12',
        isDuplicate: true,
        deletedAt: null,
        version: 1,
      },
    ];
    render(<DayRecordDetail {...props} punches={punches} />);

    expect(screen.getByText(/duplicate/i)).toBeInTheDocument();
  });

  it('shows a removed punch, marked, rather than dropping it', () => {
    const punches = [
      { ...props.punches[0], deletedAt: '2026-08-13T00:00:00.000Z' },
      props.punches[1],
    ];
    render(<DayRecordDetail {...props} punches={punches} />);

    expect(screen.getByText(/removed/i)).toBeInTheDocument();
  });

  it('explains the classification order that produced the status (FR-5.9)', () => {
    render(<DayRecordDetail {...props} />);

    expect(screen.getByText(/no administrator override/i)).toBeInTheDocument();
    expect(screen.getByText(/no authorised leave/i)).toBeInTheDocument();
  });

  it('names the ladder row that produced the deduction (FR-7.6)', () => {
    render(<DayRecordDetail {...props} />);

    expect(screen.getByText('BR-9:band1')).toBeInTheDocument();
    expect(screen.getByText('0.25')).toBeInTheDocument();
  });

  it('shows an override beside the engine value it replaced, with who and why', () => {
    const overridden = {
      ...props.dayRecord,
      override: {
        deduction: 0,
        reason: 'Traffic closure on the M9',
        actorName: 'Office Administrator',
        at: '2026-08-13T09:00:00.000Z',
      },
    };
    render(<DayRecordDetail {...props} dayRecord={overridden} />);

    expect(screen.getByText(/traffic closure on the m9/i)).toBeInTheDocument();
    expect(screen.getByText(/office administrator/i)).toBeInTheDocument();
    // The engine's own figure is still readable beneath the decision.
    expect(screen.getByText('0.25')).toBeInTheDocument();
  });

  it('says plainly when no override has been applied', () => {
    render(<DayRecordDetail {...props} />);

    expect(screen.getByText(/no override/i)).toBeInTheDocument();
  });

  it('lists the ledger movements the day produced, marking a reversal', () => {
    const ledgerEntries = [
      {
        _id: 'l1',
        entryType: 'AUTOMATIC_DEDUCTION',
        leaveType: 'Casual',
        amount: -0.25,
        rule: 'BR-9:band1',
        createdAt: '2026-08-12T14:00:00.000Z',
        reversalOf: null,
      },
      {
        _id: 'l2',
        entryType: 'REVERSAL',
        leaveType: 'Casual',
        amount: 0.25,
        rule: 'BR-9:band1',
        createdAt: '2026-08-13T09:00:00.000Z',
        reversalOf: 'l1',
      },
    ];
    render(<DayRecordDetail {...props} ledgerEntries={ledgerEntries} />);

    expect(screen.getByText(/automatic deduction/i)).toBeInTheDocument();
    expect(screen.getByText(/reversal/i)).toBeInTheDocument();
    expect(screen.getByText('-0.25')).toBeInTheDocument();
    expect(screen.getByText('+0.25')).toBeInTheDocument();
  });

  it('names a missing shift as the reason there is no status (FR-3.12)', () => {
    const noShift = {
      ...props.dayRecord,
      exceptions: ['NO_SHIFT_ASSIGNED'],
    };
    render(<DayRecordDetail {...props} shift={null} dayRecord={noShift} />);

    expect(screen.getByText(/no shift assigned/i)).toBeInTheDocument();
  });

  it('offers no corrections to a viewer who may only read', () => {
    render(<DayRecordDetail {...props} canWrite={false} />);

    expect(
      screen.queryByRole('button', { name: /add punch/i }),
    ).not.toBeInTheDocument();
  });
});

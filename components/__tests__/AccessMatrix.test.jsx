import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
  ALL_PERMISSIONS,
  PERMISSIONS,
  ROLES,
  SCOPES,
} from '../../constants/index.js';
import { AccessMatrix } from '../AccessMatrix.jsx';

/**
 * S-19. The screen that makes FR-1.2 real.
 *
 * Every assertion here is about state, visibility or enabled/disabled — the
 * server rejects an FR-1.3 violation regardless of what this renders, so what
 * matters on the client is that the attempt is not offered.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const grants = [
  {
    _id: '1',
    role: ROLES.EMPLOYEE,
    permission: PERMISSIONS.ATTENDANCE_READ,
    scope: SCOPES.ALL,
    version: 1,
  },
];

const cell = (permission, role) =>
  screen.getByRole('button', { name: `${permission} for ${role}` });

describe('AccessMatrix', () => {
  it('renders every permission the system defines, not only the granted ones', () => {
    // A permission with no row anywhere would be invisible and therefore
    // ungrantable — the catalog is the screen.
    render(<AccessMatrix grants={grants} canWrite />);

    for (const permission of ALL_PERMISSIONS) {
      expect(screen.getByText(permission)).toBeInTheDocument();
    }
  });

  it('shows the scope a role holds, and none where it holds nothing', () => {
    render(<AccessMatrix grants={grants} canWrite />);

    expect(cell(PERMISSIONS.ATTENDANCE_READ, ROLES.EMPLOYEE)).toHaveTextContent(
      'ALL',
    );
    expect(cell(PERMISSIONS.AUDIT_READ, ROLES.EMPLOYEE)).toHaveTextContent(
      'none',
    );
  });

  it('locks every OFFICE_ADMIN cell at ALL', () => {
    // FR-1.3. The server rejects it regardless; this stops the attempt.
    render(<AccessMatrix grants={grants} canWrite />);

    const locked = cell(PERMISSIONS.AUDIT_READ, ROLES.OFFICE_ADMIN);
    expect(locked).toBeDisabled();
    expect(locked).toHaveTextContent('ALL');
  });

  it('disables every cell for a viewer who cannot write', () => {
    render(<AccessMatrix grants={grants} canWrite={false} />);

    expect(cell(PERMISSIONS.ATTENDANCE_READ, ROLES.EMPLOYEE)).toBeDisabled();
  });

  it('states that the four roles are the complete set', () => {
    render(<AccessMatrix grants={grants} canWrite />);
    expect(screen.getByText(/complete set/i)).toBeInTheDocument();
  });

  it('gives every one of the four roles a column', () => {
    render(<AccessMatrix grants={grants} canWrite />);

    for (const role of Object.values(ROLES)) {
      expect(
        screen.getByRole('columnheader', { name: role }),
      ).toBeInTheDocument();
    }
  });
});

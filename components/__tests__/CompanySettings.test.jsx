import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CompanySettings } from '../CompanySettings.jsx';

/**
 * S-18. Asserts state, visibility and enabled/disabled — never a design token,
 * which belongs in `app/__tests__/theme.test.js`.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const types = [{ _id: '1', name: 'PERMANENT', version: 1 }];
const domains = [{ _id: '2', domain: 'example.com', version: 1 }];

describe('CompanySettings', () => {
  it('lists both kinds of company-wide configuration', () => {
    render(
      <CompanySettings employmentTypes={types} domains={domains} canWrite />,
    );

    expect(screen.getByText('PERMANENT')).toBeInTheDocument();
    expect(screen.getByText('example.com')).toBeInTheDocument();
  });

  it('states that there is deliberately no company-wide timezone', () => {
    // FR-3.10 and DC-5: its absence looks like an omission rather than a
    // decision unless the screen says so.
    render(
      <CompanySettings employmentTypes={types} domains={domains} canWrite />,
    );

    expect(
      screen.getByText(/no company-wide default timezone/i),
    ).toBeInTheDocument();
  });

  it('hides every write control from a viewer without config.write', () => {
    render(
      <CompanySettings
        employmentTypes={types}
        domains={domains}
        canWrite={false}
      />,
    );

    expect(
      screen.queryByRole('button', { name: /new employment type/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /authorise a domain/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /rename PERMANENT/i }),
    ).toBeNull();
    expect(
      screen.queryByRole('button', { name: /remove example\.com/i }),
    ).toBeNull();
  });

  it('offers the write controls to a viewer who holds config.write', () => {
    render(
      <CompanySettings employmentTypes={types} domains={domains} canWrite />,
    );

    expect(
      screen.getByRole('button', { name: /new employment type/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /authorise a domain/i }),
    ).toBeEnabled();
    expect(
      screen.getByRole('button', { name: /rename PERMANENT/i }),
    ).toBeEnabled();
  });

  it('explains an empty domain list rather than showing a blank table', () => {
    render(<CompanySettings employmentTypes={types} domains={[]} canWrite />);

    expect(screen.getByText(/No domain is authorised/i)).toBeInTheDocument();
  });

  it('explains an empty employment type list too', () => {
    render(<CompanySettings employmentTypes={[]} domains={domains} canWrite />);

    expect(screen.getByText(/No employment type yet/i)).toBeInTheDocument();
  });
});

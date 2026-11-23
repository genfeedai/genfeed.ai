import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { accountFilterOption } from './account-filter-option';

describe('accountFilterOption', () => {
  it('labels the option with the handle and keeps it as written', () => {
    const option = accountFilterOption(
      { handle: 'AcmeCo', name: 'Acme', platform: 'x' },
      'cred-1',
      { count: 3 },
    );

    expect(option).toMatchObject({
      count: 3,
      isLiteral: true,
      label: '@AcmeCo',
      value: 'cred-1',
    });
  });

  it('shows the platform logo avatar without announcing it twice', () => {
    const option = accountFilterOption(
      { handle: 'acme', platform: 'instagram' },
      'cred-2',
    );

    render(<div data-testid="icon">{option.icon}</div>);

    expect(screen.getByTestId('icon')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('falls back to the platform name when the account has no handle', () => {
    expect(accountFilterOption({ platform: 'linkedin' }, 'cred-3').label).toBe(
      'LinkedIn',
    );
  });
});

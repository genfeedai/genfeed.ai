import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AnalyticsAccountsPage from './page';

vi.mock('@pages/analytics/accounts/analytics-accounts', () => ({
  default: () => <div data-testid="analytics-accounts" />,
}));

describe('AnalyticsAccountsPage', () => {
  it('renders the accounts fleet table', () => {
    render(<AnalyticsAccountsPage />);
    expect(screen.getByTestId('analytics-accounts')).toBeInTheDocument();
  });
});

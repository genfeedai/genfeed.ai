import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OrgAnalyticsAccountsPage from './page';

vi.mock('@pages/analytics/accounts/analytics-accounts', () => ({
  default: () => <div data-testid="analytics-accounts" />,
}));

describe('OrgAnalyticsAccountsPage', () => {
  it('renders the organization accounts fleet table', () => {
    render(<OrgAnalyticsAccountsPage />);
    expect(screen.getByTestId('analytics-accounts')).toBeInTheDocument();
  });
});

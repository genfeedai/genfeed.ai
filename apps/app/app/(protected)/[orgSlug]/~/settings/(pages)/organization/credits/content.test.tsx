import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import SettingsCreditsPage from './content';

const { isSelfHostedMock } = vi.hoisted(() => ({
  isSelfHostedMock: vi.fn(),
}));

vi.mock('@/lib/config/edition', () => ({
  isSelfHosted: () => isSelfHostedMock(),
}));

vi.mock('../billing/add-credits-card', () => ({
  default: () => <div data-testid="hosted-credits-card">Hosted credits</div>,
}));

vi.mock('./managed-credits-checkout-card', () => ({
  default: () => <div data-testid="managed-credits-card">Managed credits</div>,
}));

describe('SettingsCreditsPage', () => {
  beforeEach(() => {
    isSelfHostedMock.mockReset();
    isSelfHostedMock.mockReturnValue(true);
  });

  it('renders managed credits for self-hosted installs', () => {
    render(<SettingsCreditsPage />);

    expect(
      screen.getByRole('heading', { name: 'Credits' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('managed-credits-card')).toBeInTheDocument();
    expect(screen.queryByTestId('hosted-credits-card')).not.toBeInTheDocument();
  });

  it('renders hosted credit top-ups for hosted installs', () => {
    isSelfHostedMock.mockReturnValue(false);

    render(<SettingsCreditsPage />);

    expect(screen.getByTestId('hosted-credits-card')).toBeInTheDocument();
    expect(
      screen.queryByTestId('managed-credits-card'),
    ).not.toBeInTheDocument();
  });
});

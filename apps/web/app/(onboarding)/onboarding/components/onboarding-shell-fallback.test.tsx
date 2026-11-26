// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OnboardingShellFallback from './onboarding-shell-fallback';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => (key === 'appName' ? 'Genfeed' : key),
}));

vi.mock('@hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => null,
}));

describe('OnboardingShellFallback', () => {
  it('shows the wizard frame with an empty progress bar before the steps are known', () => {
    render(<OnboardingShellFallback />);

    expect(screen.getByText('Genfeed')).toBeInTheDocument();
    expect(
      screen.getByRole('progressbar', { name: 'Onboarding progress' }),
    ).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByRole('status', { name: 'Loading' })).toBeInTheDocument();
  });
});

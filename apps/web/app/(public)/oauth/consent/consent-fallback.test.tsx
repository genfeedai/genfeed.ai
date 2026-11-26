// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OAuthConsentFallback from './consent-fallback';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@genfeedai/hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => null,
}));

describe('OAuthConsentFallback', () => {
  it('shows the heading the consent page opens with before the request is read', () => {
    render(<OAuthConsentFallback />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'title' }),
    ).toBeInTheDocument();
    expect(screen.getByText('description')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

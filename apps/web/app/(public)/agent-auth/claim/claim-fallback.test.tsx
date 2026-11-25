// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AgentAuthClaimFallback from './claim-fallback';
import '@testing-library/jest-dom/vitest';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@genfeedai/hooks/ui/use-theme-logo/use-theme-logo', () => ({
  useThemeLogo: () => null,
}));

describe('AgentAuthClaimFallback', () => {
  it('shows the claim frame, heading and footer before the request is read', () => {
    render(<AgentAuthClaimFallback />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'title' }),
    ).toBeInTheDocument();
    expect(screen.getByText('footer')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

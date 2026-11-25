// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProtectedShellFallback from './ProtectedShellFallback';

// No `next/navigation` or session mock on purpose: the fallback is prerendered
// where neither the pathname nor the session is known, so it must not read them.
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => `pending.${key}`,
}));

describe('ProtectedShellFallback', () => {
  it('draws the app frame as one announced status without reading the route', () => {
    render(<ProtectedShellFallback />);

    expect(
      screen.getByRole('status', { name: 'pending.loading' }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });
});

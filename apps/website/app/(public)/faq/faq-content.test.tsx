import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import FAQContent from './faq-content';

vi.mock('@hooks/ui/use-marketing-entrance', () => ({
  useMarketingEntrance: () => ({ current: null }),
}));

vi.mock(
  '@web-components/buttons/request-access/button-request-access/ButtonRequestAccess',
  () => ({ default: () => <span>Request access</span> }),
);

vi.mock('@web-components/PageLayout', () => ({
  default: ({ children, title }: { children: ReactNode; title: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

describe('FAQContent headings', () => {
  it('keeps the PageLayout title as the only H1', () => {
    render(<FAQContent />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Frequently Asked Questions',
      }),
    ).toBeInTheDocument();
  });
});

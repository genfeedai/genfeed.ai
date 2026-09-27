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

describe('FAQContent jump links', () => {
  it('jumps with fragment links, so the page needs no client JavaScript', () => {
    render(<FAQContent />);

    const general = screen.getByRole('link', { name: /^General/ });
    expect(general).toHaveAttribute('href', '#general');
    const target = document.getElementById('general');
    expect(target).toHaveClass('scroll-mt-28');
    expect(target).toHaveAttribute('tabindex', '-1');
  });
});

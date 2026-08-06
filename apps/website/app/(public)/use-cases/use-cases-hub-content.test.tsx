import { render, screen } from '@testing-library/react';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import UseCasesHubContent from './use-cases-hub-content';

vi.mock('@hooks/ui/use-marketing-entrance', () => ({
  useMarketingEntrance: () => ({ current: null }),
}));

vi.mock('@ui/card/Card', () => ({
  default: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...props }: ComponentProps<'a'>) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@web-components/PageLayout', () => ({
  default: ({ children, title }: { children: ReactNode; title: ReactNode }) => (
    <main>
      <h1>{title}</h1>
      {children}
    </main>
  ),
}));

describe('UseCasesHubContent headings', () => {
  it('keeps the PageLayout title as the only H1', () => {
    render(<UseCasesHubContent />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('renders every card title at H2 so no level is skipped', () => {
    // Regression guard: the cards shipped as <h3> under the PageLayout <h1>,
    // which skips H2 for screen-reader navigation and heading audits.
    render(<UseCasesHubContent />);

    expect(screen.queryAllByRole('heading', { level: 3 })).toHaveLength(0);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'AI-Powered Virtual Influencers',
      }),
    ).toBeInTheDocument();
  });
});

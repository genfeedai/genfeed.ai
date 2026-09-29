import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import AgentDetailNeedsYou from './AgentDetailNeedsYou';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

const baseProps = {
  failureCount: 0,
  failuresDescription: 'N consecutive run failures.',
  pendingReviewCount: 0,
  pendingReviewDescription: 'Content is waiting on review.',
  reviewHref: '/review',
  reviewLabel: 'Review',
  runsHref: '/runs',
  title: 'Needs you',
  viewRunsLabel: 'View runs',
};

describe('AgentDetailNeedsYou', () => {
  it('surfaces both failures and pending review together', () => {
    render(
      <AgentDetailNeedsYou
        {...baseProps}
        failureCount={1}
        pendingReviewCount={1}
      />,
    );

    expect(screen.getByRole('link', { name: 'View runs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review' })).toBeInTheDocument();
  });
});

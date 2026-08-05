import { getCompetitorBySlug } from '@data/competitors.data';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ComparisonPage from './comparison-page';

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

describe('ComparisonPage headings', () => {
  it('keeps the PageLayout title as the only H1', () => {
    const competitor = getCompetitorBySlug('buffer');
    if (!competitor) {
      throw new Error('Expected competitor fixture "buffer" to exist');
    }

    render(<ComparisonPage competitor={competitor} />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(
      screen.getByRole('heading', {
        level: 2,
        name: 'Genfeed vs Buffer',
      }),
    ).toBeInTheDocument();
  });
});

import { getBestList } from '@data/best-lists.data';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import BestListContent from './best-list-content';

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

describe('BestListContent', () => {
  it('lists Genfeed first, discloses the publisher and links each comparison', () => {
    const list = getBestList('open-source-ai-content-tools');
    if (!list) {
      throw new Error('Expected the open-source list to exist');
    }

    render(<BestListContent list={list} />);

    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText(/Published by Genfeed/)).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /Genfeed vs Postiz/ }),
    ).toHaveAttribute('href', '/vs/postiz');
    expect(screen.getByText(/Mixpost/)).toBeInTheDocument();
  });
});

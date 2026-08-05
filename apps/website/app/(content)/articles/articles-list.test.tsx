import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import ArticlesList from './articles-list';

vi.mock('@ui/card/empty/CardEmpty', () => ({
  default: ({ label }: { label: string }) => <div>{label}</div>,
}));

vi.mock('@ui/layout/container/Container', () => ({
  default: ({ children, label }: { children: ReactNode; label: string }) => (
    <main>
      <h1>{label}</h1>
      {children}
    </main>
  ),
}));

describe('ArticlesList empty state', () => {
  it('retains the page H1 and a same-origin internal link', () => {
    render(<ArticlesList articles={[]} />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Articles' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Genfeed features' }),
    ).toHaveAttribute('href', '/features');
  });
});

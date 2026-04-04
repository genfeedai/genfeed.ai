import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';
import PageLayout from './PageLayout';

vi.mock('@web-components/home/_footer', () => ({
  default: () => <footer data-testid="page-layout-footer">Footer</footer>,
}));

function renderPageLayout(
  overrides: Partial<ComponentProps<typeof PageLayout>> = {},
) {
  const props: ComponentProps<typeof PageLayout> = {
    children: <section>Page Body</section>,
    description: 'Short supporting copy',
    title: 'Studio',
    ...overrides,
  };

  return render(<PageLayout {...props} />);
}

describe('PageLayout Component', () => {
  it('renders poster hero composition with visual and actions', () => {
    renderPageLayout({
      heroActions: <div>Hero Actions</div>,
      heroVisual: <div data-testid="poster-visual">Poster Visual</div>,
      variant: 'poster',
    });

    expect(
      screen.getByRole('heading', { level: 1, name: 'Studio' }),
    ).toBeInTheDocument();
    expect(screen.getByTestId('poster-visual')).toBeInTheDocument();
    expect(screen.getByText('Hero Actions')).toBeInTheDocument();
    expect(screen.getByText('Page Body')).toBeInTheDocument();
  });

  it('renders proof hero composition with proof rail', () => {
    renderPageLayout({
      heroProof: <div data-testid="proof-rail">Proof Rail</div>,
      heroVisual: <div data-testid="proof-visual">Proof Visual</div>,
      variant: 'proof',
    });

    expect(screen.getByTestId('proof-rail')).toBeInTheDocument();
    expect(screen.getByTestId('proof-visual')).toBeInTheDocument();
  });

  it('omits footer when showFooter is false', () => {
    renderPageLayout({ showFooter: false, variant: 'poster' });

    expect(screen.queryByTestId('page-layout-footer')).not.toBeInTheDocument();
  });
});

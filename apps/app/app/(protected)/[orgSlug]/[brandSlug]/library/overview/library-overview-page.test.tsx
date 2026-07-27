import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LibraryOverviewPage from './library-overview-page';

vi.mock('./library-overview-credit-notice', () => ({
  default: () => <div data-testid="library-credit-notice" />,
}));

describe('LibraryOverviewPage', () => {
  it('renders plain library sections with full-tile category links', () => {
    render(<LibraryOverviewPage />);

    expect(screen.getByTestId('library-landing-title')).toHaveTextContent(
      'Library',
    );
    expect(screen.getByTestId('library-credit-notice')).toBeInTheDocument();

    expect(
      screen.getByRole('heading', { level: 3, name: 'Visual Assets' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 3, name: 'Utility Assets' }),
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Videos' })).toHaveAttribute(
      'href',
      '/library/videos',
    );
    expect(screen.getByRole('link', { name: 'Images' })).toHaveAttribute(
      'href',
      '/library/images',
    );
    expect(screen.getByRole('link', { name: 'Voices' })).toHaveAttribute(
      'href',
      '/library/voices',
    );
  });

  it('does not render legacy open-cta link labels', () => {
    render(<LibraryOverviewPage />);

    expect(
      screen.queryByRole('link', { name: 'Open Videos' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Open Images' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Open Voices' }),
    ).not.toBeInTheDocument();
  });

  it('exposes one navigable link per category tile', () => {
    render(<LibraryOverviewPage />);

    const videosTile = screen.getByTestId('library-category-videos');
    const imagesTile = screen.getByTestId('library-category-images');
    const voicesTile = screen.getByTestId('library-category-voices');

    expect(videosTile.tagName).toBe('A');
    expect(imagesTile.tagName).toBe('A');
    expect(voicesTile.tagName).toBe('A');
    expect(videosTile).toHaveClass('rounded-card');
    expect(screen.getAllByRole('link')).toHaveLength(7);
  });
});

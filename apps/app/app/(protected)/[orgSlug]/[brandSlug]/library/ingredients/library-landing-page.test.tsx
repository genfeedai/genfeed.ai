import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import LibraryLandingPage from './library-landing-page';

vi.mock('@pages/library/landing/library-landing-credit-notice', () => ({
  default: () => <div data-testid="library-credit-notice" />,
}));

describe('LibraryLandingPage', () => {
  it('renders plain library sections with full-tile category links', () => {
    render(<LibraryLandingPage />);

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
    render(<LibraryLandingPage />);

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
    render(<LibraryLandingPage />);

    const videosTile = screen.getByTestId('library-category-videos');
    const imagesTile = screen.getByTestId('library-category-images');
    const voicesTile = screen.getByTestId('library-category-voices');

    expect(videosTile.tagName).toBe('A');
    expect(imagesTile.tagName).toBe('A');
    expect(voicesTile.tagName).toBe('A');
    expect(screen.getAllByRole('link')).toHaveLength(7);
  });
});

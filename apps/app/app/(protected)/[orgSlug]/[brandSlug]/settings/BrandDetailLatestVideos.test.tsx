import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandDetailLatestVideos from './BrandDetailLatestVideos';

vi.mock('@hooks/navigation/use-org-url', () => ({
  useOrgUrl: () => ({
    href: (path: string) => `/demo/FUDNEWS${path}`,
  }),
}));

vi.mock('@services/core/environment.service', () => ({
  EnvironmentService: {
    apps: { app: 'https://app.genfeed.ai' },
  },
}));

describe('BrandDetailLatestVideos', () => {
  it('should render without crashing', () => {
    const { container } = render(<BrandDetailLatestVideos />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('scopes Create a video to the current brand instead of bare /agent/new', () => {
    render(<BrandDetailLatestVideos />);

    expect(
      screen.getByRole('link', { name: 'Create a video' }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/demo/FUDNEWS/agent/new');
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/demo/FUDNEWS/library/overview',
    );
  });
});

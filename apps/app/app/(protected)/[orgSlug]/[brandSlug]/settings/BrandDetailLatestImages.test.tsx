import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandDetailLatestImages from './BrandDetailLatestImages';

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

describe('BrandDetailLatestImages', () => {
  it('should render without crashing', () => {
    const { container } = render(<BrandDetailLatestImages />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('scopes Create an image to the current brand instead of bare /agent/new', () => {
    render(<BrandDetailLatestImages />);

    expect(
      screen.getByRole('link', { name: 'Create an image' }),
    ).toHaveAttribute('href', 'https://app.genfeed.ai/demo/FUDNEWS/agent/new');
    expect(screen.getByRole('link', { name: 'View all' })).toHaveAttribute(
      'href',
      'https://app.genfeed.ai/demo/FUDNEWS/library/assets',
    );
  });
});

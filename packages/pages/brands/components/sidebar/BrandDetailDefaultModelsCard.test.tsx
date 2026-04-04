import BrandDetailDefaultModelsCard from '@pages/brands/components/sidebar/BrandDetailDefaultModelsCard';
import type { BrandDetailDefaultModelsCardProps } from '@props/pages/brand-detail.props';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@hooks/data/organization/use-organization/use-organization', () => ({
  useOrganization: vi.fn(() => ({
    settings: {
      defaultImageModel: 'org-image-model',
      defaultMusicModel: 'org-music-model',
    },
  })),
}));

describe('BrandDetailDefaultModelsCard', () => {
  const brand = {
    defaultVideoModel: 'test-video-model',
  } as BrandDetailDefaultModelsCardProps['brand'];

  it('should render without crashing', () => {
    render(<BrandDetailDefaultModelsCard brand={brand} />);
    expect(screen.getByText('Default Models')).toBeInTheDocument();
    expect(screen.getByText('Video')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const { container } = render(
      <BrandDetailDefaultModelsCard brand={brand} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <BrandDetailDefaultModelsCard brand={brand} />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    expect(rootElement).toHaveClass('rounded-lg');
    expect(rootElement).toHaveClass('bg-card');
  });

  it('renders organization fallbacks when brand overrides are empty', () => {
    render(
      <BrandDetailDefaultModelsCard
        brand={{} as BrandDetailDefaultModelsCardProps['brand']}
      />,
    );

    expect(screen.getByText('Image')).toBeInTheDocument();
    expect(screen.getByText('org-image-model')).toBeInTheDocument();
    expect(screen.getAllByText('Organization default').length).toBeGreaterThan(
      0,
    );
  });
});

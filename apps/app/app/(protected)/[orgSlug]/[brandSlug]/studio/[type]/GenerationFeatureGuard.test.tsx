import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GenerationFeatureGuard from './GenerationFeatureGuard';
import '@testing-library/jest-dom/vitest';

vi.mock(
  '@hooks/data/organization/use-enabled-categories/use-enabled-categories',
  () => ({
    useEnabledCategories: vi.fn(() => ({
      isEnabled: vi.fn(() => true),
      isLoading: false,
    })),
  }),
);

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    selectedBrand: null,
  })),
}));

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'acme-creator', orgSlug: 'acme-org' }),
  useRouter: vi.fn(() => ({
    replace: vi.fn(),
  })),
}));

describe('GenerationFeatureGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render children when feature is enabled', () => {
    render(
      <GenerationFeatureGuard category="image">
        <div>Content</div>
      </GenerationFeatureGuard>,
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});

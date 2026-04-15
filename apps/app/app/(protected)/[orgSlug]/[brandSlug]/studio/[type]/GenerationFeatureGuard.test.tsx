import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import GenerationFeatureGuard from './GenerationFeatureGuard';
import '@testing-library/jest-dom';

vi.mock(
  '@hooks/data/organization/use-enabled-categories/use-enabled-categories',
  () => ({
    useEnabledCategories: vi.fn(() => ({
      isEnabled: vi.fn(() => true),
      isLoading: false,
    })),
  }),
);

vi.mock('next/navigation', () => ({
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

import GenerationFeatureGuard from '@pages/studio/guards/GenerationFeatureGuard';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('@contexts/user/brand-context/brand-context', () => ({
  useBrand: vi.fn(() => ({
    hasFeature: vi.fn(() => true),
  })),
}));

describe('GenerationFeatureGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render children when feature is enabled', () => {
    render(
      <GenerationFeatureGuard feature="image-generation">
        <div>Content</div>
      </GenerationFeatureGuard>,
    );
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});

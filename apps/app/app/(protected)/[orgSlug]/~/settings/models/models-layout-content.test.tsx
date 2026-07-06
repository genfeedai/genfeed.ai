import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import ModelsLayoutContent from './models-layout-content';

vi.mock('next/navigation', () => ({
  useParams: () => ({ brandSlug: 'brand', orgSlug: 'acme' }),
  usePathname: () => '/acme/~/settings/models/all',
  useRouter: () => ({
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
}));

describe('ModelsLayoutContent', () => {
  it('should render without crashing', () => {
    const { container } = render(<ModelsLayoutContent />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    // TODO: Add interaction tests
  });

  it('should apply correct styles and classes', () => {
    render(<ModelsLayoutContent />);

    const imagesTab = screen.getByRole('link', { name: 'Images' });

    expect(imagesTab).toHaveClass('data-[variant=default]:text-foreground/70');
    expect(imagesTab).not.toHaveClass('data-[variant=default]:text-secondary');
  });
});

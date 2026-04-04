import type { IIngredient } from '@genfeedai/interfaces';
import { render } from '@testing-library/react';
import MasonryBrandLogo from '@ui/masonry/shared/MasonryBrandLogo';
import { describe, expect, it } from 'vitest';

vi.mock('@ui/buttons/base/Button', () => ({
  default: ({ children, ...props }: { children: React.ReactNode }) => (
    <button {...props}>{children}</button>
  ),
}));

const mockIngredient: IIngredient = {
  brand: 'brand-123',
  brandLogoUrl: 'https://example.com/logo.png',
  id: 'ing-123',
} as unknown as IIngredient;

describe('MasonryBrandLogo', () => {
  it('should render without crashing', () => {
    const { container } = render(
      <MasonryBrandLogo ingredient={mockIngredient} />,
    );
    // Returns null when not in public gallery, so container will exist but no firstChild
    expect(container).toBeInTheDocument();
  });

  it('should return null when not in public gallery', () => {
    const { container } = render(
      <MasonryBrandLogo ingredient={mockIngredient} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('should render logo in public gallery mode', () => {
    const { container } = render(
      <MasonryBrandLogo ingredient={mockIngredient} isPublicGallery={true} />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });
});

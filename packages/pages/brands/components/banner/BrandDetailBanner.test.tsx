import type { IBrand } from '@genfeedai/contracts/interfaces';
import BrandDetailBanner from '@pages/brands/components/banner/BrandDetailBanner';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const brand = {
  bannerUrl: 'https://cdn.example.test/banner.jpg',
  label: 'Acme',
  slug: 'acme',
} as IBrand;

function renderBanner(
  overrides: Partial<{
    brand: IBrand;
    isGeneratingBanner: boolean;
    onGenerateBanner: () => void;
    onUploadBanner: () => void;
  }> = {},
) {
  return render(
    <BrandDetailBanner
      brand={overrides.brand ?? brand}
      isGeneratingBanner={overrides.isGeneratingBanner ?? false}
      onGenerateBanner={overrides.onGenerateBanner ?? vi.fn()}
      onUploadBanner={overrides.onUploadBanner ?? vi.fn()}
    />,
  );
}

describe('BrandDetailBanner', () => {
  it('should render without crashing', () => {
    renderBanner();

    const image = screen.getByAltText('Acme banner');
    expect(image).toBeInTheDocument();
    expect(image.getAttribute('src')).toContain('banner.jpg');
  });

  it('falls back to the placeholder banner when the brand has none', () => {
    renderBanner({ brand: { ...brand, bannerUrl: undefined } as IBrand });

    const image = screen.getByAltText('Acme banner');
    expect(image.getAttribute('src')).toContain('placeholders');
  });

  it('should handle user interactions correctly', () => {
    const onUploadBanner = vi.fn();
    const onGenerateBanner = vi.fn();
    renderBanner({ onGenerateBanner, onUploadBanner });

    fireEvent.click(screen.getByRole('button', { name: 'Upload banner' }));
    expect(onUploadBanner).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Generate banner' }));
    expect(onGenerateBanner).toHaveBeenCalledTimes(1);
  });

  it('should apply correct styles and classes', () => {
    const { container } = renderBanner();
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toHaveClass('relative');
    expect(rootElement).toHaveClass('h-48');
  });
});

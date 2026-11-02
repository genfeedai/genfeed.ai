import type { IBrand } from '@genfeedai/contracts/interfaces';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandDetailBanner from '@/features/brands/components/banner/BrandDetailBanner';

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

  it('shows an empty banner frame, not a placeholder picture, when the brand has none', () => {
    renderBanner({ brand: { ...brand, bannerUrl: undefined } as IBrand });

    expect(screen.queryByAltText('Acme banner')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upload banner' })).toBeVisible();
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

  it('keeps the banner in the X header frame, 1500x500', () => {
    const { container } = renderBanner();
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement.getAttribute('data-ratio')).toBe('1500x500');
  });
});

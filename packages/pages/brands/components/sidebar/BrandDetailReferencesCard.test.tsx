import BrandDetailReferencesCard from '@pages/brands/components/sidebar/BrandDetailReferencesCard';
import type { BrandDetailReferencesCardProps } from '@props/pages/brand-detail.props';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('BrandDetailReferencesCard', () => {
  const brand = {
    references: [],
  } as BrandDetailReferencesCardProps['brand'];

  it('should render without crashing', () => {
    const { container } = render(
      <BrandDetailReferencesCard
        brand={brand}
        deletingRefId={null}
        onUploadReference={vi.fn()}
        onDeleteReference={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
    expect(screen.getByText('Branding References')).toBeInTheDocument();
  });

  it('should handle user interactions correctly', () => {
    const onUploadReference = vi.fn();
    render(
      <BrandDetailReferencesCard
        brand={brand}
        deletingRefId={null}
        onUploadReference={onUploadReference}
        onDeleteReference={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /upload reference/i }));
    expect(onUploadReference).toHaveBeenCalled();
  });

  it('should apply correct styles and classes', () => {
    const { container } = render(
      <BrandDetailReferencesCard
        brand={brand}
        deletingRefId={null}
        onUploadReference={vi.fn()}
        onDeleteReference={vi.fn()}
      />,
    );
    const rootElement = container.firstChild as HTMLElement;
    expect(rootElement).toBeInTheDocument();
    expect(rootElement).toHaveClass('card');
  });
});

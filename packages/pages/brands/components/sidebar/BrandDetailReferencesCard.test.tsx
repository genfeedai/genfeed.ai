import BrandDetailReferencesCard from '@pages/brands/components/sidebar/BrandDetailReferencesCard';
import type { BrandDetailReferencesCardProps } from '@props/pages/brand-detail.props';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

describe('BrandDetailReferencesCard', () => {
  const brand = {
    references: [],
  } as BrandDetailReferencesCardProps['brand'];

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
    expect(rootElement).toHaveClass('rounded-card');
    expect(rootElement).toHaveClass('bg-card');
  });
});

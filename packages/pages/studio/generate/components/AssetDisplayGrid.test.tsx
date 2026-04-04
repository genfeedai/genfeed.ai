import AssetDisplayGrid from '@pages/studio/generate/components/AssetDisplayGrid';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('next/image', () => ({
  default: ({ src, alt, ...props }: Record<string, unknown>) => (
    <img src={src as string} alt={alt as string} {...props} />
  ),
}));

describe('AssetDisplayGrid', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render without crashing', () => {
    const { container } = render(
      <AssetDisplayGrid
        assets={[]}
        selectedIds={[]}
        onSelect={vi.fn()}
        onAssetClick={vi.fn()}
      />,
    );
    expect(container.firstChild).toBeInTheDocument();
  });

  it('should display empty state when no assets', () => {
    render(
      <AssetDisplayGrid
        assets={[]}
        selectedIds={[]}
        onSelect={vi.fn()}
        onAssetClick={vi.fn()}
      />,
    );
    expect(screen.getByText('No assets yet')).toBeInTheDocument();
  });
});

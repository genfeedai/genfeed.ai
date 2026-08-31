import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import type { ResolvingMetadata } from 'next';
import { describe, expect, it, vi } from 'vitest';
import BrandDetailPage, { generateMetadata } from './page';

vi.mock('./brand-detail', () => ({
  default: function BrandDetailMock() {
    return 'Brand detail surface';
  },
}));

vi.mock('@ui/loading/page/PageLoadingState', () => ({
  default: function PageLoadingStateMock() {
    return 'Loading brand profile';
  },
}));

describe('BrandDetailPage', () => {
  it('renders the brand detail surface inside a suspense boundary', () => {
    render(<BrandDetailPage />);

    expect(screen.getByText('Brand detail surface')).toBeInTheDocument();
  });

  it('titles the page Brand Profile', async () => {
    const parent = Promise.resolve({
      openGraph: { images: [] },
    }) as unknown as ResolvingMetadata;

    const metadata = await generateMetadata({}, parent);

    expect(metadata.title).toContain('Brand Profile');
  });
});

import { render, screen } from '@testing-library/react';
import type { ResolvingMetadata } from 'next';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./content', () => ({
  default: () => <div>mounted-receipt-content</div>,
}));
vi.mock('@helpers/media/metadata/page-metadata.helper', () => ({
  createPageMetadata: vi.fn((title: string) => () => ({ title })),
}));

import GenerationReceiptsPage, { generateMetadata } from './page';

describe('generation receipts route', () => {
  it('mounts its client content and saved-details metadata', async () => {
    render(<GenerationReceiptsPage />);
    expect(screen.getByText('mounted-receipt-content')).toBeDefined();
    const parent = Promise.resolve({
      openGraph: { images: [] },
    }) as unknown as ResolvingMetadata;
    expect(await generateMetadata({}, parent)).toEqual({
      title: 'Generation receipts',
    });
  });
});

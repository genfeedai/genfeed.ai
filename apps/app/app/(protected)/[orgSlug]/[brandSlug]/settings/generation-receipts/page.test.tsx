import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./content', () => ({
  default: () => <div>mounted-receipt-content</div>,
}));
vi.mock('@helpers/media/metadata/page-metadata.helper', () => ({
  createPageMetadata: vi.fn((title: string) => () => ({ title })),
}));

import GenerationReceiptsPage, { generateMetadata } from './page';

describe('generation receipts route', () => {
  it('mounts its client content and saved-details metadata', () => {
    render(<GenerationReceiptsPage />);
    expect(screen.getByText('mounted-receipt-content')).toBeDefined();
    expect(generateMetadata()).toEqual({ title: 'Generation receipts' });
  });
});

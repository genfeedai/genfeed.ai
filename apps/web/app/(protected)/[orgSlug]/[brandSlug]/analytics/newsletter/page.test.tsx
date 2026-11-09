import { render, screen } from '@testing-library/react';
import type { ResolvingMetadata } from 'next';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/newsletter/analytics/NewsletterAnalyticsPage', () => ({
  default: () => <div>mounted-newsletter-analytics</div>,
}));
vi.mock('@helpers/media/metadata/page-metadata.helper', () => ({
  createPageMetadata: vi.fn((title: string) => () => ({ title })),
}));

import AnalyticsNewsletterPage, { generateMetadata } from './page';

describe('newsletter analytics route', () => {
  it('mounts its page and metadata', async () => {
    render(<AnalyticsNewsletterPage />);
    expect(screen.getByText('mounted-newsletter-analytics')).toBeDefined();
    const parent = Promise.resolve({
      openGraph: { images: [] },
    }) as unknown as ResolvingMetadata;
    expect(await generateMetadata({}, parent)).toEqual({
      title: 'Newsletter Analytics',
    });
  });
});

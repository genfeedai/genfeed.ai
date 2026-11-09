import { render, screen } from '@testing-library/react';
import type { ResolvingMetadata } from 'next';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/newsletter/subscribers/NewsletterSubscribersPage', () => ({
  default: () => <div>mounted-newsletter-subscribers</div>,
}));
vi.mock('@helpers/media/metadata/page-metadata.helper', () => ({
  createPageMetadata: vi.fn((title: string) => () => ({ title })),
}));

import PublishingNewsletterPageRoute, { generateMetadata } from './page';

describe('newsletter audience route', () => {
  it('mounts its page and metadata', async () => {
    render(<PublishingNewsletterPageRoute />);
    expect(screen.getByText('mounted-newsletter-subscribers')).toBeDefined();
    const parent = Promise.resolve({
      openGraph: { images: [] },
    }) as unknown as ResolvingMetadata;
    expect(await generateMetadata({}, parent)).toEqual({
      title: 'Newsletter',
    });
  });
});

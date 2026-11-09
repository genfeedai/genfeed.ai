import { render, screen } from '@testing-library/react';
import type { ResolvingMetadata } from 'next';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/features/newsletter/settings/NewsletterSettingsPage', () => ({
  default: () => <div>mounted-newsletter-settings</div>,
}));
vi.mock('@helpers/media/metadata/page-metadata.helper', () => ({
  createPageMetadata: vi.fn((title: string) => () => ({ title })),
}));

import PublishingNewsletterSettingsPageRoute, {
  generateMetadata,
} from './page';

describe('newsletter settings route', () => {
  it('mounts its page and metadata', async () => {
    render(<PublishingNewsletterSettingsPageRoute />);
    expect(screen.getByText('mounted-newsletter-settings')).toBeDefined();
    const parent = Promise.resolve({
      openGraph: { images: [] },
    }) as unknown as ResolvingMetadata;
    expect(await generateMetadata({}, parent)).toEqual({
      title: 'Newsletter Settings',
    });
  });
});

/* @vitest-environment jsdom */

import { Platform } from '@genfeedai/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BrandPlatformHomeRoute from './page';
import '@testing-library/jest-dom/vitest';

const mockNotFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});

vi.mock('./content', () => ({
  default: ({ platform }: { platform: string }) => (
    <div>Mocked platform home: {platform}</div>
  ),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  notFound: () => mockNotFound(),
}));

describe('BrandPlatformHomeRoute', () => {
  it('renders a valid credential platform route', async () => {
    const element = await BrandPlatformHomeRoute({
      params: Promise.resolve({
        brandSlug: 'moonrise',
        orgSlug: 'acme',
        platform: 'instagram',
      }),
    });

    render(element);

    expect(
      screen.getByText('Mocked platform home: instagram'),
    ).toBeInTheDocument();
  });

  it('normalizes aliases onto the canonical platform', async () => {
    const element = await BrandPlatformHomeRoute({
      params: Promise.resolve({
        brandSlug: 'moonrise',
        orgSlug: 'acme',
        platform: 'x',
      }),
    });

    render(element);

    expect(
      screen.getByText(`Mocked platform home: ${Platform.TWITTER}`),
    ).toBeInTheDocument();
  });

  it('calls notFound for an invalid platform param', async () => {
    await expect(
      BrandPlatformHomeRoute({
        params: Promise.resolve({
          brandSlug: 'moonrise',
          orgSlug: 'acme',
          platform: 'not-a-platform',
        }),
      }),
    ).rejects.toThrow('NEXT_NOT_FOUND');

    expect(mockNotFound).toHaveBeenCalledTimes(1);
  });
});

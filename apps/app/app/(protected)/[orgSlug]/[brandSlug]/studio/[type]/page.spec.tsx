import { runPageModuleTests } from '@shared/pages/pageTestUtils';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as PageModule from './page';

const redirectMock = vi.hoisted(() =>
  vi.fn((target: string) => {
    throw new Error(`REDIRECT:${target}`);
  }),
);

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

vi.mock('./StudioPageContent', () => ({
  default: () => <div data-testid="studio-page-content" />,
}));

vi.mock('@ui/display/error-boundary/ErrorBoundary', () => ({
  default: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

runPageModuleTests('apps/app/app/(protected)/studio/[type]/page', PageModule);

afterEach(() => {
  redirectMock.mockClear();
});

describe('StudioTypePage canonical routing', () => {
  it('renders the canonical image route without redirecting', async () => {
    const result = await PageModule.default({
      params: Promise.resolve({ type: 'image' }),
      searchParams: Promise.resolve({ foo: 'bar' }),
    });

    expect(result).toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('redirects plural image routes to the canonical singular path', async () => {
    await expect(
      PageModule.default({
        params: Promise.resolve({ type: 'images' }),
        searchParams: Promise.resolve({ foo: 'bar' }),
      }),
    ).rejects.toThrow('REDIRECT:/studio/image?foo=bar');
  });

  it('strips legacy type query params from canonical routes', async () => {
    await expect(
      PageModule.default({
        params: Promise.resolve({ type: 'video' }),
        searchParams: Promise.resolve({ foo: 'bar', type: 'images' }),
      }),
    ).rejects.toThrow('REDIRECT:/studio/video?foo=bar');
  });
});

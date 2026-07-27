import { describe, expect, it, vi } from 'vitest';
import * as PageModule from './page';

const redirectMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

describe('LibraryIngredientsPage', () => {
  it('redirects legacy ingredients landing links to the canonical overview', async () => {
    await PageModule.default({
      params: Promise.resolve({
        brandSlug: 'moonrise',
        orgSlug: 'acme',
      }),
    });

    expect(redirectMock).toHaveBeenCalledWith(
      '/acme/moonrise/library/overview',
    );
  });
});

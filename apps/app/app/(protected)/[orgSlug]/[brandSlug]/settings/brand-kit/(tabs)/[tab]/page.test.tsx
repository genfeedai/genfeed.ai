import { beforeEach, describe, expect, it, vi } from 'vitest';
import BrandKitTabRoute from './page';

const notFoundMock = vi.hoisted(() =>
  vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
);

vi.mock('next/navigation', () => ({ notFound: notFoundMock }));

describe('BrandKitTabRoute', () => {
  beforeEach(() => {
    notFoundMock.mockClear();
  });

  it.each(['voice', 'visual', 'strategy'])(
    'renders nothing for the %s section',
    async (tab) => {
      await expect(
        BrandKitTabRoute({ params: Promise.resolve({ tab }) }),
      ).resolves.toBeNull();
      expect(notFoundMock).not.toHaveBeenCalled();
    },
  );

  it.each(['overview', 'guided', 'toString'])(
    'is not found for %s',
    async (tab) => {
      await expect(
        BrandKitTabRoute({ params: Promise.resolve({ tab }) }),
      ).rejects.toThrow('NEXT_NOT_FOUND');
    },
  );
});

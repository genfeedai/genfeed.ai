import type { PGlite } from '@electric-sql/pglite';
import { describe, expect, it, vi } from 'vitest';

const prismaClientConstructor = vi.hoisted(() =>
  vi.fn(function mockPrismaClient(this: object, options: { adapter: unknown }) {
    Object.assign(this, { options });
  }),
);

const adapterFactoryConstructor = vi.hoisted(() =>
  vi.fn(function mockAdapterFactory(this: object, pglite: unknown) {
    Object.assign(this, { pglite });
  }),
);

vi.mock('../generated/desktop-prisma/client/client', () => ({
  PrismaClient: prismaClientConstructor,
}));

vi.mock('prisma-pglite/dist/adapter/prisma-pglite-adapter/pglite.js', () => ({
  PrismaPGliteAdapterFactory: adapterFactoryConstructor,
}));

import { createDesktopPrismaClient } from '../src/client';

describe('createDesktopPrismaClient', () => {
  it('wraps the PGlite instance in the adapter factory and passes it to PrismaClient', () => {
    const pglite = { marker: 'pglite' } as unknown as PGlite;

    const client = createDesktopPrismaClient(pglite);

    expect(client).toBeInstanceOf(prismaClientConstructor);
    expect(adapterFactoryConstructor).toHaveBeenCalledTimes(1);
    expect(adapterFactoryConstructor).toHaveBeenCalledWith(pglite);
    const options = prismaClientConstructor.mock.calls[0]?.[0] as {
      adapter: unknown;
    };
    expect(options.adapter).toBeInstanceOf(adapterFactoryConstructor);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface PrismaClientOptions {
  adapter: unknown;
  log: string[];
}

const prismaClientConstructor = vi.hoisted(() =>
  vi.fn(function mockPrismaClient(this: object, options: PrismaClientOptions) {
    Object.assign(this, { options });
  }),
);

const prismaPgConstructor = vi.hoisted(() =>
  vi.fn(function mockPrismaPg(
    this: object,
    config: { connectionString: string | undefined },
  ) {
    Object.assign(this, { config });
  }),
);

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: prismaPgConstructor,
}));

vi.mock('../generated/prisma/client/client', () => ({
  PrismaClient: prismaClientConstructor,
}));

const globalForPrisma = globalThis as unknown as {
  prisma: object | undefined;
};

async function importClientModule(): Promise<{ prisma: object }> {
  return (await import('../src/client')) as unknown as { prisma: object };
}

describe('prisma client singleton', () => {
  beforeEach(() => {
    vi.resetModules();
    prismaClientConstructor.mockClear();
    prismaPgConstructor.mockClear();
    globalForPrisma.prisma = undefined;
    vi.stubEnv('DATABASE_URL', 'postgres://unit:test@localhost:5432/test');
  });

  afterEach(() => {
    globalForPrisma.prisma = undefined;
    vi.unstubAllEnvs();
  });

  it('creates a client with error-only logging outside development', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    const { prisma } = await importClientModule();

    expect(prisma).toBeInstanceOf(prismaClientConstructor);
    expect(prismaClientConstructor).toHaveBeenCalledTimes(1);
    const options = prismaClientConstructor.mock
      .calls[0]?.[0] as PrismaClientOptions;
    expect(options.log).toEqual(['error']);
    expect(prismaPgConstructor).toHaveBeenCalledWith({
      connectionString: 'postgres://unit:test@localhost:5432/test',
    });
  });

  it('enables verbose logging in development', async () => {
    vi.stubEnv('NODE_ENV', 'development');

    await importClientModule();

    const options = prismaClientConstructor.mock
      .calls[0]?.[0] as PrismaClientOptions;
    expect(options.log).toEqual(['query', 'error', 'warn']);
  });

  it('caches the client on globalThis outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');

    const { prisma } = await importClientModule();

    expect(globalForPrisma.prisma).toBe(prisma);
  });

  it('does not cache the client on globalThis in production', async () => {
    vi.stubEnv('NODE_ENV', 'production');

    await importClientModule();

    expect(globalForPrisma.prisma).toBeUndefined();
  });

  it('reuses an existing global client instead of creating a new one', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    const existing = { marker: 'existing-client' };
    globalForPrisma.prisma = existing;

    const { prisma } = await importClientModule();

    expect(prisma).toBe(existing);
    expect(prismaClientConstructor).not.toHaveBeenCalled();
  });
});

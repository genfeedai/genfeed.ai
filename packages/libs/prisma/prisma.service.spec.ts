import fs, { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Prisma, PrismaClient } from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { describe, expect, it, vi } from 'vitest';
import { isCloudTenantGuardEnabled, PrismaService } from './prisma.service';
import { runWithTenantContext } from './tenant-context';
import { TenantIsolationError } from './tenant-guard';

function testConfigService(
  env: Record<string, string | undefined>,
): ConfigService {
  return {
    get: (key: string) => env[key],
    mediaUrlConfig: { cdnUrl: 'https://cdn.test' },
  } as unknown as ConfigService;
}

describe('isCloudTenantGuardEnabled', () => {
  it('is true when GENFEED_CLOUD is enabled via ConfigService', () => {
    const env: Record<string, string | undefined> = { GENFEED_CLOUD: '1' };
    expect(isCloudTenantGuardEnabled((key) => env[key])).toBe(true);
  });

  it('is false for LOCAL/self-hosted when the cloud flag is unset', () => {
    expect(isCloudTenantGuardEnabled(() => undefined)).toBe(false);
  });

  it('treats an explicit false cloud flag as LOCAL even with a hosted URL', () => {
    const env: Record<string, string | undefined> = {
      GENFEEDAI_API_PUBLIC_URL: 'https://api.genfeed.ai',
      GENFEED_CLOUD: 'false',
    };
    expect(isCloudTenantGuardEnabled((key) => env[key])).toBe(false);
  });
});

describe('PrismaService error rendering without adapter dispatch', () => {
  const connectionString = ['postgres', 'unit:test@localhost:5432/test'].join(
    '://',
  );
  const cases = [
    {
      args: { select: { id: true }, include: { id: true } },
      suffix: 'Please either use',
    },
    { args: { include: { id: true } }, suffix: 'Invalid scalar field' },
  ];

  for (const [index, input] of cases.entries()) {
    it(`preserves validation diagnostic ${index + 1} without reading the large caller`, async () => {
      // Node loads modules under their resolved filename, so canonicalize a
      // symlinked tmpdir once: assertions and cache cleanup use that path.
      const directory = realpathSync(
        mkdtempSync(join(tmpdir(), 'prisma-renderer-')),
      );
      const callerPath = join(directory, 'caller.cjs');
      const requireCaller = createRequire(import.meta.url);
      writeFileSync(
        callerPath,
        'module.exports = async function validateUser(client, args) { return client.user.findMany(args); };\n' +
          '// fixed caller padding\n'.repeat(400_000),
      );
      const caller = requireCaller(callerPath) as (
        client: PrismaClient,
        args: unknown,
      ) => Promise<unknown>;
      const originalRead = fs.readFileSync;
      const readSpy = vi
        .spyOn(fs, 'readFileSync')
        .mockImplementation((...args) => originalRead(...args));
      const connectSpy = vi
        .spyOn(PrismaPg.prototype, 'connect')
        .mockRejectedValue(
          new Error('Unexpected renderer fixture adapter dispatch'),
        );
      const control = new PrismaClient({
        adapter: new PrismaPg(connectionString),
        errorFormat: 'colorless',
      });
      const service = new PrismaService(
        testConfigService({
          DATABASE_URL: connectionString,
          GENFEED_CLOUD: 'false',
        }),
        index === 0 ? { onQueryEvent: () => undefined } : undefined,
      );
      const originalArgs = structuredClone(input.args);
      const callerReads = () =>
        readSpy.mock.calls.filter(
          ([path]) => typeof path === 'string' && path === callerPath,
        ).length;
      const validationError = async (client: PrismaClient) => {
        try {
          await caller(client, input.args);
        } catch (error: unknown) {
          expect(error).toBeInstanceOf(Prisma.PrismaClientValidationError);
          if (error instanceof Prisma.PrismaClientValidationError) return error;
          throw error;
        }
        throw new Error('Expected real Prisma validation rejection');
      };
      try {
        const controlError = await validationError(control);
        expect(callerReads()).toBeGreaterThan(0);
        readSpy.mockClear();
        const serviceError = await validationError(service);
        expect(connectSpy).not.toHaveBeenCalled();
        expect(input.args).toEqual(originalArgs);
        expect(serviceError.name).toBe(controlError.name);
        expect(serviceError.clientVersion).toBe(controlError.clientVersion);
        expect(controlError.message).toContain(callerPath);
        expect(callerReads()).toBe(0);
        expect(serviceError.message).not.toContain(callerPath);
        for (const error of [controlError, serviceError]) {
          expect(error.message).toContain('Invalid `');
          expect(error.message).toContain('include');
          expect(error.message).toContain('id');
        }
        const controlSuffix = controlError.message.slice(
          controlError.message.indexOf(input.suffix),
        );
        expect(controlSuffix.startsWith(input.suffix)).toBe(true);
        expect(
          serviceError.message.slice(
            serviceError.message.indexOf(input.suffix),
          ),
        ).toBe(controlSuffix);
        if (index === 0) {
          expect(controlSuffix).toContain('select');
          expect(controlSuffix).toContain('not both');
        } else {
          expect(controlSuffix).toContain('User');
          expect(controlSuffix).toContain('relation fields');
        }
      } finally {
        readSpy.mockRestore();
        connectSpy.mockRestore();
        await Promise.all([control.$disconnect(), service.$disconnect()]);
        delete requireCaller.cache[callerPath];
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }

  it('preserves the real CLOUD cross-organization rejection before adapter dispatch', async () => {
    const connectSpy = vi
      .spyOn(PrismaPg.prototype, 'connect')
      .mockRejectedValue(
        new Error('Unexpected tenant fixture adapter dispatch'),
      );
    const service = new PrismaService(
      testConfigService({ DATABASE_URL: connectionString, GENFEED_CLOUD: '1' }),
    );
    try {
      await expect(
        runWithTenantContext(
          { organizationId: 'synthetic-tenant-a' },
          async () =>
            await service.post.findMany({
              where: { organizationId: 'synthetic-tenant-b', isDeleted: false },
            }),
        ),
      ).rejects.toMatchObject({
        name: 'TenantIsolationError',
        reason: 'organization-id-mismatch',
        model: 'Post',
        operation: 'findMany',
        message:
          'Tenant isolation: findMany on Post used organizationId synthetic-tenant-b but the request tenant is synthetic-tenant-a.',
      });
      await expect(
        runWithTenantContext(
          { organizationId: 'synthetic-tenant-a' },
          async () =>
            await service.post.findMany({
              where: { organizationId: 'synthetic-tenant-b', isDeleted: false },
            }),
        ),
      ).rejects.toBeInstanceOf(TenantIsolationError);
      expect(connectSpy).not.toHaveBeenCalled();
    } finally {
      connectSpy.mockRestore();
      await service.$disconnect();
    }
  });
});

describe('PrismaService tenant guard wiring', () => {
  it('constructs the client with the CLOUD tenant-guard extension', () => {
    const service = new PrismaService(
      testConfigService({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/genfeed',
        GENFEED_CLOUD: '1',
      }),
    );

    expect(service).toBeDefined();
    expect(typeof service.$connect).toBe('function');
    expect(service.isCloudTenantGuard).toBe(true);
  });

  it('reports the guard as off for self-hosted', () => {
    const service = new PrismaService(
      testConfigService({
        DATABASE_URL: 'postgresql://user:pass@localhost:5432/genfeed',
        GENFEED_CLOUD: 'false',
      }),
    );

    expect(service.isCloudTenantGuard).toBe(false);
  });
});

describe('PrismaService media URL wiring', () => {
  it('refuses to start when a signing key pair is configured but cannot sign', () => {
    const config = {
      get: (key: string) =>
        key === 'DATABASE_URL'
          ? 'postgresql://user:pass@localhost:5432/genfeed'
          : undefined,
      mediaUrlConfig: {
        cdnUrl: 'https://cdn.test',
        signing: {
          keyPairId: 'KEYPAIR',
          privateKey: 'not-a-key',
          ttlSeconds: 300,
        },
      },
    } as unknown as ConfigService;

    expect(() => new PrismaService(config)).toThrow(
      /key pair cannot sign URLs/,
    );
  });
});

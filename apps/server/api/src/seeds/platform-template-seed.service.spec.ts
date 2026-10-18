import { PLATFORM_TEMPLATES } from '@api/seeds/platform-template-catalog';
import { PlatformTemplateSeedService } from '@api/seeds/platform-template-seed.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';

function fixture() {
  const prisma = {
    template: {
      create: vi.fn().mockResolvedValue({}),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };
  const logger = { error: vi.fn() };
  return {
    logger,
    prisma,
    service: new PlatformTemplateSeedService(
      prisma as unknown as PrismaService,
      logger as unknown as LoggerService,
    ),
  };
}

describe('PlatformTemplateSeedService', () => {
  it('creates every catalog template as an active platform prompt', async () => {
    const { prisma, service } = fixture();

    const result = await service.reconcileCatalog();

    expect(result.written).toBe(PLATFORM_TEMPLATES.length);
    expect(result.keys).toEqual(PLATFORM_TEMPLATES.map((t) => t.key));
    for (const [index, template] of PLATFORM_TEMPLATES.entries()) {
      expect(prisma.template.create.mock.calls[index][0].data).toMatchObject({
        config: { content: template.content },
        isActive: true,
        key: template.key,
        label: template.label,
        organizationId: null,
        purpose: 'prompt',
        version: 1,
      });
    }
  });

  it('passes the prompt through unescaped so seeding changes no generation', () => {
    for (const template of PLATFORM_TEMPLATES) {
      expect(template.content).toBe('{{{prompt}}}');
    }
  });

  it('is idempotent: existing keys, including deleted ones, are left alone', async () => {
    const { prisma, service } = fixture();
    prisma.template.findFirst.mockResolvedValue({ id: 'existing' });

    const result = await service.reconcileCatalog();

    expect(result).toEqual({
      keys: [],
      unchanged: PLATFORM_TEMPLATES.length,
      written: 0,
    });
    expect(prisma.template.create).not.toHaveBeenCalled();
    const where = prisma.template.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ organizationId: null, purpose: 'prompt' });
    expect(where).not.toHaveProperty('isDeleted');
  });

  it('reports what a live run would write without writing on a dry run', async () => {
    const { prisma, service } = fixture();

    const result = await service.reconcileCatalog({ isDryRun: true });

    expect(result.written).toBe(PLATFORM_TEMPLATES.length);
    expect(prisma.template.create).not.toHaveBeenCalled();
  });

  it('attempts every template and names the ones that failed', async () => {
    const { logger, prisma, service } = fixture();
    prisma.template.create
      .mockRejectedValueOnce(new Error('db down'))
      .mockResolvedValue({});

    await expect(service.reconcileCatalog()).rejects.toThrow(
      `Platform template reconcile failed for: ${PLATFORM_TEMPLATES[0].key}`,
    );
    expect(prisma.template.create).toHaveBeenCalledTimes(
      PLATFORM_TEMPLATES.length,
    );
    expect(logger.error).toHaveBeenCalledOnce();
  });
});

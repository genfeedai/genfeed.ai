import { ModelsService } from '@api/collections/models/services/models.service';
import { ProfilesService } from '@api/collections/profiles/services/profiles.service';
import { DEFAULT_TEXT_MODEL } from '@api/constants/default-text-model.constant';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { expectCloudGuardPasses } from '@api/shared/testing/cloud-guard-assertions';
import type { Profile } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { Test } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

describe('ProfilesService document mapping', () => {
  it('projects profile data while preserving canonical persistence fields', async () => {
    const createdAt = new Date('2026-09-01T10:00:00Z');
    const row: Profile = {
      createdAt,
      createdById: 'creator-1',
      data: {
        createdAt: 'forged-date',
        createdById: 'forged-creator',
        id: 'forged-id',
        isDeleted: true,
        label: 'Editorial voice',
        organizationId: 'forged-org',
        tags: ['editorial'],
        updatedAt: 'forged-date',
      },
      id: 'profile-1',
      isDeleted: false,
      organizationId: 'org-1',
      updatedAt: createdAt,
    };
    const findFirst = vi.fn().mockResolvedValue(row);
    const module = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: PrismaService, useValue: { profile: { findFirst } } },
        { provide: LoggerService, useValue: { debug: vi.fn() } },
        { provide: ModelsService, useValue: {} },
        { provide: ReplicateService, useValue: {} },
      ],
    }).compile();

    try {
      const result = await module
        .get(ProfilesService)
        .findOne(row.id, row.organizationId);
      expect(result).toMatchObject({
        createdAt,
        createdById: row.createdById,
        id: row.id,
        isDeleted: false,
        label: 'Editorial voice',
        organizationId: row.organizationId,
        tags: ['editorial'],
        updatedAt: createdAt,
      });
      expect(result.createdAt).toBe(createdAt);
      expect(result.data).toBe(row.data);
      expect(findFirst).toHaveBeenCalledWith({
        where: {
          id: row.id,
          isDeleted: false,
          organizationId: row.organizationId,
        },
      });
    } finally {
      await module.close();
    }
  });
});

describe('ProfilesService tenant-scoped writes', () => {
  it('scopes update, default-unset and remove writes to the request org', async () => {
    const row = {
      createdAt: new Date(),
      createdById: 'creator-1',
      data: { isDefault: true, label: 'Voice' },
      id: 'profile-1',
      isDeleted: false,
      organizationId: 'org-1',
      updatedAt: new Date(),
    };
    const prisma = {
      profile: {
        findFirst: vi.fn().mockResolvedValue(row),
        findMany: vi.fn().mockResolvedValue([{ ...row, id: 'profile-2' }]),
        update: vi.fn().mockResolvedValue(row),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        ProfilesService,
        { provide: PrismaService, useValue: prisma },
        { provide: LoggerService, useValue: { debug: vi.fn() } },
        { provide: ModelsService, useValue: {} },
        { provide: ReplicateService, useValue: {} },
      ],
    }).compile();

    try {
      const service = module.get(ProfilesService);
      await runWithTenantContext({ organizationId: 'org-1' }, async () => {
        await service.update('profile-1', { isDefault: true }, 'org-1');
        await service.remove('profile-1', 'org-1');
      });

      expect(prisma.profile.update).toHaveBeenCalledTimes(3);
      expectCloudGuardPasses('Profile', 'findFirst', prisma.profile.findFirst);
      expectCloudGuardPasses('Profile', 'findMany', prisma.profile.findMany);
      expectCloudGuardPasses('Profile', 'update', prisma.profile.update);
    } finally {
      await module.close();
    }
  });
});

// #5375: BYOK — the resolved org key (when the CreditsGuard granted a
// bypass) must reach the actual text-completion dispatch, not just the
// credit decision.
describe('ProfilesService BYOK threading (#5375)', () => {
  const organizationId = 'org-1';
  const profileRow = {
    createdAt: new Date('2026-09-01T10:00:00Z'),
    createdById: 'creator-1',
    data: { article: { writingStyle: 'formal' }, usageCount: 0 },
    id: 'profile-1',
    isDeleted: false,
    organizationId,
    updatedAt: new Date('2026-09-01T10:00:00Z'),
  };

  async function buildService() {
    const findFirst = vi.fn().mockResolvedValue(profileRow);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const create = vi.fn().mockResolvedValue(profileRow);
    const replicateService = {
      generateStructuredTextSync: vi.fn().mockResolvedValue({
        article: { writingStyle: 'formal' },
        image: null,
        video: null,
        voice: null,
      }),
      generateTextCompletionSync: vi.fn().mockResolvedValue('Enhanced prompt'),
    };
    const modelsService = {
      findOne: vi.fn().mockResolvedValue({ cost: 1, pricingType: 'flat' }),
    };
    const module = await Test.createTestingModule({
      providers: [
        ProfilesService,
        {
          provide: PrismaService,
          useValue: { profile: { create, findFirst, updateMany } },
        },
        { provide: LoggerService, useValue: { debug: vi.fn() } },
        { provide: ModelsService, useValue: modelsService },
        { provide: ReplicateService, useValue: replicateService },
      ],
    }).compile();

    return {
      module,
      replicateService,
      service: module.get(ProfilesService),
    };
  }

  it('forwards a resolved BYOK key from applyProfile to the completion call', async () => {
    const { module, replicateService, service } = await buildService();
    try {
      await service.applyProfile(
        {
          contentType: 'article',
          profileId: 'profile-1',
          prompt: 'test',
        } as never,
        organizationId,
        undefined,
        'org-openrouter-key',
      );

      expect(replicateService.generateTextCompletionSync).toHaveBeenCalledWith(
        DEFAULT_TEXT_MODEL,
        expect.any(Object),
        'org-openrouter-key',
      );
    } finally {
      await module.close();
    }
  });

  it('dispatches applyProfile with no key override when the guard did not bypass', async () => {
    const { module, replicateService, service } = await buildService();
    try {
      await service.applyProfile(
        {
          contentType: 'article',
          profileId: 'profile-1',
          prompt: 'test',
        } as never,
        organizationId,
      );

      expect(replicateService.generateTextCompletionSync).toHaveBeenCalledWith(
        DEFAULT_TEXT_MODEL,
        expect.any(Object),
        undefined,
      );
    } finally {
      await module.close();
    }
  });

  it('forwards a resolved BYOK key from analyzeTone to the structured completion call', async () => {
    const { module, replicateService, service } = await buildService();
    try {
      await service.analyzeTone(
        {
          content: 'content',
          contentType: 'article',
          profileId: 'profile-1',
        } as never,
        organizationId,
        undefined,
        'org-openrouter-key',
      );

      expect(replicateService.generateStructuredTextSync).toHaveBeenCalledWith(
        DEFAULT_TEXT_MODEL,
        expect.any(Object),
        'org-openrouter-key',
      );
    } finally {
      await module.close();
    }
  });

  it('forwards a resolved BYOK key from generateFromExamples to the structured completion call', async () => {
    const { module, replicateService, service } = await buildService();
    try {
      await service.generateFromExamples(
        {
          examples: [{ content: 'example', contentType: 'article' }],
          label: 'Generated',
        } as never,
        organizationId,
        'user-1',
        undefined,
        'org-openrouter-key',
      );

      expect(replicateService.generateStructuredTextSync).toHaveBeenCalledWith(
        DEFAULT_TEXT_MODEL,
        expect.any(Object),
        'org-openrouter-key',
      );
    } finally {
      await module.close();
    }
  });
});

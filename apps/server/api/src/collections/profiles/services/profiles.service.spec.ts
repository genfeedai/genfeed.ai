import { ModelsService } from '@api/collections/models/services/models.service';
import { ProfilesService } from '@api/collections/profiles/services/profiles.service';
import { ReplicateService } from '@api/services/integrations/replicate/services/replicate.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { Profile } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
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

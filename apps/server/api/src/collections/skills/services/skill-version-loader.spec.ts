import type { SkillDocument } from '@api/collections/skills/schemas/skill.schema';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { describe, expect, it, vi } from 'vitest';
import {
  applyAuthorizedVersionBody,
  loadAuthorizedSkillVersions,
  type SkillVersionPin,
} from './skill-version-loader';

const actor = {
  brandId: 'brand-1',
  organizationId: 'org-1',
  userId: 'user-1',
};

function versionRow(id: string, instructionText: string, skillId = 'skill-1') {
  return {
    contentHash: `hash-${id}`,
    id,
    instructionText,
    skillId,
  };
}

function loaderPrisma(input: {
  assignments?: Record<string, unknown>[];
  grants?: Record<string, unknown>[];
  versions?: Record<string, unknown>[];
}) {
  return {
    skillAssignment: {
      findMany: vi.fn().mockResolvedValue(input.assignments ?? []),
    },
    skillGrant: {
      findMany: vi.fn().mockResolvedValue(input.grants ?? []),
    },
    skillVersion: {
      findMany: vi.fn().mockResolvedValue(input.versions ?? []),
    },
  };
}

const publishedSkill = {
  audience: 'organization',
  currentVersionId: 'sv-2',
  id: 'skill-1',
  ownerKind: 'organization',
  publishedVersionId: null,
  sharedVersionId: 'sv-1',
};

describe('loadAuthorizedSkillVersions', () => {
  it('loads the assigned v1 body after the live skill moves to v2', async () => {
    const prisma = loaderPrisma({
      assignments: [
        {
          skillId: 'skill-1',
          skillVersionId: 'sv-1',
          targetKind: 'organization',
        },
      ],
      versions: [
        versionRow('sv-1', 'assigned v1'),
        versionRow('sv-2', 'draft v2'),
      ],
    });

    const loaded = await loadAuthorizedSkillVersions(
      prisma as unknown as PrismaService,
      actor,
      [publishedSkill],
      new Set(),
    );

    expect(loaded.get('skill-1')).toMatchObject({
      contentHash: 'hash-sv-1',
      id: 'sv-1',
      instructionText: 'assigned v1',
    });
    expect(prisma.skillVersion.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['sv-1'] } },
    });
    expect(prisma.skillGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
      }),
    );
  });

  it('asks for unrevoked grants and does not fall through to the current draft', async () => {
    const prisma = loaderPrisma({
      versions: [versionRow('sv-2', 'draft v2')],
    });

    const loaded = await loadAuthorizedSkillVersions(
      prisma as unknown as PrismaService,
      actor,
      [
        {
          ...publishedSkill,
          audience: 'private',
          ownerKind: 'user',
          ownerUserId: 'user-2',
          sharedVersionId: null,
        },
      ],
      new Set(),
    );

    expect(loaded.size).toBe(0);
    expect(prisma.skillVersion.findMany).not.toHaveBeenCalled();
    expect(prisma.skillGrant.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
      }),
    );
  });

  it('keeps a retry pin after activation moves the assignment', async () => {
    const pins: SkillVersionPin[] = [
      {
        contentHash: 'hash-sv-1',
        skillId: 'skill-1',
        skillVersionId: 'sv-1',
      },
    ];
    const prisma = loaderPrisma({
      assignments: [
        {
          skillId: 'skill-1',
          skillVersionId: 'sv-2',
          targetKind: 'organization',
        },
      ],
      versions: [
        versionRow('sv-1', 'first execution'),
        versionRow('sv-2', 'activated v2'),
      ],
    });

    const loaded = await loadAuthorizedSkillVersions(
      prisma as unknown as PrismaService,
      actor,
      [publishedSkill],
      new Set(),
      pins,
    );

    expect(loaded.get('skill-1')?.instructionText).toBe('first execution');
    expect(prisma.skillVersion.findMany).toHaveBeenCalledWith({
      where: { id: { in: ['sv-1'] } },
    });
  });

  it('follows an explicit activation on a later run that has no pin', async () => {
    const prisma = loaderPrisma({
      assignments: [
        {
          skillId: 'skill-1',
          skillVersionId: 'sv-2',
          targetKind: 'organization',
        },
      ],
      versions: [
        versionRow('sv-1', 'shared v1'),
        versionRow('sv-2', 'activated v2'),
      ],
    });

    const loaded = await loadAuthorizedSkillVersions(
      prisma as unknown as PrismaService,
      actor,
      [publishedSkill],
      new Set(),
    );

    expect(loaded.get('skill-1')?.instructionText).toBe('activated v2');
  });

  it('lets a user assignment beat a brand assignment and an organization assignment', async () => {
    const prisma = loaderPrisma({
      assignments: [
        {
          skillId: 'skill-1',
          skillVersionId: 'sv-org',
          targetKind: 'organization',
        },
        {
          skillId: 'skill-1',
          skillVersionId: 'sv-brand',
          targetKind: 'brand',
        },
        {
          skillId: 'skill-1',
          skillVersionId: 'sv-user',
          targetKind: 'user',
        },
      ],
      versions: [
        versionRow('sv-org', 'organization copy'),
        versionRow('sv-brand', 'brand copy'),
        versionRow('sv-user', 'user copy'),
      ],
    });

    const loaded = await loadAuthorizedSkillVersions(
      prisma as unknown as PrismaService,
      actor,
      [publishedSkill],
      new Set(),
    );

    expect(loaded.get('skill-1')?.instructionText).toBe('user copy');
  });

  it('drops a version row that belongs to a different skill', async () => {
    const prisma = loaderPrisma({
      assignments: [
        {
          skillId: 'skill-1',
          skillVersionId: 'sv-1',
          targetKind: 'organization',
        },
      ],
      versions: [versionRow('sv-1', 'someone else', 'skill-other')],
    });

    const loaded = await loadAuthorizedSkillVersions(
      prisma as unknown as PrismaService,
      actor,
      [publishedSkill],
      new Set(),
    );

    expect(loaded.size).toBe(0);
  });

  it('lets the personal owner resolve the current version', async () => {
    const prisma = loaderPrisma({
      versions: [versionRow('sv-2', 'owner current')],
    });

    const loaded = await loadAuthorizedSkillVersions(
      prisma as unknown as PrismaService,
      actor,
      [
        {
          audience: 'private',
          currentVersionId: 'sv-2',
          id: 'skill-1',
          ownerKind: 'user',
          ownerUserId: 'user-1',
          publishedVersionId: null,
          sharedVersionId: null,
        },
      ],
      new Set(),
    );

    expect(loaded.get('skill-1')?.instructionText).toBe('owner current');
  });
});

describe('applyAuthorizedVersionBody', () => {
  it('replaces the live instruction fields with the authorized version', () => {
    const document = {
      config: {
        defaultInstructions: 'draft body',
        description: 'live description',
        systemPromptTemplate: 'draft body',
      },
      defaultInstructions: 'draft body',
      id: 'skill-1',
      systemPromptTemplate: 'draft body',
    } as SkillDocument;

    const projected = applyAuthorizedVersionBody(document, {
      contentHash: 'hash-sv-1',
      id: 'sv-1',
      instructionText: 'assigned v1',
    });

    expect(projected.systemPromptTemplate).toBe('assigned v1');
    expect(projected.defaultInstructions).toBe('assigned v1');
    expect(projected.skillVersionId).toBe('sv-1');
    expect(projected.contentHash).toBe('hash-sv-1');
    expect(projected.config).toMatchObject({
      defaultInstructions: 'assigned v1',
      description: 'live description',
      systemPromptTemplate: 'assigned v1',
    });
  });
});

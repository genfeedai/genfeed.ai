import { SkillsService } from '@api/collections/skills/services/skills.service';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type SkillRow = {
  config: Record<string, unknown>;
  id: string;
  isDeleted: boolean;
  label: string;
  organizationId: string | null;
};

function makeSkillRow(overrides: Partial<SkillRow> = {}): SkillRow {
  return {
    config: {
      name: 'Hook Writer',
      slug: 'hook-writer',
      source: 'custom',
      status: 'published',
    },
    id: 'skill-1',
    isDeleted: false,
    label: 'Hook Writer',
    organizationId: 'org-1',
    ...overrides,
  };
}

describe('SkillsService.updateSkill tenant scope', () => {
  const prisma = {
    skill: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
    },
  };
  const byokProviderFactoryService = {};
  const loggerService = { debug: vi.fn(), error: vi.fn(), warn: vi.fn() };

  let service: SkillsService;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma.skill.findMany.mockResolvedValue([]);
    prisma.skill.update.mockImplementation(({ data }) =>
      Promise.resolve({ ...makeSkillRow(), config: data.config }),
    );
    service = new SkillsService(
      prisma as unknown as PrismaService,
      byokProviderFactoryService as unknown as ByokProviderFactoryService,
      loggerService as unknown as LoggerService,
    );
  });

  it('updates a skill the organization owns', async () => {
    prisma.skill.findFirst.mockResolvedValue(makeSkillRow());

    const updated = await service.updateSkill('org-1', 'skill-1', {
      name: 'Hook Writer v2',
    });

    expect(prisma.skill.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'skill-1', isDeleted: false, organizationId: 'org-1' },
      }),
    );
    expect(updated.name).toBe('Hook Writer v2');
  });

  it('rejects a catalog-global skill instead of attempting the write', async () => {
    // `getSkillById` resolves through `buildAccessibleSkillWhere`, which also
    // returns global rows (`organizationId: null`). The organization-scoped
    // update can never match one, so the request must be rejected as
    // not-found rather than reaching the database and failing there.
    prisma.skill.findFirst.mockResolvedValue(
      makeSkillRow({ id: 'skill-global', organizationId: null }),
    );

    await expect(
      service.updateSkill('org-1', 'skill-global', { name: 'Renamed' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.skill.update).not.toHaveBeenCalled();
  });

  it('rejects a skill owned by another organization', async () => {
    prisma.skill.findFirst.mockResolvedValue(
      makeSkillRow({ id: 'skill-foreign', organizationId: 'org-2' }),
    );

    await expect(
      service.updateSkill('org-1', 'skill-foreign', { name: 'Renamed' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.skill.update).not.toHaveBeenCalled();
  });

  it('rejects an unresolvable skill id', async () => {
    prisma.skill.findFirst.mockResolvedValue(null);

    await expect(
      service.updateSkill('org-1', 'missing', { name: 'Renamed' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.skill.update).not.toHaveBeenCalled();
  });

  it('rejects a slug-resolved skill that belongs to another organization', async () => {
    // The slug fallback scans the accessible set in memory, so it can surface
    // a row the scoped write could never touch.
    prisma.skill.findFirst.mockResolvedValue(null);
    prisma.skill.findMany.mockResolvedValue([
      makeSkillRow({ id: 'skill-foreign', organizationId: 'org-2' }),
    ]);

    await expect(
      service.updateSkill('org-1', 'hook-writer', { name: 'Renamed' }),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.skill.update).not.toHaveBeenCalled();
  });
});

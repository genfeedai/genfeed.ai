import { SkillsService } from '@api/collections/skills/services/skills.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { NotFoundException } from '@api/helpers/exceptions/http/not-found.exception';
import { ValidationException } from '@api/helpers/exceptions/http/validation.exception';
import { ByokProviderFactoryService } from '@api/services/byok/byok-provider-factory.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ByokProvider } from '@genfeedai/enums';
import { type Brand, type Skill } from '@genfeedai/prisma';
import { LoggerService } from '@libs/logger/logger.service';
import { Test, TestingModule } from '@nestjs/testing';
import { describe, expect, it, vi } from 'vitest';

function createQueryMock<T>(result: T) {
  return {
    exec: vi.fn().mockResolvedValue(result),
    lean: vi.fn().mockResolvedValue(result),
    populate: vi.fn().mockReturnThis(),
    sort: vi.fn().mockReturnThis(),
  };
}

describe('SkillsService', () => {
  const orgId = 'test-object-id'.toString();
  const brandId = 'test-object-id'.toString();

  let service: SkillsService;

  const mockSkillModel = {
    create: vi.fn(),
    find: vi.fn(),
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  };

  const mockBrandModel = {
    findOne: vi.fn(),
    findOneAndUpdate: vi.fn(),
  };

  const mockByokFactory = {
    hasProviderAccess: vi.fn(),
  };

  const mockLogger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkillsService,
        {
          provide: PrismaService,
          useValue: { ...mockSkillModel, ...mockBrandModel },
        },
        {
          provide: ByokProviderFactoryService,
          useValue: mockByokFactory,
        },
        {
          provide: LoggerService,
          useValue: mockLogger,
        },
      ],
    }).compile();

    service = module.get(SkillsService);
  });

  it('creates an org-scoped skill', async () => {
    mockSkillModel.create.mockResolvedValue({
      _id: 'skill-1',
      slug: 'hook-writer',
    });

    await service.createSkill(orgId, {
      category: 'copywriting' as never,
      channels: ['youtube'],
      description: 'Writes hooks',
      modalities: ['text'],
      name: 'Hook Writer',
      requiredProviders: [ByokProvider.OPENAI],
      slug: 'hook-writer',
      workflowStage: 'creation',
    });

    expect(mockSkillModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        isBuiltIn: false,
        isDeleted: false,
        organization: expect.any(string),
        source: 'custom',
        status: 'published',
      }),
    );
  });

  it('imports a skill as an org-owned draft', async () => {
    mockSkillModel.create.mockResolvedValue({
      _id: 'skill-2',
      slug: 'launch-reviewer',
    });

    await service.importSkill(orgId, {
      category: 'copywriting' as never,
      channels: ['linkedin'],
      description: 'Imported skill',
      modalities: ['text'],
      name: 'Launch Reviewer',
      slug: 'launch-reviewer',
      workflowStage: 'review',
    });

    expect(mockSkillModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        isBuiltIn: false,
        source: 'imported',
        status: 'draft',
      }),
    );
  });

  it('customizes an accessible base skill into an org variant', async () => {
    const baseSkillId = 'test-object-id';
    mockSkillModel.findOne.mockResolvedValue({
      _id: baseSkillId,
      category: 'copywriting',
      channels: ['youtube'],
      description: 'Base description',
      modalities: ['text'],
      name: 'YouTube Script Setup',
      requiredProviders: [ByokProvider.OPENAI],
      slug: 'youtube-script-setup',
      workflowStage: 'creation',
    });
    mockSkillModel.create.mockResolvedValue({ _id: 'variant-1' });

    await service.customizeSkill(orgId, baseSkillId.toString(), {
      name: 'YouTube Script Setup Custom',
    });

    expect(mockSkillModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseSkill: baseSkillId,
        isBuiltIn: false,
        organization: expect.any(string),
        source: 'custom',
        status: 'draft',
      }),
    );
  });

  it('lists org and built-in skills for the catalog', async () => {
    mockSkillModel.find.mockReturnValue(
      createQueryMock([{ slug: 'a' }, { slug: 'b' }]),
    );

    const result = await service.listAllForOrg(orgId);

    expect(result).toHaveLength(2);
    expect(mockSkillModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        $or: expect.arrayContaining([
          { organization: expect.any(string) },
          { organization: null },
        ]),
        isDeleted: false,
      }),
    );
  });

  it('falls back to built-in skills when org context is missing', async () => {
    mockSkillModel.find.mockReturnValue(createQueryMock([{ slug: 'builtin' }]));

    const result = await service.listAllForOrg('');

    expect(result).toHaveLength(1);
    expect(mockSkillModel.find).toHaveBeenCalledWith({
      isDeleted: false,
      organization: null,
    });
  });

  it('rejects org-owned skill creation without a valid organization id', async () => {
    expect(() =>
      service.createSkill('', {
        category: 'copywriting' as never,
        channels: ['youtube'],
        description: 'Writes hooks',
        modalities: ['text'],
        name: 'Hook Writer',
        slug: 'hook-writer',
        workflowStage: 'creation',
      }),
    ).toThrow(ValidationException);

    expect(mockSkillModel.create).not.toHaveBeenCalled();
  });

  it('resolves enabled brand skills from agentConfig.enabledSkills', async () => {
    mockBrandModel.findOne.mockReturnValue(
      createQueryMock({
        _id: brandId,
        agentConfig: { enabledSkills: ['hook-writer'] },
      }),
    );

    const skillId = 'test-object-id';
    mockSkillModel.find.mockReturnValue(
      createQueryMock([
        {
          _id: skillId,
          channels: ['youtube'],
          isEnabled: true,
          modalities: ['text'],
          requiredProviders: [],
          slug: 'hook-writer',
          status: 'published',
          workflowStage: 'creation',
        },
      ]),
    );

    mockByokFactory.hasProviderAccess.mockResolvedValue(true);

    const result = await service.resolveBrandSkills(orgId, brandId, {
      channel: 'youtube',
      modality: 'text',
      workflowStage: 'creation',
    });

    expect(result).toHaveLength(1);
    expect(result[0].targetSkill.slug).toBe('hook-writer');
    expect(result[0].priority).toBe(0);
  });

  it('returns enabled skill slugs from brand agentConfig', async () => {
    mockBrandModel.findOne.mockReturnValue(
      createQueryMock({
        _id: brandId,
        agentConfig: { enabledSkills: ['hook-writer', 'caption-reviewer'] },
      }),
    );

    const slugs = await service.getEnabledSkillSlugs(orgId, brandId);

    expect(slugs).toEqual(['hook-writer', 'caption-reviewer']);
  });

  it('filters requested slugs against enabled skills', async () => {
    mockBrandModel.findOne.mockReturnValue(
      createQueryMock({
        _id: brandId,
        agentConfig: { enabledSkills: ['hook-writer', 'caption-reviewer'] },
      }),
    );

    const slugs = await service.getEnabledSkillSlugs(orgId, brandId, [
      'hook-writer',
      'non-existent',
    ]);

    expect(slugs).toEqual(['hook-writer']);
  });

  it('throws when the brand is not accessible', async () => {
    mockBrandModel.findOne.mockReturnValue(createQueryMock(null));

    await expect(service.getEnabledSkillSlugs(orgId, brandId)).rejects.toThrow(
      NotFoundException,
    );
  });
});

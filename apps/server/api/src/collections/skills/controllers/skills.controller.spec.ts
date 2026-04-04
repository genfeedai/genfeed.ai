import { SkillsController } from '@api/collections/skills/controllers/skills.controller';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import type { User } from '@clerk/backend';
import { PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/clerk/clerk.util', () => ({
  getPublicMetadata: vi.fn(),
}));

const mockGetPublicMetadata = getPublicMetadata as unknown as ReturnType<
  typeof vi.fn
>;

describe('SkillsController', () => {
  let controller: SkillsController;

  const mockService = {
    createSkill: vi.fn(),
    customizeSkill: vi.fn(),
    getSkillById: vi.fn(),
    importSkill: vi.fn(),
    listAllForOrg: vi.fn(),
    updateSkill: vi.fn(),
  };

  const mockReq = {} as Request;
  const mockUser = {} as User;

  beforeEach(async () => {
    vi.resetAllMocks();

    mockGetPublicMetadata.mockReturnValue({
      organization: 'org-1',
      user: 'user-1',
    });

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkillsController],
      providers: [
        {
          provide: SkillsService,
          useValue: mockService,
        },
      ],
    })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(SkillsController);
  });

  it('does not declare a controller-level v1 prefix', () => {
    expect(Reflect.getMetadata(PATH_METADATA, SkillsController)).not.toBe('v1');
  });

  it('lists skills for the organization', async () => {
    mockService.listAllForOrg.mockResolvedValue([]);

    await controller.listSkills(mockReq, mockUser);

    expect(mockService.listAllForOrg).toHaveBeenCalledWith('org-1');
  });

  it('gets a skill by id or slug', async () => {
    mockService.getSkillById.mockResolvedValue({ slug: 'youtube-script' });

    await controller.getSkill(mockReq, mockUser, 'youtube-script');

    expect(mockService.getSkillById).toHaveBeenCalledWith(
      'org-1',
      'youtube-script',
    );
  });

  it('creates a content skill', async () => {
    mockService.createSkill.mockResolvedValue({ slug: 'hook-writer' });

    await controller.createSkill(mockReq, mockUser, {
      category: 'copywriting' as never,
      channels: ['youtube'],
      description: 'Writes hooks',
      modalities: ['text'],
      name: 'Hook Writer',
      slug: 'hook-writer',
      workflowStage: 'creation',
    });

    expect(mockService.createSkill).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ slug: 'hook-writer' }),
    );
  });

  it('customizes an existing skill', async () => {
    mockService.customizeSkill.mockResolvedValue({
      slug: 'hook-writer-custom',
    });

    await controller.customizeSkill(mockReq, mockUser, 'skill-1', {
      name: 'Hook Writer Custom',
    });

    expect(mockService.customizeSkill).toHaveBeenCalledWith(
      'org-1',
      'skill-1',
      { name: 'Hook Writer Custom' },
    );
  });
});

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { SkillsController } from '@api/collections/skills/controllers/skills.controller';
import { SkillsService } from '@api/collections/skills/services/skills.service';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request } from 'express';
import { describe, expect, it, vi } from 'vitest';

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
  const mockUser = {
    id: 'user-1',
    isSuperAdmin: false,
    organizationId: 'org-1',
    userId: 'user-1',
  } as User;

  beforeEach(async () => {
    vi.resetAllMocks();

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

  it('requires the roles guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, SkillsController)).toContain(
      RolesGuard,
    );
  });

  it.each([
    [
      'list',
      () =>
        controller.listSkills(mockReq, {
          ...mockUser,
          organizationId: undefined,
        } as unknown as User),
    ],
    [
      'get',
      () =>
        controller.getSkill(
          mockReq,
          { ...mockUser, organizationId: undefined } as unknown as User,
          'hook-writer',
        ),
    ],
    [
      'create',
      () =>
        controller.createSkill(
          mockReq,
          { ...mockUser, organizationId: undefined } as unknown as User,
          {
            category: 'copywriting' as never,
            channels: ['youtube'],
            description: 'Writes hooks',
            modalities: ['text'],
            name: 'Hook Writer',
            slug: 'hook-writer',
            workflowStage: 'creation',
          },
        ),
    ],
    [
      'import',
      () =>
        controller.importSkill(
          mockReq,
          { ...mockUser, organizationId: undefined } as unknown as User,
          {
            category: 'copywriting' as never,
            channels: ['youtube'],
            description: 'Writes hooks',
            modalities: ['text'],
            name: 'Hook Writer',
            slug: 'hook-writer',
            workflowStage: 'creation',
          },
        ),
    ],
    [
      'customize',
      () =>
        controller.customizeSkill(
          mockReq,
          { ...mockUser, organizationId: undefined } as unknown as User,
          'skill-1',
          { name: 'Hook Writer Custom' },
        ),
    ],
    [
      'update',
      () =>
        controller.updateSkill(
          mockReq,
          { ...mockUser, organizationId: undefined } as unknown as User,
          'skill-1',
          { name: 'Hook Writer v2' },
        ),
    ],
  ])('rejects %s without organization context', async (_operation, invoke) => {
    await expect(invoke()).rejects.toMatchObject({ status: 403 });

    for (const serviceMethod of Object.values(mockService)) {
      expect(serviceMethod).not.toHaveBeenCalled();
    }
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

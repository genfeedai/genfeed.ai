import { SkillDownloadController } from '@api/skills-pro/controllers/skill-download.controller';
import { SkillDownloadService } from '@api/skills-pro/services/skill-download.service';
import { isPublicRoute } from '@libs/decorators/public.decorator';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import type { AuthenticatedUser } from '@server/auth/interfaces/authenticated-user.interface';
import type { Request } from 'express';

describe('SkillDownloadController', () => {
  let controller: SkillDownloadController;
  const verifyReceipt = vi.fn();
  const getDownloadUrl = vi.fn();
  const installSkill = vi.fn();
  const user = { organizationId: 'org-1' } as AuthenticatedUser;
  const request = {
    originalUrl: '/v1/skills-pro/install',
  } as Request;

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [SkillDownloadController],
      providers: [
        {
          provide: SkillDownloadService,
          useValue: { getDownloadUrl, installSkill, verifyReceipt },
        },
      ],
    }).compile();

    controller = module.get(SkillDownloadController);
  });

  it.each(['verifyReceipt', 'downloadSkill', 'installSkill'] as const)(
    'keeps %s on the authenticated guard path',
    (method) => {
      const context = {
        getClass: () => SkillDownloadController,
        getHandler: () => SkillDownloadController.prototype[method],
      } as unknown as ExecutionContext;

      expect(isPublicRoute(new Reflector(), context)).toBe(false);
    },
  );

  it('verifies the receipt inside the current organization', async () => {
    verifyReceipt.mockResolvedValue({
      email: 'buyer@example.com',
      productType: 'skill',
      skills: ['image-gen-pro'],
      valid: true,
    });

    await controller.verifyReceipt(user, { receiptId: 'sk_rcpt_one' });

    expect(verifyReceipt).toHaveBeenCalledWith('org-1', 'sk_rcpt_one');
  });

  it('downloads only inside the current organization', async () => {
    getDownloadUrl.mockResolvedValue({ downloadUrl: 'https://cdn.example' });

    await controller.downloadSkill(user, {
      receiptId: 'sk_rcpt_one',
      skillSlug: 'image-gen-pro',
    });

    expect(getDownloadUrl).toHaveBeenCalledWith(
      'org-1',
      'sk_rcpt_one',
      'image-gen-pro',
    );
  });

  it('returns a metadata-only serialized installation result', async () => {
    installSkill.mockResolvedValue({
      files: [{ content: 'private', path: 'SKILL.md' }],
      id: 'skill-1',
      instructions: 'private body',
      name: 'Image Gen Pro',
      slug: 'image-gen-pro',
      status: 'installed',
      version: '1.0.0',
    });

    const result = await controller.installSkill(request, user, {
      receiptId: 'sk_rcpt_one',
      skillSlug: 'image-gen-pro',
    });

    expect(installSkill).toHaveBeenCalledWith(
      'org-1',
      'sk_rcpt_one',
      'image-gen-pro',
    );
    expect(result).toMatchObject({
      data: {
        attributes: {
          name: 'Image Gen Pro',
          slug: 'image-gen-pro',
          status: 'installed',
          version: '1.0.0',
        },
        id: 'skill-1',
        type: 'skills-pro-installation',
      },
    });
    expect(JSON.stringify(result)).not.toContain('private');
  });

  it('rejects users without an organization context', () => {
    expect(() =>
      controller.verifyReceipt({} as AuthenticatedUser, {
        receiptId: 'sk_rcpt_one',
      }),
    ).toThrow();
  });
});

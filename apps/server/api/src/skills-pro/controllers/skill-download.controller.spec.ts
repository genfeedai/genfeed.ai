import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { OPTIONAL_AUTH_KEY } from '@api/helpers/decorators/optional-auth.decorator';
import { SkillDownloadController } from '@api/skills-pro/controllers/skill-download.controller';
import { SkillDownloadService } from '@api/skills-pro/services/skill-download.service';
import { isPublicRoute } from '@libs/decorators/public.decorator';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, type TestingModule } from '@nestjs/testing';
import type { Request } from 'express';

describe('SkillDownloadController', () => {
  let controller: SkillDownloadController;
  const verifyReceipt = vi.fn();
  const verifyReceiptBearer = vi.fn();
  const getDownloadUrl = vi.fn();
  const getDownloadUrlBearer = vi.fn();
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
          useValue: {
            getDownloadUrl,
            getDownloadUrlBearer,
            installSkill,
            verifyReceipt,
            verifyReceiptBearer,
          },
        },
      ],
    }).compile();

    controller = module.get(SkillDownloadController);
  });

  it.each(['verifyReceipt', 'downloadSkill'] as const)(
    'accepts a missing credential on %s without making the route public',
    (method) => {
      const context = {
        getClass: () => SkillDownloadController,
        getHandler: () => SkillDownloadController.prototype[method],
      } as unknown as ExecutionContext;

      expect(isPublicRoute(new Reflector(), context)).toBe(false);
      expect(
        Reflect.getMetadata(
          OPTIONAL_AUTH_KEY,
          SkillDownloadController.prototype[method],
        ),
      ).toBe(true);
    },
  );

  it('keeps install on the authenticated guard path', () => {
    const context = {
      getClass: () => SkillDownloadController,
      getHandler: () => SkillDownloadController.prototype.installSkill,
    } as unknown as ExecutionContext;

    expect(isPublicRoute(new Reflector(), context)).toBe(false);
    expect(
      Reflect.getMetadata(
        OPTIONAL_AUTH_KEY,
        SkillDownloadController.prototype.installSkill,
      ),
    ).toBeUndefined();
  });

  it('verifies the receipt inside the current organization', async () => {
    verifyReceipt.mockResolvedValue({
      email: 'buyer@example.com',
      productType: 'skill',
      skills: ['image-gen-pro'],
      valid: true,
    });

    await controller.verifyReceipt(user, { receiptId: 'sk_rcpt_one' });

    expect(verifyReceipt).toHaveBeenCalledWith('org-1', 'sk_rcpt_one');
    expect(verifyReceiptBearer).not.toHaveBeenCalled();
  });

  it('verifies a receipt secret when the caller has no organization', async () => {
    verifyReceiptBearer.mockResolvedValue({
      email: 'buyer@example.com',
      productType: 'skill',
      skills: ['image-gen-pro'],
      valid: true,
    });

    await controller.verifyReceipt(undefined, { receiptId: 'sk_rcpt_one' });

    expect(verifyReceiptBearer).toHaveBeenCalledWith('sk_rcpt_one');
    expect(verifyReceipt).not.toHaveBeenCalled();
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
    expect(getDownloadUrlBearer).not.toHaveBeenCalled();
  });

  it('downloads with the receipt secret when the caller has no organization', async () => {
    getDownloadUrlBearer.mockResolvedValue({
      downloadUrl: 'https://cdn.example',
    });

    await controller.downloadSkill(undefined, {
      receiptId: 'sk_rcpt_one',
      skillSlug: 'image-gen-pro',
    });

    expect(getDownloadUrlBearer).toHaveBeenCalledWith(
      'sk_rcpt_one',
      'image-gen-pro',
    );
    expect(getDownloadUrl).not.toHaveBeenCalled();
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

  it('rejects install without an organization context', async () => {
    await expect(
      controller.installSkill(request, {} as AuthenticatedUser, {
        receiptId: 'sk_rcpt_one',
        skillSlug: 'image-gen-pro',
      }),
    ).rejects.toMatchObject({
      response: {
        detail: 'Organization context is required',
        title: 'Forbidden',
      },
      status: 403,
    });
    expect(installSkill).not.toHaveBeenCalled();
  });
});

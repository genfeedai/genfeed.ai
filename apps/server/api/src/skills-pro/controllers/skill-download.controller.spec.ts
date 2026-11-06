import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { OPTIONAL_AUTH_KEY } from '@api/helpers/decorators/optional-auth.decorator';
import { SkillDownloadController } from '@api/skills-pro/controllers/skill-download.controller';
import type { SkillDownloadService } from '@api/skills-pro/services/skill-download.service';
import { isPublicRoute } from '@libs/decorators/public.decorator';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

describe('SkillDownloadController', () => {
  let controller: SkillDownloadController;
  let installs: Array<{
    organizationId: string;
    receiptId: string;
    skillSlug: string;
  }>;
  let rollbacks: unknown[];
  const user = { organizationId: 'org-1' } as AuthenticatedUser;
  const request = {
    originalUrl: '/v1/skills-pro/install',
  } as Request;
  const entitlement = {
    email: 'buyer@example.com',
    productType: 'skill',
    skills: ['image-gen-pro'],
    valid: true,
  };

  beforeEach(() => {
    installs = [];
    rollbacks = [];

    // Each path answers with where it resolved the receipt, so a result
    // shows whether the organization or the bearer secret was used.
    const skillDownloadService = {
      getDownloadUrl: async (
        organizationId: string,
        receiptId: string,
        skillSlug: string,
      ) => ({
        downloadUrl: `https://cdn.example/${organizationId}/${receiptId}/${skillSlug}`,
      }),
      getDownloadUrlBearer: async (receiptId: string, skillSlug: string) => ({
        downloadUrl: `https://cdn.example/bearer/${receiptId}/${skillSlug}`,
      }),
      installSkill: async (
        organizationId: string,
        receiptId: string,
        skillSlug: string,
      ) => {
        installs.push({ organizationId, receiptId, skillSlug });
        return {
          files: [{ content: 'private', path: 'SKILL.md' }],
          id: 'skill-1',
          instructions: 'private body',
          name: 'Image Gen Pro',
          slug: skillSlug,
          status: 'installed',
          version: '1.0.0',
        };
      },
      rollbackInstalledSkill: async (...args: unknown[]) => {
        rollbacks.push(args);
        return {};
      },
      verifyReceipt: async (organizationId: string, receiptId: string) => ({
        ...entitlement,
        resolvedBy: `${organizationId}:${receiptId}`,
      }),
      verifyReceiptBearer: async (receiptId: string) => ({
        ...entitlement,
        resolvedBy: `bearer:${receiptId}`,
      }),
    };

    controller = new SkillDownloadController(
      skillDownloadService as unknown as SkillDownloadService,
    );
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

  it.each(['installSkill', 'rollbackSkill'] as const)(
    'keeps %s on the authenticated guard path',
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
      ).toBeUndefined();
    },
  );

  it.each([
    ['the current organization', user, 'org-1:sk_rcpt_one'],
    ['the receipt secret without an organization', undefined, 'bearer:sk_rcpt_one'],
    [
      'the receipt secret for a blank organization',
      { organizationId: '  ' } as AuthenticatedUser,
      'bearer:sk_rcpt_one',
    ],
  ])('verifies the receipt through %s', async (_label, caller, resolvedBy) => {
    await expect(
      controller.verifyReceipt(caller, { receiptId: 'sk_rcpt_one' }),
    ).resolves.toEqual({ ...entitlement, resolvedBy });
  });

  it.each([
    [
      'inside the current organization',
      user,
      'https://cdn.example/org-1/sk_rcpt_one/image-gen-pro',
    ],
    [
      'with the receipt secret without an organization',
      undefined,
      'https://cdn.example/bearer/sk_rcpt_one/image-gen-pro',
    ],
  ])('downloads %s', async (_label, caller, downloadUrl) => {
    await expect(
      controller.downloadSkill(caller, {
        receiptId: 'sk_rcpt_one',
        skillSlug: 'image-gen-pro',
      }),
    ).resolves.toEqual({ downloadUrl });
  });

  it('installs into the current organization and returns metadata only', async () => {
    const result = await controller.installSkill(request, user, {
      receiptId: 'sk_rcpt_one',
      skillSlug: 'image-gen-pro',
    });

    expect(installs).toEqual([
      {
        organizationId: 'org-1',
        receiptId: 'sk_rcpt_one',
        skillSlug: 'image-gen-pro',
      },
    ]);
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
    expect(installs).toEqual([]);
  });

  it.each([
    [
      'a user',
      { organizationId: 'org-1' } as AuthenticatedUser,
      'User context is required',
    ],
    [
      'an organization',
      { userId: 'user-1' } as AuthenticatedUser,
      'Organization context is required',
    ],
  ])('rejects rollback without %s context', async (_label, caller, detail) => {
    await expect(
      controller.rollbackSkill(request, caller, {
        skillSlug: 'image-gen-pro',
        versionId: 'version-1',
      }),
    ).rejects.toMatchObject({
      response: { detail, title: 'Forbidden' },
      status: 403,
    });
    expect(rollbacks).toEqual([]);
  });
});

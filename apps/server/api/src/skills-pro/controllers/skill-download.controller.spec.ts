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
  let installations: unknown[];
  const user = { organizationId: 'org-1' } as AuthenticatedUser;
  const request = {
    originalUrl: '/v1/skills-pro/install',
  } as Request;

  // Each answer names the path that resolved it: the organization-scoped
  // lookup, or the receipt-secret (bearer) lookup.
  const receipt = (via: string) => ({
    email: 'buyer@example.com',
    productType: 'skill',
    skills: ['image-gen-pro'],
    valid: true,
    via,
  });

  beforeEach(() => {
    installations = [];
    controller = new SkillDownloadController({
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
        installations.push({ organizationId, receiptId, skillSlug });
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
      verifyReceipt: async (organizationId: string, receiptId: string) =>
        receipt(`${organizationId}:${receiptId}`),
      verifyReceiptBearer: async (receiptId: string) =>
        receipt(`bearer:${receiptId}`),
    } as unknown as SkillDownloadService);
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

  it('verifies the receipt inside the current organization', async () => {
    await expect(
      controller.verifyReceipt(user, { receiptId: 'sk_rcpt_one' }),
    ).resolves.toMatchObject({ via: 'org-1:sk_rcpt_one' });
  });

  it('verifies a receipt secret when the caller has no organization', async () => {
    await expect(
      controller.verifyReceipt(undefined, { receiptId: 'sk_rcpt_one' }),
    ).resolves.toMatchObject({ via: 'bearer:sk_rcpt_one' });
  });

  it('downloads only inside the current organization', async () => {
    await expect(
      controller.downloadSkill(user, {
        receiptId: 'sk_rcpt_one',
        skillSlug: 'image-gen-pro',
      }),
    ).resolves.toEqual({
      downloadUrl: 'https://cdn.example/org-1/sk_rcpt_one/image-gen-pro',
    });
  });

  it('downloads with the receipt secret when the caller has no organization', async () => {
    await expect(
      controller.downloadSkill(undefined, {
        receiptId: 'sk_rcpt_one',
        skillSlug: 'image-gen-pro',
      }),
    ).resolves.toEqual({
      downloadUrl: 'https://cdn.example/bearer/sk_rcpt_one/image-gen-pro',
    });
  });

  it('returns a metadata-only serialized installation result', async () => {
    const result = await controller.installSkill(request, user, {
      receiptId: 'sk_rcpt_one',
      skillSlug: 'image-gen-pro',
    });

    expect(installations).toEqual([
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
    expect(installations).toEqual([]);
  });
});

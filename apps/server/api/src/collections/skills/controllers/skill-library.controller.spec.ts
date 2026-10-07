import type { AuthenticatedUser as PolicyUser } from '@api/auth/interfaces/authenticated-user.interface';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { getTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { testId as policyTestId } from '@helpers/testing/test-id.helper';
import { getTenantContext } from '@libs/prisma/tenant-context';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defer, firstValueFrom } from 'rxjs';
import 'reflect-metadata';
import type { AuthenticatedUser } from '@api/auth/interfaces/authenticated-user.interface';
import { SkillLibraryController } from '@api/collections/skills/controllers/skill-library.controller';
import type { SkillLibraryService } from '@api/collections/skills/services/skill-library.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { BadRequestException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HEADERS_METADATA,
  METHOD_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import type { Request } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const version = {
  id: 'sv1_skill_2',
  versionNumber: 2,
  createdAt: '2026-10-02T12:00:00.000Z',
  contentHash: `sha256:skill-v1:${'a'.repeat(64)}`,
  instructionText: '',
};
const user = {
  userId: 'opaque|canonical',
  organizationId: 'org',
  brandId: 'authenticated-brand',
} as AuthenticatedUser;
const request = {
  originalUrl: '/v1/skills/skill/versions?limit=1',
  headers: { 'x-brand-id': 'client-brand' },
} as unknown as Request;
describe('skill immutable versions controller', () => {
  it('propagates the existing export capability refusal without replacing the actor', async () => {
    const failure = new BadRequestException('Export capability unavailable');
    library.export.mockRejectedValueOnce(failure);
    await expect(controller.exportSkill(user, 'skill')).rejects.toBe(failure);
    expect(library.export).toHaveBeenCalledWith(
      {
        organizationId: user.organizationId,
        brandId: user.brandId,
        userId: user.userId,
      },
      'skill',
    );
  });
  it('keeps exportSkill original identity behind the real owner interceptor', async () => {
    const owner: PolicyUser = {
      id: policyTestId('user'),
      userId: policyTestId('user'),
      organizationId: policyTestId('org'),
      brandId: policyTestId('brand'),
      isSuperAdmin: true,
      isApiKey: true,
      scopes: ['read'],
    };
    const req = {
      method: 'GET',
      query: {} as Record<string, string>,
      user: owner,
      context: {
        ...owner,
        isSuperAdmin: true,
        subscriptionTier: 'pro',
        stripeSubscriptionStatus: 'active',
        hydratedAt: 1,
      },
    };
    const context = req.context;
    const before = { ...context };
    const execution = {
      getClass: () => SkillLibraryController,
      getHandler: () => SkillLibraryController.prototype.exportSkill,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    const interceptor = new TenantContextInterceptor(new Reflector());
    library.export.mockResolvedValue({
      contentHash: 'hash',
      instructions: 'body',
      versionId: 'version',
    });
    const handle = vi.fn(() =>
      defer(async () => {
        expect(getTenantContext()?.organizationId).toBe(owner.organizationId);
        expect(getTenantReadScope()).toBeUndefined();
        return controller.exportSkill(owner, 'skill');
      }),
    );
    req.query = { organizationId: policyTestId('org', 2) };
    expect(() => interceptor.intercept(execution, { handle })).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(handle).not.toHaveBeenCalled();
    expect(library.export).not.toHaveBeenCalled();
    const selections: Array<Record<string, string>> = [
      {},
      { organizationId: owner.organizationId },
    ];
    for (const query of selections) {
      req.query = query;
      const result = await firstValueFrom(
        interceptor.intercept(execution, { handle }),
      );
      expect(library.export).toHaveBeenCalledWith(
        {
          organizationId: owner.organizationId,
          userId: owner.userId,
          brandId: owner.brandId,
        },
        'skill',
      );
      expect(result).toMatchObject({ instructions: 'body' });
      expect(req.user).toBe(owner);
      expect(req.context).toBe(context);
      expect(req.context).toEqual(before);
    }
  });
  const library = {
    listVersions: vi.fn(),
    getVersion: vi.fn(),
    export: vi.fn(),
  };
  const controller = new SkillLibraryController(
    library as unknown as SkillLibraryService,
  );
  beforeEach(() => {
    vi.clearAllMocks();
    library.listVersions.mockResolvedValue({
      items: [version],
      limit: 1,
      hasMore: true,
      nextCursor: 2,
    });
    library.getVersion.mockResolvedValue(version);
  });
  it('uses the real collection envelope with numeric cursor and authenticated actor only', async () => {
    expect(
      await controller.listVersions(request, user, 'skill', { limit: '1' }),
    ).toEqual({
      data: [
        {
          type: 'skill-version',
          id: version.id,
          attributes: {
            versionNumber: 2,
            createdAt: version.createdAt,
            contentHash: version.contentHash,
          },
        },
      ],
      links: {
        self: request.originalUrl,
        cursor: { limit: 1, hasMore: true, nextCursor: 2 },
      },
    });
    expect(library.listVersions).toHaveBeenCalledWith(
      {
        userId: 'opaque|canonical',
        organizationId: 'org',
        brandId: 'authenticated-brand',
      },
      'skill',
      { limit: 1 },
    );
  });
  it('emits effective limits and terminal/empty cursors in the real collection envelope', async () => {
    for (const items of [[version], []]) {
      library.listVersions.mockResolvedValue({
        items,
        limit: 20,
        hasMore: false,
        nextCursor: null,
      });
      const response = await controller.listVersions(
        request,
        user,
        'skill',
        {},
      );
      expect(response).toMatchObject({
        links: {
          self: request.originalUrl,
          cursor: { limit: 20, hasMore: false, nextCursor: null },
        },
      });
      expect(response.data).toHaveLength(items.length);
    }
  });
  it('does not acquire an absent brand from request headers or route', async () => {
    await controller.listVersions(
      request,
      { ...user, brandId: undefined } as unknown as AuthenticatedUser,
      'skill',
      {},
    );
    expect(library.listVersions).toHaveBeenCalledWith(
      { userId: user.userId, organizationId: 'org', brandId: undefined },
      'skill',
      { limit: 20 },
    );
  });
  it('serializes exact detail with actual sv1 identifier and empty body', async () => {
    expect(
      await controller.getVersion(request, user, 'skill', version.id, {}),
    ).toEqual({
      data: {
        type: 'skill-version',
        id: version.id,
        attributes: {
          versionNumber: 2,
          createdAt: version.createdAt,
          contentHash: version.contentHash,
          instructionText: '',
        },
      },
      links: { self: request.originalUrl },
    });
    expect(library.getVersion).toHaveBeenCalledWith(
      expect.objectContaining({ brandId: 'authenticated-brand' }),
      'skill',
      version.id,
    );
  });
  it('rejects untouched invalid query before any service request', async () => {
    for (const query of [
      { brandId: 'injected' },
      { brandSlug: 'injected' },
      { limit: '1e1' },
      { limit: ['1'] },
      { limit: null },
    ]) {
      await expect(
        controller.listVersions(request, user, 'skill', query),
      ).rejects.toThrow(BadRequestException);
    }
    await expect(
      controller.getVersion(request, user, 'skill', version.id, { limit: 1 }),
    ).rejects.toThrow(BadRequestException);
    expect(library.listVersions).not.toHaveBeenCalled();
    expect(library.getVersion).not.toHaveBeenCalled();
  });
  it('preserves canonical errors and never returns null/empty success on denial', async () => {
    library.listVersions.mockRejectedValue(
      new NotFoundException('Skill version'),
    );
    library.getVersion.mockRejectedValue(
      new NotFoundException('Skill version'),
    );
    await expect(
      controller.listVersions(request, user, 'skill', {}),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.getVersion(request, user, 'skill', version.id, {}),
    ).rejects.toThrow(NotFoundException);
    await expect(
      controller.listVersions(request, { ...user, userId: '' }, 'skill', {}),
    ).rejects.toMatchObject({ status: 403 });
  });
  it('retains guard and private no-store headers on exactly two GET routes', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, SkillLibraryController),
    ).toHaveLength(1);
    for (const method of ['listVersions', 'getVersion'] as const) {
      const handler = SkillLibraryController.prototype[method];
      expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(0);
      expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe(
        method === 'listVersions' ? ':id/versions' : ':id/versions/:versionId',
      );
      expect(Reflect.getMetadata(HEADERS_METADATA, handler)).toEqual(
        expect.arrayContaining([
          { name: 'Cache-Control', value: 'private,no-store' },
          { name: 'Vary', value: 'Cookie,Authorization' },
        ]),
      );
    }
  });
});

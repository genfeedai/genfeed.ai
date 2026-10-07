import type {
  AuthenticatedUser,
  AuthenticatedUser as PolicyUser,
} from '@api/auth/interfaces/authenticated-user.interface';
import { StudioGenerateDraftsController } from '@api/collections/studio-generate-drafts/controllers/studio-generate-drafts.controller';
import type { UpsertStudioGenerateDraftDto } from '@api/collections/studio-generate-drafts/dto/upsert-studio-generate-draft.dto';
import type { StudioGenerateDraftsService } from '@api/collections/studio-generate-drafts/services/studio-generate-drafts.service';
import { TenantContextInterceptor } from '@api/helpers/interceptors/tenant-context/tenant-context.interceptor';
import { getTenantReadScope } from '@api/helpers/interceptors/tenant-context/tenant-read-scope.context';
import { testId as policyTestId } from '@helpers/testing/test-id.helper';
import { getTenantContext } from '@libs/prisma/tenant-context';
import type { ExecutionContext } from '@nestjs/common';
import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { defer, firstValueFrom } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_request: unknown, _serializer: unknown, data: unknown) => ({ data }),
  ),
}));

const user = {
  brandId: 'brand-1',
  id: 'session-user-id',
  organizationId: 'org-1',
  userId: 'opaque-user-id',
} as AuthenticatedUser;

const request = { originalUrl: '/studio-generate-drafts/current' } as never;

const dto: UpsertStudioGenerateDraftDto = {
  attachments: [],
  brandId: 'brand-routed',
  knowledgeSelection: {},
  prompt: 'Draft prompt',
  references: [],
  settingsByType: {},
  type: 'image',
};

describe('StudioGenerateDraftsController', () => {
  it('keeps findCurrent original identity behind the real owner interceptor', async () => {
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
      getClass: () => StudioGenerateDraftsController,
      getHandler: () => StudioGenerateDraftsController.prototype.findCurrent,
      switchToHttp: () => ({ getRequest: () => req }),
    } as unknown as ExecutionContext;
    const interceptor = new TenantContextInterceptor(new Reflector());
    service.findCurrent.mockResolvedValue(null);
    const handle = vi.fn(() =>
      defer(async () => {
        expect(getTenantContext()?.organizationId).toBe(owner.organizationId);
        expect(getTenantReadScope()).toBeUndefined();
        return controller.findCurrent(
          req as unknown as Request,
          owner,
          'tab-brand',
        );
      }),
    );
    req.query = { organizationId: policyTestId('org', 2) };
    expect(() => interceptor.intercept(execution, { handle })).toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(handle).not.toHaveBeenCalled();
    expect(service.findCurrent).not.toHaveBeenCalled();
    const selections: Array<Record<string, string>> = [
      {},
      { organizationId: owner.organizationId },
    ];
    for (const query of selections) {
      req.query = query;
      const result = await firstValueFrom(
        interceptor.intercept(execution, { handle }),
      );
      expect(service.findCurrent).toHaveBeenCalledWith({
        organizationId: owner.organizationId,
        userId: owner.userId,
        brandId: 'tab-brand',
      });
      expect(result).toEqual({ data: null });
      expect(req.user).toBe(owner);
      expect(req.context).toBe(context);
      expect(req.context).toEqual(before);
    }
  });
  const service = { findCurrent: vi.fn(), upsertCurrent: vi.fn() };
  let controller: StudioGenerateDraftsController;

  beforeEach(() => {
    vi.clearAllMocks();
    controller = new StudioGenerateDraftsController(
      service as unknown as StudioGenerateDraftsService,
    );
  });

  it('returns an empty document when the user has no draft for the brand', async () => {
    service.findCurrent.mockResolvedValueOnce(null);

    await expect(
      controller.findCurrent(request, user, 'brand-routed'),
    ).resolves.toEqual({
      data: null,
    });
    // The tab's brand wins over the member's last-selected brand.
    expect(service.findCurrent).toHaveBeenCalledWith({
      brandId: 'brand-routed',
      organizationId: 'org-1',
      userId: 'opaque-user-id',
    });
  });

  it('derives write ownership only from the authenticated context', async () => {
    service.upsertCurrent.mockResolvedValueOnce({ id: 'draft-1', ...dto });

    await controller.upsertCurrent(request, user, dto);

    expect(service.upsertCurrent).toHaveBeenCalledWith(dto, {
      brandId: 'brand-routed',
      organizationId: 'org-1',
      userId: 'opaque-user-id',
    });
  });

  it('requires the requesting tab to name its brand', async () => {
    await expect(
      controller.findCurrent(request, user, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      controller.upsertCurrent(request, user, { ...dto, brandId: ' ' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.findCurrent).not.toHaveBeenCalled();
    expect(service.upsertCurrent).not.toHaveBeenCalled();
  });

  it('rejects a repeated brand query with a 400 instead of a crash', async () => {
    await expect(
      controller.findCurrent(request, user, ['brand-a', 'brand-b']),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.findCurrent).not.toHaveBeenCalled();
  });

  it('requires an authenticated organization', async () => {
    await expect(
      controller.upsertCurrent(request, { ...user, organizationId: '' }, dto),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(service.upsertCurrent).not.toHaveBeenCalled();
  });
});

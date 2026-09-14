import 'reflect-metadata';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandOsRevisionsController } from '@api/collections/brands/controllers/brand-os-revisions.controller';
import type { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { MemberRole } from '@genfeedai/contracts';
import { buildBrandKitDraftFromBrand } from '@genfeedai/helpers';
import { BrandOsRevisionSerializer } from '@genfeedai/serializers';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import type { Request } from 'express';

const request = {
  originalUrl: '/v1/brands/brand-1/brand-os/revisions',
} as Request;
const user = { id: 'canonical-user-1', organizationId: 'org-1' } as User;
const content = buildBrandKitDraftFromBrand({ id: 'brand-1', label: 'Acme' });
const revision = {
  approvedAt: null,
  approvedById: null,
  brandId: 'brand-1',
  content,
  createdAt: '2026-09-14T10:00:00.000Z',
  exportSchemaVersion: '1',
  id: 'rev-1',
  organizationId: 'org-1',
  status: 'DRAFT',
  updatedAt: '2026-09-14T10:00:00.000Z',
  version: 1,
};

function harness() {
  const service = {
    approve: vi.fn().mockResolvedValue(revision),
    create: vi.fn().mockResolvedValue(revision),
    get: vi.fn().mockResolvedValue(revision),
    list: vi.fn().mockResolvedValue([revision]),
    update: vi.fn().mockResolvedValue(revision),
  };
  return {
    controller: new BrandOsRevisionsController(
      service as unknown as BrandOsRevisionsService,
    ),
    service,
  };
}

describe('BrandOsRevisionsController', () => {
  afterEach(() => vi.restoreAllMocks());

  it('restricts mutations to owner/admin and guards every route with membership authorization', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, BrandOsRevisionsController),
    ).toContain(RolesGuard);
    for (const method of ['create', 'update', 'approve'] as const) {
      expect(
        Reflect.getMetadata(
          ROLES_KEY,
          BrandOsRevisionsController.prototype[method],
        ),
      ).toEqual([MemberRole.OWNER, MemberRole.ADMIN]);
    }
  });

  it('delegates scoped reads and serializes revision collections and details', async () => {
    const { controller, service } = harness();
    const serialize = vi.spyOn(BrandOsRevisionSerializer, 'serialize');
    await controller.list(request, user, 'brand-1');
    expect(service.list).toHaveBeenCalledWith('org-1', 'brand-1');
    expect(serialize).toHaveBeenCalledWith([revision]);
    await controller.get(request, user, 'brand-1', 'rev-1');
    expect(service.get).toHaveBeenCalledWith('org-1', 'brand-1', 'rev-1');
    expect(serialize).toHaveBeenCalledWith(revision);
  });

  it('forwards concurrency tokens and the canonical approval user ID', async () => {
    const { controller, service } = harness();
    await controller.update(request, user, 'brand-1', 'rev-1', {
      content,
      updatedAt: revision.updatedAt,
    });
    expect(service.update).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'rev-1',
      content,
      revision.updatedAt,
    );
    await controller.approve(request, user, 'brand-1', 'rev-1', {
      updatedAt: revision.updatedAt,
    });
    expect(service.approve).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
      'rev-1',
      'canonical-user-1',
      revision.updatedAt,
    );
  });

  it('rejects missing tenant context before any service access', async () => {
    const { controller, service } = harness();
    await expect(
      controller.list(request, { id: 'user-1' } as User, 'brand-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.list).not.toHaveBeenCalled();
  });
});

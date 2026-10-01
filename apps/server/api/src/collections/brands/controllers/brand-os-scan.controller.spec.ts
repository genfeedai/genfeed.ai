import 'reflect-metadata';
import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { BrandOsScanController } from '@api/collections/brands/controllers/brand-os-scan.controller';
import type { BrandOsScanService } from '@api/collections/brands/services/brand-os-scan.service';
import { ROLES_KEY } from '@api/helpers/decorators/roles/roles.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { MemberRole } from '@genfeedai/contracts';
import { BrandOnboardingScanSerializer } from '@genfeedai/serializers';
import { ForbiddenException } from '@nestjs/common';
import {
  GUARDS_METADATA,
  HTTP_CODE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants';
import type { Request } from 'express';

const request = { originalUrl: '/brands/brand-1/brand-os/scan' } as Request;
const user = { id: 'user-1', organizationId: 'org-1' } as User;
const scan = {
  id: '1254ff7f-367d-4cda-af62-1c666a73fc8f',
  brandId: 'brand-1',
  status: 'running',
  url: 'https://acme.example/',
  startedAt: '2026-10-01T10:00:00.000Z',
};
function harness() {
  const service = {
    start: vi.fn().mockResolvedValue(scan),
    get: vi.fn().mockResolvedValue(null),
  };
  return {
    service,
    controller: new BrandOsScanController(
      service as unknown as BrandOsScanService,
    ),
  };
}
describe('BrandOsScanController', () => {
  afterEach(() => vi.restoreAllMocks());
  it('guards membership, restricts POST to owners/admins and returns HTTP200', () => {
    expect(Reflect.getMetadata(PATH_METADATA, BrandOsScanController)).toBe(
      'brands/:id/brand-os/scan',
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, BrandOsScanController),
    ).toContain(RolesGuard);
    expect(
      Reflect.getMetadata(ROLES_KEY, BrandOsScanController.prototype.start),
    ).toEqual([MemberRole.OWNER, MemberRole.ADMIN]);
    expect(
      Reflect.getMetadata(ROLES_KEY, BrandOsScanController.prototype.get),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata(
        HTTP_CODE_METADATA,
        BrandOsScanController.prototype.start,
      ),
    ).toBe(200);
  });
  it('delegates scoped URL/UUID and uses the canonical serializer including absence', async () => {
    const { controller, service } = harness();
    const serialize = vi.spyOn(BrandOnboardingScanSerializer, 'serialize');
    await controller.start(request, user, 'brand-1', {
      url: scan.url,
      requestId: scan.id,
    });
    expect(service.start).toHaveBeenCalledWith({
      organizationId: 'org-1',
      brandId: 'brand-1',
      url: scan.url,
      requestId: scan.id,
    });
    expect(serialize).toHaveBeenCalledWith(scan);
    const response = await controller.get(request, user, 'brand-1');
    expect(service.get).toHaveBeenCalledWith('org-1', 'brand-1');
    expect(serialize).toHaveBeenCalledWith(null);
    expect(response).toMatchObject({ data: null });
    expect(JSON.stringify(response)).not.toContain('baseline');
  });
  it('rejects missing organization before any service call', async () => {
    const { controller, service } = harness();
    await expect(
      controller.get(request, { id: 'user' } as User, 'brand-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      controller.start(request, { id: 'user' } as User, 'brand-1', {
        url: scan.url,
        requestId: scan.id,
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.get).not.toHaveBeenCalled();
    expect(service.start).not.toHaveBeenCalled();
  });
});

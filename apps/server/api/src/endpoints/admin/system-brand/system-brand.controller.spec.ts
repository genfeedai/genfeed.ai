import { SYSTEM_BRAND_ID } from '@api/collections/brands/services/system-brand.service';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { hashBrandGenerationRulesReviewV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import type { BrandGenerationRulesV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { getTenantContext } from '@libs/prisma/tenant-context';
import { ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { SystemBrandController } from './system-brand.controller';

vi.mock('@api/helpers/decorators/user/current-user.decorator', () => ({
  CurrentUser:
    () => (_target: unknown, _key: string, descriptor: PropertyDescriptor) =>
      descriptor,
}));
vi.mock('@api/helpers/utils/response/response.util', () => ({
  serializeSingle: vi.fn(
    (_req: unknown, _serializer: unknown, item: unknown) => ({
      data: item,
    }),
  ),
}));

const request = { url: 'https://api.genfeed.ai/admin/system-brand' } as never;
const revision = { id: 'rev-1', status: 'DRAFT' };
const rules: BrandGenerationRulesV1 = {
  assets: [],
  avoid: [],
  evidence: [],
  examples: [],
  facts: [],
  mandatory: [],
  palette: [],
  schemaVersion: 1,
  typography: [],
};

function setup() {
  const tenants: Array<string | undefined> = [];
  const track = () => {
    tenants.push(getTenantContext()?.organizationId);
    return Promise.resolve(revision);
  };
  const systemBrand = { ensure: vi.fn().mockResolvedValue({ revision }) };
  const revisions = {
    approve: vi.fn(track),
    get: vi.fn().mockResolvedValue({ content: { generationRules: rules } }),
    update: vi.fn(track),
  };
  const controller = new SystemBrandController(
    systemBrand as never,
    revisions as never,
  );
  return { controller, revisions, systemBrand, tenants };
}

describe('SystemBrandController', () => {
  it('is reachable only by an allow-listed platform admin', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      SystemBrandController,
    ) as unknown[];
    expect(guards).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });

  it('creates the system brand on first read and returns its live revision', async () => {
    const { controller, systemBrand } = setup();
    await expect(controller.get(request)).resolves.toEqual({ data: revision });
    expect(systemBrand.ensure).toHaveBeenCalledTimes(1);
  });

  it('edits the system kit inside the system organization only', async () => {
    const { controller, revisions, tenants } = setup();
    const content = { fields: {} } as never;
    await controller.update(request, 'rev-1', {
      content,
      updatedAt: '2026-10-14T00:00:00.000Z',
    });
    expect(revisions.update).toHaveBeenCalledWith(
      SYSTEM_WORKFLOW_PRINCIPAL_ID,
      SYSTEM_BRAND_ID,
      'rev-1',
      content,
      '2026-10-14T00:00:00.000Z',
    );
    expect(tenants).toEqual([SYSTEM_WORKFLOW_PRINCIPAL_ID]);
  });

  it('approves as the calling admin, never as the system principal', async () => {
    const { controller, revisions, tenants } = setup();
    await controller.approve(
      request,
      { id: 'auth_1', userId: 'db_user_1' } as never,
      'rev-1',
      { updatedAt: '2026-10-14T00:00:00.000Z' },
    );
    expect(revisions.approve).toHaveBeenCalledWith(
      SYSTEM_WORKFLOW_PRINCIPAL_ID,
      SYSTEM_BRAND_ID,
      'rev-1',
      'db_user_1',
      '2026-10-14T00:00:00.000Z',
      hashBrandGenerationRulesReviewV1(rules),
    );
    expect(tenants).toEqual([SYSTEM_WORKFLOW_PRINCIPAL_ID]);
  });

  it('approves a kit without saved rules with no rules digest', async () => {
    const { controller, revisions } = setup();
    revisions.get.mockResolvedValue({ content: {} });
    await controller.approve(
      request,
      { id: 'auth_1', userId: 'db_user_1' } as never,
      'rev-1',
      { updatedAt: '2026-10-14T00:00:00.000Z' },
    );
    expect(revisions.approve).toHaveBeenCalledWith(
      SYSTEM_WORKFLOW_PRINCIPAL_ID,
      SYSTEM_BRAND_ID,
      'rev-1',
      'db_user_1',
      '2026-10-14T00:00:00.000Z',
      undefined,
    );
  });

  it('refuses to approve without a user identity', async () => {
    const { controller, revisions } = setup();
    await expect(
      controller.approve(request, {} as never, 'rev-1', {
        updatedAt: '2026-10-14T00:00:00.000Z',
      }),
    ).rejects.toThrow(ForbiddenException);
    expect(revisions.approve).not.toHaveBeenCalled();
  });
});

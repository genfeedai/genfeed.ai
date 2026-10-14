import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import {
  SYSTEM_BRAND_ID,
  SystemBrandService,
} from '@api/collections/brands/services/system-brand.service';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { IBrandOsRevision } from '@genfeedai/contracts/interfaces';
import { getTenantContext } from '@libs/prisma/tenant-context';
import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const revision = { id: 'draft-1', status: 'DRAFT' } as IBrandOsRevision;

function setup(options: {
  createError?: unknown;
  existing?: Array<{ id: string } | null>;
}) {
  const findFirst = vi.fn();
  for (const found of options.existing ?? [{ id: SYSTEM_BRAND_ID }])
    findFirst.mockResolvedValueOnce(found);
  const create = options.createError
    ? vi.fn().mockRejectedValue(options.createError)
    : vi.fn().mockResolvedValue({ id: SYSTEM_BRAND_ID });
  const tenantDuringBaseline: Array<string | undefined> = [];
  const ensureBaselineDraft = vi.fn(async () => {
    tenantDuringBaseline.push(getTenantContext()?.organizationId);
    return revision;
  });
  const service = new SystemBrandService(
    { brand: { create, findFirst } } as unknown as PrismaService,
    { ensureBaselineDraft } as unknown as BrandOsRevisionsService,
  );
  return {
    create,
    ensureBaselineDraft,
    findFirst,
    service,
    tenantDuringBaseline,
  };
}

describe('SystemBrandService', () => {
  it('creates nothing when the system brand exists and returns its live revision', async () => {
    const { create, ensureBaselineDraft, service } = setup({});
    await expect(service.ensure()).resolves.toEqual({
      brandId: SYSTEM_BRAND_ID,
      organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      revision,
    });
    expect(create).not.toHaveBeenCalled();
    expect(ensureBaselineDraft).toHaveBeenCalledWith(
      SYSTEM_WORKFLOW_PRINCIPAL_ID,
      SYSTEM_BRAND_ID,
    );
  });

  it('creates the brand under the system organization and seeds the default kit draft', async () => {
    const { create, ensureBaselineDraft, findFirst, service } = setup({
      existing: [null],
    });
    await service.ensure();
    expect(findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        id: SYSTEM_BRAND_ID,
        isDeleted: false,
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      },
    });
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: SYSTEM_BRAND_ID,
        label: 'Genfeed',
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      }),
    });
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(
      ensureBaselineDraft.mock.invocationCallOrder[0],
    );
  });

  it('never approves anything', async () => {
    const { ensureBaselineDraft, service } = setup({});
    const result = await service.ensure();
    expect(result.revision.status).toBe('DRAFT');
    expect(ensureBaselineDraft).toHaveBeenCalledTimes(1);
  });

  it('accepts the brand a concurrent first use created', async () => {
    const { service } = setup({
      createError: { code: 'P2002' },
      existing: [null, { id: SYSTEM_BRAND_ID }],
    });
    await expect(service.ensure()).resolves.toMatchObject({
      brandId: SYSTEM_BRAND_ID,
    });
  });

  it('refuses a unique conflict that left no live brand (a deleted row owns the id)', async () => {
    const { ensureBaselineDraft, service } = setup({
      createError: { code: 'P2002' },
      existing: [null, null],
    });
    await expect(service.ensure()).rejects.toThrow(ConflictException);
    expect(ensureBaselineDraft).not.toHaveBeenCalled();
  });

  it('surfaces any other creation failure unchanged', async () => {
    const failure = new Error('foreign key');
    const { service } = setup({ createError: failure, existing: [null] });
    await expect(service.ensure()).rejects.toBe(failure);
  });

  it('works inside the system organization tenant context, whatever the caller is in', async () => {
    const { service, tenantDuringBaseline } = setup({});
    await service.ensure();
    expect(tenantDuringBaseline).toEqual([SYSTEM_WORKFLOW_PRINCIPAL_ID]);
  });
});

import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminOrganizationBrandOsController } from '@api/endpoints/admin/organization-brands/organization-brand-os.controller';
import { BrandOsRevisionStatus } from '@genfeedai/contracts';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';

const request = { context: { userId: 'operator' } } as never;

function createController(
  existing: Array<{ content: unknown; status: BrandOsRevisionStatus }>,
) {
  const applied: unknown[] = [];
  const approvals: unknown[] = [];
  const brandsService = {
    applyBrandKitDraft: async (
      _brandId: string,
      _organizationId: string,
      dto: unknown,
    ) => {
      applied.push(dto);
      return { appliedFields: ['voiceTone'], preservedFields: [] };
    },
  };
  const revisions = {
    approve: async (...args: unknown[]) => {
      approvals.push(args);
      return {
        approvedAt: '2026-11-13T23:30:00.000Z',
        id: 'rev-1',
        status: BrandOsRevisionStatus.APPROVED,
        version: 1,
      };
    },
    ensureBaselineDraft: async () => ({
      content: {},
      id: 'rev-1',
      status: BrandOsRevisionStatus.DRAFT,
      updatedAt: '2026-11-13T23:00:00.000Z',
    }),
    list: async () => existing,
  };
  const controller = new AdminOrganizationBrandOsController(
    brandsService as never,
    revisions as never,
  );
  return { applied, approvals, controller };
}

describe('admin organization brand os', () => {
  it('requires both IP allow-list and platform super-admin guards', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminOrganizationBrandOsController),
    ).toEqual([IpWhitelistGuard, SuperAdminGuard]);
  });

  it('applies the kit fields, then approves the draft and reports the approved revision', async () => {
    const { applied, approvals, controller } = createController([]);
    const result = await controller.approve(request, 'org-1', 'brand-1', {
      voiceTone: 'Bold and punchy',
    });

    expect(applied).toEqual([
      { fields: { voiceTone: { action: 'accept', value: 'Bold and punchy' } } },
    ]);
    expect(approvals).toHaveLength(1);
    expect(result).toEqual({
      data: {
        appliedFields: ['voiceTone'],
        approvedAt: '2026-11-13T23:30:00.000Z',
        brandId: 'brand-1',
        organizationId: 'org-1',
        preservedFields: [],
        revisionId: 'rev-1',
        status: BrandOsRevisionStatus.APPROVED,
        version: 1,
      },
    });
  });

  it('refuses a brand with an approved or owner-edited revision before writing anything', async () => {
    for (const status of [
      BrandOsRevisionStatus.APPROVED,
      BrandOsRevisionStatus.DRAFT,
    ]) {
      const { applied, approvals, controller } = createController([
        { content: { fields: {} }, status },
      ]);
      await expect(
        controller.approve(request, 'org-1', 'brand-1', { voiceTone: 'Calm' }),
      ).rejects.toThrow('already has a');
      expect(applied).toEqual([]);
      expect(approvals).toEqual([]);
    }
  });

  it('rejects fields outside the kit and an empty body', async () => {
    const { controller } = createController([]);
    await expect(
      controller.approve(request, 'org-1', 'brand-1', { organizationId: 'x' }),
    ).rejects.toThrow('Invalid Brand OS kit fields');
    await expect(
      controller.approve(request, 'org-1', 'brand-1', {}),
    ).rejects.toThrow('Invalid Brand OS kit fields');
  });
});

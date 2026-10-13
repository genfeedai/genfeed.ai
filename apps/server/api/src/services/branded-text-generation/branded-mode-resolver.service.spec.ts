import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { describe, expect, it, vi } from 'vitest';
import { BrandedModeResolverService } from './branded-mode-resolver.service';

const actor = { organizationId: 'org-1', userId: 'user-1' };

function setup(overrides: {
  approved?: { id: string } | null;
  baseline?: { id: string; status: string };
}) {
  const revisions = {
    ensureBaselineDraft: vi
      .fn()
      .mockResolvedValue(
        overrides.baseline ?? { id: 'draft-1', status: 'DRAFT' },
      ),
    findApproved: vi.fn().mockResolvedValue(overrides.approved ?? null),
  };
  const brandAccess = { assert: vi.fn().mockResolvedValue(undefined) };
  const service = new BrandedModeResolverService(
    revisions as unknown as BrandOsRevisionsService,
    brandAccess as unknown as BrandAccessService,
  );
  return { brandAccess, revisions, service };
}

describe('BrandedModeResolverService', () => {
  it('uses the approved revision whenever one exists and creates nothing', async () => {
    const { revisions, service } = setup({ approved: { id: 'rev-1' } });
    await expect(service.resolve(actor, 'brand-1')).resolves.toEqual({
      mode: 'approved_brand',
    });
    expect(revisions.ensureBaselineDraft).not.toHaveBeenCalled();
  });

  it('falls back to the live draft provisionally, pinned by its id', async () => {
    const { revisions, service } = setup({});
    await expect(service.resolve(actor, 'brand-1')).resolves.toEqual({
      draftRevisionId: 'draft-1',
      mode: 'provisional_brand',
    });
    expect(revisions.ensureBaselineDraft).toHaveBeenCalledWith(
      'org-1',
      'brand-1',
    );
  });

  it('treats a revision approved during the lookup as approved', async () => {
    const { service } = setup({
      baseline: { id: 'rev-2', status: 'APPROVED' },
    });
    await expect(service.resolve(actor, 'brand-1')).resolves.toEqual({
      mode: 'approved_brand',
    });
  });

  it('checks brand access before reading or creating any revision', async () => {
    const { brandAccess, revisions, service } = setup({});
    brandAccess.assert.mockRejectedValueOnce(new Error('forbidden'));
    await expect(service.resolve(actor, 'brand-1')).rejects.toThrow(
      'forbidden',
    );
    expect(revisions.findApproved).not.toHaveBeenCalled();
    expect(revisions.ensureBaselineDraft).not.toHaveBeenCalled();
  });
});

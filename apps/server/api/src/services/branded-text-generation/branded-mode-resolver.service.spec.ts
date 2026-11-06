import type { BrandAccessService } from '@api/authorization/brand-access/brand-access.service';
import type { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import type { SystemBrandService } from '@api/collections/brands/services/system-brand.service';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import { describe, expect, it } from 'vitest';
import { BrandedModeResolverService } from './branded-mode-resolver.service';

type Revision = {
  brandId: string;
  id: string;
  organizationId: string;
  status: 'APPROVED' | 'DRAFT';
};

const actor = { organizationId: 'org-1', userId: 'user-1' };
const SYSTEM_BRAND_ID = 'genfeed-system-brand';

/**
 * In-memory brand OS revisions, brand ownership and system brand. Only
 * `brand-1` in `org-1` is accessible; the system brand has no customer owner.
 */
function setup(initial: Revision[] = []) {
  const state = {
    // Simulates another request approving the draft mid-lookup.
    isApprovedDuringLookup: false,
    revisions: [...initial],
    systemBrandError: null as Error | null,
  };
  const find = (
    organizationId: string,
    brandId: string,
    status: Revision['status'],
  ): Revision | null =>
    state.revisions.find(
      (revision) =>
        revision.organizationId === organizationId &&
        revision.brandId === brandId &&
        revision.status === status,
    ) ?? null;
  const revisions = {
    ensureBaselineDraft: async (organizationId: string, brandId: string) => {
      let draft = find(organizationId, brandId, 'DRAFT');
      if (!draft) {
        draft = {
          brandId,
          id: `draft-${state.revisions.length + 1}`,
          organizationId,
          status: 'DRAFT',
        };
        state.revisions.push(draft);
      }
      if (state.isApprovedDuringLookup) draft.status = 'APPROVED';
      return draft;
    },
    findApproved: async (organizationId: string, brandId: string) =>
      find(organizationId, brandId, 'APPROVED'),
  };
  const brandAccess = {
    assert: async (requester: { organizationId: string }, brandId: string) => {
      if (requester.organizationId !== 'org-1' || brandId !== 'brand-1') {
        throw new Error('forbidden');
      }
    },
  };
  const systemBrand = {
    ensure: async () => {
      if (state.systemBrandError) throw state.systemBrandError;
      return {
        brandId: SYSTEM_BRAND_ID,
        organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
      };
    },
  };
  const service = new BrandedModeResolverService(
    revisions as unknown as BrandOsRevisionsService,
    brandAccess as unknown as BrandAccessService,
    systemBrand as unknown as SystemBrandService,
  );
  return { service, state };
}

const approvedRevision: Revision = {
  brandId: 'brand-1',
  id: 'rev-1',
  organizationId: 'org-1',
  status: 'APPROVED',
};

describe('BrandedModeResolverService', () => {
  it('uses the approved revision whenever one exists and creates nothing', async () => {
    const { service, state } = setup([approvedRevision]);
    await expect(service.resolve(actor, 'brand-1')).resolves.toEqual({
      mode: 'approved_brand',
    });
    expect(state.revisions).toEqual([approvedRevision]);
  });

  it('falls back to a baseline draft provisionally, pinned by its id', async () => {
    const { service, state } = setup();
    await expect(service.resolve(actor, 'brand-1')).resolves.toEqual({
      draftRevisionId: 'draft-1',
      mode: 'provisional_brand',
    });
    expect(state.revisions).toEqual([
      {
        brandId: 'brand-1',
        id: 'draft-1',
        organizationId: 'org-1',
        status: 'DRAFT',
      },
    ]);
  });

  it('reuses the existing live draft instead of creating another', async () => {
    const { service, state } = setup();
    await service.resolve(actor, 'brand-1');
    await expect(service.resolve(actor, 'brand-1')).resolves.toEqual({
      draftRevisionId: 'draft-1',
      mode: 'provisional_brand',
    });
    expect(state.revisions).toHaveLength(1);
  });

  it('treats a revision approved during the lookup as approved', async () => {
    const { service, state } = setup();
    state.isApprovedDuringLookup = true;
    await expect(service.resolve(actor, 'brand-1')).resolves.toEqual({
      mode: 'approved_brand',
    });
  });

  it('checks brand access before creating any revision', async () => {
    const { service, state } = setup();
    await expect(service.resolve(actor, 'brand-2')).rejects.toThrow(
      'forbidden',
    );
    expect(state.revisions).toEqual([]);
  });

  describe('system brand', () => {
    it('resolves the Genfeed system brand provisionally for the system principal', async () => {
      const { service, state } = setup();
      await expect(service.resolveSystem()).resolves.toEqual({
        actor: {
          organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          userId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
        },
        brandId: SYSTEM_BRAND_ID,
        draftRevisionId: 'draft-1',
        mode: 'provisional_brand',
      });
      expect(state.revisions).toEqual([
        {
          brandId: SYSTEM_BRAND_ID,
          id: 'draft-1',
          organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          status: 'DRAFT',
        },
      ]);
    });

    it('switches to approved once the owner approved the system kit', async () => {
      const { service } = setup([
        {
          brandId: SYSTEM_BRAND_ID,
          id: 'rev-1',
          organizationId: SYSTEM_WORKFLOW_PRINCIPAL_ID,
          status: 'APPROVED',
        },
      ]);
      await expect(service.resolveSystem()).resolves.toMatchObject({
        brandId: SYSTEM_BRAND_ID,
        mode: 'approved_brand',
      });
    });

    it('fails closed when the system brand cannot be ensured', async () => {
      const { service, state } = setup();
      state.systemBrandError = new Error('unavailable');
      await expect(service.resolveSystem()).rejects.toThrow('unavailable');
      expect(state.revisions).toEqual([]);
    });
  });
});

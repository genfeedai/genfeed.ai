import {
  type BrandAccessActor,
  BrandAccessService,
} from '@api/authorization/brand-access/brand-access.service';
import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import {
  runAsSystemOrganization,
  SystemBrandService,
} from '@api/collections/brands/services/system-brand.service';
import { SYSTEM_WORKFLOW_PRINCIPAL_ID } from '@api/collections/workflows/system-workflow.contract';
import { Injectable } from '@nestjs/common';

export type BrandedModeResolution =
  | { mode: 'approved_brand' }
  | { mode: 'provisional_brand'; draftRevisionId: string };

/** Who generates, and for which brand, when no customer brand is involved. */
export type SystemBrandedGenerationTarget = BrandedModeResolution & {
  actor: BrandAccessActor;
  brandId: string;
};

/**
 * Decides how a branded generation resolves its identity. An approved revision
 * always wins. Otherwise the brand's live DRAFT is used provisionally, creating
 * the Genfeed default style kit first when the brand has no revision at all.
 * The mode is never client-supplied and the choice is pinned by the receipt.
 */
@Injectable()
export class BrandedModeResolverService {
  constructor(
    private readonly revisions: BrandOsRevisionsService,
    private readonly brandAccess: BrandAccessService,
    private readonly systemBrand: SystemBrandService,
  ) {}

  async resolve(
    actor: BrandAccessActor,
    brandId: string,
  ): Promise<BrandedModeResolution> {
    await this.brandAccess.assert(actor, brandId);
    return this.resolveRevision(actor.organizationId, brandId);
  }

  /**
   * Internal generation with no customer brand (system, lifecycle and
   * internal content) runs as the system principal on the Genfeed system
   * brand. The brand is created on first use and stays provisional until its
   * kit is approved once. The caller runs the seam itself inside
   * `runAsSystemOrganization` with `actor`.
   */
  async resolveSystem(): Promise<SystemBrandedGenerationTarget> {
    const { brandId, organizationId } = await this.systemBrand.ensure();
    const mode = await runAsSystemOrganization(() =>
      this.resolveRevision(organizationId, brandId),
    );
    return {
      ...mode,
      actor: { organizationId, userId: SYSTEM_WORKFLOW_PRINCIPAL_ID },
      brandId,
    };
  }

  private async resolveRevision(
    organizationId: string,
    brandId: string,
  ): Promise<BrandedModeResolution> {
    const approved = await this.revisions.findApproved(organizationId, brandId);
    if (approved) return { mode: 'approved_brand' };
    const baseline = await this.revisions.ensureBaselineDraft(
      organizationId,
      brandId,
    );
    return baseline.status === 'APPROVED'
      ? { mode: 'approved_brand' }
      : { draftRevisionId: baseline.id, mode: 'provisional_brand' };
  }
}

import {
  type BrandAccessActor,
  BrandAccessService,
} from '@api/authorization/brand-access/brand-access.service';
import { BrandOsRevisionsService } from '@api/collections/brands/services/brand-os-revisions.service';
import { Injectable } from '@nestjs/common';

export type BrandedModeResolution =
  | { mode: 'approved_brand' }
  | { mode: 'provisional_brand'; draftRevisionId: string };

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
  ) {}

  async resolve(
    actor: BrandAccessActor,
    brandId: string,
  ): Promise<BrandedModeResolution> {
    await this.brandAccess.assert(actor, brandId);
    const approved = await this.revisions.findApproved(
      actor.organizationId,
      brandId,
    );
    if (approved) return { mode: 'approved_brand' };
    const baseline = await this.revisions.ensureBaselineDraft(
      actor.organizationId,
      brandId,
    );
    return baseline.status === 'APPROVED'
      ? { mode: 'approved_brand' }
      : { draftRevisionId: baseline.id, mode: 'provisional_brand' };
  }
}

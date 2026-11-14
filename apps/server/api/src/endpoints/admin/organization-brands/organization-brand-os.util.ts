import { BrandOsRevisionStatus } from '@genfeedai/contracts';
import type { IBrandOsRevision } from '@genfeedai/contracts/interfaces';
import { isGenfeedDefaultKitDraft } from '@genfeedai/helpers';

/**
 * The revision that stops an operator approval: one the brand's owners already
 * approved or edited. Submitted fields reach the brand record, not a stored
 * draft, so approving over such a revision would approve content that does not
 * carry them. A superseded revision and the untouched Genfeed default draft
 * never block.
 */
export function findBlockingBrandOsRevision(
  revisions: readonly IBrandOsRevision[],
): IBrandOsRevision | undefined {
  return revisions.find(
    (revision) =>
      revision.status !== BrandOsRevisionStatus.SUPERSEDED &&
      !(
        revision.status === BrandOsRevisionStatus.DRAFT &&
        isGenfeedDefaultKitDraft(revision.content)
      ),
  );
}

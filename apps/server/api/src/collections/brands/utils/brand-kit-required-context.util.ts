import { measureRequiredBrandContext } from '@api/services/agent-context-assembly/brand-context-budget.util';
import {
  BrandIdentityIntegrityError,
  projectProvisionalBrandIdentitySnapshot,
} from '@api/services/branded-generation-receipts/brand-identity-snapshot-projection.util';
import {
  type BrandRequiredContextReport,
  buildBrandRequiredContextReport,
  formatBrandRequiredContextOverflow,
} from '@api/services/harness/brand-required-context-report.util';
import { projectBrandSnapshotContributions } from '@api/services/harness/branded-generation-compiler';
import { BrandOsRevisionStatus } from '@genfeedai/contracts';
import type {
  IBrandKitDraft,
  IBrandOsRevision,
} from '@genfeedai/contracts/interfaces';
import type { BrandOsRevision, Prisma } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';

type RevisionIdentity = Pick<
  BrandOsRevision,
  'brandId' | 'id' | 'organizationId' | 'version'
>;

/**
 * What every text generation must carry whole (the identity, the voice and
 * the required rules), measured against the shared budget. Null when the kit's
 * identity cannot be read at all: generation then fails with its own
 * integrity code, so there is no count to show.
 */
export function measureBrandKitRequiredTextContext(
  revision: RevisionIdentity,
  content: IBrandKitDraft,
): BrandRequiredContextReport | null {
  let required: ReturnType<typeof projectBrandSnapshotContributions>[0];
  try {
    // The provisional projection reads only these fields of the row; it counts
    // the text of any revision, whatever its status, as if it were approved.
    const snapshot = projectProvisionalBrandIdentitySnapshot(
      {
        ...revision,
        content: content as unknown as Prisma.JsonValue,
        isDeleted: false,
        status: BrandOsRevisionStatus.DRAFT,
      } as BrandOsRevision,
      new Date().toISOString(),
    );
    [required] = projectBrandSnapshotContributions(
      { ...snapshot, approval: 'approved' },
      'text',
    );
  } catch (error) {
    if (error instanceof BrandIdentityIntegrityError) return null;
    throw error;
  }
  return buildBrandRequiredContextReport(
    required,
    measureRequiredBrandContext(required),
  );
}

/**
 * Every text generation carries the identity, the voice and the required
 * rules whole, so a kit whose required text exceeds the shared budget would
 * fail all of them after approval. Refuse it before approval, naming the
 * longest fields. Image and video prompts carry more than text does, so text
 * is the floor.
 */
export function assertBrandKitRequiredTextContextFits(
  row: BrandOsRevision,
  content: IBrandKitDraft,
): void {
  const report = measureBrandKitRequiredTextContext(row, content);
  if (!report || report.overflowCharacters === 0) return;
  throw new ConflictException({
    code: 'brand_kit_required_context_too_long',
    fields: report.fields,
    maxCharacters: report.maxCharacters,
    message: formatBrandRequiredContextOverflow(report),
    overflowCharacters: report.overflowCharacters,
    requiredCharacters: report.requiredCharacters,
  });
}

/**
 * A revision for the editor: the saved text count rides along so the Brand Kit
 * page can show the meter before anyone presses Approve. A superseded revision
 * is history and is never approved, so it carries no count.
 */
export function withRequiredTextContext(
  revision: IBrandOsRevision,
): IBrandOsRevision {
  if (revision.status === BrandOsRevisionStatus.SUPERSEDED) return revision;
  const requiredTextContext = measureBrandKitRequiredTextContext(
    revision,
    revision.content,
  );
  return requiredTextContext ? { ...revision, requiredTextContext } : revision;
}

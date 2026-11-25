import {
  BRAND_CONTEXT_CHARACTER_BUDGET,
  measureRequiredBrandContext,
} from '@api/services/agent-context-assembly/brand-context-budget.util';
import {
  BrandIdentityIntegrityError,
  projectProvisionalBrandIdentitySnapshot,
} from '@api/services/branded-generation-receipts/brand-identity-snapshot-projection.util';
import {
  buildBrandRequiredContextReport,
  formatBrandRequiredContextOverflow,
} from '@api/services/harness/brand-required-context-report.util';
import { projectBrandSnapshotContributions } from '@api/services/harness/branded-generation-compiler';
import type { IBrandKitDraft } from '@genfeedai/contracts/interfaces';
import type { BrandOsRevision, Prisma } from '@genfeedai/prisma';
import { ConflictException } from '@nestjs/common';

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
  let required: ReturnType<typeof projectBrandSnapshotContributions>[0];
  try {
    const snapshot = projectProvisionalBrandIdentitySnapshot(
      { ...row, content: content as unknown as Prisma.JsonValue },
      new Date().toISOString(),
    );
    [required] = projectBrandSnapshotContributions(
      { ...snapshot, approval: 'approved' },
      'text',
    );
  } catch (error) {
    // A kit generation cannot read at all fails with its own integrity code.
    if (error instanceof BrandIdentityIntegrityError) return;
    throw error;
  }
  const requiredCharacters = measureRequiredBrandContext(required);
  if (requiredCharacters <= BRAND_CONTEXT_CHARACTER_BUDGET) return;
  const report = buildBrandRequiredContextReport(required, requiredCharacters);
  throw new ConflictException({
    code: 'brand_kit_required_context_too_long',
    fields: report.fields,
    maxCharacters: report.maxCharacters,
    message: formatBrandRequiredContextOverflow(report),
    overflowCharacters: report.overflowCharacters,
    requiredCharacters: report.requiredCharacters,
  });
}

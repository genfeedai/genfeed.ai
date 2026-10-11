import { BrandRenderEvidenceService } from '@api/services/brand-render-evidence/brand-render-evidence.service';
import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { BrandArtifactVisual } from '@api/services/brand-validation/brand-validation-visual.util';
import { BrandVisualAnalysisService } from '@api/services/brand-validation/brand-visual-analysis.service';
import { BrandedGenerationArtifactMaterialService } from '@api/services/branded-generation-receipts/branded-generation-artifact-material.service';
import { hashBrandArtifactValidationReportV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type {
  BrandedGenerationActorV1,
  BrandedGenerationMutationResultV1,
} from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import type {
  BrandArtifactValidationMaterialV1,
  BrandArtifactValidationReportV1,
  BrandedGenerationReceiptV1,
  BrandIdentitySnapshotV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { ConflictException, Injectable, Optional } from '@nestjs/common';

@Injectable()
export class BrandValidationReceiptService {
  constructor(
    private readonly material: BrandedGenerationArtifactMaterialService,
    private readonly receipts: BrandedGenerationReceiptsService,
    private readonly validator: BrandValidationService,
    @Optional() private readonly visualAnalysis?: BrandVisualAnalysisService,
    @Optional() private readonly renderEvidence?: BrandRenderEvidenceService,
  ) {}

  /**
   * The render manifest of an exported image or video, read against the exact bytes
   * the receipt pinned. Only the platform's own renderers store one; the validator
   * relies on it only when verified.
   */
  private async readRenderEvidence(
    receipt: BrandedGenerationReceiptV1,
    snapshot: BrandIdentitySnapshotV1,
    material: BrandArtifactValidationMaterialV1,
  ) {
    const { artifact } = receipt;
    if (!this.renderEvidence || !artifact || artifact.kind !== 'ingredient')
      return undefined;
    const visual = new BrandArtifactVisual({
      artifact,
      material,
      snapshot,
    });
    if (visual.selection.kind !== 'selected') return undefined;
    return this.renderEvidence.read(
      {
        brandId: receipt.brandId,
        organizationId: receipt.organizationId,
      },
      artifact.id,
      visual.selection.bytes,
    );
  }

  async validateReceipt(
    actor: BrandedGenerationActorV1,
    receiptId: string,
  ): Promise<BrandedGenerationMutationResultV1> {
    const { receipt, material } = await this.material.acquire(actor, receiptId);
    let report: BrandArtifactValidationReportV1 | null = null;
    if (receipt.mode !== 'raw') {
      if (!receipt.artifact || !receipt.snapshot)
        throw new ConflictException('receipt_state_conflict');
      report = await this.validator.validateBrandArtifact(
        {
          snapshot: receipt.snapshot,
          artifact: receipt.artifact,
          material,
        },
        {
          renderEvidence: await this.readRenderEvidence(
            receipt,
            receipt.snapshot,
            material,
          ),
          visualAnalysis: this.visualAnalysis,
        },
      );
    }
    const reportHash =
      report === null ? null : hashBrandArtifactValidationReportV1(report);
    if (
      receipt.state !== 'checking' &&
      (reportHash === null
        ? receipt.validation === null
        : receipt.validation !== null &&
          hashBrandArtifactValidationReportV1(receipt.validation) ===
            reportHash)
    )
      return { receipt, replayed: true };
    const kind = receipt.state === 'checking' ? 'validate' : 'revalidate';
    return this.receipts.recordValidation(
      actor,
      receipt.id,
      {
        operationKey: `brand-validation:${kind}:${reportHash ?? 'raw'}`,
        expectedRevision: receipt.revision,
      },
      kind,
      report,
    );
  }
}

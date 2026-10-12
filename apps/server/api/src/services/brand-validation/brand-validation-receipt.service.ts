import { BrandRenderEvidenceService } from '@api/services/brand-render-evidence/brand-render-evidence.service';
import { BrandFactCheckService } from '@api/services/brand-validation/brand-fact-check.service';
import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { BrandArtifactVisual } from '@api/services/brand-validation/brand-validation-visual.util';
import { hasPendingBrandVisionChecks } from '@api/services/brand-validation/brand-vision-pending.util';
import { BrandVisionQueueService } from '@api/services/brand-validation/brand-vision-queue.service';
import { BrandVisualAnalysisService } from '@api/services/brand-validation/brand-visual-analysis.service';
import type { BrandVisualAnalysis } from '@api/services/brand-validation/brand-visual-analysis.types';
import { BrandDeferredVisualAnalysis } from '@api/services/brand-validation/brand-visual-analysis-deferral';
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
import { LoggerService } from '@libs/logger/logger.service';
import { getErrorMessage } from '@libs/utils/error/get-error-message.util';
import { ConflictException, Injectable, Optional } from '@nestjs/common';

@Injectable()
export class BrandValidationReceiptService {
  constructor(
    private readonly material: BrandedGenerationArtifactMaterialService,
    private readonly receipts: BrandedGenerationReceiptsService,
    private readonly validator: BrandValidationService,
    @Optional() private readonly visualAnalysis?: BrandVisualAnalysisService,
    @Optional() private readonly renderEvidence?: BrandRenderEvidenceService,
    @Optional() private readonly visionQueue?: BrandVisionQueueService,
    @Optional() private readonly logger?: LoggerService,
    @Optional() private readonly factChecker?: BrandFactCheckService,
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

  /**
   * Validates a receipt's artifact in the request path. A paid reading of the pixels (OCR,
   * logo or product placement) can wait minutes for a cold model, so it never runs here: when
   * the platform switch is on, those checks are left `unknown` (`visual_analysis_pending`) and a
   * background job finishes them (`completeVisionChecks`). Without a queue nothing is deferred
   * and the readable checks stay as the text pass left them.
   */
  async validateReceipt(
    actor: BrandedGenerationActorV1,
    receiptId: string,
  ): Promise<BrandedGenerationMutationResultV1> {
    const deferral =
      this.visualAnalysis && this.visionQueue
        ? new BrandDeferredVisualAnalysis(this.visualAnalysis)
        : undefined;
    const result = await this.validate(actor, receiptId, deferral);
    if (deferral?.isRequested && hasPendingBrandVisionChecks(result.receipt))
      await this.offerVisionJob(actor, result.receipt.id);
    return result;
  }

  /**
   * The background step: reads the pixels with the vision models (each prediction waits for a
   * cold start) and revalidates the receipt with what they proved. A receipt with no pending
   * check is left alone, so a duplicate job pays nothing. A reading that cannot complete leaves
   * its checks `unknown` (`visual_analysis_unavailable`); the spend is recorded either way.
   */
  async completeVisionChecks(
    actor: BrandedGenerationActorV1,
    receiptId: string,
  ): Promise<BrandedGenerationMutationResultV1 | null> {
    if (!this.visualAnalysis) return null;
    const current = await this.receipts.get(actor, receiptId);
    if (!hasPendingBrandVisionChecks(current))
      return { receipt: current, replayed: true };
    return this.validate(actor, receiptId, this.visualAnalysis);
  }

  /** The receipt is already validated: a job that cannot be queued leaves it pending, never failed. */
  private async offerVisionJob(
    actor: BrandedGenerationActorV1,
    receiptId: string,
  ): Promise<void> {
    try {
      await this.visionQueue?.enqueue({
        actorId: actor.actorId,
        brandId: actor.brandId,
        organizationId: actor.organizationId,
        receiptId,
      });
    } catch (error: unknown) {
      this.logger?.warn(
        `${this.constructor.name} brand vision job was not queued: ${getErrorMessage(error)}`,
        { receiptId },
      );
    }
  }

  private async validate(
    actor: BrandedGenerationActorV1,
    receiptId: string,
    visualAnalysis: BrandVisualAnalysis | undefined,
  ): Promise<BrandedGenerationMutationResultV1> {
    const { receipt, material } = await this.material.acquire(actor, receiptId);
    const { factChecker } = this;
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
          visualAnalysis,
          factCheck: factChecker
            ? (request) => factChecker.check(actor, request)
            : undefined,
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

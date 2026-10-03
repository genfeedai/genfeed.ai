import { BrandValidationService } from '@api/services/brand-validation/brand-validation.service';
import { BrandedGenerationArtifactMaterialService } from '@api/services/branded-generation-receipts/branded-generation-artifact-material.service';
import { hashBrandArtifactValidationReportV1 } from '@api/services/branded-generation-receipts/branded-generation-hash.util';
import { BrandedGenerationReceiptsService } from '@api/services/branded-generation-receipts/branded-generation-receipts.service';
import type {
  BrandedGenerationActorV1,
  BrandedGenerationMutationResultV1,
} from '@api/services/branded-generation-receipts/branded-generation-receipts.types';
import type { BrandArtifactValidationReportV1 } from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
import { ConflictException, Injectable } from '@nestjs/common';

@Injectable()
export class BrandValidationReceiptService {
  constructor(
    private readonly material: BrandedGenerationArtifactMaterialService,
    private readonly receipts: BrandedGenerationReceiptsService,
    private readonly validator: BrandValidationService,
  ) {}

  async validateReceipt(
    actor: BrandedGenerationActorV1,
    receiptId: string,
  ): Promise<BrandedGenerationMutationResultV1> {
    const { receipt, material } = await this.material.acquire(actor, receiptId);
    let report: BrandArtifactValidationReportV1 | null = null;
    if (receipt.mode !== 'raw') {
      if (!receipt.artifact || !receipt.snapshot)
        throw new ConflictException('receipt_state_conflict');
      report = await this.validator.validateBrandArtifact({
        snapshot: receipt.snapshot,
        artifact: receipt.artifact,
        material,
      });
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

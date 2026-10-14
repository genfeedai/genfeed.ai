import { HttpException } from '@nestjs/common';

export interface BrandedGenerationProviderAttempt {
  model: string;
}

/**
 * A branded generation stopped with a stable reason. The saved receipt id
 * travels in `meta.brandedGenerationReceiptId` so the client can open the
 * receipt that explains what happened. `providerAttempt` is set when the
 * provider was already called: that cost is known and billable even though the
 * request failed.
 */
export class BrandedGenerationBlockedException extends HttpException {
  public readonly brandedGenerationReceiptId: string;
  public readonly isBillableFailure: boolean;
  public readonly providerAttempt: BrandedGenerationProviderAttempt | null;
  public readonly reasonCode: string;

  constructor(
    status: number,
    reasonCode: string,
    receiptId: string,
    providerAttempt: BrandedGenerationProviderAttempt | null = null,
  ) {
    super(
      {
        code: reasonCode,
        detail: `Branded generation stopped: ${reasonCode}`,
        title: 'Branded generation stopped',
      },
      status,
    );
    this.brandedGenerationReceiptId = receiptId;
    this.isBillableFailure = providerAttempt !== null;
    this.providerAttempt = providerAttempt;
    this.reasonCode = reasonCode;
  }
}

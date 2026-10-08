import { HttpException } from '@nestjs/common';

/**
 * A branded generation stopped with a stable reason. The saved receipt id
 * travels in `meta.brandedGenerationReceiptId` so the client can open the
 * receipt that explains what happened.
 */
export class BrandedGenerationBlockedException extends HttpException {
  public readonly brandedGenerationReceiptId: string;
  public readonly reasonCode: string;

  constructor(status: number, reasonCode: string, receiptId: string) {
    super(
      {
        code: reasonCode,
        detail: `Branded generation stopped: ${reasonCode}`,
        title: 'Branded generation stopped',
      },
      status,
    );
    this.brandedGenerationReceiptId = receiptId;
    this.reasonCode = reasonCode;
  }
}

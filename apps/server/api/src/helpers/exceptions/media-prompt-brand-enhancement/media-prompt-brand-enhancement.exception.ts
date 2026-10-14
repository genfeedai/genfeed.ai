import { MEDIA_PROMPT_BRAND_ENHANCEMENT_FAILED_ERROR_CODE } from '@genfeedai/contracts/constants';
import { HttpException, HttpStatus } from '@nestjs/common';

export type MediaPromptBrandEnhancementStage =
  | 'brand_identity'
  | 'brief'
  | 'provider'
  | 'response'
  | 'receipt';

/**
 * Brand prompt enhancement for a media generation failed. The request stops
 * before any provider call or credit use; it is never degraded to the raw
 * prompt. The 502 carries a stable code so a client can offer an explicit
 * "generate without brand" retry (`brandMode: 'raw'`).
 */
export class MediaPromptBrandEnhancementException extends HttpException {
  public readonly stage: MediaPromptBrandEnhancementStage;

  constructor(stage: MediaPromptBrandEnhancementStage) {
    const detail = `Brand prompt enhancement failed at the ${stage.replace('_', ' ')} step. Nothing was generated and no credits were used.`;
    super(
      {
        code: MEDIA_PROMPT_BRAND_ENHANCEMENT_FAILED_ERROR_CODE,
        detail,
        title: 'Brand prompt enhancement failed',
      },
      HttpStatus.BAD_GATEWAY,
    );
    this.message = detail;
    this.stage = stage;
  }
}

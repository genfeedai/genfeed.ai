import { MediaPromptBrandEnhancementException } from '@api/helpers/exceptions/media-prompt-brand-enhancement/media-prompt-brand-enhancement.exception';
import { MEDIA_PROMPT_BRAND_ENHANCEMENT_FAILED_ERROR_CODE } from '@genfeedai/contracts/constants';
import { HttpStatus } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

describe('MediaPromptBrandEnhancementException', () => {
  it('is a 502 with the stable code and a detail that never leaks internals', () => {
    const error = new MediaPromptBrandEnhancementException('brand_identity');
    expect(error.getStatus()).toBe(HttpStatus.BAD_GATEWAY);
    expect(error.stage).toBe('brand_identity');
    expect(error.getResponse()).toEqual({
      code: MEDIA_PROMPT_BRAND_ENHANCEMENT_FAILED_ERROR_CODE,
      detail:
        'Brand prompt enhancement failed at the brand identity step. Nothing was generated and no credits were used.',
      title: 'Brand prompt enhancement failed',
    });
  });
});

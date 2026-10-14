/**
 * Stable `errors[0].code` the API sets (HTTP 502) when brand prompt enhancement
 * for an image or video generation fails. The request stopped before any paid
 * provider call or credit use; clients branch on this code and may offer a
 * one-click retry that sends `brandMode: 'raw'`.
 */
export const MEDIA_PROMPT_BRAND_ENHANCEMENT_FAILED_ERROR_CODE =
  'MEDIA_PROMPT_BRAND_ENHANCEMENT_FAILED';

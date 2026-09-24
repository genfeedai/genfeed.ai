import { parseSocialPostUrl } from '@genfeedai/contracts';

import type { CaptureMode } from '~models/knowledge-capture.model';

export type ExtensionIdeaSurface = 'idea' | 'knowledge';

/**
 * A supported post URL opens Imported review.
 * A text selection, or any other page, stays on explicit Knowledge capture.
 */
export function extensionIdeaTab(input: {
  captureMode?: CaptureMode;
  url?: string;
}): ExtensionIdeaSurface {
  if (input.captureMode === 'selection') {
    return 'knowledge';
  }
  return parseSocialPostUrl(input.url ?? '') ? 'idea' : 'knowledge';
}

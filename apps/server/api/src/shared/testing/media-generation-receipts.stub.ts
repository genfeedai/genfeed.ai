import type { MediaGenerationReceiptsService } from '@api/services/media-generation-receipts/media-generation-receipts.service';
import { vi } from 'vitest';

/**
 * Stand-in for specs whose subject writes generation receipts but does not
 * exercise them: every receipt write resolves without effect, exactly like the
 * real service's detached writes from the caller's point of view.
 */
export function mediaGenerationReceiptsStub(): MediaGenerationReceiptsService {
  return {
    open: vi.fn().mockResolvedValue(undefined),
    recordAccepted: vi.fn().mockResolvedValue(undefined),
    syncTerminal: vi.fn().mockResolvedValue(undefined),
  } as unknown as MediaGenerationReceiptsService;
}

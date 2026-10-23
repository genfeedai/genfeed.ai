import { isGenerationEnhancementFailed } from '@genfeedai/contracts/interfaces';

export function serializeEnhancementFailed(
  record: Record<string, unknown>,
): boolean | undefined {
  if (
    record.generationHarness === undefined ||
    record.generationHarness === null
  )
    return undefined;
  return isGenerationEnhancementFailed(record.generationHarness);
}

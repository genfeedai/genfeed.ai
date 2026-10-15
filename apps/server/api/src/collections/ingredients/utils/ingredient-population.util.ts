import { PopulatePatterns } from '@api/shared/utils/populate/populate.util';
import type { PopulateOption } from '@genfeedai/contracts/interfaces';

/**
 * Get context-aware population options to prevent over-fetching
 * @param context - The context determining which fields to populate
 */
export function ingredientPopulationForContext(
  context: 'list' | 'detail' | 'minimal' | 'create' = 'minimal',
): PopulateOption[] {
  // User details are omitted from list projections unless a caller explicitly
  // needs them; this keeps ingredient payloads and relation queries bounded.
  switch (context) {
    case 'list':
      return [
        PopulatePatterns.brandMinimal,
        PopulatePatterns.metadataBasic,
        PopulatePatterns.promptMinimal,
        { path: 'tags', select: ['id', 'label'] },
      ];
    case 'detail':
      return [
        PopulatePatterns.organizationMinimal,
        PopulatePatterns.brandMinimal,
        PopulatePatterns.metadataFull,
        PopulatePatterns.promptFull,
        { path: 'parent', select: ['id', 'category', 'status'] },
        { path: 'references', select: ['id', 'category', 'status'] },
        { path: 'tags', select: ['id', 'label'] },
      ];
    case 'create':
      return [
        PopulatePatterns.brandMinimal,
        PopulatePatterns.metadataBasic,
        PopulatePatterns.promptMinimal,
      ];
    default:
      return [PopulatePatterns.brandId, { path: 'metadata', select: ['id'] }];
  }
}

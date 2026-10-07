import {
  PopulateBuilder,
  PopulatePatterns,
} from '@api/shared/utils/populate/populate.util';
import type { PopulateOption } from '@genfeedai/contracts/interfaces';

export function buildOptimizedPopulateFields(
  populateFields: (string | PopulateOption)[],
): PopulateOption[] {
  // Convert known relation names to explicit projections. Unknown relations
  // retain full loading because their serializer requirements are domain-specific.
  return populateFields
    .filter((field) => field !== 'user')
    .map((field) => {
      if (typeof field === 'string') {
        // Apply default optimizations for common fields
        switch (field) {
          case 'brand':
            return PopulatePatterns.brandMinimal;
          case 'organization':
            return PopulatePatterns.organizationMinimal;
          case 'metadata':
            return PopulatePatterns.metadataFull;
          case 'asset':
            return PopulatePatterns.assetMinimal;
          case 'parent':
            return PopulatePatterns.parentMinimal;
          default:
            return PopulateBuilder.create(field);
        }
      }
      return field;
    });
}

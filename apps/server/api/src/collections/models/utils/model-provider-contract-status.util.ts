import type {
  ModelProviderContractMappingStatus,
  ModelProviderContractReviewStatus,
} from '@genfeedai/contracts/interfaces';

/** Review state a newly imported contract starts in: supported mappings wait for review, the rest are quarantined. */
export function initialContractReviewStatus(
  mappingStatus: ModelProviderContractMappingStatus,
): ModelProviderContractReviewStatus {
  return mappingStatus === 'supported' ? 'pending' : 'quarantined';
}

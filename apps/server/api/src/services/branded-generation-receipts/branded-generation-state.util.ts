import {
  brandArtifactValidationReportV1Schema,
  brandedGenerationReceiptV1Schema,
} from '@genfeedai/contracts/api-types/contracts';
import type {
  BrandArtifactValidationReportV1,
  BrandedGenerationReceiptV1,
} from '@genfeedai/contracts/interfaces/content/branded-generation.interface';
export type BrandedGenerationStateV1 = BrandedGenerationReceiptV1['state'];
export type BrandedGenerationOperationKindV1 =
  | 'resolve'
  | 'recompose'
  | 'dispatch'
  | 'bind_artifact'
  | 'validate'
  | 'revalidate'
  | 'fail'
  | 'block'
  | 'cancel'
  | 'record_costs'
  | 'delete';
export interface BrandedGenerationReadinessInputV1 {
  receipt: BrandedGenerationReceiptV1;
  validation: BrandArtifactValidationReportV1 | null;
}
export type BrandedGenerationReadinessV1 =
  | { state: 'ready'; compliance: 'passed' | 'not_claimed' }
  | { state: 'needs_review'; compliance: 'unverified' }
  | { state: 'blocked'; compliance: 'failed' };
const states: readonly BrandedGenerationStateV1[] = [
  'created',
  'resolved',
  'dispatched',
  'checking',
  'ready',
  'needs_review',
  'blocked',
  'failed',
  'cancelled',
];
export function canTransitionBrandedGenerationStateV1(
  from: BrandedGenerationStateV1,
  to: BrandedGenerationStateV1,
  operation: BrandedGenerationOperationKindV1,
): boolean {
  if (!states.includes(from) || !states.includes(to)) return false;
  switch (operation) {
    case 'resolve':
      return from === 'created' && ['resolved', 'blocked'].includes(to);
    case 'recompose':
      return from === 'resolved' && to === 'resolved';
    case 'dispatch':
      return from === 'resolved' && to === 'dispatched';
    case 'bind_artifact':
      return from === 'dispatched' && to === 'checking';
    case 'validate':
      return (
        from === 'checking' && ['ready', 'needs_review', 'blocked'].includes(to)
      );
    case 'revalidate':
      return (
        ['checking', 'ready', 'needs_review', 'blocked'].includes(from) &&
        ['ready', 'needs_review', 'blocked'].includes(to)
      );
    case 'fail':
      return from === 'dispatched' && to === 'failed';
    case 'block':
      return (
        ['created', 'resolved', 'dispatched', 'checking'].includes(from) &&
        to === 'blocked'
      );
    case 'cancel':
      return ['created', 'resolved'].includes(from) && to === 'cancelled';
    case 'record_costs':
    case 'delete':
      return from === to;
    default:
      return false;
  }
}
export function classifyBrandedGenerationReadinessV1(
  input: BrandedGenerationReadinessInputV1,
): BrandedGenerationReadinessV1 {
  const current = brandedGenerationReceiptV1Schema.safeParse(input.receipt);
  if (
    !current.success ||
    current.data.isDeleted ||
    !current.data.artifact ||
    current.data.execution?.result !== 'completed' ||
    !['checking', 'ready', 'needs_review', 'blocked'].includes(
      current.data.state,
    )
  )
    throw new TypeError('Invalid branded generation readiness input');
  const receipt = current.data;
  const validation =
    input.validation === null
      ? null
      : brandArtifactValidationReportV1Schema.parse(input.validation);
  if (receipt.mode === 'raw' && validation !== null)
    throw new TypeError('Invalid branded generation readiness input');
  const candidate = (result: BrandedGenerationReadinessV1) => ({
    ...receipt,
    ...result,
    validation,
  });
  if (
    validation?.checks.some(
      (check) => check.severity === 'hard' && check.result === 'fail',
    )
  ) {
    const result = { state: 'blocked', compliance: 'failed' } as const;
    brandedGenerationReceiptV1Schema.parse(candidate(result));
    return result;
  }
  if (receipt.mode === 'raw') {
    const result = { state: 'ready', compliance: 'not_claimed' } as const;
    brandedGenerationReceiptV1Schema.parse(candidate(result));
    return result;
  }
  if (receipt.mode === 'approved_brand' && validation !== null) {
    const result = { state: 'ready', compliance: 'passed' } as const;
    if (brandedGenerationReceiptV1Schema.safeParse(candidate(result)).success)
      return result;
  }
  const result = { state: 'needs_review', compliance: 'unverified' } as const;
  brandedGenerationReceiptV1Schema.parse(candidate(result));
  return result;
}

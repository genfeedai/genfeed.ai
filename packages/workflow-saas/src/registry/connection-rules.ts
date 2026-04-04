import { CONNECTION_RULES } from '@genfeedai/types/nodes';
import type { SaaSHandleType } from '@workflow-saas/types';

/**
 * Extended connection rules for SaaS handle types.
 * Core rules are spread in, and SaaS-specific types are added.
 */
export const SAAS_CONNECTION_RULES: Record<SaaSHandleType, SaaSHandleType[]> = {
  // Core rules
  ...CONNECTION_RULES,
  any: ['image', 'text', 'video', 'number', 'audio', 'brand', 'object', 'any'],
  // SaaS extensions
  brand: ['brand'],
  object: ['object'],
};

/**
 * Validate whether a source handle type can connect to a target handle type.
 * 'any' as a target accepts all source types.
 */
export function isValidSaaSConnection(
  sourceType: SaaSHandleType,
  targetType: SaaSHandleType,
): boolean {
  if (targetType === 'any') {
    return true;
  }
  return SAAS_CONNECTION_RULES[sourceType]?.includes(targetType) ?? false;
}

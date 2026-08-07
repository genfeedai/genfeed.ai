/**
 * Warm-up account provisioning lifecycle. Values match Prisma
 * `WarmupAccountStatus` exactly.
 *
 * `warmup_accounts.status` is a Postgres enum column.
 *
 * @see packages/prisma/prisma/schema.prisma `enum WarmupAccountStatus`
 * @see .agents/memory/rules/enum_source_of_truth.md
 */
export const WarmupAccountStatus = {
  DRAFT: 'DRAFT',
  PROVISIONING: 'PROVISIONING',
  PROVISIONED: 'PROVISIONED',
  INVITED: 'INVITED',
  FAILED: 'FAILED',
  CLAIMED: 'CLAIMED',
  ARCHIVED: 'ARCHIVED',
} as const;

export type WarmupAccountStatus =
  (typeof WarmupAccountStatus)[keyof typeof WarmupAccountStatus];

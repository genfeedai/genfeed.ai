import type { Prisma } from '@genfeedai/prisma';

/**
 * Prisma `where` fragment limiting agent messages to those a viewer may read:
 * messages that carry no brand, or one of `brandIds`. `undefined` means the
 * viewer reaches every brand, so nothing is added.
 *
 * It uses `AND` so it combines with the cursor fragment, which owns `OR`.
 */
export function buildAgentMessageBrandWhere(
  brandIds: string[] | undefined,
): Pick<Prisma.AgentMessageWhereInput, 'AND'> {
  if (brandIds === undefined) {
    return {};
  }
  return {
    AND: [{ OR: [{ brandId: null }, { brandId: { in: brandIds } }] }],
  };
}

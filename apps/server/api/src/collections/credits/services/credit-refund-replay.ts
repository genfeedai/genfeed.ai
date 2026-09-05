import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import type { PrismaTransactionClient } from '@api/helpers/utils/transaction/transaction.util';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditTransactionCategory } from '@genfeedai/contracts';

export async function findCreditRefundReplay(
  prisma: PrismaTransactionClient | PrismaService,
  organizationId: string,
  idempotencyKey?: string,
) {
  if (!idempotencyKey) return null;
  const existing = await prisma.creditTransaction.findFirst({
    where: {
      organizationId,
      isDeleted: false,
      category: CreditTransactionCategory.REFUND,
      idempotencyKey,
    },
  });
  return existing
    ? {
        currentBalance: existing.balanceAfter ?? 0,
        newBalance: existing.balanceAfter ?? 0,
        wasApplied: false,
      }
    : null;
}

export async function assertRefundOrganization(
  prisma: PrismaService,
  organizationId: string,
): Promise<void> {
  const organization = await prisma.organization.findFirst({
    where: { id: organizationId, isDeleted: false },
  });
  if (!organization) throw new BusinessLogicException('Organization not found');
}

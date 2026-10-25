import { scopedWhere } from '@api/index';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditReservationStatus } from '@genfeedai/contracts';
import { MEDIA_GENERATION_WORKLOAD_TYPE } from '@genfeedai/contracts/constants';
import { Injectable } from '@nestjs/common';

export type IngredientGenerationCostStatus = 'reserved' | 'settled';

export interface IngredientGenerationCost {
  /** Credits the output costs; null when no credit hold paid for it. */
  credits: number | null;
  /** `reserved` is a hold that is not yet settled, so the figure may still change. */
  status: IngredientGenerationCostStatus | null;
}

/**
 * What a generated asset cost in credits. The output's own credit hold is the
 * ledger entry that pays for it (the same read the generation receipt uses), so
 * an asset whose hold was released or expired, that ran on the organization's
 * own provider key, or that was never generated here has no cost to show.
 */
@Injectable()
export class IngredientGenerationCostService {
  constructor(private readonly prisma: PrismaService) {}

  async find(
    organizationId: string,
    ingredientId: string,
  ): Promise<IngredientGenerationCost> {
    const hold = await this.prisma.creditReservation.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { amount: true, settledAmount: true, status: true },
      where: scopedWhere(organizationId, {
        status: {
          in: [
            CreditReservationStatus.RESERVED,
            CreditReservationStatus.SETTLED,
          ],
        },
        workloadId: ingredientId,
        workloadType: MEDIA_GENERATION_WORKLOAD_TYPE,
      }),
    });
    if (!hold) return { credits: null, status: null };
    return hold.status === CreditReservationStatus.SETTLED
      ? { credits: hold.settledAmount ?? hold.amount, status: 'settled' }
      : { credits: hold.amount, status: 'reserved' };
  }
}

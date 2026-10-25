import { IngredientGenerationCostService } from '@api/collections/ingredients/services/ingredient-generation-cost.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { CreditReservationStatus } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';

const organizationId = testId('org');
const ingredientId = testId('ingredient');

function setup(hold: unknown) {
  const findFirst = vi.fn().mockResolvedValue(hold);
  const service = new IngredientGenerationCostService({
    creditReservation: { findFirst },
  } as unknown as PrismaService);
  return { findFirst, service };
}

describe('IngredientGenerationCostService', () => {
  it("reads the output's own credit hold inside the organization", async () => {
    const { findFirst, service } = setup(null);

    await service.find(organizationId, ingredientId);

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isDeleted: false,
          organizationId,
          workloadId: ingredientId,
          workloadType: 'media-generation',
        }),
      }),
    );
  });

  it('reports the settled amount once the hold is settled', async () => {
    const { service } = setup({
      amount: 60,
      settledAmount: 48,
      status: CreditReservationStatus.SETTLED,
    });

    await expect(service.find(organizationId, ingredientId)).resolves.toEqual({
      credits: 48,
      status: 'settled',
    });
  });

  it('falls back to the hold amount when a settled hold has no settled figure', async () => {
    const { service } = setup({
      amount: 60,
      settledAmount: null,
      status: CreditReservationStatus.SETTLED,
    });

    await expect(service.find(organizationId, ingredientId)).resolves.toEqual({
      credits: 60,
      status: 'settled',
    });
  });

  it('reports a running generation as reserved', async () => {
    const { service } = setup({
      amount: 60,
      settledAmount: null,
      status: CreditReservationStatus.RESERVED,
    });

    await expect(service.find(organizationId, ingredientId)).resolves.toEqual({
      credits: 60,
      status: 'reserved',
    });
  });

  it('has no cost when no charged hold paid for the asset', async () => {
    const { service } = setup(null);

    await expect(service.find(organizationId, ingredientId)).resolves.toEqual({
      credits: null,
      status: null,
    });
  });
});

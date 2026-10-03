import { IngredientCharacterFilterService } from '@api/collections/ingredients/services/ingredient-character-filter.service';
import type { PersonasService } from '@api/collections/personas/services/personas.service';
import { testId } from '@helpers/testing/test-id.helper';

describe('IngredientCharacterFilterService', () => {
  const organizationId = testId('org');
  const brandId = testId('brand');
  const available = testId('character', 1);
  const otherAvailable = testId('character', 2);
  const unavailable = testId('character', 3);

  const personasService = {
    findAvailableToBrand: vi.fn(),
  };
  const service = new IngredientCharacterFilterService(
    personasService as unknown as PersonasService,
  );

  beforeEach(() => {
    vi.clearAllMocks();
    personasService.findAvailableToBrand.mockImplementation(
      async ({ personaId }: { personaId: string }) =>
        personaId === unavailable ? null : { id: personaId },
    );
  });

  it('adds no predicate and skips lookups when nothing was requested', async () => {
    await expect(
      service.buildFilter({
        brandId,
        characterIds: undefined,
        organizationId,
      }),
    ).resolves.toEqual({});
    await expect(
      service.buildFilter({ brandId, characterIds: [], organizationId }),
    ).resolves.toEqual({});
    expect(personasService.findAvailableToBrand).not.toHaveBeenCalled();
  });

  it('resolves every id through the shared brand availability rule', async () => {
    const filter = await service.buildFilter({
      brandId,
      characterIds: [available, otherAvailable],
      organizationId,
    });

    expect(filter).toEqual({
      personaId: { in: [available, otherAvailable] },
    });
    expect(personasService.findAvailableToBrand).toHaveBeenCalledWith({
      brandId,
      organizationId,
      personaId: available,
    });
  });

  it('drops an unavailable character without revealing it', async () => {
    const filter = await service.buildFilter({
      brandId,
      characterIds: [available, unavailable],
      organizationId,
    });

    expect(filter).toEqual({ personaId: { in: [available] } });
  });

  it('matches nothing when no requested character is available', async () => {
    const filter = await service.buildFilter({
      brandId,
      characterIds: [unavailable],
      organizationId,
    });

    expect(filter).toEqual({ personaId: { in: [] } });
  });

  it('looks each id up once', async () => {
    await service.buildFilter({
      brandId,
      characterIds: [available, available],
      organizationId,
    });

    expect(personasService.findAvailableToBrand).toHaveBeenCalledTimes(1);
  });

  it('matches nothing without an active brand', async () => {
    const filter = await service.buildFilter({
      brandId: undefined,
      characterIds: [available],
      organizationId,
    });

    expect(filter).toEqual({ personaId: { in: [] } });
    expect(personasService.findAvailableToBrand).not.toHaveBeenCalled();
  });
});

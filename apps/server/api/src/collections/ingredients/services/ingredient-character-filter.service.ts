import { PersonasService } from '@api/collections/personas/services/personas.service';
import { IngredientFilterUtil } from '@api/helpers/utils/ingredient-filter/ingredient-filter.util';
import { Injectable } from '@nestjs/common';

/**
 * Turns the Library `characters` query into a Prisma fragment.
 *
 * Availability is decided by the shared character resolution in
 * `PersonasService` (own brand plus brand availability), so a character the
 * active brand cannot use is dropped here and never reveals itself: it simply
 * matches nothing.
 */
@Injectable()
export class IngredientCharacterFilterService {
  constructor(private readonly personasService: PersonasService) {}

  async buildFilter(params: {
    brandId: string | null | undefined;
    characterIds: readonly string[] | undefined;
    organizationId: string;
  }): Promise<Record<string, unknown>> {
    const requested = Array.from(new Set(params.characterIds ?? []));

    if (requested.length === 0) {
      return IngredientFilterUtil.buildCharacterFilter(undefined);
    }

    const { brandId, organizationId } = params;

    if (!brandId) {
      return IngredientFilterUtil.buildCharacterFilter([]);
    }

    const resolved = await Promise.all(
      requested.map((personaId) =>
        this.personasService.findAvailableToBrand({
          brandId,
          organizationId,
          personaId,
        }),
      ),
    );

    return IngredientFilterUtil.buildCharacterFilter(
      resolved.flatMap((persona) => (persona ? [persona.id] : [])),
    );
  }
}

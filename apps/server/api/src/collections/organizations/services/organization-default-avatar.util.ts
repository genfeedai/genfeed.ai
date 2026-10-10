import type { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { BadRequestException } from '@nestjs/common';

/** A default avatar must be an avatar image ingredient of the organization. */
export async function assertDefaultAvatarIngredient(
  ingredientsService: IngredientsService,
  organizationId: string,
  defaultAvatarIngredientId?: string | null,
): Promise<void> {
  if (defaultAvatarIngredientId == null) {
    return;
  }

  const avatarIngredient = await ingredientsService.findAvatarImageById(
    defaultAvatarIngredientId,
    organizationId,
  );

  if (!avatarIngredient) {
    throw new BadRequestException(
      'Default avatar must reference an avatar image ingredient in this organization',
    );
  }
}

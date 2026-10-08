import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import type {
  AvatarVideoGenerationContext,
  AvatarVideoGenerationParams,
} from '@api/collections/videos/services/avatar-video-generation.types';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { IngredientCategory, IngredientStatus } from '@genfeedai/contracts';
import { ConfigService } from '@libs/config/config.service';
import { readIngredientMediaUrl } from '@libs/media/media-url.util';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

/** Resolves the scoped stored image or provider avatar used for execution. */
@Injectable()
export class AvatarVideoReferenceService {
  constructor(
    private readonly configService: ConfigService,
    private readonly ingredientsService: IngredientsService,
    private readonly mediaIssuer: AuthorizedMediaUrlService,
    private readonly personasService: PersonasService,
  ) {}

  /** The character the photo belongs to; refuses one the brand lost. */
  async admitCharacter(
    photoIngredientId: string | undefined,
    brandId: string,
    organizationId: string,
  ): Promise<string | null> {
    const { personaId } = await this.personasService.resolveCharacterReferences(
      {
        brandId,
        ingredientIds: photoIngredientId ? [photoIngredientId] : [],
        organizationId,
        path: 'avatar-video',
      },
    );
    return personaId;
  }

  async resolvePhotoUrl(
    _params: AvatarVideoGenerationParams,
    context: AvatarVideoGenerationContext,
    resolvedPhotoIngredientId?: string,
    resolvedPhotoUrl?: string,
  ): Promise<string> {
    if (
      resolvedPhotoUrl &&
      !(
        this.configService.isAuthorizedMediaDeliveryEnabled &&
        resolvedPhotoIngredientId
      )
    ) {
      return resolvedPhotoUrl;
    }

    if (resolvedPhotoIngredientId) {
      const avatarIngredient =
        await this.ingredientsService.findAvatarImageById(
          resolvedPhotoIngredientId,
          context.organizationId,
        );

      if (!avatarIngredient) {
        throw new HttpException(
          {
            detail:
              'Configured default avatar must reference an avatar image ingredient in this organization',
            title: 'Validation failed',
          },
          HttpStatus.BAD_REQUEST,
        );
      }

      const avatarUrl = this.configService.isAuthorizedMediaDeliveryEnabled
        ? (
            await this.mediaIssuer.issueServerPublish(context.organizationId, [
              avatarIngredient.id,
            ])
          ).get(avatarIngredient.id)
        : readIngredientMediaUrl(avatarIngredient);
      if (avatarUrl) {
        return avatarUrl;
      }

      if (this.configService.isAuthorizedMediaDeliveryEnabled) {
        throw new HttpException(
          'Avatar media is unavailable',
          HttpStatus.BAD_REQUEST,
        );
      }
      return `${this.configService.ingredientsEndpoint}/avatars/${avatarIngredient.id}`;
    }

    throw new HttpException(
      'Choose an image or a trained HeyGen look.',
      HttpStatus.BAD_REQUEST,
    );
  }

  async resolveAudioIngredient(
    ingredientId: string,
    organizationId: string,
  ): Promise<string> {
    const ingredient = await this.ingredientsService.findOne({
      id: ingredientId,
      organizationId,
      isDeleted: false,
    });
    if (
      !ingredient ||
      ![
        IngredientCategory.AUDIO,
        IngredientCategory.VOICE,
        IngredientCategory.MUSIC,
      ].includes(ingredient.category as IngredientCategory) ||
      ![
        IngredientStatus.GENERATED,
        IngredientStatus.VALIDATED,
        IngredientStatus.UPLOADED,
      ].includes(ingredient.status as IngredientStatus)
    )
      throw new HttpException(
        'Choose a playable audio asset from this organization.',
        HttpStatus.BAD_REQUEST,
      );
    const url = this.configService.isAuthorizedMediaDeliveryEnabled
      ? (
          await this.mediaIssuer.issueServerPublish(organizationId, [
            ingredient.id,
          ])
        ).get(ingredient.id)
      : readIngredientMediaUrl(ingredient);
    if (!url)
      throw new HttpException(
        'The selected narration has no playable audio.',
        HttpStatus.BAD_REQUEST,
      );
    return url;
  }
}

import { IngredientsService } from '@api/collections/ingredients/services/ingredients.service';
import { PersonasService } from '@api/collections/personas/services/personas.service';
import type {
  AvatarVideoGenerationContext,
  AvatarVideoGenerationParams,
} from '@api/collections/videos/services/avatar-video-generation.types';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { ByokService } from '@api/services/byok/byok.service';
import { HeyGenService } from '@api/services/integrations/heygen/services/heygen.service';
import { AuthorizedMediaUrlService } from '@api/services/media-urls/authorized-media-url.service';
import { ByokProvider } from '@genfeedai/contracts';
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
    private readonly byokService: ByokService,
    private readonly heygenService: HeyGenService,
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
    params: AvatarVideoGenerationParams,
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

    if (!params.avatarId) {
      throw new HttpException(
        {
          detail:
            'Either photoUrl must be provided or identity defaults must resolve a default avatar image',
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const heygenByokKey = await this.byokService.resolveApiKey(
      context.organizationId,
      ByokProvider.HEYGEN,
    );
    const avatars = await this.heygenService.getAvatars(
      context.organizationId,
      undefined,
      heygenByokKey?.apiKey,
    );
    const avatar = avatars.find(
      (candidate) => candidate.avatarId === params.avatarId,
    );

    if (!avatar) {
      throw new NotFoundException('Avatar', params.avatarId);
    }

    return avatar.preview;
  }
}

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { ElementsService } from '@api/collections/elements/elements.service';
import { Cache } from '@api/helpers/decorators/cache/cache.decorator';
import { LogMethod } from '@api/helpers/decorators/log/log-method.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { getPublicMetadata } from '@api/helpers/utils/auth/auth.util';
import { serializeCollection } from '@api/helpers/utils/response/response.util';
import {
  BlacklistSerializer,
  CameraMovementSerializer,
  CameraSerializer,
  LensSerializer,
  LightingSerializer,
  MoodSerializer,
  SceneSerializer,
  SoundSerializer,
  StyleSerializer,
} from '@genfeedai/serializers';
import { Controller, Get, Req, SetMetadata, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';

@AutoSwagger()
@ApiTags('elements')
@Controller('elements')
@ApiBearerAuth()
@UseGuards(RolesGuard)
export class ElementsController {
  constructor(private readonly elementsService: ElementsService) {}

  @Get()
  @SetMetadata('skipRoles', true)
  @Cache({
    keyGenerator: (req) =>
      `elements:list:${(req.user?.publicMetadata?.organization as string | undefined) ?? 'global'}`,
    // Tags match the BaseService collection names so element writes
    // (create/patch/remove) bust this response automatically.
    tags: [
      'elementBlacklist',
      'elementCamera',
      'elementCameraMovement',
      'elementLens',
      'elementLighting',
      'elementMood',
      'elementScene',
      'elementSound',
      'elementStyle',
    ],
    ttl: 600, // 10 minutes
  })
  @ApiOperation({
    description:
      'Retrieves all element collections (cameras, moods, scenes, styles, sounds, blacklists, lightings, lenses, cameraMovements) in a single request for efficient client-side loading',
    summary: 'Get all elements',
  })
  @LogMethod({ logEnd: false, logError: true, logStart: true })
  async findAllElements(@Req() req: Request, @CurrentUser() user: User) {
    const { organization: organizationId } = getPublicMetadata(user);

    const elements = await this.elementsService.findAllElements(organizationId);

    return {
      data: {
        blacklists: serializeCollection(req, BlacklistSerializer, {
          docs: elements.blacklists,
        }),
        cameraMovements: serializeCollection(req, CameraMovementSerializer, {
          docs: elements.cameraMovements,
        }),
        cameras: serializeCollection(req, CameraSerializer, {
          docs: elements.cameras,
        }),
        lenses: serializeCollection(req, LensSerializer, {
          docs: elements.lenses,
        }),
        lightings: serializeCollection(req, LightingSerializer, {
          docs: elements.lightings,
        }),
        moods: serializeCollection(req, MoodSerializer, {
          docs: elements.moods,
        }),
        scenes: serializeCollection(req, SceneSerializer, {
          docs: elements.scenes,
        }),
        sounds: serializeCollection(req, SoundSerializer, {
          docs: elements.sounds,
        }),
        styles: serializeCollection(req, StyleSerializer, {
          docs: elements.styles,
        }),
      },
    };
  }
}

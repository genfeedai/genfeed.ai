import { ElementsBlacklistsService } from '@api/collections/elements/blacklists/services/blacklists.service';
import { ElementsCameraMovementsService } from '@api/collections/elements/camera-movements/services/camera-movements.service';
import { ElementsCamerasService } from '@api/collections/elements/cameras/services/cameras.service';
import { ElementsLensesService } from '@api/collections/elements/lenses/services/lenses.service';
import { ElementsLightingsService } from '@api/collections/elements/lightings/services/lightings.service';
import { ElementsMoodsService } from '@api/collections/elements/moods/services/moods.service';
import { ElementsScenesService } from '@api/collections/elements/scenes/services/scenes.service';
import {
  buildElementScopeConditions,
  orderElementsForOrganization,
  type ScopedElement,
  withPlatformDefaultFlag,
} from '@api/collections/elements/shared/element-scope.util';
import { ElementsSoundsService } from '@api/collections/elements/sounds/services/sounds.service';
import { ElementsStylesService } from '@api/collections/elements/styles/services/styles.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class ElementsService {
  constructor(
    private readonly camerasService: ElementsCamerasService,
    private readonly moodsService: ElementsMoodsService,
    private readonly scenesService: ElementsScenesService,
    private readonly stylesService: ElementsStylesService,
    private readonly soundsService: ElementsSoundsService,
    private readonly blacklistsService: ElementsBlacklistsService,
    private readonly lightingsService: ElementsLightingsService,
    private readonly lensesService: ElementsLensesService,
    private readonly cameraMovementsService: ElementsCameraMovementsService,
  ) {}

  /**
   * Every element collection visible to the organization (#6038): active
   * platform defaults first in curated order, then the organization's own
   * elements. One query per type; each item says whether it is a default.
   * Blacklists have no platform defaults and stay organization-only.
   */
  async findAllElements(organizationId: string | null | undefined) {
    const buildQuery = (): Record<string, unknown> => ({
      orderBy: { sortOrder: 1, createdAt: -1, key: 1 },
      where: {
        isDeleted: false,
        OR: buildElementScopeConditions({ organizationId }),
      },
    });

    const findScoped = async <T extends ScopedElement>(service: {
      findAll(
        query: Record<string, unknown>,
        options: { pagination: false },
      ): Promise<{ docs: T[] }>;
    }) =>
      orderElementsForOrganization(
        (await service.findAll(buildQuery(), { pagination: false })).docs,
      ).map(withPlatformDefaultFlag);

    const [
      cameras,
      moods,
      scenes,
      styles,
      sounds,
      blacklists,
      lightings,
      lenses,
      cameraMovements,
    ] = await Promise.all([
      findScoped(this.camerasService),
      findScoped(this.moodsService),
      findScoped(this.scenesService),
      findScoped(this.stylesService),
      findScoped(this.soundsService),
      organizationId
        ? this.blacklistsService
            .findAll(
              {
                orderBy: { createdAt: -1, key: 1 },
                where: { isDeleted: false, organizationId },
              },
              { pagination: false },
            )
            .then((result) => result.docs)
        : Promise.resolve([]),
      findScoped(this.lightingsService),
      findScoped(this.lensesService),
      findScoped(this.cameraMovementsService),
    ]);

    return {
      blacklists,
      cameraMovements,
      cameras,
      lenses,
      lightings,
      moods,
      scenes,
      sounds,
      styles,
    };
  }
}

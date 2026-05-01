import { ElementsBlacklistsService } from '@api/collections/elements/blacklists/services/blacklists.service';
import { ElementsCameraMovementsService } from '@api/collections/elements/camera-movements/services/camera-movements.service';
import { ElementsCamerasService } from '@api/collections/elements/cameras/services/cameras.service';
import { ElementsLensesService } from '@api/collections/elements/lenses/services/lenses.service';
import { ElementsLightingsService } from '@api/collections/elements/lightings/services/lightings.service';
import { ElementsMoodsService } from '@api/collections/elements/moods/services/moods.service';
import { ElementsScenesService } from '@api/collections/elements/scenes/services/scenes.service';
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

  async findAllElements(organizationId: string | null | undefined) {
    // Build findAll query to get both default (no org) and org-specific elements
    const buildQuery = (): Record<string, unknown> => {
      // Always filter by isDeleted: false, and add org logic
      const baseMatch: Record<string, unknown> = { isDeleted: false };

      // Common: default elements (no org)
      const defaultOrgConditions = [{ organization: null }];

      baseMatch.OR = organizationId
        ? [{ organization: organizationId }, ...defaultOrgConditions]
        : defaultOrgConditions;

      return { where: baseMatch, orderBy: { createdAt: -1, key: 1 } };
    };

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
      this.camerasService
        .findAll(buildQuery(), { pagination: false })
        .then((result) => result.docs),
      this.moodsService
        .findAll(buildQuery(), { pagination: false })
        .then((result) => result.docs),
      this.scenesService
        .findAll(buildQuery(), { pagination: false })
        .then((result) => result.docs),
      this.stylesService
        .findAll(buildQuery(), { pagination: false })
        .then((result) => result.docs),
      this.soundsService
        .findAll(buildQuery(), { pagination: false })
        .then((result) => result.docs),
      this.blacklistsService
        .findAll(buildQuery(), { pagination: false })
        .then((result) => result.docs),
      this.lightingsService
        .findAll(buildQuery(), { pagination: false })
        .then((result) => result.docs),
      this.lensesService
        .findAll(buildQuery(), { pagination: false })
        .then((result) => result.docs),
      this.cameraMovementsService
        .findAll(buildQuery(), { pagination: false })
        .then((result) => result.docs),
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

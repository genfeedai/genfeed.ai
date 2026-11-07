import type { ModelDocument } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import { getRegistryModelCapability } from '@api/collections/models/utils/registry-model-capability.util';
import { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { RouterService } from '@api/services/router/router.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ModelCategory, ModelLifecycle } from '@genfeedai/contracts';
import {
  type VideoRecipe,
  type VideoRecipeRouting,
  type VideoRecipeRoutingSource,
  type VideoRecipeStep,
  type VideoRecipeStepRouting,
  videoRecipeRoutingSchema,
} from '@genfeedai/contracts/api-types/contracts/video-recipe.contract';
import {
  findUnmetVideoRecipeRequirements,
  getVideoRecipe,
} from '@genfeedai/contracts/constants';
import { Traced } from '@libs/tracing/traced';
import { Injectable } from '@nestjs/common';

/** The category defaults a brand or organization can set. */
interface CategoryDefaults {
  defaultImageModel: string | null;
  defaultMusicModel: string | null;
  defaultVideoModel: string | null;
}

function categoryDefault(
  defaults: CategoryDefaults | null,
  category: ModelCategory,
): string | null {
  if (!defaults) return null;
  switch (category) {
    case ModelCategory.IMAGE:
      return defaults.defaultImageModel;
    case ModelCategory.VIDEO:
      return defaults.defaultVideoModel;
    case ModelCategory.MUSIC:
      return defaults.defaultMusicModel;
    default:
      return null;
  }
}

/** Most common unmet requirement first, so the reason names the real blocker. */
function summarizeUnmet(unmet: readonly string[][]): string {
  const counts = new Map<string, number>();
  for (const reason of unmet.flat()) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }
  const reasons = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([reason]) => reason);
  return reasons.length > 0
    ? `No model in this category meets: ${reasons.join(', ')}.`
    : 'No model is available in this category.';
}

/**
 * Per-step model routing for a video recipe (#9615). Each step resolves through
 * the canonical router, restricted to registry rows that meet the step's
 * capabilities: caller pin, then brand default, then organization default,
 * then the registry default, then the best-ranked row. Nothing is hardcoded,
 * so a new catalog default takes over on the next resolution.
 */
@Traced()
@Injectable()
export class VideoRecipeRoutingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly modelsService: ModelsService,
    private readonly organizationSettingsService: OrganizationSettingsService,
    private readonly routerService: RouterService,
  ) {}

  async resolve(
    organizationId: string,
    brandId: string,
    recipeKey: string,
    pins: Readonly<Record<string, string>> = {},
  ): Promise<VideoRecipeRouting> {
    const recipe = getVideoRecipe(recipeKey);
    if (!recipe) {
      throw new NotFoundException('Video recipe', recipeKey);
    }

    const brand = await this.prisma.brand.findFirst({
      select: {
        defaultImageModel: true,
        defaultMusicModel: true,
        defaultVideoModel: true,
      },
      where: { id: brandId, isDeleted: false, organizationId },
    });
    if (!brand) {
      throw new NotFoundException('Brand', brandId);
    }

    const settings = await this.organizationSettingsService.findOne({
      isDeleted: false,
      organizationId,
    });
    const organizationDefaults: CategoryDefaults | null = settings
      ? {
          defaultImageModel: settings.defaultImageModel ?? null,
          defaultMusicModel: settings.defaultMusicModel ?? null,
          defaultVideoModel: settings.defaultVideoModel ?? null,
        }
      : null;

    const steps = await Promise.all(
      recipe.steps.map((step) =>
        this.resolveStep(organizationId, step, {
          brand: categoryDefault(brand, step.category),
          organization: categoryDefault(organizationDefaults, step.category),
          pin: pins[step.id] ?? null,
        }),
      ),
    );

    return this.toRouting(recipe, steps);
  }

  private toRouting(
    recipe: VideoRecipe,
    steps: VideoRecipeStepRouting[],
  ): VideoRecipeRouting {
    return videoRecipeRoutingSchema.parse({
      isRunnable: steps.every((step) => step.modelKey !== null),
      label: recipe.label,
      recipeKey: recipe.key,
      recipeVersion: recipe.version,
      steps,
    });
  }

  private async resolveStep(
    organizationId: string,
    step: VideoRecipeStep,
    candidates: {
      brand: string | null;
      organization: string | null;
      pin: string | null;
    },
  ): Promise<VideoRecipeStepRouting> {
    const models = await this.modelsService.findAllActive({
      category: step.category,
      OR: [{ organizationId: null }, { organizationId }],
    });
    const visible = models.filter(
      (model) => model.lifecycle !== ModelLifecycle.RETIRED,
    );
    const evaluated = visible.map((model) => ({
      model,
      unmet: findUnmetVideoRecipeRequirements(
        step,
        getRegistryModelCapability(model),
      ),
    }));
    const eligible = evaluated
      .filter((entry) => entry.unmet.length === 0)
      .map((entry) => entry.model);

    const base = {
      category: step.category,
      eligibleModelCount: eligible.length,
      isReviewPoint: step.isReviewPoint,
      label: step.label,
      stepId: step.id,
    };
    const unavailable = (reason: string): VideoRecipeStepRouting => ({
      ...base,
      modelKey: null,
      modelLabel: null,
      source: null,
      unavailableReason: reason,
    });

    if (eligible.length === 0) {
      return unavailable(summarizeUnmet(evaluated.map((entry) => entry.unmet)));
    }

    const ordered: Array<[VideoRecipeRoutingSource, string | null]> = [
      ['pin', candidates.pin],
      ['brand-default', candidates.brand],
      ['organization-default', candidates.organization],
    ];
    let resolution: Awaited<ReturnType<RouterService['resolveModelKey']>>;
    try {
      resolution = await this.routerService.resolveModelKey({
        candidates: ordered.map(([, key]) => key),
        category: step.category,
        eligibleModelKeys: eligible.map((model) => model.key),
        organizationId,
      });
    } catch (error: unknown) {
      if (error instanceof NotFoundException) {
        return unavailable(
          'No recommended, priced model meets this step. Ask an operator to recommend one in the catalog.',
        );
      }
      throw error;
    }

    const source: VideoRecipeRoutingSource =
      resolution.source === 'candidate'
        ? (ordered.find(([, key]) => key === resolution.key)?.[0] ?? 'pin')
        : resolution.source === 'registry-best'
          ? 'registry-best'
          : 'registry-default';
    const chosen: ModelDocument | undefined = eligible.find(
      (model) => model.key === resolution.key,
    );

    return {
      ...base,
      modelKey: resolution.key,
      modelLabel: chosen?.label ?? resolution.key,
      source,
      unavailableReason: null,
    };
  }
}

import { ModelLifecycle } from '@genfeedai/enums';
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/modules/prisma/prisma.service';
import { OrganizationSettingsService } from '../../organization-settings/services/organization-settings.service';
import type { TrainingDocument } from '../../trainings/schemas/training.schema';
import type { ModelDocument } from '../schemas/model.schema';
import { isModelOnAllowlist } from '../utils/enabled-model.util';
import { ModelsService } from './models.service';

@Injectable()
export class ModelRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgSettingsService: OrganizationSettingsService,
    private readonly logger: LoggerService,
    private readonly modelsService: ModelsService,
  ) {}

  async validateModelForOrg(
    modelKey: string,
    organizationId: string,
  ): Promise<ModelDocument> {
    const model = await this.findVisibleModel(modelKey, organizationId);

    if (!model) {
      throw new BadRequestException(`Unknown model: ${modelKey}`);
    }

    // Org ownership check
    if (model.organizationId && model.organizationId !== organizationId) {
      throw new ForbiddenException('Model not available for this organization');
    }

    // Organization enabled-model allowlist check. Seed an empty allowlist
    // first (same contract as settings GET) so Demo/legacy orgs are not
    // enable-none until someone opens Org Settings. A non-empty list is an
    // explicit choice and ensureEnabledModelIds leaves it untouched.
    const orgSettings = await this.orgSettingsService.findOne({
      organizationId,
    });
    const ensuredSettings = orgSettings
      ? await this.orgSettingsService.ensureEnabledModelIds(orgSettings)
      : orgSettings;
    const enabledModelIds = Array.isArray(
      (ensuredSettings as Record<string, unknown> | null)?.enabledModelIds,
    )
      ? ((ensuredSettings as Record<string, unknown>)
          .enabledModelIds as string[])
      : [];

    if (enabledModelIds.length === 0) {
      throw new ForbiddenException('No models enabled for this workspace');
    }

    if (!isModelOnAllowlist(model, enabledModelIds)) {
      throw new ForbiddenException('Model not enabled for this organization');
    }

    if (model.lifecycle === ModelLifecycle.RETIRED) {
      return this.resolveRetiredSuccessor(model);
    }

    if (!model.isActive) {
      throw new ForbiddenException('Model is not available for execution');
    }

    return model;
  }

  private async resolveRetiredSuccessor(
    model: ModelDocument,
  ): Promise<ModelDocument> {
    const seen = new Set<string>();
    let current: ModelDocument | null = model;

    while (current?.lifecycle === ModelLifecycle.RETIRED) {
      if (!current.key || seen.has(current.key) || !current.succeededBy) {
        throw new ForbiddenException('Retired model has no safe successor');
      }
      seen.add(current.key);
      current = await this.modelsService.findOne({
        key: current.succeededBy,
        organizationId: current.organizationId ?? null,
      });
    }

    if (!current?.isActive || current.isDeleted) {
      throw new ForbiddenException('Retired model has no callable successor');
    }
    return current;
  }

  private async findVisibleModel(
    key: string,
    organizationId: string,
  ): Promise<ModelDocument | null> {
    const privateModel = await this.modelsService.findOne({
      key,
      organizationId,
    });
    if (privateModel) {
      return privateModel;
    }
    return this.modelsService.findOne({ key, organizationId: null });
  }

  async createFromTraining(training: TrainingDocument): Promise<ModelDocument> {
    try {
      const newModel = await this.modelsService.createFromTraining(training);
      const organizationId = newModel.organizationId;

      if (organizationId && newModel.id) {
        await this.orgSettingsService.addEnabledModel(
          organizationId,
          newModel.id,
        );
      }

      this.logger.log(
        `Created model ${newModel.key} from training ${training.id}`,
      );
      return newModel;
    } catch (err: unknown) {
      const error = err as { code?: string };
      if (error.code === 'P2002') {
        const raceWinner = await this.modelsService.findOne({
          trainingId: training.id,
        });
        if (raceWinner) {
          return raceWinner;
        }
      }
      throw err;
    }
  }

  async reconcileTrainingModels(): Promise<void> {
    const allTrainings = await this.prisma.training.findMany({
      where: { isDeleted: false, stage: 'READY' },
    });

    const orphanedTrainings: typeof allTrainings = [];

    for (const training of allTrainings) {
      const model = await this.prisma.model.findFirst({
        where: { trainingId: training.id },
      });
      if (!model) {
        orphanedTrainings.push(training);
      }
    }

    for (const training of orphanedTrainings) {
      try {
        await this.createFromTraining(training as unknown as TrainingDocument);
      } catch (err: unknown) {
        const error = err as { message?: string };
        this.logger.error(
          `Reconciliation failed for training ${training.id}: ${error.message}`,
        );
      }
    }

    this.logger.log(
      `Reconciled ${orphanedTrainings.length} orphaned trainings`,
    );
  }

  async reconcileEnabledModels(): Promise<void> {
    const orgModels = await this.prisma.model.findMany({
      where: {
        organizationId: { not: null },
        isActive: true,
        isDeleted: false,
      },
      select: { id: true, organizationId: true },
    });

    const modelsByOrg = new Map<string, string[]>();
    for (const model of orgModels) {
      if (!model.organizationId) continue;
      const orgKey = model.organizationId;
      const modelIds = modelsByOrg.get(orgKey) ?? [];
      modelIds.push(model.id);
      modelsByOrg.set(orgKey, modelIds);
    }

    let repaired = 0;
    for (const [orgId, modelIds] of modelsByOrg) {
      const orgSettings = await this.orgSettingsService.findOne({
        organizationId: orgId,
      });
      const enabledModelIds = Array.isArray(
        (orgSettings as Record<string, unknown> | null)?.enabledModelIds,
      )
        ? ((orgSettings as Record<string, unknown>).enabledModelIds as string[])
        : [];
      const enabledSet = new Set<string>(enabledModelIds);

      for (const modelId of modelIds) {
        if (!enabledSet.has(modelId)) {
          await this.orgSettingsService.addEnabledModel(orgId, modelId);
          repaired++;
        }
      }
    }

    this.logger.log(`Reconciled ${repaired} enabledModelIds drift entries`);
  }
}

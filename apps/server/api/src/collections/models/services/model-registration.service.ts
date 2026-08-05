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
    const model = await this.modelsService.findOne({
      isDeleted: false,
      key: modelKey,
    });

    if (!model) {
      throw new BadRequestException(`Unknown model: ${modelKey}`);
    }

    // Org ownership check
    if (model.organizationId && model.organizationId !== organizationId) {
      throw new ForbiddenException('Model not available for this organization');
    }

    // Organization enabled-model allowlist check.
    const orgSettings = await this.orgSettingsService.findOne({
      organizationId,
    });
    const enabledModelIds = Array.isArray(
      (orgSettings as Record<string, unknown> | null)?.enabledModelIds,
    )
      ? ((orgSettings as Record<string, unknown>).enabledModelIds as string[])
      : [];
    const isEnabled = enabledModelIds.includes(model.id);

    if (!isEnabled) {
      throw new ForbiddenException('Model not enabled for this organization');
    }

    return model;
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

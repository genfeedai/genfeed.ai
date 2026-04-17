// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../shared/modules/prisma/prisma.service';
// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { OrganizationSettingsService } from '../../organization-settings/services/organization-settings.service';
import type { TrainingDocument } from '../../trainings/schemas/training.schema';
import type { ModelDocument } from '../schemas/model.schema';

@Injectable()
export class ModelRegistrationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly orgSettingsService: OrganizationSettingsService,
    private readonly logger: LoggerService,
  ) {}

  async validateModelForOrg(
    modelKey: string,
    organizationId: string,
  ): Promise<ModelDocument> {
    // key is stored in config JSON — fetch all and filter
    const models = await this.prisma.model.findMany({
      where: { isDeleted: false },
    });

    const model = models.find((m) => {
      const config = m.config as Record<string, unknown>;
      return config?.key === modelKey;
    });

    if (!model) {
      throw new BadRequestException(`Unknown model: ${modelKey}`);
    }

    // Org ownership check
    if (model.organizationId && model.organizationId !== organizationId) {
      throw new ForbiddenException('Model not available for this organization');
    }

    // enabledModels check
    const orgSettings = await this.orgSettingsService.findOne({
      organization: organizationId,
    });
    const isEnabled = (orgSettings?.enabledModels ?? []).some(
      (id: string) => id === model.id,
    );

    if (!isEnabled) {
      throw new ForbiddenException('Model not enabled for this organization');
    }

    return model as unknown as ModelDocument;
  }

  async createFromTraining(training: TrainingDocument): Promise<ModelDocument> {
    const trainingId = String(training._id ?? training.id ?? '');

    // Idempotent check
    const existing = await this.prisma.model.findFirst({
      where: { trainingId },
    });
    if (existing) return existing as unknown as ModelDocument;

    // Resolve parent model by key stored in config
    const parentModelKey = (training.baseModel || training.model) as
      | string
      | undefined;
    let parentModel:
      | Awaited<ReturnType<typeof this.prisma.model.findFirst>>
      | undefined;

    if (parentModelKey) {
      const candidates = await this.prisma.model.findMany({
        where: { isDeleted: false },
      });
      parentModel =
        candidates.find((m) => {
          const config = m.config as Record<string, unknown>;
          return config?.key === parentModelKey;
        }) ?? undefined;
    }

    if (!parentModel) {
      this.logger.warn(
        `Base model not found for training ${trainingId}: ${parentModelKey}`,
      );
    }

    const parentConfig = parentModel?.config as Record<string, unknown> | null;
    const key = `genfeed-ai/${training.organization}/${trainingId}`;
    const organizationId = String(training.organization);

    try {
      const newModel = await this.prisma.model.create({
        data: {
          organizationId,
          trainingId,
          parentModelId: parentModel?.id ?? null,
          label: training.label as string,
          isActive: true,
          config: {
            key,
            category: parentConfig?.category ?? 'IMAGE',
            provider: 'genfeed-ai',
            cost: parentConfig?.cost ?? 1,
            isDefault: false,
            triggerWord: training.trigger as string | undefined,
            capabilities: parentConfig?.capabilities ?? [],
            supportsFeatures: [
              ...((parentConfig?.supportsFeatures as string[]) ?? []),
              'lora-weights',
            ],
          },
        },
      });

      await this.orgSettingsService.addEnabledModel(
        training.organization as string,
        newModel.id,
      );

      this.logger.log(`Created model ${key} from training ${trainingId}`);
      return newModel as unknown as ModelDocument;
    } catch (err: unknown) {
      const error = err as { code?: number };
      if (error.code === 11000) {
        const raceWinner = await this.prisma.model.findFirst({
          where: { trainingId },
        });
        return raceWinner as unknown as ModelDocument;
      }
      throw err;
    }
  }

  async reconcileTrainingModels(): Promise<void> {
    const allTrainings = await this.prisma.training.findMany({
      where: { status: 'COMPLETED', isDeleted: false },
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
      if (!modelsByOrg.has(orgKey)) modelsByOrg.set(orgKey, []);
      modelsByOrg.get(orgKey)!.push(model.id);
    }

    let repaired = 0;
    for (const [orgId, modelIds] of modelsByOrg) {
      const orgSettings = await this.orgSettingsService.findOne({
        organization: orgId,
      });
      const enabledSet = new Set<string>(orgSettings?.enabledModels ?? []);

      for (const modelId of modelIds) {
        if (!enabledSet.has(modelId)) {
          await this.orgSettingsService.addEnabledModel(orgId, modelId);
          repaired++;
        }
      }
    }

    this.logger.log(`Reconciled ${repaired} enabledModels drift entries`);
  }
}

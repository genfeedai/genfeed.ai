import type { LoggerService } from '@libs/logger/logger.service';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model as MongooseModel, Types } from 'mongoose';
import { DB_CONNECTIONS } from '../../../constants/database.constants';
import type { OrganizationSettingsService } from '../../organization-settings/services/organization-settings.service';
import type { TrainingDocument } from '../../trainings/schemas/training.schema';
import { Model, type ModelDocument } from '../schemas/model.schema';

@Injectable()
export class ModelRegistrationService {
  constructor(
    @InjectModel(Model.name, DB_CONNECTIONS.CLOUD)
    private readonly modelModel: MongooseModel<ModelDocument>,
    private readonly orgSettingsService: OrganizationSettingsService,
    private readonly logger: LoggerService,
  ) {}

  async validateModelForOrg(
    modelKey: string,
    organizationId: Types.ObjectId,
  ): Promise<ModelDocument> {
    const model = await this.modelModel
      .findOne({ key: modelKey, isDeleted: false })
      .lean()
      .exec();

    if (!model) {
      throw new BadRequestException(`Unknown model: ${modelKey}`);
    }

    // Org ownership check
    if (model.organization && !model.organization.equals(organizationId)) {
      throw new ForbiddenException('Model not available for this organization');
    }

    // enabledModels check
    const orgSettings = await this.orgSettingsService.findOne({
      organization: organizationId,
    });
    const isEnabled = (orgSettings?.enabledModels ?? []).some(
      (id: Types.ObjectId) => id.equals(model._id),
    );

    if (!isEnabled) {
      throw new ForbiddenException('Model not enabled for this organization');
    }

    return model as ModelDocument;
  }

  async createFromTraining(training: TrainingDocument): Promise<ModelDocument> {
    // Idempotent check
    const existing = await this.modelModel
      .findOne({ training: training._id })
      .lean()
      .exec();
    if (existing) return existing as ModelDocument;

    // Resolve parent model by key
    const parentModel = await this.modelModel
      .findOne({ key: training.baseModel || training.model, isDeleted: false })
      .lean()
      .exec();

    if (!parentModel) {
      this.logger.warn(
        `Base model not found for training ${training._id}: ${training.baseModel || training.model}`,
      );
    }

    const key = `genfeed-ai/${training.organization}/${training._id}`;

    try {
      const newModel = await this.modelModel.create({
        key,
        label: training.label,
        category: parentModel?.category ?? 'IMAGE',
        provider: 'genfeed-ai',
        cost: parentModel?.cost ?? 1,
        isActive: true,
        isDefault: false,
        organization: training.organization,
        training: training._id,
        parentModel: parentModel?._id ?? null,
        triggerWord: training.trigger,
        capabilities: parentModel?.capabilities ?? [],
        supportsFeatures: [
          ...(parentModel?.supportsFeatures ?? []),
          'lora-weights',
        ],
      });

      await this.orgSettingsService.addEnabledModel(
        training.organization,
        newModel._id,
      );

      this.logger.log(`Created model ${key} from training ${training._id}`);
      return newModel;
    } catch (err: any) {
      if (err.code === 11000) {
        // Race condition: another call created it between our findOne and create
        const raceWinner = await this.modelModel
          .findOne({ training: training._id })
          .lean()
          .exec();
        return raceWinner as ModelDocument;
      }
      throw err;
    }
  }
}

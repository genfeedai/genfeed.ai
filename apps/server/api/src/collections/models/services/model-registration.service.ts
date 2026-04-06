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
}

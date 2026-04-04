import { Model } from '@api/collections/models/schemas/model.schema';
import { ModelsService } from '@api/collections/models/services/models.service';
import {
  baseModelKey,
  isFalDestination,
  isReplicateDestination,
  isReplicateVersionId,
} from '@api/collections/models/utils/model-key.util';
import { ModelCategory } from '@genfeedai/enums';
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';

export interface ModelValidationOptions {
  category: ModelCategory;
  fieldName?: string;
}

export const ValidateModel =
  Reflector.createDecorator<ModelValidationOptions>();

@Injectable()
export class ModelsGuard implements CanActivate {
  constructor(
    private readonly modelsService: ModelsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get(ValidateModel, context.getHandler());

    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const fieldName = options.fieldName || 'model';
    const modelKey = request.body?.[fieldName];

    if (!modelKey) {
      return true;
    }

    // Allow dynamic provider destinations or version ids to bypass static validation
    if (
      isFalDestination(modelKey) ||
      isReplicateDestination(modelKey) ||
      isReplicateVersionId(modelKey)
    ) {
      return true;
    }

    const validModels = await this.getValidModelsByCategory(options.category);
    const validModelKeys = validModels.map((model) => model.key);
    const normalized = baseModelKey(modelKey);

    if (!normalized || !validModelKeys.includes(normalized)) {
      throw new HttpException(
        {
          detail: `Invalid model for ${options.category} generation. Valid models: ${validModelKeys.join(',')}`,
          title: 'Validation failed',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    request.validModels = validModels;
    request.selectedModel = validModels.find((m) => m.key === normalized);

    return true;
  }

  private async getValidModelsByCategory(category: string): Promise<Model[]> {
    const models = await this.modelsService.findAll(
      [
        {
          $match: {
            category,
            isDefault: true,
            isDeleted: false,
          },
        },
      ],
      { pagination: false },
    );

    return models.docs || [];
  }
}

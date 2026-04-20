// biome-ignore lint/style/useImportType: NestJS DI requires runtime imports
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import {
  isFalDestination,
  isReplicateDestination,
  isReplicateVersionId,
} from '@api/collections/models/utils/model-key.util';
import type { ModelCategory } from '@genfeedai/enums';
import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
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
    private readonly modelRegistrationService: ModelRegistrationService,
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

    const rawOrgId = request.context?.organizationId;

    if (!rawOrgId || !/^[0-9a-f]{24}$/i.test(rawOrgId)) {
      throw new ForbiddenException('Organization context is required');
    }

    const organizationId = rawOrgId;
    const model = await this.modelRegistrationService.validateModelForOrg(
      modelKey,
      organizationId,
    );

    // Validate that the model belongs to the requested category
    if (
      options.category &&
      model.category &&
      model.category !== options.category
    ) {
      throw new ForbiddenException(
        `Model "${modelKey}" is category "${model.category}", but this endpoint requires "${options.category}"`,
      );
    }

    request.selectedModel = model;

    return true;
  }
}

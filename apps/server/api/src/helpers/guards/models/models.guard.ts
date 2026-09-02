import type { AuthenticatedRequest } from '@api/auth/interfaces/authenticated-user.interface';
import { ModelRegistrationService } from '@api/collections/models/services/model-registration.service';
import {
  isFalDestination,
  isReplicateDestination,
  isReplicateVersionId,
} from '@api/collections/models/utils/model-key.util';
import { readRequestOrganizationId } from '@api/helpers/utils/request/read-request-organization-id.util';
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

export interface ModelsGuardRequest extends AuthenticatedRequest {
  body?: Record<string, unknown>;
  selectedModel?: unknown;
}

@Injectable()
export class ModelsGuard implements CanActivate {
  constructor(
    private readonly modelRegistrationService: ModelRegistrationService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get(ValidateModel, context.getHandler());

    return this.validate(context.switchToHttp().getRequest(), options);
  }

  /**
   * Explicit-input model allowlist validation. Shared by the HTTP guard adapter
   * above and by the in-process agent generation gateway.
   */
  async validate(
    request: ModelsGuardRequest,
    options: ModelValidationOptions | undefined,
  ): Promise<boolean> {
    if (!options) {
      return true;
    }

    const fieldName = options.fieldName || 'model';
    const modelKey = request.body?.[fieldName];

    if (typeof modelKey !== 'string' || !modelKey) {
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

    const organizationId = readRequestOrganizationId(request);

    if (!organizationId) {
      throw new ForbiddenException('Organization context is required');
    }
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

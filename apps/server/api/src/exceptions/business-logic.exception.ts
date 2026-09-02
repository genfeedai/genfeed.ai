import { HttpException, HttpStatus } from '@nestjs/common';

type BusinessErrorDetails = Record<string, unknown>;
type PlanLimitResource = 'brands' | 'channels' | 'organizations' | 'seats';

interface PlanLimitExceededOptions {
  currentCount: number;
  limit: number;
  resource: PlanLimitResource;
  upgradeTier: string | null;
}

const PLAN_LIMIT_RESOURCE_LABELS: Record<
  PlanLimitResource,
  { plural: string; singular: string }
> = {
  brands: { plural: 'brand kits', singular: 'brand kit' },
  channels: {
    plural: 'connected channels',
    singular: 'connected channel',
  },
  organizations: {
    plural: 'organizations',
    singular: 'organization',
  },
  seats: { plural: 'team seats', singular: 'team seat' },
};

function formatTierLabel(tier: string | null): string {
  if (!tier) {
    return 'a higher plan';
  }

  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

export class BusinessLogicException extends HttpException {
  constructor(
    message: string,
    details?: BusinessErrorDetails,
    public readonly errorCode: string = 'BUSINESS_LOGIC_ERROR',
  ) {
    super(
      {
        code: errorCode,
        detail: message,
        status: HttpStatus.UNPROCESSABLE_ENTITY,
        timestamp: new Date().toISOString(),
        title: 'Business Logic Error',
        ...(details && { meta: details }),
      },
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
    this.name = 'BusinessLogicException';
  }
}

export class InsufficientCreditsException extends BusinessLogicException {
  constructor(required: number, available: number) {
    super(
      `Insufficient credits: ${required} required, ${available} available`,
      { available, required },
      'INSUFFICIENT_CREDITS',
    );
  }
}

export class PlanLimitExceededException extends HttpException {
  constructor(options: PlanLimitExceededOptions) {
    const resourceLabel = PLAN_LIMIT_RESOURCE_LABELS[options.resource];
    const label =
      options.limit === 1 ? resourceLabel.singular : resourceLabel.plural;
    const tierLabel = formatTierLabel(options.upgradeTier);

    super(
      {
        code: 'PLAN_LIMIT_EXCEEDED',
        detail: `Your current plan includes ${options.limit} ${label}. Upgrade to ${tierLabel} to add more.`,
        meta: {
          currentCount: options.currentCount,
          limit: options.limit,
          resource: options.resource,
          upgradeTier: options.upgradeTier,
        },
        status: HttpStatus.FORBIDDEN,
        timestamp: new Date().toISOString(),
        title: 'Plan limit reached',
      },
      HttpStatus.FORBIDDEN,
    );
    this.name = 'PlanLimitExceededException';
  }
}

export class InvalidOperationException extends BusinessLogicException {
  constructor(operation: string, reason: string) {
    super(
      `Invalid operation: ${operation} - ${reason}`,
      { operation, reason },
      'INVALID_OPERATION',
    );
  }
}

export class ResourceNotReadyException extends BusinessLogicException {
  constructor(resource: string, currentState: string, requiredState: string) {
    super(
      `Resource ${resource} is not ready: current state is ${currentState}, required state is ${requiredState}`,
      { currentState, requiredState, resource },
      'RESOURCE_NOT_READY',
    );
  }
}

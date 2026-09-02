import type { RequestWithContext } from '@api/common/middleware/request-context.middleware';
import type { ModelValidationOptions } from '@api/helpers/guards/models/models.guard';
import type { ReservationCreditsConfig } from '@api/helpers/utils/credits/generation-credit-reservation.util';
import type { ActivitySource, MemberRole } from '@genfeedai/enums';
import type { CreditsConfig } from '@genfeedai/interfaces';
import type { Type } from '@nestjs/common';
import type { AuthenticatedUser } from '@server/auth/interfaces/authenticated-user.interface';

/**
 * The request object the invoker synthesizes for an in-process call. It carries
 * exactly the fields the shared guards, credits interceptor, and domain
 * services read off a real HTTP request.
 */
export interface AgentEndpointRequest extends RequestWithContext {
  creditsConfig?: ReservationCreditsConfig & {
    amount: number;
    deferred?: boolean;
    modelKey?: string;
  };
  creditsOutputCount?: number;
  selectedModel?: unknown;
}

/**
 * Who an in-process call runs as. Worker turns hold no HTTP session, so the
 * caller states the principal and the invoker resolves the full authenticated
 * identity from it.
 */
export interface AgentEndpointPrincipal {
  brandId?: string;
  organizationId: string;
  userId: string;
}

/**
 * Per-call ledger attribution. It overrides only the description and source of
 * the endpoint's credits config, never its price or its enforcement.
 */
export interface AgentEndpointCreditsAttribution {
  description?: string;
  source?: ActivitySource;
}

/** One in-process call: the principal plus the body an HTTP client would POST. */
export interface AgentEndpointInvocation {
  body: Record<string, unknown>;
  creditsAttribution?: AgentEndpointCreditsAttribution;
  principal: AgentEndpointPrincipal;
}

/** What a descriptor's `handle` receives once enforcement has passed. */
export interface AgentEndpointCallContext<TDto> {
  dto: TDto;
  request: AgentEndpointRequest;
  user: AuthenticatedUser;
}

/**
 * Declarative mirror of one HTTP controller method's enforcement config. Every
 * field maps 1:1 onto a decorator on the matching controller method, so the
 * in-process path and the HTTP path enforce the same contract.
 *
 * Read as: "what would Nest do for this route?" — and nothing else. Endpoint
 * descriptors carry no behaviour of their own beyond `handle`.
 */
export interface AgentEndpoint<TDto, TResult> {
  /** `@Credits(...)`. Omitted for a route that is not billable. */
  creditsConfig?: CreditsConfig;
  /** `@Body()` DTO metatype. */
  dto: Type<TDto>;
  handle(context: AgentEndpointCallContext<TDto>): Promise<TResult>;
  /** `@UseInterceptors(CreditsInterceptor)` */
  hasCreditsInterceptor: boolean;
  /** `@UseGuards(RolesGuard)` on the controller class. */
  hasRolesGuard: boolean;
  /** `@ValidateModel(...)`. Omitted when the route has no `ModelsGuard`. */
  modelValidation?: ModelValidationOptions;
  /** Route the response serializer reports as the resource link. */
  originalUrl: string;
  /** `@Param(...)` values. */
  params?: Record<string, string>;
  /** `@SetMetadata('roles', [...])` on the handler. */
  requiredRoles?: (string | MemberRole)[];
  /** `@DeferCreditsUntilModelResolution()` */
  shouldDeferCreditsUntilModelResolution?: boolean;
}

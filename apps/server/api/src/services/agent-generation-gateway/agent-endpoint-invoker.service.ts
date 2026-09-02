import { isPlatformSuperAdmin } from '@api/auth/better-auth/better-auth-access.util';
import { MembersService } from '@api/collections/members/services/members.service';
import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import type {
  AgentEndpoint,
  AgentEndpointCreditsAttribution,
  AgentEndpointInvocation,
  AgentEndpointPrincipal,
  AgentEndpointRequest,
} from '@api/services/agent-generation-gateway/agent-endpoint.interface';
import type { CreditsConfig } from '@genfeedai/interfaces';
import { ForbiddenException, Injectable, type Type } from '@nestjs/common';
import type { AuthenticatedUser } from '@server/auth/interfaces/authenticated-user.interface';
import { ValidationPipe } from '@server/helpers/pipes/validation.pipe';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';

/**
 * Runs one endpoint descriptor the way Nest runs the matching HTTP route.
 *
 * Agent turns and UI actions execute in the workers process, which holds no
 * HTTP session, so a loopback HTTP call to the API fails authentication. This
 * invoker is the in-process replacement: it synthesizes the request, hydrates
 * the request context, and drives the same guard, pipe, and credit-settlement
 * chain the controller would — using the guards' explicit-input methods, so
 * there is exactly one enforcement implementation for both paths.
 *
 * It is deliberately endpoint-agnostic. Gateways own the descriptors; this
 * class owns the sequence.
 */
@Injectable()
export class AgentEndpointInvoker {
  private readonly validationPipe = new ValidationPipe();

  constructor(
    private readonly creditsGuard: CreditsGuard,
    private readonly creditsInterceptor: CreditsInterceptor,
    private readonly membersService: MembersService,
    private readonly modelsGuard: ModelsGuard,
    private readonly prisma: PrismaService,
    private readonly requestContextMiddleware: RequestContextMiddleware,
    private readonly rolesGuard: RolesGuard,
    private readonly subscriptionGuard: SubscriptionGuard,
  ) {}

  /**
   * Enforce and run one endpoint, in Nest's order: class guards, then handler
   * guards, then the body pipe, then the handler, then credit settlement.
   */
  async invoke<TDto extends object, TResult>(
    endpoint: AgentEndpoint<TDto, TResult>,
    invocation: AgentEndpointInvocation,
  ): Promise<TResult> {
    const request = await this.buildRequest(endpoint, invocation);
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Call principal could not be resolved');
    }

    if (endpoint.hasRolesGuard) {
      await this.rolesGuard.assertRoles(request, endpoint.requiredRoles);
    }

    this.subscriptionGuard.assertActive(request);

    await this.creditsGuard.admit(
      request,
      this.attributeCredits(
        endpoint.creditsConfig,
        invocation.creditsAttribution,
      ),
      endpoint.shouldDeferCreditsUntilModelResolution === true,
    );

    await this.modelsGuard.validate(request, endpoint.modelValidation);

    const dto = await this.validateBody(request.body, endpoint.dto);

    try {
      const result = await endpoint.handle({ dto, request, user });

      if (endpoint.hasCreditsInterceptor) {
        await this.creditsInterceptor.settle(request, result);
      }

      return result;
    } catch (error: unknown) {
      if (endpoint.hasCreditsInterceptor) {
        await this.creditsInterceptor.release(request);
      }

      throw error;
    }
  }

  /**
   * Relabel the endpoint's credits config for the calling surface. Price,
   * model, and enforcement are untouched — only the ledger's description and
   * activity source move, so bot spend stays separable from agent spend.
   */
  private attributeCredits(
    creditsConfig: CreditsConfig | undefined,
    attribution: AgentEndpointCreditsAttribution | undefined,
  ): CreditsConfig | undefined {
    if (!creditsConfig || !attribution) {
      return creditsConfig;
    }

    return {
      ...creditsConfig,
      ...(attribution.description
        ? { description: attribution.description }
        : {}),
      ...(attribution.source ? { source: attribution.source } : {}),
    };
  }

  /**
   * Build the request an HTTP call would have produced and hydrate its context
   * exactly as `RequestContextMiddleware` does for a real request — guards read
   * super-admin, subscription status, and tier off `request.context`.
   */
  private async buildRequest<TDto, TResult>(
    endpoint: AgentEndpoint<TDto, TResult>,
    invocation: AgentEndpointInvocation,
  ): Promise<AgentEndpointRequest> {
    const user = await this.resolvePrincipal(invocation.principal);

    const request = {
      body: { ...invocation.body },
      headers: {},
      method: 'POST',
      originalUrl: endpoint.originalUrl,
      params: endpoint.params ?? {},
      query: {},
      url: endpoint.originalUrl,
      user,
    } as unknown as AgentEndpointRequest;

    await this.requestContextMiddleware.hydrate(request);

    return request;
  }

  /**
   * Resolve the stated principal into a full authenticated identity.
   *
   * The principal arrives from a worker job rather than from a verified
   * session, so organization access is proved here with an active-membership
   * lookup before any guard sees the request. Platform super-admins bypass it,
   * exactly as they do on the HTTP path.
   */
  private async resolvePrincipal(
    principal: AgentEndpointPrincipal,
  ): Promise<AuthenticatedUser> {
    const userId = principal.userId?.trim();
    const organizationId = principal.organizationId?.trim();

    if (!userId || !organizationId) {
      throw new ForbiddenException(
        'A user and an organization are required to run this call',
      );
    }

    const user = await this.prisma.user.findFirst({
      select: { id: true, platformRole: true },
      where: { id: userId, isDeleted: false },
    });

    if (!user) {
      throw new ForbiddenException('Call principal is not a known user');
    }

    const isSuperAdmin = isPlatformSuperAdmin(user.platformRole);

    if (!isSuperAdmin) {
      const member = await this.membersService.findOne({
        isActive: true,
        isDeleted: false,
        organizationId,
        userId: user.id,
      });

      if (!member) {
        throw new ForbiddenException(
          `User is not a member of organization ${organizationId}`,
        );
      }
    }

    return {
      brandId: principal.brandId ?? '',
      id: user.id,
      isSuperAdmin,
      organizationId,
      userId: user.id,
    };
  }

  private async validateBody<TDto>(
    body: unknown,
    metatype: Type<TDto>,
  ): Promise<TDto> {
    const validated = await this.validationPipe.transform(body, {
      metatype,
      type: 'body',
    });

    return validated as TDto;
  }
}

import { testMcpApprovalPricing } from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.fixture';
import { approvalGenerationConstraint } from '@api/collections/mcp-approvals/schemas/mcp-approval-pricing.schema';
import { MembersService } from '@api/collections/members/services/members.service';
import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
import { OrganizationModuleAccessService } from '@api/common/organization-modules/organization-module-access.service';
import { getOrganizationModuleExecutionContext } from '@api/common/organization-modules/organization-module-execution.context';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { ModelsGuard } from '@api/helpers/guards/models/models.guard';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { SubscriptionGuard } from '@api/helpers/guards/subscription/subscription.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import type {
  AgentEndpoint,
  AgentEndpointInvocation,
} from '@api/services/agent-generation-gateway/agent-endpoint.interface';
import { AgentEndpointInvoker } from '@api/services/agent-generation-gateway/agent-endpoint-invoker.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivitySource, MemberRole, PlatformRole } from '@genfeedai/contracts';
import { testId } from '@helpers/testing/test-id.helper';
import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { IsString } from 'class-validator';

const ORGANIZATION_ID = testId('org');
const USER_ID = testId('user');
const MEMBER_ID = testId('member');

class TestGenerationDto {
  @IsString()
  text!: string;
}

describe('AgentEndpointInvoker', () => {
  const invocation: AgentEndpointInvocation = {
    body: { text: 'a product launch' },
    principal: { organizationId: ORGANIZATION_ID, userId: USER_ID },
  };

  let invoker: AgentEndpointInvoker;
  let order: string[];
  let creditsGuard: { admit: ReturnType<typeof vi.fn> };
  let creditsInterceptor: {
    release: ReturnType<typeof vi.fn>;
    settle: ReturnType<typeof vi.fn>;
  };
  let membersService: { findOne: ReturnType<typeof vi.fn> };
  let modelsGuard: { validate: ReturnType<typeof vi.fn> };
  let prisma: { user: { findFirst: ReturnType<typeof vi.fn> } };
  let requestContextMiddleware: { hydrate: ReturnType<typeof vi.fn> };
  let rolesGuard: { assertRoles: ReturnType<typeof vi.fn> };
  let subscriptionGuard: { assertActive: ReturnType<typeof vi.fn> };
  let moduleAccess: { assertAccess: ReturnType<typeof vi.fn> };

  function buildEndpoint(
    overrides: Partial<AgentEndpoint<TestGenerationDto, string>> = {},
  ): AgentEndpoint<TestGenerationDto, string> {
    return {
      organizationModule: { moduleId: 'playground' },
      creditsConfig: {
        description: 'Image generation',
        source: ActivitySource.IMAGE_GENERATION,
      },
      dto: TestGenerationDto,
      handle: vi.fn(async () => {
        order.push('handle');
        return 'generated';
      }),
      hasCreditsInterceptor: true,
      hasRolesGuard: true,
      originalUrl: '/v1/images',
      requiredRoles: [MemberRole.OWNER],
      ...overrides,
    };
  }

  beforeEach(async () => {
    order = [];
    creditsGuard = {
      admit: vi.fn(async () => {
        order.push('credits');
        return true;
      }),
    };
    creditsInterceptor = {
      release: vi.fn(async () => {
        order.push('release');
      }),
      settle: vi.fn(async () => {
        order.push('settle');
      }),
    };
    membersService = {
      findOne: vi.fn().mockResolvedValue({ id: MEMBER_ID }),
    };
    modelsGuard = {
      validate: vi.fn(async () => {
        order.push('models');
        return true;
      }),
    };
    prisma = {
      user: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ id: USER_ID, platformRole: null }),
      },
    };
    requestContextMiddleware = {
      hydrate: vi.fn(async () => {
        order.push('hydrate');
      }),
    };
    rolesGuard = {
      assertRoles: vi.fn(async () => {
        order.push('roles');
        return true;
      }),
    };
    subscriptionGuard = {
      assertActive: vi.fn(async () => {
        order.push('subscription');
        return true;
      }),
    };
    moduleAccess = {
      assertAccess: vi.fn(async () => {
        order.push('module');
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentEndpointInvoker,
        { provide: OrganizationModuleAccessService, useValue: moduleAccess },
        { provide: CreditsGuard, useValue: creditsGuard },
        { provide: CreditsInterceptor, useValue: creditsInterceptor },
        { provide: MembersService, useValue: membersService },
        { provide: ModelsGuard, useValue: modelsGuard },
        { provide: PrismaService, useValue: prisma },
        {
          provide: RequestContextMiddleware,
          useValue: requestContextMiddleware,
        },
        { provide: RolesGuard, useValue: rolesGuard },
        { provide: SubscriptionGuard, useValue: subscriptionGuard },
      ],
    }).compile();

    invoker = module.get(AgentEndpointInvoker);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('carries only server-approved pricing after the credit guard replaces its config', async () => {
    const constraint = approvalGenerationConstraint(testMcpApprovalPricing());
    if (!constraint) throw new Error('test quote unavailable');
    creditsGuard.admit.mockImplementation(async (request) => {
      request.creditsConfig = {
        deferred: true,
        source: ActivitySource.IMAGE_GENERATION,
      };
    });
    const endpoint = buildEndpoint({
      shouldDeferCreditsUntilModelResolution: true,
      handle: vi.fn(async ({ request }) => {
        expect(request.creditsConfig).toMatchObject({
          deferred: true,
          approvedGenerationQuote: constraint,
        });
        return 'generated';
      }),
    });
    await expect(
      invoker.invoke(endpoint, {
        ...invocation,
        approvedGenerationQuote: constraint,
      }),
    ).resolves.toBe('generated');
  });
  it.each(['/v1/images', '/v1/music', '/v1/alternate'])(
    'rejects unsupported quote admission before credit admission: %s',
    async (originalUrl) => {
      const constraint = approvalGenerationConstraint(testMcpApprovalPricing());
      if (!constraint) throw new Error('test quote unavailable');
      const endpoint = buildEndpoint({ originalUrl });
      await expect(
        invoker.invoke(endpoint, {
          ...invocation,
          approvedGenerationQuote: constraint,
        }),
      ).rejects.toThrow('supported deferred');
      expect(creditsGuard.admit).not.toHaveBeenCalled();
      expect(endpoint.handle).not.toHaveBeenCalled();
    },
  );

  it('runs the HTTP enforcement chain in order and settles the credits', async () => {
    const endpoint = buildEndpoint();

    await expect(invoker.invoke(endpoint, invocation)).resolves.toBe(
      'generated',
    );

    expect(order).toEqual([
      'hydrate',
      'roles',
      'module',
      'subscription',
      'credits',
      'models',
      'handle',
      'settle',
    ]);
    expect(rolesGuard.assertRoles).toHaveBeenCalledWith(
      expect.objectContaining({ originalUrl: '/v1/images' }),
      [MemberRole.OWNER],
    );
    expect(subscriptionGuard.assertActive).toHaveBeenCalledWith(
      expect.objectContaining({ originalUrl: '/v1/images' }),
      endpoint.creditsConfig,
      'playground',
    );
    expect(creditsInterceptor.release).not.toHaveBeenCalled();
  });

  it('blocks a disabled module before subscription, credits, models or the handler and ignores forged body ownership', async () => {
    const endpoint = buildEndpoint({
      organizationModule: { moduleId: 'automation' },
      isSubscriptionCheckSkipped: true,
    });
    moduleAccess.assertAccess.mockRejectedValue(
      new ForbiddenException('Module disabled'),
    );
    await expect(
      invoker.invoke(endpoint, {
        ...invocation,
        body: {
          ...invocation.body,
          moduleId: 'playground',
          organizationId: 'forged',
        },
      }),
    ).rejects.toThrow('Module disabled');
    expect(moduleAccess.assertAccess).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      'automation',
      'write',
    );
    expect(subscriptionGuard.assertActive).not.toHaveBeenCalled();
    expect(creditsGuard.admit).not.toHaveBeenCalled();
    expect(modelsGuard.validate).not.toHaveBeenCalled();
    expect(endpoint.handle).not.toHaveBeenCalled();
    expect(creditsInterceptor.release).not.toHaveBeenCalled();
  });

  it('requires server-owned module metadata before spending', async () => {
    const endpoint = buildEndpoint();
    Reflect.deleteProperty(endpoint, 'organizationModule');
    await expect(invoker.invoke(endpoint, invocation)).rejects.toThrow(
      'Endpoint module ownership is required',
    );
    expect(moduleAccess.assertAccess).not.toHaveBeenCalled();
    expect(creditsGuard.admit).not.toHaveBeenCalled();
    expect(endpoint.handle).not.toHaveBeenCalled();
  });

  it('propagates only descriptor-owned module and authenticated organization into nested execution', async () => {
    const handle = vi.fn(async () => {
      await Promise.resolve();
      expect(getOrganizationModuleExecutionContext()).toEqual({
        organizationId: ORGANIZATION_ID,
        moduleId: 'storyboard',
      });
      return 'generated';
    });
    await invoker.invoke(
      buildEndpoint({ organizationModule: { moduleId: 'storyboard' }, handle }),
      {
        ...invocation,
        body: {
          ...invocation.body,
          moduleId: 'automation',
          organizationId: 'forged',
        },
      },
    );
    expect(handle).toHaveBeenCalledTimes(1);
    expect(getOrganizationModuleExecutionContext()).toBeUndefined();
  });

  it('preserves explicit export admission independently of subscription-skip flags', async () => {
    const endpoint = buildEndpoint({
      organizationModule: { moduleId: 'messages', operation: 'export' },
      isSubscriptionCheckSkipped: true,
      creditsConfig: undefined,
      hasCreditsInterceptor: false,
    });
    await invoker.invoke(endpoint, invocation);
    expect(moduleAccess.assertAccess).toHaveBeenCalledWith(
      ORGANIZATION_ID,
      'messages',
      'export',
    );
  });

  it('preserves the subscription gate when the endpoint has no credits config', async () => {
    const endpoint = buildEndpoint({
      creditsConfig: undefined,
      hasCreditsInterceptor: false,
    });
    subscriptionGuard.assertActive.mockImplementation(async () => {
      throw new ForbiddenException('Active subscription required');
    });

    await expect(invoker.invoke(endpoint, invocation)).rejects.toThrow(
      'Active subscription required',
    );

    expect(subscriptionGuard.assertActive).toHaveBeenCalledWith(
      expect.objectContaining({ originalUrl: '/v1/images' }),
      undefined,
      'playground',
    );
    expect(creditsGuard.admit).not.toHaveBeenCalled();
    expect(endpoint.handle).not.toHaveBeenCalled();
  });

  it('skips the subscription gate only for an endpoint that declares no SubscriptionGuard', async () => {
    const endpoint = buildEndpoint({
      creditsConfig: undefined,
      hasCreditsInterceptor: false,
      isSubscriptionCheckSkipped: true,
    });
    subscriptionGuard.assertActive.mockImplementation(async () => {
      throw new ForbiddenException('Active subscription required');
    });

    await expect(invoker.invoke(endpoint, invocation)).resolves.toBe(
      'generated',
    );

    expect(subscriptionGuard.assertActive).not.toHaveBeenCalled();
    expect(rolesGuard.assertRoles).toHaveBeenCalled();
    expect(endpoint.handle).toHaveBeenCalledOnce();
  });

  it('validates the body against the endpoint DTO before the handler runs', async () => {
    const endpoint = buildEndpoint();

    await invoker.invoke(endpoint, invocation);

    expect(endpoint.handle).toHaveBeenCalledWith(
      expect.objectContaining({
        dto: expect.any(TestGenerationDto),
        user: expect.objectContaining({
          organizationId: ORGANIZATION_ID,
          userId: USER_ID,
        }),
      }),
    );
  });

  it('rejects a body the endpoint DTO does not accept', async () => {
    await expect(
      invoker.invoke(buildEndpoint(), {
        body: { text: 42 },
        principal: invocation.principal,
      }),
    ).rejects.toThrow('Validation failed');
    expect(creditsInterceptor.settle).not.toHaveBeenCalled();
  });

  it('applies the caller ledger attribution without changing enforcement', async () => {
    await invoker.invoke(buildEndpoint(), {
      ...invocation,
      creditsAttribution: {
        description: 'Bot media generation',
        source: ActivitySource.BOT_GENERATION,
      },
    });

    expect(creditsGuard.admit).toHaveBeenCalledWith(
      expect.anything(),
      {
        description: 'Bot media generation',
        source: ActivitySource.BOT_GENERATION,
      },
      false,
    );
  });

  it('releases the reservation when the handler fails', async () => {
    const endpoint = buildEndpoint({
      handle: vi.fn().mockRejectedValue(new Error('provider timeout')),
    });

    await expect(invoker.invoke(endpoint, invocation)).rejects.toThrow(
      'provider timeout',
    );

    expect(creditsInterceptor.release).toHaveBeenCalledTimes(1);
    expect(creditsInterceptor.settle).not.toHaveBeenCalled();
  });

  it('refuses a principal without an active membership', async () => {
    membersService.findOne.mockResolvedValue(null);
    const endpoint = buildEndpoint();

    await expect(invoker.invoke(endpoint, invocation)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(endpoint.handle).not.toHaveBeenCalled();
    expect(creditsGuard.admit).not.toHaveBeenCalled();
  });

  it('requires membership from a platform superadmin, which has no client IP here', async () => {
    membersService.findOne.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({
      id: USER_ID,
      platformRole: PlatformRole.SUPERADMIN,
    });
    const endpoint = buildEndpoint();

    await expect(invoker.invoke(endpoint, invocation)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(endpoint.handle).not.toHaveBeenCalled();
  });

  it('refuses to run a billable endpoint with no credits interceptor before reserving anything', async () => {
    const endpoint = buildEndpoint({
      hasCreditsInterceptor: false,
      originalUrl: '/v1/images/upscale',
    });

    await expect(invoker.invoke(endpoint, invocation)).rejects.toThrow(
      '/v1/images/upscale',
    );

    expect(creditsGuard.admit).not.toHaveBeenCalled();
    expect(requestContextMiddleware.hydrate).not.toHaveBeenCalled();
    expect(endpoint.handle).not.toHaveBeenCalled();
  });

  it('skips the roles guard for an endpoint whose controller has none', async () => {
    await invoker.invoke(
      buildEndpoint({ hasRolesGuard: false, requiredRoles: undefined }),
      invocation,
    );

    expect(rolesGuard.assertRoles).not.toHaveBeenCalled();
    expect(order).toEqual([
      'hydrate',
      'module',
      'subscription',
      'credits',
      'models',
      'handle',
      'settle',
    ]);
  });
});

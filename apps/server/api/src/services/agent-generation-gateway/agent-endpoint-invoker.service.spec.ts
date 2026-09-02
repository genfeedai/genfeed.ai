import { MembersService } from '@api/collections/members/services/members.service';
import { RequestContextMiddleware } from '@api/common/middleware/request-context.middleware';
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
import { ActivitySource, MemberRole, PlatformRole } from '@genfeedai/enums';
import { testId } from '@helpers/testing/test-id.helper';
import { ForbiddenException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '@server/shared/modules/prisma/prisma.service';
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

  function buildEndpoint(
    overrides: Partial<AgentEndpoint<TestGenerationDto, string>> = {},
  ): AgentEndpoint<TestGenerationDto, string> {
    return {
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
      assertActive: vi.fn(() => {
        order.push('subscription');
        return true;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentEndpointInvoker,
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

  it('runs the HTTP enforcement chain in order and settles the credits', async () => {
    const endpoint = buildEndpoint();

    await expect(invoker.invoke(endpoint, invocation)).resolves.toBe(
      'generated',
    );

    expect(order).toEqual([
      'hydrate',
      'roles',
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
    expect(creditsInterceptor.release).not.toHaveBeenCalled();
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

  it('exempts a platform superadmin from the membership proof', async () => {
    membersService.findOne.mockResolvedValue(null);
    prisma.user.findFirst.mockResolvedValue({
      id: USER_ID,
      platformRole: PlatformRole.SUPERADMIN,
    });

    await expect(invoker.invoke(buildEndpoint(), invocation)).resolves.toBe(
      'generated',
    );
    expect(membersService.findOne).not.toHaveBeenCalled();
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
      'subscription',
      'credits',
      'models',
      'handle',
      'settle',
    ]);
  });
});

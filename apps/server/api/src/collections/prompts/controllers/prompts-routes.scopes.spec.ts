import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { AdminPromptsController } from '@api/collections/prompts/controllers/admin-prompts.controller';
import { PromptsController } from '@api/collections/prompts/controllers/prompts.controller';
import { PromptsOperationsController } from '@api/collections/prompts/controllers/prompts-operations.controller';
import { PromptsTransformationsController } from '@api/collections/prompts/controllers/prompts-transformations.controller';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { ActionOrigin, ApiKeyCategory } from '@genfeedai/contracts';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { METHOD_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';

function keyWithScopes(scopes: string[]): ApiKeyDocument {
  return {
    allowedIps: [],
    category: ApiKeyCategory.GENFEEDAI,
    defaultBrandId: null,
    expiresAt: null,
    id: 'key-1',
    isRevoked: false,
    key: 'hashed',
    metadata: null,
    organizationId: 'org-1',
    rateLimit: 60,
    scopes,
    userId: 'user-1',
  } as unknown as ApiKeyDocument;
}

function buildGuard(apiKey: ApiKeyDocument): ApiKeyAuthGuard {
  const apiKeysService = {
    canSwitchOrganizations: () => false,
    checkRateLimit: async () => ({
      allowed: true,
      limit: 60,
      retryAfterSeconds: 0,
    }),
    findByKey: async () => apiKey,
    hasScope: ApiKeysService.prototype.hasScope,
    isIpAllowed: () => true,
    isMcpOAuthSession: () => false,
    readMcpAccessMode: () => 'standard',
    resolveActionOrigin: () => ActionOrigin.API,
    resolveAnyBrandId: async () => 'brand-1',
    resolveEffectiveOrganizationId: async () => 'org-1',
    resolveValidDefaultBrandId: async () => undefined,
    updateLastUsed: async () => undefined,
  } as unknown as ApiKeysService;

  return new ApiKeyAuthGuard(apiKeysService, new Reflector());
}

type Handler = (...args: never[]) => unknown;
type ControllerClass = new (...args: never[]) => object;

function routeContext(
  controller: ControllerClass,
  handler: Handler,
): ExecutionContext {
  const request = {
    connection: { remoteAddress: '203.0.113.7' },
    headers: { authorization: 'Bearer gf_test_key' },
    ip: '203.0.113.7',
    user: null,
  };

  return {
    getClass: () => controller,
    getHandler: () => handler,
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader: () => undefined }),
    }),
  } as unknown as ExecutionContext;
}

const ROUTES = [
  [
    'GET /prompts',
    PromptsController,
    PromptsController.prototype.findAll,
    'prompts:read',
  ],
  [
    'GET /prompts/:promptId',
    PromptsController,
    PromptsController.prototype.findOne,
    'prompts:read',
  ],
  [
    'POST /prompts',
    PromptsController,
    PromptsController.prototype.create,
    'prompts:create',
  ],
  [
    'PATCH /prompts/:promptId',
    PromptsController,
    PromptsController.prototype.update,
    'prompts:update',
  ],
  [
    'POST /prompts/:promptId/publish',
    PromptsController,
    PromptsController.prototype.publishToMarketplace,
    'prompts:update',
  ],
  [
    'GET /prompts/admin/without-generation',
    AdminPromptsController,
    AdminPromptsController.prototype.list,
    'admin',
  ],
  [
    'POST /prompts/parse',
    PromptsTransformationsController,
    PromptsTransformationsController.prototype.parse,
    'prompts:read',
  ],
  [
    'POST /prompts/:promptId/remix',
    PromptsTransformationsController,
    PromptsTransformationsController.prototype.createRemix,
    'prompts:create',
  ],
  [
    'POST /prompts/:promptId/enhance',
    PromptsTransformationsController,
    PromptsTransformationsController.prototype.enhanceExisting,
    'prompts:update',
  ],
  [
    'POST /prompts/voice-to-speech',
    PromptsOperationsController,
    PromptsOperationsController.prototype.voiceToSpeech,
    'prompts:create',
  ],
  [
    'POST /prompts/tweet',
    PromptsOperationsController,
    PromptsOperationsController.prototype.generateTweetReply,
    'prompts:create',
  ],
] as const;

const CONTROLLERS: readonly ControllerClass[] = [
  AdminPromptsController,
  PromptsController,
  PromptsOperationsController,
  PromptsTransformationsController,
];

/** Names of the route handlers on a controller (anything carrying HTTP route metadata). */
function routeHandlerNames(controller: ControllerClass): string[] {
  return Object.getOwnPropertyNames(controller.prototype).filter(
    (name) =>
      name !== 'constructor' &&
      Reflect.getMetadata(
        METHOD_METADATA,
        (controller.prototype as Record<string, unknown>)[name] as object,
      ) !== undefined,
  );
}

describe.each(ROUTES)(
  '%s API key scope',
  (_route, controller, handler, scope) => {
    it('refuses a key without the scope', async () => {
      const guard = buildGuard(keyWithScopes(['brands:read']));

      await expect(
        guard.canActivate(routeContext(controller, handler)),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it('refuses a key that only holds another prompts scope', async () => {
      // No prompts route requires prompts:delete, so it never satisfies one.
      const guard = buildGuard(keyWithScopes(['prompts:delete']));

      await expect(
        guard.canActivate(routeContext(controller, handler)),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it(`allows a key with ${scope}`, async () => {
      const guard = buildGuard(keyWithScopes([scope]));

      await expect(
        guard.canActivate(routeContext(controller, handler)),
      ).resolves.toBe(true);
    });
  },
);

describe('prompts route coverage', () => {
  it('refuses a read-only key on a route that writes', async () => {
    const guard = buildGuard(keyWithScopes(['prompts:read']));

    await expect(
      guard.canActivate(
        routeContext(PromptsController, PromptsController.prototype.create),
      ),
    ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
  });

  it.each(
    CONTROLLERS.map((controller) => [controller.name, controller] as const),
  )('%s lists every route handler in the scope table', (_name, controller) => {
    const listed = ROUTES.filter(
      ([, tableController]) => tableController === controller,
    )
      .map(([, , handler]) => handler.name)
      .sort();

    expect(routeHandlerNames(controller).sort()).toEqual(listed);
  });
});

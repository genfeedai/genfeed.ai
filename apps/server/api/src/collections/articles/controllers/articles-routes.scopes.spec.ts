import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { ArticlesController } from '@api/collections/articles/controllers/articles.controller';
import { ArticlesTrafficController } from '@api/collections/articles/controllers/articles-traffic.controller';
import { ArticlesOperationsController } from '@api/collections/articles/controllers/operations/articles-operations.controller';
import { ArticlesTransformationsController } from '@api/collections/articles/controllers/transformations/articles-transformations.controller';
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
    'GET /articles',
    ArticlesController,
    ArticlesController.prototype.findAll,
    'articles:read',
  ],
  [
    'GET /articles/:id',
    ArticlesController,
    ArticlesController.prototype.findOne,
    'articles:read',
  ],
  [
    'GET /articles/:articleId/preview-links',
    ArticlesController,
    ArticlesController.prototype.createPreviewLink,
    'articles:create',
  ],
  [
    'GET /articles/:articleId/versions',
    ArticlesController,
    ArticlesController.prototype.getVersions,
    'articles:read',
  ],
  [
    'POST /articles',
    ArticlesController,
    ArticlesController.prototype.create,
    'articles:create',
  ],
  [
    'PATCH /articles/:articleId',
    ArticlesController,
    ArticlesController.prototype.patch,
    'articles:create',
  ],
  [
    'DELETE /articles/:id',
    ArticlesController,
    ArticlesController.prototype.remove,
    'articles:create',
  ],
  [
    'GET /articles/:articleId/website-traffic',
    ArticlesTrafficController,
    ArticlesTrafficController.prototype.getTraffic,
    'articles:read',
  ],
  [
    'POST /articles/generations',
    ArticlesOperationsController,
    ArticlesOperationsController.prototype.generateArticles,
    'articles:create',
  ],
  [
    'POST /articles/:articleId/reviews',
    ArticlesOperationsController,
    ArticlesOperationsController.prototype.reviewArticle,
    'articles:create',
  ],
  [
    'POST /articles/:articleId/thread-conversions',
    ArticlesTransformationsController,
    ArticlesTransformationsController.prototype.convertToThread,
    'articles:create',
  ],
  [
    'POST /articles/:articleId/virality-analyses',
    ArticlesTransformationsController,
    ArticlesTransformationsController.prototype.analyzeVirality,
    'articles:create',
  ],
  [
    'POST /articles/:articleId/seo-scores',
    ArticlesTransformationsController,
    ArticlesTransformationsController.prototype.scoreSeo,
    'articles:create',
  ],
  [
    'POST /articles/:articleId/remixes',
    ArticlesTransformationsController,
    ArticlesTransformationsController.prototype.createRemix,
    'articles:create',
  ],
  [
    'POST /articles/:articleId/prompts',
    ArticlesTransformationsController,
    ArticlesTransformationsController.prototype.generatePrompt,
    'articles:create',
  ],
  [
    'POST /articles/:articleId/images',
    ArticlesTransformationsController,
    ArticlesTransformationsController.prototype.generateImageFromArticle,
    'articles:create',
  ],
  [
    'POST /articles/:articleId/videos',
    ArticlesTransformationsController,
    ArticlesTransformationsController.prototype.generateVideoFromArticle,
    'articles:create',
  ],
] as const;

const CONTROLLERS: readonly ControllerClass[] = [
  ArticlesController,
  ArticlesOperationsController,
  ArticlesTrafficController,
  ArticlesTransformationsController,
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

const OTHER_ARTICLES_SCOPE = {
  'articles:create': 'articles:read',
  'articles:read': 'articles:create',
} as const;

describe.each(ROUTES)(
  '%s API key scope',
  (_route, controller, handler, scope) => {
    it('refuses a key without the scope', async () => {
      const guard = buildGuard(keyWithScopes(['brands:read']));

      await expect(
        guard.canActivate(routeContext(controller, handler)),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it('refuses a key that only holds the other articles scope', async () => {
      const guard = buildGuard(keyWithScopes([OTHER_ARTICLES_SCOPE[scope]]));

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

describe('articles route coverage', () => {
  it('refuses a read-only key on a route that writes', async () => {
    const guard = buildGuard(keyWithScopes(['articles:read']));

    await expect(
      guard.canActivate(
        routeContext(ArticlesController, ArticlesController.prototype.create),
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

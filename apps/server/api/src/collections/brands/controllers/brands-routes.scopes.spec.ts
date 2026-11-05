import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { BrandFontAssetsController } from '@api/collections/brands/controllers/brand-font-assets.controller';
import { BrandLutController } from '@api/collections/brands/controllers/brand-lut.controller';
import { BrandOsRevisionsController } from '@api/collections/brands/controllers/brand-os-revisions.controller';
import { BrandOsScanController } from '@api/collections/brands/controllers/brand-os-scan.controller';
import { BrandRelocationsController } from '@api/collections/brands/controllers/brand-relocations.controller';
import { BrandsController } from '@api/collections/brands/controllers/brands.controller';
import { BrandsAgentConfigController } from '@api/collections/brands/controllers/brands-agent-config.controller';
import { BrandsSetupController } from '@api/collections/brands/controllers/brands-setup.controller';
import { BrandsRelationshipsController } from '@api/collections/brands/controllers/relationships/brands-relationships.controller';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { ActionOrigin, ApiKeyCategory } from '@genfeedai/contracts';
import {
  type ExecutionContext,
  RequestMethod,
  UnauthorizedException,
} from '@nestjs/common';
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

function brandRouteContext(
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

const BRAND_WRITE_ROUTES: ReadonlyArray<
  readonly [string, ControllerClass, Handler]
> = [
  ['POST /brands', BrandsController, BrandsController.prototype.create],
  ['PATCH /brands/:id', BrandsController, BrandsController.prototype.patch],
  ['DELETE /brands/:id', BrandsController, BrandsController.prototype.remove],
  [
    'POST /brands/:brandId/font-assets',
    BrandFontAssetsController,
    BrandFontAssetsController.prototype.upload,
  ],
  [
    'DELETE /brands/:brandId/font-assets/:assetId',
    BrandFontAssetsController,
    BrandFontAssetsController.prototype.remove,
  ],
  [
    'PUT /brands/:brandId/lut',
    BrandLutController,
    BrandLutController.prototype.upload,
  ],
  [
    'DELETE /brands/:brandId/lut',
    BrandLutController,
    BrandLutController.prototype.remove,
  ],
  [
    'POST /brands/:id/brand-os/revisions',
    BrandOsRevisionsController,
    BrandOsRevisionsController.prototype.create,
  ],
  [
    'PATCH /brands/:id/brand-os/revisions/:revisionId',
    BrandOsRevisionsController,
    BrandOsRevisionsController.prototype.update,
  ],
  [
    'POST /brands/:id/brand-os/revisions/:revisionId/approve',
    BrandOsRevisionsController,
    BrandOsRevisionsController.prototype.approve,
  ],
  [
    'POST /brands/:id/brand-os/scan',
    BrandOsScanController,
    BrandOsScanController.prototype.start,
  ],
  [
    'PATCH /brands/:id/agent-config',
    BrandsAgentConfigController,
    BrandsAgentConfigController.prototype.updateAgentConfig,
  ],
  [
    'POST /brands/:id/brand-kit/crawl',
    BrandsAgentConfigController,
    BrandsAgentConfigController.prototype.crawlBrandKitWebsite,
  ],
  [
    'POST /brands/:id/brand-kit/apply',
    BrandsAgentConfigController,
    BrandsAgentConfigController.prototype.applyBrandKitDraft,
  ],
  [
    'POST /brands/:id/brand-kit/manual',
    BrandsAgentConfigController,
    BrandsAgentConfigController.prototype.createManualBrandKitDraft,
  ],
  [
    'POST /brands/:id/brand-kit/brand-os/claim',
    BrandsAgentConfigController,
    BrandsAgentConfigController.prototype.claimBrandOsPreview,
  ],
  [
    'POST /brands/:id/brand-kit/assets/import',
    BrandsAgentConfigController,
    BrandsAgentConfigController.prototype.importBrandKitAssets,
  ],
  [
    'POST /brands/:id/agent-config/generate-voice',
    BrandsAgentConfigController,
    BrandsAgentConfigController.prototype.generateBrandVoice,
  ],
  [
    'PATCH /brands/:id/agent-config/enabled-skills',
    BrandsAgentConfigController,
    BrandsAgentConfigController.prototype.updateEnabledSkills,
  ],
  [
    'POST /brands/website-preview',
    BrandsSetupController,
    BrandsSetupController.prototype.previewWebsite,
  ],
  [
    'POST /brands/:id/scrape',
    BrandsSetupController,
    BrandsSetupController.prototype.scrapeBrand,
  ],
  [
    'POST /brands/:id/reference-images',
    BrandsSetupController,
    BrandsSetupController.prototype.addReferenceImages,
  ],
];

const BRAND_CONTROLLERS: readonly ControllerClass[] = [
  BrandFontAssetsController,
  BrandLutController,
  BrandOsRevisionsController,
  BrandOsScanController,
  BrandRelocationsController,
  BrandsAgentConfigController,
  BrandsController,
  BrandsRelationshipsController,
  BrandsSetupController,
];

/**
 * Names of the handlers that change something (any HTTP method but GET),
 * including ones inherited from a base controller.
 */
function mutatingHandlerNames(controller: ControllerClass): string[] {
  const names = new Set<string>();
  for (
    let prototype = controller.prototype as object | null;
    prototype && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype)
  ) {
    for (const name of Object.getOwnPropertyNames(prototype)) {
      if (name === 'constructor') continue;
      const method = Reflect.getMetadata(
        METHOD_METADATA,
        (controller.prototype as Record<string, unknown>)[name] as object,
      );
      if (method !== undefined && method !== RequestMethod.GET) {
        names.add(name);
      }
    }
  }
  return [...names].sort();
}

describe.each(BRAND_WRITE_ROUTES)(
  '%s API key scope',
  (_route, controller, handler) => {
    it('refuses a key that can only read brands', async () => {
      const guard = buildGuard(keyWithScopes(['brands:read']));

      await expect(
        guard.canActivate(brandRouteContext(controller, handler)),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it('allows a key with brands:write', async () => {
      const guard = buildGuard(keyWithScopes(['brands:write']));

      await expect(
        guard.canActivate(brandRouteContext(controller, handler)),
      ).resolves.toBe(true);
    });
  },
);

describe('brand write route coverage', () => {
  it.each(
    BRAND_CONTROLLERS.map(
      (controller) => [controller.name, controller] as const,
    ),
  )(
    '%s lists every route that changes a brand in the scope table',
    (_name, controller) => {
      const listed = BRAND_WRITE_ROUTES.filter(
        ([, tableController]) => tableController === controller,
      )
        .map(([, , handler]) => handler.name)
        .sort();

      expect(mutatingHandlerNames(controller)).toEqual(listed);
    },
  );
});

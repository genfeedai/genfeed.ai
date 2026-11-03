import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { ImagesController } from '@api/collections/images/controllers/images.controller';
import { ImagesOperationsController } from '@api/collections/images/controllers/operations/images-operations.controller';
import { ImagesRelationshipsController } from '@api/collections/images/controllers/relationships/images-relationships.controller';
import { ImagesReframeController } from '@api/collections/images/controllers/transformations/images-reframe.controller';
import { ImagesResizeController } from '@api/collections/images/controllers/transformations/images-resize.controller';
import { ImagesUpscaleController } from '@api/collections/images/controllers/transformations/images-upscale.controller';
import { ImagesUploadsController } from '@api/collections/images/controllers/upload/images-uploads.controller';
import { ApiKeyAuthGuard } from '@api/helpers/guards/api-key/api-key.guard';
import { ActionOrigin, ApiKeyCategory } from '@genfeedai/contracts';
import { type ExecutionContext, UnauthorizedException } from '@nestjs/common';
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

function imageRouteContext(
  controller: new (...args: never[]) => object,
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

const IMAGE_ROUTES = [
  [
    'GET /images',
    ImagesController,
    ImagesController.prototype.findAll,
    'images:read',
  ],
  [
    'GET /images/:imageId',
    ImagesController,
    ImagesController.prototype.findOne,
    'images:read',
  ],
  [
    'DELETE /images/:imageId',
    ImagesController,
    ImagesController.prototype.remove,
    'images:delete',
  ],
  [
    'GET /images/:imageId/children',
    ImagesRelationshipsController,
    ImagesRelationshipsController.prototype.findChildren,
    'images:read',
  ],
  [
    'POST /images',
    ImagesOperationsController,
    ImagesOperationsController.prototype.create,
    'images:create',
  ],
  [
    'POST /images/:id/edit',
    ImagesOperationsController,
    ImagesOperationsController.prototype.edit,
    'images:create',
  ],
  [
    'POST /images/:id/split',
    ImagesOperationsController,
    ImagesOperationsController.prototype.splitContactSheet,
    'images:create',
  ],
  [
    'POST /images/:imageId/reframe',
    ImagesReframeController,
    ImagesReframeController.prototype.reframeImage,
    'images:create',
  ],
  [
    'POST /images/:imageId/resize',
    ImagesResizeController,
    ImagesResizeController.prototype.resizeImage,
    'images:create',
  ],
  [
    'POST /images/:imageId/upscale',
    ImagesUpscaleController,
    ImagesUpscaleController.prototype.upscaleImage,
    'images:create',
  ],
  [
    'POST /images/upload',
    ImagesUploadsController,
    ImagesUploadsController.prototype.upload,
    'images:create',
  ],
  [
    'POST /images/upload/nft',
    ImagesUploadsController,
    ImagesUploadsController.prototype.uploadNFT,
    'images:create',
  ],
  [
    'POST /images/upload/presigned',
    ImagesUploadsController,
    ImagesUploadsController.prototype.generatePresignedUrl,
    'images:create',
  ],
  [
    'POST /images/upload/confirm/:imageId',
    ImagesUploadsController,
    ImagesUploadsController.prototype.confirmUpload,
    'images:create',
  ],
] as const;

describe.each(IMAGE_ROUTES)(
  '%s API key scope',
  (_route, controller, handler, scope) => {
    it('refuses a key without the scope', async () => {
      const guard = buildGuard(keyWithScopes(['brands:read']));

      await expect(
        guard.canActivate(imageRouteContext(controller, handler)),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it(`allows a key with ${scope}`, async () => {
      const guard = buildGuard(keyWithScopes([scope]));

      await expect(
        guard.canActivate(imageRouteContext(controller, handler)),
      ).resolves.toBe(true);
    });
  },
);

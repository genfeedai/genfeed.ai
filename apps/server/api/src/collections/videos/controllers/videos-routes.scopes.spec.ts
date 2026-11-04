import type { ApiKeyDocument } from '@api/collections/api-keys/schemas/api-key.schema';
import { ApiKeysService } from '@api/collections/api-keys/services/api-keys.service';
import { AvatarVideoController } from '@api/collections/videos/controllers/avatar-video.controller';
import { BatchInterpolationController } from '@api/collections/videos/controllers/batch-interpolation.controller';
import { VideosCaptionsController } from '@api/collections/videos/controllers/captions/videos-captions.controller';
import { CrunVideoQuoteController } from '@api/collections/videos/controllers/crun-video-quote.controller';
import { VideosLiveSessionsController } from '@api/collections/videos/controllers/live-sessions/videos-live-sessions.controller';
import { VideosProvenanceController } from '@api/collections/videos/controllers/provenance/videos-provenance.controller';
import { VideosMergeController } from '@api/collections/videos/controllers/relationships/videos-merge.controller';
import { VideosRelationshipsController } from '@api/collections/videos/controllers/relationships/videos-relationships.controller';
import { VideosClipChainController } from '@api/collections/videos/controllers/transformations/clip-chain/videos-clip-chain.controller';
import { VideosEditsController } from '@api/collections/videos/controllers/transformations/edits/videos-edits.controller';
import { VideosEffectsController } from '@api/collections/videos/controllers/transformations/effects/videos-effects.controller';
import { VideosExtendController } from '@api/collections/videos/controllers/transformations/extend/videos-extend.controller';
import { VideosGifController } from '@api/collections/videos/controllers/transformations/gif/videos-gif.controller';
import { VideosLipSyncController } from '@api/collections/videos/controllers/transformations/lip-sync/videos-lip-sync.controller';
import { VideosReframeController } from '@api/collections/videos/controllers/transformations/reframe/videos-reframe.controller';
import { VideosResizeController } from '@api/collections/videos/controllers/transformations/resize/videos-resize.controller';
import { VideosUpscaleController } from '@api/collections/videos/controllers/transformations/upscale/videos-upscale.controller';
import { VideosUpscaleQuoteController } from '@api/collections/videos/controllers/transformations/upscale/videos-upscale-quote.controller';
import { VideosUploadController } from '@api/collections/videos/controllers/upload/videos-upload.controller';
import { VideosController } from '@api/collections/videos/controllers/videos.controller';
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

function videoRouteContext(
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

const VIDEO_ROUTES = [
  [
    'GET /videos',
    VideosController,
    VideosController.prototype.findAll,
    'videos:read',
  ],
  [
    'GET /videos/:videoId',
    VideosController,
    VideosController.prototype.findOne,
    'videos:read',
  ],
  [
    'GET /videos/:videoId/thumbnail',
    VideosController,
    VideosController.prototype.getThumbnail,
    'videos:read',
  ],
  [
    'DELETE /videos/:videoId',
    VideosController,
    VideosController.prototype.remove,
    'videos:delete',
  ],
  [
    'POST /videos',
    VideosController,
    VideosController.prototype.create,
    'videos:create',
  ],
  [
    'POST /videos/merge',
    VideosMergeController,
    VideosMergeController.prototype.mergeVideos,
    'videos:create',
  ],
  [
    'GET /videos/:videoId/children',
    VideosRelationshipsController,
    VideosRelationshipsController.prototype.findChildren,
    'videos:read',
  ],
  [
    'GET /videos/:videoId/posts',
    VideosRelationshipsController,
    VideosRelationshipsController.prototype.findAllPosts,
    'videos:read',
  ],
  [
    'POST /videos/:videoId/extend',
    VideosExtendController,
    VideosExtendController.prototype.extendVideo,
    'videos:create',
  ],
  [
    'POST /videos/:videoId/reverse',
    VideosEffectsController,
    VideosEffectsController.prototype.reverseVideo,
    'videos:create',
  ],
  [
    'POST /videos/:videoId/mirror',
    VideosEffectsController,
    VideosEffectsController.prototype.mirrorVideo,
    'videos:create',
  ],
  [
    'POST /videos/lip-sync',
    VideosLipSyncController,
    VideosLipSyncController.prototype.createLipSyncVideo,
    'videos:create',
  ],
  [
    'POST /videos/:videoId/upscale',
    VideosUpscaleController,
    VideosUpscaleController.prototype.upscaleVideo,
    'videos:create',
  ],
  [
    'GET /videos/:videoId/upscale-quote',
    VideosUpscaleQuoteController,
    VideosUpscaleQuoteController.prototype.findUpscaleQuote,
    'videos:create',
  ],
  [
    'POST /videos/:videoId/resize',
    VideosResizeController,
    VideosResizeController.prototype.resizeVideo,
    'videos:create',
  ],
  [
    'POST /videos/:videoId/portrait',
    VideosResizeController,
    VideosResizeController.prototype.resizeToPortrait,
    'videos:create',
  ],
  [
    'POST /videos/:videoId/reframe',
    VideosReframeController,
    VideosReframeController.prototype.reframeVideo,
    'videos:create',
  ],
  [
    'POST /videos/:videoId/trim',
    VideosEditsController,
    VideosEditsController.prototype.trimVideo,
    'videos:create',
  ],
  [
    'POST /videos/:videoId/text-overlay',
    VideosEditsController,
    VideosEditsController.prototype.addTextOverlay,
    'videos:create',
  ],
  [
    'POST /videos/:videoId/gif',
    VideosGifController,
    VideosGifController.prototype.createGif,
    'videos:create',
  ],
  [
    'POST /videos/clip-chain',
    VideosClipChainController,
    VideosClipChainController.prototype.createClipChain,
    'videos:create',
  ],
  [
    'POST /videos/live-sessions',
    VideosLiveSessionsController,
    VideosLiveSessionsController.prototype.openSession,
    'videos:create',
  ],
  [
    'GET /videos/live-sessions/:sessionId',
    VideosLiveSessionsController,
    VideosLiveSessionsController.prototype.getSession,
    'videos:read',
  ],
  [
    'POST /videos/live-sessions/:sessionId/terminate',
    VideosLiveSessionsController,
    VideosLiveSessionsController.prototype.terminateSession,
    'videos:create',
  ],
  [
    'POST /videos/crun-quote',
    CrunVideoQuoteController,
    CrunVideoQuoteController.prototype.quote,
    'videos:create',
  ],
  [
    'POST /videos/upload',
    VideosUploadController,
    VideosUploadController.prototype.createUpload,
    'videos:create',
  ],
  [
    'GET /videos/:videoId/captions',
    VideosCaptionsController,
    VideosCaptionsController.prototype.getCaptions,
    'videos:read',
  ],
  [
    'POST /videos/:videoId/captions',
    VideosCaptionsController,
    VideosCaptionsController.prototype.createVideoWithCaptions,
    'videos:create',
  ],
  [
    'POST /videos/interpolation',
    BatchInterpolationController,
    BatchInterpolationController.prototype.createBatchInterpolation,
    'videos:create',
  ],
  [
    'GET /videos/:videoId/provenance',
    VideosProvenanceController,
    VideosProvenanceController.prototype.getProvenance,
    'videos:read',
  ],
  [
    'GET /videos/:videoId/provenance/watermark-evaluation',
    VideosProvenanceController,
    VideosProvenanceController.prototype.getWatermarkEvaluation,
    'videos:read',
  ],
  [
    'POST /videos/avatar/quote',
    AvatarVideoController,
    AvatarVideoController.prototype.quoteAvatarVideo,
    'videos:create',
  ],
  [
    'POST /videos/avatar',
    AvatarVideoController,
    AvatarVideoController.prototype.createAvatarVideo,
    'videos:create',
  ],
] as const;

const VIDEO_CONTROLLERS: readonly ControllerClass[] = [
  AvatarVideoController,
  BatchInterpolationController,
  CrunVideoQuoteController,
  VideosCaptionsController,
  VideosClipChainController,
  VideosController,
  VideosEditsController,
  VideosEffectsController,
  VideosExtendController,
  VideosGifController,
  VideosLipSyncController,
  VideosLiveSessionsController,
  VideosMergeController,
  VideosProvenanceController,
  VideosReframeController,
  VideosRelationshipsController,
  VideosResizeController,
  VideosUploadController,
  VideosUpscaleController,
  VideosUpscaleQuoteController,
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

describe.each(VIDEO_ROUTES)(
  '%s API key scope',
  (_route, controller, handler, scope) => {
    it('refuses a key without the scope', async () => {
      const guard = buildGuard(keyWithScopes(['brands:read']));

      await expect(
        guard.canActivate(videoRouteContext(controller, handler)),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it('refuses a key that only holds another video scope', async () => {
      // No video route requires videos:update, so it never satisfies one.
      const guard = buildGuard(keyWithScopes(['videos:update']));

      await expect(
        guard.canActivate(videoRouteContext(controller, handler)),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it(`allows a key with ${scope}`, async () => {
      const guard = buildGuard(keyWithScopes([scope]));

      await expect(
        guard.canActivate(videoRouteContext(controller, handler)),
      ).resolves.toBe(true);
    });
  },
);

describe('video route coverage', () => {
  it('refuses a read-only key on every route that creates or deletes', async () => {
    const guard = buildGuard(keyWithScopes(['videos:read']));

    await expect(
      guard.canActivate(
        videoRouteContext(VideosController, VideosController.prototype.create),
      ),
    ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    await expect(
      guard.canActivate(
        videoRouteContext(VideosController, VideosController.prototype.remove),
      ),
    ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
  });

  it.each(
    VIDEO_CONTROLLERS.map(
      (controller) => [controller.name, controller] as const,
    ),
  )('%s lists every route handler in the scope table', (_name, controller) => {
    const listed = VIDEO_ROUTES.filter(
      ([, tableController]) => tableController === controller,
    )
      .map(([, , handler]) => handler.name)
      .sort();

    expect(routeHandlerNames(controller).sort()).toEqual(listed);
  });
});

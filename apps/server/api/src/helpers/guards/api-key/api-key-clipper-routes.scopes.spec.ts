import { ClipperProjectGenerationController } from '@api/collections/clipper-projects/clipper-project-generation.controller';
import { ClipperProjectHandoffsController } from '@api/collections/clipper-projects/clipper-project-handoffs.controller';
import { ClipperProjectHighlightsController } from '@api/collections/clipper-projects/clipper-project-highlights.controller';
import { ClipperProjectIngestionController } from '@api/collections/clipper-projects/clipper-project-ingestion.controller';
import { ClipperProjectPublicToolController } from '@api/collections/clipper-projects/clipper-project-public-tool.controller';
import { ClipperProjectReferenceFramesController } from '@api/collections/clipper-projects/clipper-project-reference-frames.controller';
import { ClipperProjectsController } from '@api/collections/clipper-projects/clipper-projects.controller';
import {
  buildGuard,
  type ControllerClass,
  type Handler,
  keyWithScopes,
  routeContext,
} from '@api/helpers/guards/api-key/api-key-route-scope.fixture';
import { UnauthorizedException } from '@nestjs/common';

type ScopedRoute = readonly [string, ControllerClass, Handler];

function httpMethod(route: string): string {
  return route.split(' ')[0];
}

const GEN_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /clipper-projects/:projectId/generate',
    ClipperProjectGenerationController,
    ClipperProjectGenerationController.prototype.generateClips,
  ],
  [
    'POST /clipper-projects/:projectId/retry-failed',
    ClipperProjectGenerationController,
    ClipperProjectGenerationController.prototype.retryFailedClips,
  ],
  [
    'POST /clipper-projects/:projectId/hook-approval',
    ClipperProjectGenerationController,
    ClipperProjectGenerationController.prototype.submitHookClipDecision,
  ],
  [
    'POST /clipper-projects/:projectId/results/:clipperResultId/editor-handoff',
    ClipperProjectHandoffsController,
    ClipperProjectHandoffsController.prototype.createEditorHandoff,
  ],
  [
    'POST /clipper-projects/:projectId/results/:clipperResultId/library-link',
    ClipperProjectHandoffsController,
    ClipperProjectHandoffsController.prototype.retryLibraryLink,
  ],
  [
    'POST /clipper-projects/:projectId/highlights/:highlightId/rewrite',
    ClipperProjectHighlightsController,
    ClipperProjectHighlightsController.prototype.rewriteHighlight,
  ],
  [
    'POST /clipper-projects/drafts',
    ClipperProjectIngestionController,
    ClipperProjectIngestionController.prototype.createDraft,
  ],
  [
    'PATCH /clipper-projects/:projectId/draft',
    ClipperProjectIngestionController,
    ClipperProjectIngestionController.prototype.saveDraft,
  ],
  [
    'POST /clipper-projects/from-ingredient',
    ClipperProjectIngestionController,
    ClipperProjectIngestionController.prototype.createFromIngredient,
  ],
  [
    'POST /clipper-projects/from-youtube',
    ClipperProjectIngestionController,
    ClipperProjectIngestionController.prototype.createFromYoutube,
  ],
  [
    'POST /clipper-projects/from-upload',
    ClipperProjectIngestionController,
    ClipperProjectIngestionController.prototype.prepareUpload,
  ],
  [
    'POST /clipper-projects/:projectId/source/finalize',
    ClipperProjectIngestionController,
    ClipperProjectIngestionController.prototype.finalizeUpload,
  ],
  [
    'POST /clipper-projects/:projectId/source/retry',
    ClipperProjectIngestionController,
    ClipperProjectIngestionController.prototype.retrySource,
  ],
  [
    'POST /clipper-projects/analyze',
    ClipperProjectIngestionController,
    ClipperProjectIngestionController.prototype.analyzeYoutube,
  ],
  [
    'POST /clipper-projects/public-tool/claim',
    ClipperProjectPublicToolController,
    ClipperProjectPublicToolController.prototype.claim,
  ],
  [
    'PUT /clipper-projects/:projectId/reference-frame',
    ClipperProjectReferenceFramesController,
    ClipperProjectReferenceFramesController.prototype.selectReferenceFrame,
  ],
  [
    'POST /clipper-projects',
    ClipperProjectsController,
    ClipperProjectsController.prototype.create,
  ],
  [
    'PATCH /clipper-projects/:id',
    ClipperProjectsController,
    ClipperProjectsController.prototype.update,
  ],
];

describe.each(GEN_ROUTES)('%s API key scope', (route, controller, handler) => {
  it.each([
    [['videos:read', 'images:read', 'brands:read', 'posts:read']],
    [['brands:write', 'brand-kit:write', 'credentials:read']],
    [['posts:approve', 'posts:publish', 'analytics:read']],
  ])('refuses a key with only %j', async (scopes) => {
    const guard = buildGuard(keyWithScopes(scopes));

    await expect(
      guard.canActivate(routeContext(controller, handler, httpMethod(route))),
    ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
  });

  it.each([
    ['videos:create'],
    ['images:create'],
    ['prompts:create'],
    ['articles:create'],
    ['posts:draft'],
    ['admin'],
  ])('allows a key with %s', async (scope) => {
    const guard = buildGuard(keyWithScopes([scope]));

    await expect(
      guard.canActivate(routeContext(controller, handler, httpMethod(route))),
    ).resolves.toBe(true);
  });
});

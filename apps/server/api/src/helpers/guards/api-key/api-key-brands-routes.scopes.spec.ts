import { BrandMemoryController } from '@api/collections/brand-memory/controllers/brand-memory.controller';
import { BrandedGenerationFeedbackController } from '@api/collections/branded-generation-receipts/controllers/branded-generation-feedback.controller';
import { BrandInterviewController } from '@api/collections/brands/brand-interview/controllers/brand-interview.controller';
import { ContentRunsController } from '@api/collections/content-runs/controllers/content-runs.controller';
import { StoryboardAssetBibleController } from '@api/collections/content-runs/controllers/storyboard-asset-bible.controller';
import { StoryboardReverseController } from '@api/collections/content-runs/controllers/storyboard-reverse.controller';
import { StoryboardRunsController } from '@api/collections/content-runs/controllers/storyboard-runs.controller';
import { StoryboardShotRendersController } from '@api/collections/content-runs/controllers/storyboard-shot-renders.controller';
import { ImportedSourceMediaController } from '@api/collections/imported-sources/controllers/imported-source-media.controller';
import { ImportedSourcesController } from '@api/collections/imported-sources/controllers/imported-sources.controller';
import {
  buildGuard,
  type ControllerClass,
  type Handler,
  keyWithScopes,
  routeContext,
} from '@api/helpers/guards/api-key/api-key-route-scope.fixture';
import { ContentEngineController } from '@api/services/content-engine/content-engine.controller';
import { ContentOptimizationController } from '@api/services/content-optimization/content-optimization.controller';
import { ExpertPathController } from '@api/services/expert-path/expert-path.controller';
import { TurboContentController } from '@api/services/turbo-content/turbo-content.controller';
import { VideoRecipesController } from '@api/services/video-recipes/video-recipes.controller';
import { UnauthorizedException } from '@nestjs/common';

type BrandRoute = readonly [string, ControllerClass, Handler];

const CONTENT_GENERATION_ROUTES: readonly BrandRoute[] = [
  [
    'PUT /brands/:brandId/generation-receipts/:receiptId/feedback',
    BrandedGenerationFeedbackController,
    BrandedGenerationFeedbackController.prototype.rate,
  ],
  [
    'DELETE /brands/:brandId/generation-receipts/:receiptId/feedback',
    BrandedGenerationFeedbackController,
    BrandedGenerationFeedbackController.prototype.withdraw,
  ],
  [
    'POST /brands/:brandId/content-runs/briefs',
    ContentRunsController,
    ContentRunsController.prototype.createBriefRun,
  ],
  [
    'POST /brands/:brandId/content-runs/remixes',
    ContentRunsController,
    ContentRunsController.prototype.createBrandRemixRun,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/assets/quote',
    StoryboardAssetBibleController,
    StoryboardAssetBibleController.prototype.quoteAssets,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/assets/reconcile',
    StoryboardAssetBibleController,
    StoryboardAssetBibleController.prototype.reconcileAssets,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/plan/reverse',
    StoryboardReverseController,
    StoryboardReverseController.prototype.reversePlan,
  ],
  [
    'POST /brands/:brandId/storyboard-runs',
    StoryboardRunsController,
    StoryboardRunsController.prototype.create,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/shots/:shotId/character-replacement',
    StoryboardRunsController,
    StoryboardRunsController.prototype.replaceCharacter,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/stills/quote',
    StoryboardRunsController,
    StoryboardRunsController.prototype.quoteStills,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/stills',
    StoryboardRunsController,
    StoryboardRunsController.prototype.generateStills,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/stills/reconcile',
    StoryboardRunsController,
    StoryboardRunsController.prototype.reconcileStills,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/long-form/estimate',
    StoryboardRunsController,
    StoryboardRunsController.prototype.estimateLongForm,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/long-form/translations',
    StoryboardRunsController,
    StoryboardRunsController.prototype.translateLongForm,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/slideshow/post',
    StoryboardRunsController,
    StoryboardRunsController.prototype.createSlideshowPost,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/a-roll/quote',
    StoryboardRunsController,
    StoryboardRunsController.prototype.quoteARoll,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/a-roll',
    StoryboardRunsController,
    StoryboardRunsController.prototype.renderARoll,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/a-roll/reconcile',
    StoryboardRunsController,
    StoryboardRunsController.prototype.reconcileARoll,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/animatic/quote',
    StoryboardRunsController,
    StoryboardRunsController.prototype.quoteAnimatic,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/animatic',
    StoryboardRunsController,
    StoryboardRunsController.prototype.renderAnimatic,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/long-form/assemble',
    StoryboardRunsController,
    StoryboardRunsController.prototype.assembleLongForm,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/animatic/assemble',
    StoryboardRunsController,
    StoryboardRunsController.prototype.assembleAnimatic,
  ],
  [
    'PATCH /brands/:brandId/storyboard-runs/:runId/plan',
    StoryboardRunsController,
    StoryboardRunsController.prototype.updatePlan,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/plan/reset',
    StoryboardRunsController,
    StoryboardRunsController.prototype.resetPlan,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/plan/draft',
    StoryboardRunsController,
    StoryboardRunsController.prototype.draftPlan,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/plan/approve',
    StoryboardRunsController,
    StoryboardRunsController.prototype.approvePlan,
  ],
  [
    'PATCH /brands/:brandId/storyboard-runs/:runId/source',
    StoryboardRunsController,
    StoryboardRunsController.prototype.updateSource,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/renders/quote',
    StoryboardShotRendersController,
    StoryboardShotRendersController.prototype.quoteRenders,
  ],
  [
    'POST /brands/:brandId/storyboard-runs/:runId/renders/reconcile',
    StoryboardShotRendersController,
    StoryboardShotRendersController.prototype.reconcileRenders,
  ],
  [
    'POST /brands/:brandId/content/studio-proposals',
    ContentEngineController,
    ContentEngineController.prototype.generateStudioProposals,
  ],
  [
    'POST /brands/:brandId/content/plans',
    ContentEngineController,
    ContentEngineController.prototype.generatePlan,
  ],
  [
    'PUT /brands/:brandId/content/plans/:planId',
    ContentEngineController,
    ContentEngineController.prototype.updatePlan,
  ],
  [
    'DELETE /brands/:brandId/content/plans/:planId',
    ContentEngineController,
    ContentEngineController.prototype.deletePlan,
  ],
  [
    'POST /brands/:brandId/content/plans/:planId/execute',
    ContentEngineController,
    ContentEngineController.prototype.executePlan,
  ],
  [
    'POST /brands/:brandId/content/plans/:planId/items/:itemId/execute',
    ContentEngineController,
    ContentEngineController.prototype.executeItem,
  ],
  [
    'POST /brands/:brandId/optimization/optimize-prompt',
    ContentOptimizationController,
    ContentOptimizationController.prototype.optimizePrompt,
  ],
  [
    'POST /brands/:brandId/optimization/suggestions/auto-apply',
    ContentOptimizationController,
    ContentOptimizationController.prototype.autoApplySuggestion,
  ],
  [
    'POST /brands/:brandId/optimization/ab-tests',
    ContentOptimizationController,
    ContentOptimizationController.prototype.executeAbTest,
  ],
  [
    'POST /brands/:brandId/optimization/ab-tests/resolve',
    ContentOptimizationController,
    ContentOptimizationController.prototype.resolveAbTests,
  ],
  [
    'POST /brands/:brandId/expert-path/first-system',
    ExpertPathController,
    ExpertPathController.prototype.generateFirstSystem,
  ],
  [
    'PATCH /brands/:brandId/expert-path/first-system/:planId/items/:itemId',
    ExpertPathController,
    ExpertPathController.prototype.reviewFirstSystemItem,
  ],
  [
    'POST /brands/:brandId/content/turbo',
    TurboContentController,
    TurboContentController.prototype.createTurboRun,
  ],
  [
    'POST /brands/:brandId/video-recipes/:recipeKey/routing',
    VideoRecipesController,
    VideoRecipesController.prototype.resolveRouting,
  ],
];

const BRAND_EDIT_ROUTES: readonly BrandRoute[] = [
  [
    'POST /brands/:brandId/memory/distill',
    BrandMemoryController,
    BrandMemoryController.prototype.distillMemory,
  ],
  [
    'POST /brands/:brandId/interview',
    BrandInterviewController,
    BrandInterviewController.prototype.start,
  ],
  [
    'POST /brands/interview/:interviewId/answer',
    BrandInterviewController,
    BrandInterviewController.prototype.submitAnswer,
  ],
  [
    'POST /brands/interview/:interviewId/skip',
    BrandInterviewController,
    BrandInterviewController.prototype.skipField,
  ],
  [
    'POST /brands/interview/:interviewId/complete',
    BrandInterviewController,
    BrandInterviewController.prototype.complete,
  ],
  [
    'POST /brands/interview/:interviewId/abandon',
    BrandInterviewController,
    BrandInterviewController.prototype.abandon,
  ],
  [
    'POST /brands/:brandId/imported-sources/:id/media',
    ImportedSourceMediaController,
    ImportedSourceMediaController.prototype.start,
  ],
  [
    'POST /brands/:brandId/imported-sources/:id/media/retry',
    ImportedSourceMediaController,
    ImportedSourceMediaController.prototype.retry,
  ],
  [
    'POST /brands/:brandId/imported-sources',
    ImportedSourcesController,
    ImportedSourcesController.prototype.save,
  ],
  [
    'POST /brands/:brandId/imported-sources/:id/recaptures',
    ImportedSourcesController,
    ImportedSourcesController.prototype.recapture,
  ],
  [
    'POST /brands/:brandId/expert-path/positioning/profile',
    ExpertPathController,
    ExpertPathController.prototype.regeneratePositioning,
  ],
];

function httpMethod(route: string): string {
  return route.split(' ')[0];
}

describe.each(CONTENT_GENERATION_ROUTES)(
  '%s API key scope',
  (route, controller, handler) => {
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
  },
);

describe.each(BRAND_EDIT_ROUTES)(
  '%s API key scope',
  (route, controller, handler) => {
    it.each([
      [['videos:create', 'images:create', 'prompts:create']],
      [['articles:create', 'posts:draft', 'posts:schedule']],
      [['brands:read', 'credits:read', 'analytics:read']],
    ])('refuses a key with only %j', async (scopes) => {
      const guard = buildGuard(keyWithScopes(scopes));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it.each([['brands:write'], ['brand-kit:write'], ['admin']])(
      'allows a key with %s',
      async (scope) => {
        const guard = buildGuard(keyWithScopes([scope]));

        await expect(
          guard.canActivate(
            routeContext(controller, handler, httpMethod(route)),
          ),
        ).resolves.toBe(true);
      },
    );
  },
);

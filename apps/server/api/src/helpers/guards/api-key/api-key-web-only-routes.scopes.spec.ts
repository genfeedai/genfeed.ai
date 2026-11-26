import { AgentAuthController } from '@api/agent-auth/controllers/agent-auth.controller';
import { AssetsIngestionController } from '@api/collections/assets/controllers/operations/assets-ingestion.controller';
import { AssetsOperationsController } from '@api/collections/assets/controllers/operations/assets-operations.controller';
import { GifsController } from '@api/collections/gifs/controllers/gifs.controller';
import { LinksController } from '@api/collections/links/controllers/links.controller';
import { AccountNewsletterSubscribeController } from '@api/collections/newsletter-subscribers/controllers/account-newsletter-subscribe.controller';
import { ReferralsController } from '@api/collections/referrals/controllers/referrals.controller';
import { SpeechController } from '@api/collections/speech/controllers/speech.controller';
import { StreaksController } from '@api/collections/streaks/controllers/streaks.controller';
import { SubscriptionAttributionsController } from '@api/collections/subscription-attributions/controllers/subscription-attributions.controller';
import { TrackedLinksController } from '@api/collections/tracked-links/controllers/tracked-links.controller';
import { VotesController } from '@api/collections/votes/controllers/votes.controller';
import { AdsResearchController } from '@api/endpoints/ads-research/ads-research.controller';
import { AiActionsController } from '@api/endpoints/ai-actions/ai-actions.controller';
import { AccountAnalyticsController } from '@api/endpoints/analytics/account-analytics.controller';
import { DevController } from '@api/endpoints/dev/dev.controller';
import { MCPController } from '@api/endpoints/mcp/mcp.controller';
import { OnboardingController } from '@api/endpoints/onboarding/onboarding.controller';
import { PublicYoutubeLongFormController } from '@api/endpoints/public/controllers/youtube-long-form/public-youtube-long-form.controller';
import {
  buildGuard,
  type ControllerClass,
  type Handler,
  keyWithScopes,
  routeContext,
} from '@api/helpers/guards/api-key/api-key-route-scope.fixture';
import { MarketplaceInstallController } from '@api/marketplace-integration/marketplace-install.controller';
import { OAuthAuthorizeController } from '@api/oauth/controllers/oauth-authorize.controller';
import { ContentGatewayController } from '@api/services/content-gateway/content-gateway.controller';
import { OpusProController } from '@api/services/integrations/opuspro/controllers/opuspro.controller';
import { RouterController } from '@api/services/router/router.controller';
import { TwitterPipelineController } from '@api/services/twitter-pipeline/twitter-pipeline.controller';
import { UnauthorizedException } from '@nestjs/common';

type ScopedRoute = readonly [string, ControllerClass, Handler];

function httpMethod(route: string): string {
  return route.split(' ')[0];
}

const ADMIN_ROUTES: readonly ScopedRoute[] = [
  [
    'POST /agent/auth/claim/complete',
    AgentAuthController,
    AgentAuthController.prototype.complete,
  ],
  [
    'POST /assets/upload',
    AssetsIngestionController,
    AssetsIngestionController.prototype.createUpload,
  ],
  [
    'POST /assets/from-ingredient',
    AssetsIngestionController,
    AssetsIngestionController.prototype.createFromIngredient,
  ],
  [
    'POST /assets/generate',
    AssetsOperationsController,
    AssetsOperationsController.prototype.generate,
  ],
  ['DELETE /gifs/:gifId', GifsController, GifsController.prototype.remove],
  ['POST /links', LinksController, LinksController.prototype.create],
  ['PATCH /links/:linkId', LinksController, LinksController.prototype.patch],
  ['DELETE /links/:linkId', LinksController, LinksController.prototype.remove],
  [
    'POST /newsletter/subscribe',
    AccountNewsletterSubscribeController,
    AccountNewsletterSubscribeController.prototype.subscribe,
  ],
  [
    'POST /referrals/me/codes',
    ReferralsController,
    ReferralsController.prototype.createCode,
  ],
  [
    'PATCH /referrals/me/codes/:codeId',
    ReferralsController,
    ReferralsController.prototype.updateCode,
  ],
  [
    'POST /referrals/me/claim',
    ReferralsController,
    ReferralsController.prototype.claim,
  ],
  [
    'POST /speech/transcribe/audio',
    SpeechController,
    SpeechController.prototype.transcribeAudio,
  ],
  [
    'POST /speech/transcribe/url',
    SpeechController,
    SpeechController.prototype.transcribeUrl,
  ],
  [
    'PATCH /organizations/:organizationId/streaks/me',
    StreaksController,
    StreaksController.prototype.patchMyStreak,
  ],
  [
    'POST /analytics/subscription-attribution',
    SubscriptionAttributionsController,
    SubscriptionAttributionsController.prototype.trackSubscription,
  ],
  [
    'POST /tracking/links',
    TrackedLinksController,
    TrackedLinksController.prototype.generateLink,
  ],
  [
    'PATCH /tracking/links/:id',
    TrackedLinksController,
    TrackedLinksController.prototype.updateLink,
  ],
  [
    'DELETE /tracking/links/:id',
    TrackedLinksController,
    TrackedLinksController.prototype.deleteLink,
  ],
  ['POST /votes', VotesController, VotesController.prototype.create],
  ['DELETE /votes', VotesController, VotesController.prototype.remove],
  [
    'POST /ads/research/watchlist/:id/poll',
    AdsResearchController,
    AdsResearchController.prototype.pollWatchedAdvertiser,
  ],
  [
    'POST /ads/research/ad-pack',
    AdsResearchController,
    AdsResearchController.prototype.generateAdPack,
  ],
  [
    'POST /ads/research/remix-workflow',
    AdsResearchController,
    AdsResearchController.prototype.createRemixWorkflow,
  ],
  [
    'POST /ads/research/launch-prep',
    AdsResearchController,
    AdsResearchController.prototype.prepareCampaignForReview,
  ],
  [
    'POST /organizations/:organizationId/ai-actions/execute',
    AiActionsController,
    AiActionsController.prototype.execute,
  ],
  [
    'PATCH /analytics/fleet-evaluation-policy',
    AccountAnalyticsController,
    AccountAnalyticsController.prototype.savePolicy,
  ],
  [
    'POST /dev/discord',
    DevController,
    DevController.prototype.debugDiscordCard,
  ],
  ['POST /mcp/videos', MCPController, MCPController.prototype.createVideo],
  [
    'POST /onboarding/prefix',
    OnboardingController,
    OnboardingController.prototype.setPrefix,
  ],
  [
    'POST /onboarding/brands/:brandId/scan',
    OnboardingController,
    OnboardingController.prototype.scanBrand,
  ],
  [
    'POST /onboarding/brands/:brandId/drafts',
    OnboardingController,
    OnboardingController.prototype.generateDrafts,
  ],
  [
    'POST /onboarding/brands/:brandId/drafts/media',
    OnboardingController,
    OnboardingController.prototype.retryDraftMedia,
  ],
  [
    'POST /onboarding/brands/:brandId/drafts/redo',
    OnboardingController,
    OnboardingController.prototype.rewriteDraft,
  ],
  [
    'POST /youtube-long-form',
    PublicYoutubeLongFormController,
    PublicYoutubeLongFormController.prototype.createAuthenticated,
  ],
  [
    'POST /youtube-long-form/:artifactId/source-library',
    PublicYoutubeLongFormController,
    PublicYoutubeLongFormController.prototype.promoteSource,
  ],
  [
    'POST /marketplace-installs/:listingId',
    MarketplaceInstallController,
    MarketplaceInstallController.prototype.install,
  ],
  [
    'POST /oauth/authorize/decision',
    OAuthAuthorizeController,
    OAuthAuthorizeController.prototype.decide,
  ],
  [
    'POST /content-gateway/signal',
    ContentGatewayController,
    ContentGatewayController.prototype.routeSignal,
  ],
  [
    'POST /content-gateway/execute',
    ContentGatewayController,
    ContentGatewayController.prototype.executeSkill,
  ],
  [
    'POST /opuspro/generate',
    OpusProController,
    OpusProController.prototype.generateVideo,
  ],
  [
    'POST /router/select-model',
    RouterController,
    RouterController.prototype.selectModel,
  ],
  [
    'POST /router/estimate-generation-credits',
    RouterController,
    RouterController.prototype.estimateGenerationCredits,
  ],
  [
    'POST /organizations/:organizationId/twitter-pipeline/search',
    TwitterPipelineController,
    TwitterPipelineController.prototype.search,
  ],
  [
    'POST /organizations/:organizationId/twitter-pipeline/draft',
    TwitterPipelineController,
    TwitterPipelineController.prototype.draft,
  ],
  [
    'POST /organizations/:organizationId/twitter-pipeline/publish',
    TwitterPipelineController,
    TwitterPipelineController.prototype.publish,
  ],
];

describe.each(ADMIN_ROUTES)(
  '%s API key scope',
  (route, controller, handler) => {
    it.each([
      [['videos:create', 'images:create', 'prompts:create', 'articles:create']],
      [['posts:draft', 'posts:schedule', 'posts:publish', 'brands:write']],
      [['videos:read', 'images:read', 'brands:read', 'credits:read']],
    ])('refuses a key with only %j', async (scopes) => {
      const guard = buildGuard(keyWithScopes(scopes));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).rejects.toThrow(new UnauthorizedException('Insufficient permissions'));
    });

    it.each([['admin']])('allows a key with %s', async (scope) => {
      const guard = buildGuard(keyWithScopes([scope]));

      await expect(
        guard.canActivate(routeContext(controller, handler, httpMethod(route))),
      ).resolves.toBe(true);
    });
  },
);

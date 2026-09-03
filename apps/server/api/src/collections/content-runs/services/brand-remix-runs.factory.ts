import type { BrandsService } from '@api/collections/brands/services/brands.service';
import type { ContentGeneratorService } from '@api/collections/content-intelligence/services/content-generator.service';
import { BrandRemixRunExecutionService } from '@api/collections/content-runs/services/brand-remix-run-execution.service';
import { BrandRemixRunPaidDraftService } from '@api/collections/content-runs/services/brand-remix-run-paid-draft.service';
import { BrandRemixRunPersistenceService } from '@api/collections/content-runs/services/brand-remix-run-persistence.service';
import { BrandRemixRunPlanningService } from '@api/collections/content-runs/services/brand-remix-run-planning.service';
import { BrandRemixRunProviderDispatchService } from '@api/collections/content-runs/services/brand-remix-run-provider-dispatch.service';
import { BrandRemixRunReviewService } from '@api/collections/content-runs/services/brand-remix-run-review.service';
import { BrandRemixRunStateService } from '@api/collections/content-runs/services/brand-remix-run-state.service';
import { BrandRemixRunsService } from '@api/collections/content-runs/services/brand-remix-runs.service';
import type { BrandRemixRuntime } from '@api/collections/content-runs/services/brand-remix-runtime';
import { BrandRemixSourceResolverService } from '@api/collections/content-runs/services/brand-remix-source-resolver.service';
import type { PausedMetaCampaignDraftService } from '@api/collections/content-runs/services/paused-meta-campaign-draft.service';
import type { PausedXAdsCampaignDraftService } from '@api/collections/content-runs/services/paused-x-ads-campaign-draft.service';
import type { CreditsUtilsService } from '@api/collections/credits/services/credits.utils.service';
import type { ImageGenerationService } from '@api/collections/images/services/image-generation.service';
import type { OrganizationSettingsService } from '@api/collections/organization-settings/services/organization-settings.service';
import type { TrendReferenceCorpusService } from '@api/collections/trends/services/trend-reference-corpus.service';
import type { AvatarVideoGenerationService } from '@api/collections/videos/services/avatar-video-generation.service';
import type { VideoGenerationService } from '@api/collections/videos/services/video-generation.service';
import type { SystemWorkflowRunnerService } from '@api/collections/workflows/system-workflow-runner.service';
import type { AdsResearchService } from '@api/endpoints/ads-research/ads-research.service';
import type { BatchGenerationService } from '@api/services/batch-generation/batch-generation.service';
import type { ByokService } from '@api/services/byok/byok.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';

export interface BrandRemixRunsCollaborators {
  adsResearchService: AdsResearchService;
  avatarVideoGenerationService: AvatarVideoGenerationService;
  batchGenerationService: BatchGenerationService;
  brandsService: BrandsService;
  byokService: ByokService;
  contentGeneratorService: ContentGeneratorService;
  creditsUtilsService: CreditsUtilsService;
  imageGenerationService: ImageGenerationService;
  organizationSettingsService: OrganizationSettingsService;
  pausedMetaCampaignDraftService: PausedMetaCampaignDraftService;
  pausedXAdsCampaignDraftService: PausedXAdsCampaignDraftService;
  prisma: PrismaService;
  runtime: BrandRemixRuntime;
  systemWorkflowRunner: SystemWorkflowRunnerService;
  trendReferenceCorpusService: TrendReferenceCorpusService;
  videoGenerationService: VideoGenerationService;
}

export interface BrandRemixRunsGraph {
  dispatch: BrandRemixRunProviderDispatchService;
  execution: BrandRemixRunExecutionService;
  paidDraft: BrandRemixRunPaidDraftService;
  persistence: BrandRemixRunPersistenceService;
  planning: BrandRemixRunPlanningService;
  review: BrandRemixRunReviewService;
  service: BrandRemixRunsService;
  sourceResolver: BrandRemixSourceResolverService;
  state: BrandRemixRunStateService;
}

export function assembleBrandRemixRunsGraph(
  collaborators: BrandRemixRunsCollaborators,
): BrandRemixRunsGraph {
  const persistence = new BrandRemixRunPersistenceService(collaborators.prisma);
  const sourceResolver = new BrandRemixSourceResolverService(
    collaborators.prisma,
    collaborators.adsResearchService,
    collaborators.runtime,
  );
  const planning = new BrandRemixRunPlanningService(
    collaborators.prisma,
    collaborators.brandsService,
    collaborators.organizationSettingsService,
    sourceResolver,
  );
  const state = new BrandRemixRunStateService(
    collaborators.prisma,
    persistence,
  );
  const dispatch = new BrandRemixRunProviderDispatchService(
    collaborators.imageGenerationService,
    collaborators.videoGenerationService,
    collaborators.avatarVideoGenerationService,
    collaborators.contentGeneratorService,
    collaborators.creditsUtilsService,
    persistence,
    state,
  );
  const execution = new BrandRemixRunExecutionService(
    collaborators.prisma,
    planning,
    persistence,
    state,
    dispatch,
    collaborators.creditsUtilsService,
    collaborators.byokService,
    collaborators.systemWorkflowRunner,
    collaborators.runtime,
  );
  const review = new BrandRemixRunReviewService(
    planning,
    persistence,
    state,
    collaborators.batchGenerationService,
    collaborators.trendReferenceCorpusService,
    collaborators.systemWorkflowRunner,
    collaborators.runtime,
  );
  const paidDraft = new BrandRemixRunPaidDraftService(
    planning,
    persistence,
    state,
    collaborators.pausedMetaCampaignDraftService,
    collaborators.pausedXAdsCampaignDraftService,
    collaborators.runtime,
  );
  return {
    dispatch,
    execution,
    paidDraft,
    persistence,
    planning,
    review,
    service: new BrandRemixRunsService(
      planning,
      persistence,
      state,
      execution,
      review,
      paidDraft,
    ),
    sourceResolver,
    state,
  };
}

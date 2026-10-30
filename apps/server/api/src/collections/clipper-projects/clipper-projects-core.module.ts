import { OrganizationModuleAccessModule } from '@api/common/organization-modules/organization-module-access.module';
import { HeyGenModule } from '@api/services/integrations/heygen/heygen.module';
/**
 * ClipperProjectsCoreModule
 *
 * Core clip services, immutable workflow definitions, and their action
 * executors, plus clip project persistence, generation dispatch, identity,
 * rewrite, hook-approval, and raw-cut services.
 *
 * ClipperProjectsModule adds only the HTTP controllers.
 */

import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CaptionsModule } from '@api/collections/captions/captions.module';
import { ClipperProjectsService } from '@api/collections/clipper-projects/clipper-projects.service';
import { ClipperAnalysisWorkflowService } from '@api/collections/clipper-projects/services/clipper-analysis-workflow.service';
import { ClipperAnalysisWorkflowQueueService } from '@api/collections/clipper-projects/services/clipper-analysis-workflow-queue.service';
import { ClipperAvatarBillingService } from '@api/collections/clipper-projects/services/clipper-avatar-billing.service';
import { ClipperClipEditService } from '@api/collections/clipper-projects/services/clipper-clip-edit.service';
import { ClipperContinuityWorkflowService } from '@api/collections/clipper-projects/services/clipper-continuity-workflow.service';
import { ClipperFactoryWorkflowService } from '@api/collections/clipper-projects/services/clipper-factory-workflow.service';
import { ClipperFactoryWorkflowQueueService } from '@api/collections/clipper-projects/services/clipper-factory-workflow-queue.service';
import { ClipperGenerationService } from '@api/collections/clipper-projects/services/clipper-generation.service';
import { ClipperGenerationDispatchService } from '@api/collections/clipper-projects/services/clipper-generation-dispatch.service';
import { ClipperGenerationRequestService } from '@api/collections/clipper-projects/services/clipper-generation-request.service';
import { ClipperHighlightDetector } from '@api/collections/clipper-projects/services/clipper-highlight-detector.service';
import { ClipperIdentityResolutionService } from '@api/collections/clipper-projects/services/clipper-identity-resolution.service';
import { ClipperLibraryLinkService } from '@api/collections/clipper-projects/services/clipper-library-link.service';
import { ClipperProjectIngestionService } from '@api/collections/clipper-projects/services/clipper-project-ingestion.service';
import { HighlightRewriteService } from '@api/collections/clipper-projects/services/highlight-rewrite.service';
import { HookClipApprovalService } from '@api/collections/clipper-projects/services/hook-clipper-approval.service';
import { RawCutClipService } from '@api/collections/clipper-projects/services/raw-cut-clip.service';
import { RawCutClipCompletionService } from '@api/collections/clipper-projects/services/raw-cut-clip-completion.service';
import { ClipperResultsModule } from '@api/collections/clipper-results/clipper-results.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { VideoGenerationModule } from '@api/collections/videos/video-generation.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { AvatarVideoModule } from '@api/services/avatar-video/avatar-video.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { PublicClipperToolStoreModule } from '@api/services/public-clipper-tool/public-clipper-tool-store.module';
import { UploadsModule } from '@api/services/uploads/uploads.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    ClipperAvatarBillingService,
    ClipperClipEditService,
    ClipperAnalysisWorkflowQueueService,
    ClipperAnalysisWorkflowService,
    ClipperProjectsService,
    ClipperContinuityWorkflowService,
    ClipperFactoryWorkflowQueueService,
    ClipperFactoryWorkflowService,
    ClipperGenerationService,
    ClipperGenerationDispatchService,
    ClipperGenerationRequestService,
    ClipperHighlightDetector,
    ClipperIdentityResolutionService,
    ClipperLibraryLinkService,
    ClipperProjectIngestionService,
    HighlightRewriteService,
    HookClipApprovalService,
    RawCutClipCompletionService,
    RawCutClipService,
  ],
  imports: [
    OrganizationModuleAccessModule,
    BrandsCoreModule,
    CaptionsModule,
    ClipperResultsModule,
    CreditsModule,
    IngredientsModule,
    HttpModule,
    MetadataModule,
    AvatarVideoModule,
    VideoGenerationModule,
    HeyGenModule,
    OpenRouterModule,
    PublicClipperToolStoreModule,
    FileQueueModule,
    FilesClientModule,
    UploadsModule,
    WorkflowsModule,
    WhisperModule,
  ],
  providers: [
    ClipperAvatarBillingService,
    ClipperClipEditService,
    ClipperAnalysisWorkflowQueueService,
    ClipperAnalysisWorkflowService,
    ClipperProjectsService,
    ClipperContinuityWorkflowService,
    ClipperFactoryWorkflowQueueService,
    ClipperFactoryWorkflowService,
    ClipperGenerationService,
    ClipperGenerationDispatchService,
    ClipperGenerationRequestService,
    ClipperHighlightDetector,
    ClipperIdentityResolutionService,
    ClipperLibraryLinkService,
    ClipperProjectIngestionService,
    HighlightRewriteService,
    HookClipApprovalService,
    RawCutClipCompletionService,
    RawCutClipService,
  ],
})
export class ClipperProjectsCoreModule {}

/**
 * ClipProjectsCoreModule
 *
 * Core clip services, immutable workflow definitions, and their action
 * executors. ClipProjectsModule adds only the HTTP controllers.
 */

import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { CaptionsModule } from '@api/collections/captions/captions.module';
import { ClipResultsModule } from '@api/collections/clip-results/clip-results.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { MetadataModule } from '@api/collections/metadata/metadata.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { AvatarVideoModule } from '@api/services/avatar-video/avatar-video.module';
import { FilesClientModule } from '@api/services/files-microservice/client/files-client.module';
import { FileQueueModule } from '@api/services/files-microservice/queue/file-queue.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { PublicClipToolStoreModule } from '@api/services/public-clip-tool/public-clip-tool-store.module';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { ClipProjectsService } from '@server/collections/clip-projects/clip-projects.service';
import { ClipAnalysisWorkflowService } from '@server/collections/clip-projects/services/clip-analysis-workflow.service';
import { ClipAnalysisWorkflowQueueService } from '@server/collections/clip-projects/services/clip-analysis-workflow-queue.service';
import { ClipContinuityWorkflowService } from '@server/collections/clip-projects/services/clip-continuity-workflow.service';
import { ClipFactoryWorkflowService } from '@server/collections/clip-projects/services/clip-factory-workflow.service';
import { ClipFactoryWorkflowQueueService } from '@server/collections/clip-projects/services/clip-factory-workflow-queue.service';
import { ClipGenerationService } from '@server/collections/clip-projects/services/clip-generation.service';
import { ClipGenerationRequestService } from '@server/collections/clip-projects/services/clip-generation-request.service';
import { ClipHighlightDetector } from '@server/collections/clip-projects/services/clip-highlight-detector.service';
import { ClipIdentityResolutionService } from '@server/collections/clip-projects/services/clip-identity-resolution.service';
import { ClipLibraryLinkService } from '@server/collections/clip-projects/services/clip-library-link.service';
import { HighlightRewriteService } from '@server/collections/clip-projects/services/highlight-rewrite.service';
import { HookClipApprovalService } from '@server/collections/clip-projects/services/hook-clip-approval.service';
import { RawCutClipService } from '@server/collections/clip-projects/services/raw-cut-clip.service';
import { RawCutClipCompletionService } from '@server/collections/clip-projects/services/raw-cut-clip-completion.service';

@Module({
  exports: [
    ClipAnalysisWorkflowQueueService,
    ClipAnalysisWorkflowService,
    ClipProjectsService,
    ClipContinuityWorkflowService,
    ClipFactoryWorkflowQueueService,
    ClipFactoryWorkflowService,
    ClipGenerationService,
    ClipGenerationRequestService,
    ClipHighlightDetector,
    ClipIdentityResolutionService,
    ClipLibraryLinkService,
    HighlightRewriteService,
    HookClipApprovalService,
    RawCutClipCompletionService,
    RawCutClipService,
  ],
  imports: [
    BrandsCoreModule,
    CaptionsModule,
    ClipResultsModule,
    CreditsModule,
    IngredientsModule,
    HttpModule,
    MetadataModule,
    AvatarVideoModule,
    OpenRouterModule,
    PublicClipToolStoreModule,
    FileQueueModule,
    FilesClientModule,
    WorkflowsModule,
    WhisperModule,
  ],
  providers: [
    ClipAnalysisWorkflowQueueService,
    ClipAnalysisWorkflowService,
    ClipProjectsService,
    ClipContinuityWorkflowService,
    ClipFactoryWorkflowQueueService,
    ClipFactoryWorkflowService,
    ClipGenerationService,
    ClipGenerationRequestService,
    ClipHighlightDetector,
    ClipIdentityResolutionService,
    ClipLibraryLinkService,
    HighlightRewriteService,
    HookClipApprovalService,
    RawCutClipCompletionService,
    RawCutClipService,
  ],
})
export class ClipProjectsCoreModule {}

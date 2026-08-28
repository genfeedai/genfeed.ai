/**
 * ClipProjectsCoreModule
 *
 * Core clip services plus their workflow-backed terminal actions. It has no
 * dependency on ClipAnalyzeModule or ClipFactoryModule, allowing queue modules
 * to import it without creating circular clip-queue references.
 *
 * ClipProjectsModule re-exports everything from here and adds the queue modules.
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
import { Module } from '@nestjs/common';
import { ClipProjectsService } from '@server/collections/clip-projects/clip-projects.service';
import { ClipContinuityWorkflowService } from '@server/collections/clip-projects/services/clip-continuity-workflow.service';
import { ClipGenerationService } from '@server/collections/clip-projects/services/clip-generation.service';
import { ClipGenerationRequestService } from '@server/collections/clip-projects/services/clip-generation-request.service';
import { ClipIdentityResolutionService } from '@server/collections/clip-projects/services/clip-identity-resolution.service';
import { ClipLibraryLinkService } from '@server/collections/clip-projects/services/clip-library-link.service';
import { HighlightRewriteService } from '@server/collections/clip-projects/services/highlight-rewrite.service';
import { HookClipApprovalService } from '@server/collections/clip-projects/services/hook-clip-approval.service';
import { RawCutClipService } from '@server/collections/clip-projects/services/raw-cut-clip.service';
import { RawCutClipCompletionService } from '@server/collections/clip-projects/services/raw-cut-clip-completion.service';

@Module({
  exports: [
    ClipProjectsService,
    ClipContinuityWorkflowService,
    ClipGenerationService,
    ClipGenerationRequestService,
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
    MetadataModule,
    AvatarVideoModule,
    OpenRouterModule,
    FileQueueModule,
    FilesClientModule,
    WorkflowsModule,
  ],
  providers: [
    ClipProjectsService,
    ClipContinuityWorkflowService,
    ClipGenerationService,
    ClipGenerationRequestService,
    ClipIdentityResolutionService,
    ClipLibraryLinkService,
    HighlightRewriteService,
    HookClipApprovalService,
    RawCutClipCompletionService,
    RawCutClipService,
  ],
})
export class ClipProjectsCoreModule {}

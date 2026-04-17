/**
 * ClipProjectsCoreModule
 *
 * Minimal module providing ClipProjectsService + schema registration only.
 * Intentionally has NO dependency on ClipAnalyzeModule or ClipFactoryModule,
 * allowing queue modules to import it without creating circular references.
 *
 * ClipProjectsModule re-exports everything from here and adds the queue modules.
 */

import { ClipProjectsService } from '@api/collections/clip-projects/clip-projects.service';
import { ClipGenerationService } from '@api/collections/clip-projects/services/clip-generation.service';
import { HighlightRewriteService } from '@api/collections/clip-projects/services/highlight-rewrite.service';
import { ClipResultsModule } from '@api/collections/clip-results/clip-results.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { AvatarVideoModule } from '@api/services/avatar-video/avatar-video.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { Module } from '@nestjs/common';

@Module({
  exports: [
    ClipProjectsService,
    ClipGenerationService,
    HighlightRewriteService,
  ],
  imports: [
    ClipResultsModule,
    CreditsModule,
    AvatarVideoModule,
    OpenRouterModule,
  ],
  providers: [
    ClipProjectsService,
    ClipGenerationService,
    HighlightRewriteService,
  ],
})
export class ClipProjectsCoreModule {}

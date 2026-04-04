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
import {
  ClipProject,
  ClipProjectSchema,
} from '@api/collections/clip-projects/schemas/clip-project.schema';
import { ClipGenerationService } from '@api/collections/clip-projects/services/clip-generation.service';
import { HighlightRewriteService } from '@api/collections/clip-projects/services/highlight-rewrite.service';
import { ClipResultsModule } from '@api/collections/clip-results/clip-results.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { AvatarVideoModule } from '@api/services/avatar-video/avatar-video.module';
import { OpenRouterModule } from '@api/services/integrations/openrouter/openrouter.module';
import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  exports: [
    MongooseModule,
    ClipProjectsService,
    ClipGenerationService,
    HighlightRewriteService,
  ],
  imports: [
    ClipResultsModule,
    CreditsModule,
    AvatarVideoModule,
    OpenRouterModule,
    MongooseModule.forFeatureAsync(
      [
        {
          // @ts-expect-error TS2353
          connectionName: DB_CONNECTIONS.CLIPS,
          imports: [ConfigModule],
          inject: [ConfigService],
          name: ClipProject.name,
          useFactory: () => {
            const schema = ClipProjectSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            schema.index({ status: 1, user: 1 });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLIPS,
    ),
  ],
  providers: [
    ClipProjectsService,
    ClipGenerationService,
    HighlightRewriteService,
  ],
})
export class ClipProjectsCoreModule {}

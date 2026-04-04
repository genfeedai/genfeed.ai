/**
 * Captions Module
 * Video captions & subtitles: AI-generated captions, multi-language support,
SRT/VTT export, and automated caption timing.
 */

import { CaptionsController } from '@api/collections/captions/controllers/captions.controller';
import {
  Caption,
  CaptionSchema,
} from '@api/collections/captions/schemas/caption.schema';
import { CaptionsService } from '@api/collections/captions/services/captions.service';
import { IngredientsModule } from '@api/collections/ingredients/ingredients.module';
import { ConfigModule } from '@api/config/config.module';
import { ConfigService } from '@api/config/config.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { WhisperModule } from '@api/services/whisper/whisper.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [CaptionsController],
  exports: [MongooseModule, CaptionsService],
  imports: [
    forwardRef(() => IngredientsModule),
    forwardRef(() => WhisperModule),

    MongooseModule.forFeatureAsync(
      [
        {
          imports: [ConfigModule],
          inject: [ConfigService],
          name: Caption.name,
          useFactory: () => {
            const schema = CaptionSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // For ingredient caption lookups
            schema.index({
              ingredient: 1,
              language: 1,
            });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [CaptionsService],
})
export class CaptionsModule {}

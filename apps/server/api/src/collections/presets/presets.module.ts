/**
 * Presets Module
 * Saved PromptBar configurations: stores prompt text + style + mood + camera + scene
 * as reusable presets. Users select preset → all PromptBar values auto-fill.
 * NOTE: Different from Templates (which are prompt templates with {{variables}}).
 */
import { MembersModule } from '@api/collections/members/members.module';
import { PresetsController } from '@api/collections/presets/controllers/presets.controller';
import { PresetSchema } from '@api/collections/presets/schemas/preset.schema';
import { PresetsService } from '@api/collections/presets/services/presets.service';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import mongooseAggregatePaginateV2 from 'mongoose-aggregate-paginate-v2';

@Module({
  controllers: [PresetsController],
  exports: [PresetsService],
  imports: [
    forwardRef(() => MembersModule),

    MongooseModule.forFeatureAsync(
      [
        {
          name: 'Preset',
          useFactory: () => {
            const schema = PresetSchema;

            schema.plugin(mongooseAggregatePaginateV2);

            // Index for organization-based queries (including null for defaults)
            schema.index(
              {
                createdAt: -1,
                isDeleted: 1,
                organization: 1,
              },
              { sparse: true },
            );

            // Index for active presets
            schema.index({
              category: 1,
              isActive: 1,
            });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.CLOUD,
    ),
  ],
  providers: [PresetsService],
})
export class PresetsModule {}

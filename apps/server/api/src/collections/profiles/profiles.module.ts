/**
 * Profiles Module
 * Brand consistency management: tone/style profiles for images, videos, voice, and articles.
 * Apply brand voice to prompts, analyze tone compliance, and auto-generate from examples.
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { ProfilesController } from '@api/collections/profiles/controllers/profiles.controller';
import {
  Profile,
  ProfileSchema,
} from '@api/collections/profiles/schemas/profile.schema';
import { ProfilesService } from '@api/collections/profiles/services/profiles.service';
import { ConfigModule } from '@api/config/config.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [ProfilesController],
  exports: [ProfilesService],
  imports: [
    ByokModule,
    ConfigModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    ReplicateModule,
    MongooseModule.forFeatureAsync(
      [
        {
          name: Profile.name,
          useFactory: () => {
            const schema = ProfileSchema;

            // Primary query with soft delete
            schema.index(
              { createdAt: -1, isDeleted: 1, organization: 1 },
              { partialFilterExpression: { isDeleted: false } },
            );

            // Creator lookup
            schema.index({ createdBy: 1 });

            // Default profile lookup
            schema.index({ isDefault: 1 });

            // Text search on name and description
            schema.index({ description: 'text', label: 'text' });

            return schema;
          },
        },
      ],
      DB_CONNECTIONS.AUTH,
    ),
  ],
  providers: [ProfilesService, CreditsGuard, CreditsInterceptor],
})
export class ProfilesModule {}

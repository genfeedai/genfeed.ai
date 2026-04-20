/**
 * Profiles Module
 * Brand consistency management: tone/style profiles for images, videos, voice, and articles.
 * Apply brand voice to prompts, analyze tone compliance, and auto-generate from examples.
 */

import { CreditsModule } from '@api/collections/credits/credits.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { ProfilesController } from '@api/collections/profiles/controllers/profiles.controller';
import { ProfilesService } from '@api/collections/profiles/services/profiles.service';
import { ConfigModule } from '@api/config/config.module';
import { CreditsGuard } from '@api/helpers/guards/credits/credits.guard';
import { CreditsInterceptor } from '@api/helpers/interceptors/credits/credits.interceptor';
import { ByokModule } from '@api/services/byok/byok.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [ProfilesController],
  exports: [ProfilesService],
  imports: [
    ByokModule,
    ConfigModule,
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    ReplicateModule,
  ],
  providers: [ProfilesService, CreditsGuard, CreditsInterceptor],
})
export class ProfilesModule {}

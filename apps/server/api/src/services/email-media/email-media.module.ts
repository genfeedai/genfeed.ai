import { EmailMediaController } from '@api/services/email-media/email-media.controller';
import { EmailMediaUrlService } from '@api/services/email-media/email-media-url.service';
import { MediaUrlService } from '@api/services/media-urls/media-url.service';
import { RateLimitGuard } from '@api/shared/guards/rate-limit/rate-limit.guard';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { ConfigModule } from '@libs/config/config.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [EmailMediaController],
  exports: [EmailMediaUrlService],
  imports: [ConfigModule, PrismaModule],
  providers: [EmailMediaUrlService, MediaUrlService, RateLimitGuard],
})
export class EmailMediaModule {}

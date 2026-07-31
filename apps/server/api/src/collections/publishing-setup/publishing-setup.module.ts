import { PublishingSetupController } from '@api/collections/publishing-setup/controllers/publishing-setup.controller';
import { PublishingSetupService } from '@api/collections/publishing-setup/services/publishing-setup.service';
import { MicroservicesModule } from '@api/services/microservices/microservices.module';
import { Module } from '@nestjs/common';

/**
 * `ConfigModule`, `LoggerModule`, and `PrismaModule` are `@Global()`, so only
 * the queue-health dependency needs an explicit import here.
 */
@Module({
  controllers: [PublishingSetupController],
  exports: [PublishingSetupService],
  imports: [MicroservicesModule],
  providers: [PublishingSetupService],
})
export class PublishingSetupModule {}

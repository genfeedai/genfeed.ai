import { PublishingSetupController } from '@api/collections/publishing-setup/controllers/publishing-setup.controller';
import { PublishingProviderSetupModule } from '@api/collections/publishing-setup/publishing-provider-setup.module';
import { PublishingSetupService } from '@api/collections/publishing-setup/services/publishing-setup.service';
import { MicroservicesModule } from '@api/services/microservices/microservices.module';
import { Module } from '@nestjs/common';

/**
 * `ConfigModule`, `LoggerModule`, and `PrismaModule` are `@Global()`, so only
 * the queue-health and provider-signal dependencies need explicit imports here.
 */
@Module({
  controllers: [PublishingSetupController],
  exports: [PublishingSetupService],
  imports: [MicroservicesModule, PublishingProviderSetupModule],
  providers: [PublishingSetupService],
})
export class PublishingSetupModule {}

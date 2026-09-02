import { PublishingProviderSetupService } from '@api/collections/publishing-setup/services/publishing-provider-setup.service';
import { Module } from '@nestjs/common';

/**
 * Dependency-free carrier for the config-derived provider signals.
 *
 * Kept separate from `PublishingSetupModule` so credential readiness can import
 * the provider evaluation without pulling in the checklist's Prisma and Redis
 * probes — that import direction would otherwise create a cycle.
 */
@Module({
  exports: [PublishingProviderSetupService],
  providers: [PublishingProviderSetupService],
})
export class PublishingProviderSetupModule {}

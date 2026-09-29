import { PlatformSettingsModule } from '@api/collections/platform-settings/platform-settings.module';
import { FeaturedWorkflowsService } from '@api/collections/workflows/services/featured-workflows.service';
import { Module } from '@nestjs/common';

/**
 * Admin-pinned Featured workflows (#5511): the pin store on the
 * platform-settings singleton plus the cross-organization projection. A leaf
 * with no import edge back into the workflows modules, so both the workflows
 * HTTP surface and the admin pin endpoints can import it.
 */
@Module({
  exports: [FeaturedWorkflowsService],
  imports: [PlatformSettingsModule],
  providers: [FeaturedWorkflowsService],
})
export class FeaturedWorkflowsModule {}

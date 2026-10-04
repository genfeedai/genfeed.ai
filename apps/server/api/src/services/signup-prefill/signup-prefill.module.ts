import { BrandsModule } from '@api/collections/brands/brands.module';
import { HarnessProfilesModule } from '@api/collections/harness-profiles/harness-profiles.module';
import { WorkflowsModule } from '@api/collections/workflows/workflows.module';
import { BrandScraperModule } from '@api/services/brand-scraper/brand-scraper.module';
import { OrganizationCreatedPrefillListener } from '@api/services/signup-prefill/listeners/organization-created-prefill.listener';
import { SignupPrefillService } from '@api/services/signup-prefill/signup-prefill.service';
import { SignupPrefillWorkflowService } from '@api/services/signup-prefill/signup-prefill-workflow.service';
import { ConfigModule } from '@libs/config/config.module';
import { LoggerModule } from '@libs/logger/logger.module';
import { Module } from '@nestjs/common';

/**
 * Registers the immutable signup prefill workflow and its action executors,
 * and runs it for the default brand of every organization created later.
 */
@Module({
  exports: [SignupPrefillService, SignupPrefillWorkflowService],
  imports: [
    ConfigModule,
    LoggerModule,
    BrandsModule,
    BrandScraperModule,
    HarnessProfilesModule,
    WorkflowsModule,
  ],
  providers: [
    OrganizationCreatedPrefillListener,
    SignupPrefillService,
    SignupPrefillWorkflowService,
  ],
})
export class SignupPrefillModule {}

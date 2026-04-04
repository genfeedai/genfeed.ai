import { BrandsModule } from '@api/collections/brands/brands.module';
import { CreditsModule } from '@api/collections/credits/credits.module';
import { MembersModule } from '@api/collections/members/members.module';
import { ModelsModule } from '@api/collections/models/models.module';
import { OrganizationsModule } from '@api/collections/organizations/organizations.module';
import { PostsModule } from '@api/collections/posts/posts.module';
import { UsersModule } from '@api/collections/users/users.module';
import { ConfigModule } from '@api/config/config.module';
import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { CrmController } from '@api/endpoints/admin/crm/crm.controller';
import { CrmService } from '@api/endpoints/admin/crm/crm.service';
import { ProactiveOnboardingService } from '@api/endpoints/admin/crm/proactive-onboarding.service';
import {
  AlignmentRule,
  AlignmentRuleSchema,
} from '@api/endpoints/admin/crm/schemas/alignment-rule.schema';
import {
  Company,
  CompanySchema,
} from '@api/endpoints/admin/crm/schemas/company.schema';
import {
  CostRecord,
  CostRecordSchema,
} from '@api/endpoints/admin/crm/schemas/cost-record.schema';
import {
  CrmTask,
  CrmTaskSchema,
} from '@api/endpoints/admin/crm/schemas/crm-task.schema';
import { Lead, LeadSchema } from '@api/endpoints/admin/crm/schemas/lead.schema';
import {
  LeadActivity,
  LeadActivitySchema,
} from '@api/endpoints/admin/crm/schemas/lead-activity.schema';
import {
  RevenueRecord,
  RevenueRecordSchema,
} from '@api/endpoints/admin/crm/schemas/revenue-record.schema';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { BatchGenerationModule } from '@api/services/batch-generation/batch-generation.module';
import { BrandScraperModule } from '@api/services/brand-scraper/brand-scraper.module';
import { ClerkModule } from '@api/services/integrations/clerk/clerk.module';
import { ReplicateModule } from '@api/services/integrations/replicate/replicate.module';
import { MasterPromptGeneratorService } from '@api/services/knowledge-base/master-prompt-generator.service';
import { NotificationsModule } from '@api/services/notifications/notifications.module';
import { forwardRef, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

@Module({
  controllers: [CrmController],
  exports: [CrmService, ProactiveOnboardingService],
  imports: [
    ConfigModule,
    // Register CRM schemas on the 'crm' secondary connection
    MongooseModule.forFeature(
      [
        { name: Lead.name, schema: LeadSchema },
        { name: LeadActivity.name, schema: LeadActivitySchema },
        { name: AlignmentRule.name, schema: AlignmentRuleSchema },
        { name: Company.name, schema: CompanySchema },
        { name: CrmTask.name, schema: CrmTaskSchema },
        { name: CostRecord.name, schema: CostRecordSchema },
        { name: RevenueRecord.name, schema: RevenueRecordSchema },
      ],
      DB_CONNECTIONS.CRM,
    ),
    // Modules needed for proactive onboarding
    forwardRef(() => OrganizationsModule),
    forwardRef(() => BrandsModule),
    forwardRef(() => CreditsModule),
    forwardRef(() => ModelsModule),
    forwardRef(() => UsersModule),
    forwardRef(() => MembersModule),
    forwardRef(() => PostsModule),
    forwardRef(() => BatchGenerationModule),
    forwardRef(() => BrandScraperModule),
    forwardRef(() => ClerkModule),
    forwardRef(() => NotificationsModule),
    forwardRef(() => ReplicateModule),
  ],
  providers: [
    CrmService,
    MasterPromptGeneratorService,
    ProactiveOnboardingService,
    IpWhitelistGuard,
  ],
})
export class CrmModule {}

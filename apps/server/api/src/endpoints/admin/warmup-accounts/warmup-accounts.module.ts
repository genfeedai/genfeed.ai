import { ArticlesModule } from '@api/collections/articles/articles.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { MembersModule } from '@api/collections/members/members.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { WarmupAccountsController } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.controller';
import { AdminWarmupAccountsService } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.service';
import { WarmupPreparationService } from '@api/endpoints/admin/warmup-accounts/warmup-preparation.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [WarmupAccountsController],
  imports: [
    MembersModule,
    BrandsCoreModule,
    ArticlesModule,
    WorkflowsCoreModule,
  ],
  providers: [
    WarmupPreparationService,
    AdminWarmupAccountsService,
    IpWhitelistGuard,
    SuperAdminGuard,
  ],
})
export class AdminWarmupAccountsModule {}

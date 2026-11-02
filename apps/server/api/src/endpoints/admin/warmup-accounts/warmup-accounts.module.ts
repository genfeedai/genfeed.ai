import { ArticlesModule } from '@api/collections/articles/articles.module';
import { BrandsCoreModule } from '@api/collections/brands/brands-core.module';
import { ContentPreviewsModule } from '@api/collections/content-previews/content-previews.module';
import { MembersModule } from '@api/collections/members/members.module';
import { WorkflowsCoreModule } from '@api/collections/workflows/workflows-core.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { WarmupAccountsController } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.controller';
import { AdminWarmupAccountsService } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.service';
import { WarmupPreparationService } from '@api/endpoints/admin/warmup-accounts/warmup-preparation.service';
import { WarmupPreviewsService } from '@api/endpoints/admin/warmup-accounts/warmup-previews.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [WarmupAccountsController],
  imports: [
    MembersModule,
    BrandsCoreModule,
    ContentPreviewsModule,
    ArticlesModule,
    WorkflowsCoreModule,
  ],
  providers: [
    WarmupPreparationService,
    WarmupPreviewsService,
    AdminWarmupAccountsService,
    IpWhitelistGuard,
    SuperAdminGuard,
  ],
})
export class AdminWarmupAccountsModule {}

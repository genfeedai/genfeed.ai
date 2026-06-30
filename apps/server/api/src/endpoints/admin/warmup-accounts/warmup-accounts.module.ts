import { MembersModule } from '@api/collections/members/members.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { WarmupAccountsController } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.controller';
import { AdminWarmupAccountsService } from '@api/endpoints/admin/warmup-accounts/warmup-accounts.service';
import { forwardRef, Module } from '@nestjs/common';

@Module({
  controllers: [WarmupAccountsController],
  imports: [forwardRef(() => MembersModule)],
  providers: [AdminWarmupAccountsService, IpWhitelistGuard, SuperAdminGuard],
})
export class AdminWarmupAccountsModule {}

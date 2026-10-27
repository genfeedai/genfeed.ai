import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { HarnessActivationController } from '@api/endpoints/admin/harness/harness-activation.controller';
import { ContentHarnessModule } from '@api/services/harness/harness.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [HarnessActivationController],
  imports: [ContentHarnessModule],
  providers: [IpWhitelistGuard, SuperAdminGuard],
})
export class AdminHarnessActivationModule {}

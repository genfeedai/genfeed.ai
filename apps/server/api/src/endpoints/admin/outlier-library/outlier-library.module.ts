import { OutlierLibraryModule } from '@api/collections/outlier-library/outlier-library.module';
import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { IpWhitelistGuard } from '@api/endpoints/admin/guards/ip-whitelist.guard';
import { AdminOutlierLibraryController } from '@api/endpoints/admin/outlier-library/outlier-library.controller';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AdminOutlierLibraryController],
  imports: [OutlierLibraryModule],
  providers: [IpWhitelistGuard, SuperAdminGuard],
})
export class AdminOutlierLibraryModule {}

import { DashboardLayoutsController } from '@api/collections/dashboard-layouts/controllers/dashboard-layouts.controller';
import { DashboardLayoutsService } from '@api/collections/dashboard-layouts/services/dashboard-layouts.service';
import { Module } from '@nestjs/common';

@Module({
  controllers: [DashboardLayoutsController],
  exports: [DashboardLayoutsService],
  imports: [],
  providers: [DashboardLayoutsService],
})
export class DashboardLayoutsModule {}

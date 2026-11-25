import { SuperAdminGuard } from '@api/common/guards/super-admin.guard';
import { AdminCustomerInstancesController } from '@api/endpoints/admin/customer-instances/admin-customer-instances.controller';
import { AdminCustomerInstancesService } from '@api/endpoints/admin/customer-instances/admin-customer-instances.service';
import { PrismaModule } from '@api/shared/modules/prisma/prisma.module';
import { Module } from '@nestjs/common';

@Module({
  controllers: [AdminCustomerInstancesController],
  imports: [PrismaModule],
  providers: [AdminCustomerInstancesService, SuperAdminGuard],
})
export class AdminCustomerInstancesModule {}

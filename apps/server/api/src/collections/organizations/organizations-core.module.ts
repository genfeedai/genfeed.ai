import { OrganizationsService } from '@server/collections/organizations/services/organizations.service';
import { Module } from '@nestjs/common';

/** Organization persistence only. Member/settings HTTP stays on OrganizationsModule. */
@Module({
  exports: [OrganizationsService],
  providers: [OrganizationsService],
})
export class OrganizationsCoreModule {}

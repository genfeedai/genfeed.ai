import { CreateDashboardLayoutDto } from '@api/collections/dashboard-layouts/dto/create-dashboard-layout.dto';
import { PartialType } from '@nestjs/swagger';

export class UpdateDashboardLayoutDto extends PartialType(
  CreateDashboardLayoutDto,
) {}

import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { AutoSwagger } from '@api/helpers/decorators/swagger/auto-swagger.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { RolesGuard } from '@api/helpers/guards/roles/roles.guard';
import { ResearchScanService } from '@api/services/research-access/research-scan.service';
import type { ResearchScanStatus } from '@genfeedai/contracts';
import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';

@AutoSwagger()
@OrganizationModule('discovery')
@Controller('research/scans')
@UseGuards(RolesGuard)
export class ResearchScansController {
  constructor(private readonly researchScanService: ResearchScanService) {}

  /**
   * How many scans of the trends and ads libraries the organization has left,
   * and when the next one opens. Reading this starts no run and counts as no
   * scan.
   */
  @Get()
  async list(@CurrentUser() user: User): Promise<{
    data: ResearchScanStatus[];
  }> {
    if (!user.organizationId) {
      throw new ForbiddenException({
        detail: 'An authenticated organization is required',
        title: 'Forbidden',
      });
    }
    return {
      data: await this.researchScanService.getStatuses(user.organizationId),
    };
  }
}

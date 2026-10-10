import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { OrganizationModule } from '@api/common/organization-modules/organization-module.decorator';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { TurboContentService } from '@api/services/turbo-content/turbo-content.service';
import { CreateTurboContentDto } from '@api/services/turbo-content/dto/create-turbo-content.dto';
import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Batch Content')
@Controller('brands/:brandId/content/turbo')
@OrganizationModule('turbo')
export class TurboContentController {
  constructor(private readonly turboContentService: TurboContentService) {}

  @Post()
  @ApiOperation({ summary: 'Generate content through a batch workflow' })
  async createTurboRun(
    @Param('brandId') brandId: string,
    @Body() dto: CreateTurboContentDto,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;

    return this.turboContentService.queueTurboRun(
      {
        brandId,
        count: dto.count,
        organizationId: organization,
        params: dto.params,
        skillSlug: dto.skillSlug,
      },
      userId,
    );
  }
}

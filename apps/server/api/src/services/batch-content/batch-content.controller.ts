import type { AuthenticatedUser as User } from '@api/auth/interfaces/authenticated-user.interface';
import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { BatchContentService } from '@api/services/batch-content/batch-content.service';
import { CreateBatchContentDto } from '@api/services/batch-content/dto/create-batch-content.dto';
import { Body, Controller, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Batch Content')
@Controller('brands/:brandId/content/batch')
export class BatchContentController {
  constructor(private readonly batchContentService: BatchContentService) {}

  @Post()
  @ApiOperation({ summary: 'Generate content through a batch workflow' })
  async createBatch(
    @Param('brandId') brandId: string,
    @Body() dto: CreateBatchContentDto,
    @CurrentUser() user: User,
  ) {
    const organization = user.organizationId;
    const userId = user.userId ?? user.id;

    return this.batchContentService.queueBatch(
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

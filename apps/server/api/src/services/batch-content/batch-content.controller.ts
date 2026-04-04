import { CurrentUser } from '@api/helpers/decorators/user/current-user.decorator';
import { getPublicMetadata } from '@api/helpers/utils/clerk/clerk.util';
import { BatchContentService } from '@api/services/batch-content/batch-content.service';
import { CreateBatchContentDto } from '@api/services/batch-content/dto/create-batch-content.dto';
import type { User } from '@clerk/backend';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Batch Content')
@Controller('brands/:brandId/content/batch')
export class BatchContentController {
  constructor(private readonly batchContentService: BatchContentService) {}

  @Post()
  @ApiOperation({ summary: 'Trigger parallel batch content generation' })
  async createBatch(
    @Param('brandId') brandId: string,
    @Body() dto: CreateBatchContentDto,
    @CurrentUser() user: User,
  ): Promise<{ batchId: string; status: string }> {
    const { organization, user: userId } = getPublicMetadata(user);

    const { batchId } = await this.batchContentService.triggerBatch(
      {
        brandId,
        count: dto.count,
        organizationId: organization,
        params: dto.params,
        skillSlug: dto.skillSlug,
      },
      userId,
    );

    return {
      batchId,
      status: 'queued',
    };
  }

  @Get(':batchId')
  @ApiOperation({ summary: 'Get batch content generation status/results' })
  getBatchStatus(
    @Param('brandId') brandId: string,
    @Param('batchId') batchId: string,
    @CurrentUser() user: User,
  ) {
    const { organization } = getPublicMetadata(user);

    return this.batchContentService.getBatchStatus(
      batchId,
      organization,
      brandId,
    );
  }
}

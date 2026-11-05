import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
import { InternalCallers } from '@api/helpers/guards/admin-api-key/internal-callers.decorator';
import { AgentReportReviewService } from '@api/services/agent-reports/agent-report-review.service';
import { Public } from '@libs/decorators/public.decorator';
import {
  BadRequestException,
  Body,
  Controller,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsIn, IsString, Matches, MaxLength } from 'class-validator';

const MD5_HEX_PATTERN = /^[a-f0-9]{32}$/;

export class ResolveAgentReportReviewDto {
  @IsString() @MaxLength(200) organizationId!: string;
  @IsString() @MaxLength(200) remoteUserId!: string;
  @IsString() @MaxLength(200) channelId!: string;
  @Matches(MD5_HEX_PATTERN) token!: string;
  @IsIn(['approve', 'reject']) decision!: 'approve' | 'reject';
}
@Controller('internal/agent-reports')
@Public()
@UseGuards(AdminApiKeyGuard)
@InternalCallers('discord', 'slack', 'telegram')
export class AgentReportReviewController {
  constructor(private readonly reviews: AgentReportReviewService) {}
  @Post(':platform/review')
  resolve(
    @Param('platform') platform: string,
    @Body() input: ResolveAgentReportReviewDto,
  ) {
    if (platform !== 'telegram' && platform !== 'discord')
      throw new BadRequestException('Unsupported report channel');
    return this.reviews.resolve(platform, input);
  }
}

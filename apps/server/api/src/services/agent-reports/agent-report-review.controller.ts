import { AdminApiKeyGuard } from '@api/helpers/guards/admin-api-key/admin-api-key.guard';
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

export class ResolveAgentReportReviewDto {
  @IsString() @MaxLength(200) organizationId!: string;
  @IsString() @MaxLength(200) remoteUserId!: string;
  @IsString() @MaxLength(200) channelId!: string;
  @Matches(/^[a-f0-9]{32}$/) token!: string;
  @IsIn(['approve', 'reject']) decision!: 'approve' | 'reject';
}
@Controller('internal/agent-reports')
@Public()
@UseGuards(AdminApiKeyGuard)
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

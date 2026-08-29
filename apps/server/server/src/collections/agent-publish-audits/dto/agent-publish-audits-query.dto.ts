import { ApiPropertyOptional } from '@nestjs/swagger';
import { BaseQueryDto } from '@server/helpers/dto/base-query.dto';
import { IsEntityId } from '@server/helpers/validation/entity-id.validator';
import { IsOptional, IsString } from 'class-validator';

export class AgentPublishAuditsQueryDto extends BaseQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsEntityId()
  postGroupId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  workflowExecutionId?: string;
}

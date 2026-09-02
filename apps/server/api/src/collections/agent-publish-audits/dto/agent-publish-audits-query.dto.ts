import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
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

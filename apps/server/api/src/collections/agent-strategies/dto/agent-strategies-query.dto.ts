import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { toOptionalBoolean } from '@api/helpers/dto/optional-boolean.transform';
import { AGENT_TYPE_VALUES } from '@api/services/agent-orchestrator/constants/agent-type.constants';
import { AgentType } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

export class AgentStrategiesQueryDto extends BaseQueryDto {
  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Filter by platform', required: false })
  platform?: string;

  @IsIn(AGENT_TYPE_VALUES)
  @IsOptional()
  @ApiProperty({
    description: 'Filter by agent type',
    enum: AGENT_TYPE_VALUES,
    required: false,
  })
  agentType?: AgentType;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  @ApiProperty({ description: 'Filter by active status', required: false })
  isActive?: boolean;

  @IsOptional()
  @Transform(toOptionalBoolean)
  @IsBoolean()
  @ApiProperty({ description: 'Filter by enabled status', required: false })
  isEnabled?: boolean;
}

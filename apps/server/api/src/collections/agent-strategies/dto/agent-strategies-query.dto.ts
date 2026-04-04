import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { AGENT_TYPE_VALUES } from '@api/services/agent-orchestrator/constants/agent-type.constants';
import { AgentType } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

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
  @ValidateIf((o) => o.isActive !== undefined)
  @Transform(({ value }) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    return undefined;
  })
  @IsBoolean()
  @ApiProperty({ description: 'Filter by active status', required: false })
  isActive?: boolean;

  @IsOptional()
  @ValidateIf((o) => o.isEnabled !== undefined)
  @Transform(({ value }) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (value === 'true' || value === true) {
      return true;
    }
    if (value === 'false' || value === false) {
      return false;
    }
    return undefined;
  })
  @IsBoolean()
  @ApiProperty({ description: 'Filter by enabled status', required: false })
  isEnabled?: boolean;
}

import { IsOmittable } from '@api/helpers/validation/is-omittable.validator';
import {
  AgentThreadShareLevel,
  AgentThreadShareScope,
} from '@genfeedai/contracts';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsString, MinLength } from 'class-validator';

export class CreateAgentThreadShareDto {
  @ApiProperty({ enum: AgentThreadShareLevel })
  @IsEnum(AgentThreadShareLevel)
  readonly level!: AgentThreadShareLevel;

  @ApiProperty({ enum: AgentThreadShareScope })
  @IsEnum(AgentThreadShareScope)
  readonly scope!: AgentThreadShareScope;

  @ApiPropertyOptional({
    description:
      'Brand whose members the share reaches. Required for `brand` when the thread has no brand; must match the thread brand otherwise.',
  })
  @IsOmittable()
  @IsString()
  @MinLength(1)
  readonly targetBrandId?: string;

  @ApiPropertyOptional({
    description: 'Member the share reaches. Required for `member`.',
  })
  @IsOmittable()
  @IsString()
  @MinLength(1)
  readonly targetUserId?: string;
}

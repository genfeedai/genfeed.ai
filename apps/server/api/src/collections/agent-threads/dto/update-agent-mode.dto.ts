import { AgentThreadMode } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateAgentModeDto {
  @IsEnum(AgentThreadMode)
  @ApiProperty({ enum: AgentThreadMode, enumName: 'AgentThreadMode' })
  readonly mode!: AgentThreadMode;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ required: false })
  readonly threadId?: string;
}

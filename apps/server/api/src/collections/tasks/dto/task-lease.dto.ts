import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ReleaseTaskDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Agent holding the task lease', type: String })
  readonly agentId!: string;
}

export class CheckoutTaskDto extends ReleaseTaskDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Run acquiring the task lease', type: String })
  readonly runId!: string;
}

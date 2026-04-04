import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class WorkspaceTaskRequestChangesDto {
  @IsString()
  @MaxLength(1000)
  @ApiProperty({
    description: 'Reviewer guidance for the requested change',
    required: true,
    type: String,
  })
  reason!: string;
}

export class WorkspaceTaskDismissDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  @ApiProperty({
    description: 'Optional dismissal reason',
    required: false,
    type: String,
  })
  reason?: string;
}

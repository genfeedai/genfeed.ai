import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString } from 'class-validator';

export class ValidateWorkflowConnectionDto {
  @IsString()
  @ApiProperty({ description: 'Source node type', type: String })
  readonly sourceType!: string;

  @IsString()
  @ApiProperty({ description: 'Source output handle', type: String })
  readonly sourceHandle!: string;

  @IsString()
  @ApiProperty({ description: 'Target node type', type: String })
  readonly targetType!: string;

  @IsString()
  @ApiProperty({ description: 'Target input handle', type: String })
  readonly targetHandle!: string;
}

export class ValidateWorkflowInputsDto {
  @IsOptional()
  @IsObject()
  @ApiPropertyOptional({ description: 'Workflow input values', type: Object })
  readonly inputs?: Record<string, unknown>;
}

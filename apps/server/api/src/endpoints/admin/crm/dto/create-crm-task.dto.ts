import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateCrmTaskDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Task title' })
  readonly title!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Task description', required: false })
  readonly description?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Priority level', required: false })
  readonly priority?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Associated lead ID', required: false })
  readonly lead?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Associated company ID', required: false })
  readonly company?: string;

  @IsDateString()
  @IsOptional()
  @ApiProperty({ description: 'Due date (ISO 8601)', required: false })
  readonly dueDate?: string;
}

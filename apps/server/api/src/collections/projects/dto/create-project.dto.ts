import { PROJECT_STATUSES } from '@api/collections/projects/schemas/project.schema';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateProjectDto {
  @IsString()
  @MaxLength(500)
  @ApiProperty({
    description: 'Project label',
    required: true,
    type: String,
  })
  label!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10000)
  @ApiProperty({
    description: 'Project description',
    required: false,
    type: String,
  })
  description?: string;

  @IsOptional()
  @IsEnum(PROJECT_STATUSES)
  @ApiProperty({
    description: 'Project status',
    enum: PROJECT_STATUSES,
    required: false,
  })
  status?: (typeof PROJECT_STATUSES)[number];
}

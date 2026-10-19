import { PaginationQueryDto } from '@api/helpers/dto/pagination-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** `GET /skills` page window plus the catalog filters the settings table offers. */
export class SkillsQueryDto extends PaginationQueryDto {
  @ApiProperty({
    description: 'Narrow the catalog to one composer surface',
    required: false,
  })
  @IsOptional()
  @IsString()
  surface?: string;

  @ApiProperty({
    description: 'Case-insensitive search over skill name and description',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;

  @ApiProperty({ description: 'Filter by skill source', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  source?: string;

  @ApiProperty({ description: 'Filter by modality', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  modality?: string;

  @ApiProperty({ description: 'Filter by workflow stage', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  stage?: string;

  @ApiProperty({
    description: 'Only skills the runtime injects by default',
    required: false,
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  isDefault?: boolean;
}

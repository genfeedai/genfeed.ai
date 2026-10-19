import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class VoiceCatalogQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter by catalog provider (e.g. elevenlabs, heygen)',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  readonly provider?: string;

  @ApiProperty({
    description: 'Search catalog voices by name',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  readonly search?: string;
}

import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class VoicesCatalogQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter the catalog by voice provider',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  provider?: string;

  @ApiProperty({
    description: 'Search catalog voices by name',
    required: false,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

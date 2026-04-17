import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsMongoId, IsOptional, IsString } from 'class-validator';

export class CaptionsQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter captions by brand ID',
    required: false,
  })
  @IsOptional()
  @IsMongoId()
  brand?: string;

  @ApiProperty({
    description: 'Filter captions by language (e.g., en, es, fr)',
    required: false,
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiProperty({
    description: 'Filter captions by format (e.g., srt, vtt, plain)',
    required: false,
  })
  @IsOptional()
  @IsString()
  format?: string;
}

import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class CaptionsQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter captions by brand ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
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

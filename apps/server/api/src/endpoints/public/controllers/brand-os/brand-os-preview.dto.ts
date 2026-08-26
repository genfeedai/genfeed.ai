import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  MinLength,
} from 'class-validator';

export class BrandOsPreviewDto {
  @ApiPropertyOptional({
    description: 'Public http(s) website used as preview evidence.',
    example: 'https://example.com',
    maxLength: 2048,
  })
  @IsOptional()
  @IsString()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  readonly url?: string;

  @ApiPropertyOptional({
    description: 'Bounded, manually supplied Brand OS guidance.',
    maxLength: 12_000,
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(12_000)
  readonly guidance?: string;
}

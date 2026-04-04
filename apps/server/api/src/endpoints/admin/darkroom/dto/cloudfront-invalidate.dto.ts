import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString } from 'class-validator';

export class CloudFrontInvalidateDto {
  @IsOptional()
  @IsString()
  @ApiProperty({
    description:
      'CloudFront distribution ID. If omitted, the configured darkroom default will be used.',
    required: false,
  })
  readonly distributionId!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Paths to invalidate (defaults to /*)',
    required: false,
  })
  readonly paths?: string[];
}

import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class VideoUpscaleQuoteQueryDto {
  @IsString()
  @ApiProperty({ description: 'Upscale model to quote' })
  readonly model!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  @ApiProperty({ default: 30, required: false })
  readonly targetFps?: number;

  @IsOptional()
  @IsString()
  @IsIn(['720p', '1080p', '2k', '4k'])
  @ApiProperty({ default: '1080p', required: false })
  readonly targetResolution?: string;
}

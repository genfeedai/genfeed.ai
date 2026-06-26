import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';

class DatasetCaptionDto {
  @IsString()
  @ApiProperty({
    description: 'Filename stem without extension (e.g. "photo1")',
  })
  readonly filenameStem!: string;

  @IsString()
  @ApiProperty({ description: 'Caption text from paired .txt file' })
  readonly caption!: string;
}

export class UploadDatasetDto {
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => DatasetCaptionDto)
  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return JSON.parse(value) as DatasetCaptionDto[];
    }
    return value as DatasetCaptionDto[];
  })
  @ApiProperty({
    description:
      'JSON array of { filenameStem, caption } pairs parsed from FormData',
    required: false,
  })
  readonly captions?: DatasetCaptionDto[];
}

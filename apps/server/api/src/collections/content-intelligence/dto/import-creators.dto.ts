import { AddCreatorDto } from '@api/collections/content-intelligence/dto/add-creator.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsOptional, ValidateNested } from 'class-validator';

export enum ImportFormat {
  JSON = 'json',
  CSV = 'csv',
}

export class ImportCreatorsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddCreatorDto)
  @ApiProperty({
    description: 'Array of creators to import',
    type: [AddCreatorDto],
  })
  creators!: AddCreatorDto[];

  @IsOptional()
  @IsEnum(ImportFormat)
  @ApiProperty({
    default: ImportFormat.JSON,
    description: 'Format of the import data',
    enum: ImportFormat,
    enumName: 'ImportFormat',
    required: false,
  })
  format?: ImportFormat;
}

export class ImportCreatorsFromFileDto {
  @IsEnum(ImportFormat)
  @ApiProperty({
    description: 'Format of the uploaded file',
    enum: ImportFormat,
    enumName: 'ImportFormat',
  })
  format!: ImportFormat;
}

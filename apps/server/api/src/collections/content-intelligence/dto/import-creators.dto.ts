import { AddCreatorDto } from '@api/collections/content-intelligence/dto/add-creator.dto';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  ValidateNested,
} from 'class-validator';

const MAX_CREATOR_IMPORT_ITEMS = 50;

export enum ImportFormat {
  JSON = 'json',
  CSV = 'csv',
}

export class ImportCreatorsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CREATOR_IMPORT_ITEMS)
  @ValidateNested({ each: true })
  @Type(() => AddCreatorDto)
  @ApiProperty({
    description: 'Array of creators to import',
    maxItems: MAX_CREATOR_IMPORT_ITEMS,
    minItems: 1,
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

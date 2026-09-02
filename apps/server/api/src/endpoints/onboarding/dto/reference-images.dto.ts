import { ReferenceImageCategory } from '@genfeedai/enums';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

export class ReferenceImageDto {
  @IsString()
  url!: string;

  @IsEnum(ReferenceImageCategory)
  category!: ReferenceImageCategory;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}

export class AddReferenceImagesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReferenceImageDto)
  images!: ReferenceImageDto[];
}

import { TagCategory, TagScope } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsEnum,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class CreateTagDto {
  @IsString()
  @IsOptional()
  @IsEnum(TagCategory)
  @ApiProperty({
    description: 'The category/type of entities this tag applies to',
    enum: TagCategory,
    enumName: 'TagCategory',
    required: false,
  })
  readonly category!: TagCategory;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  @ApiProperty({
    description: 'The tag label',
    maxLength: 80,
    required: true,
  })
  readonly label!: string;

  @IsString()
  @IsOptional()
  @IsIn([TagScope.BRAND, TagScope.ORGANIZATION])
  @ApiProperty({
    default: TagScope.BRAND,
    description:
      'Where the tag is visible: the active brand (default) or every brand of ' +
      'the organization. Organization-wide tags need an owner or admin.',
    enum: [TagScope.BRAND, TagScope.ORGANIZATION],
    required: false,
  })
  readonly scope?: TagScope.BRAND | TagScope.ORGANIZATION;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'The tag description',
    required: false,
  })
  readonly description?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    description: 'A unique key for the tag',
    required: false,
  })
  readonly key?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: '#000000',
    description: 'The background color of the tag',
    required: false,
  })
  readonly backgroundColor?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({
    default: '#FFFFFF',
    description: 'The text color of the tag',
    required: false,
  })
  readonly textColor?: string;
}

import { TagCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

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
  @ApiProperty({
    description: 'The tag label',
    required: true,
  })
  readonly label!: string;

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

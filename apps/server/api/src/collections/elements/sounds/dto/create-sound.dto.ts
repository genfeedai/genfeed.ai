import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { ModelCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateElementSoundDto {
  @ApiProperty({ required: false })
  @IsEntityId()
  @IsOptional()
  organization?: string;

  @ApiProperty({
    enum: ModelCategory,
    enumName: 'ModelCategory',
    required: false,
  })
  @IsEnum(ModelCategory)
  @IsOptional()
  category?: ModelCategory;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  label!: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  key!: string;

  @ApiProperty({ default: false, required: false })
  @IsBoolean()
  @IsOptional()
  isDeleted?: boolean;

  @ApiProperty({ default: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiProperty({
    default: false,
    description: 'Whether this is auto-selected in promptbar by default',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

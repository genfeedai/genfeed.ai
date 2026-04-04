import { ModelCategory } from '@genfeedai/enums';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateElementLightingDto {
  @IsString()
  key!: string;

  @IsString()
  label!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsEnum(ModelCategory)
  @IsOptional()
  category?: ModelCategory;

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

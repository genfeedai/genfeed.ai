import { PlatformElementDto } from '@api/shared/dto/element/platform-element.dto';
import { ModelCategory } from '@genfeedai/contracts';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class CreateElementLightingDto extends PlatformElementDto {
  @IsEnum(ModelCategory)
  @IsOptional()
  category?: ModelCategory;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

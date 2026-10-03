import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { PlatformElementDto } from '@api/shared/dto/element/platform-element.dto';
import { ModelCategory } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class CreateElementSoundDto extends PlatformElementDto {
  @ApiProperty({ required: false })
  @IsEntityId()
  @IsOptional()
  organizationId?: string;

  @ApiProperty({
    enum: ModelCategory,
    enumName: 'ModelCategory',
    required: false,
  })
  @IsEnum(ModelCategory)
  @IsOptional()
  category?: ModelCategory;

  @ApiProperty({ default: false, required: false })
  @IsBoolean()
  @IsOptional()
  isDeleted?: boolean;

  @ApiProperty({
    default: false,
    description: 'Whether this is auto-selected in promptbar by default',
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}

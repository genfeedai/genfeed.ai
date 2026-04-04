import { ElementDto } from '@api/shared/dto/element/element.dto';
import { ModelCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

export class CreateElementBlacklistDto extends ElementDto {
  @IsEnum(ModelCategory)
  @IsOptional()
  @ApiProperty({
    description: 'Category of the blacklist',
    enum: ModelCategory,
    enumName: 'ModelCategory',
    required: false,
  })
  readonly category?: ModelCategory;

  @IsBoolean()
  @IsOptional()
  @ApiProperty({
    description: 'Whether this is auto-selected in promptbar by default',
    required: false,
  })
  readonly isDefault?: boolean;
}

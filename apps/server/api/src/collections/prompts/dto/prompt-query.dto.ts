import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { AssetScope } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';

export class PromptQueryDto extends BaseQueryDto {
  @ApiProperty({
    description: 'Filter prompts by access scope',
    enum: AssetScope,
    enumName: 'AssetScope',
    required: false,
  })
  @IsOptional()
  @IsEnum(AssetScope)
  scope?: AssetScope;

  @ApiProperty({
    description: 'Filter prompts by brand ID',
    required: false,
  })
  @IsOptional()
  @IsEntityId()
  brand?: string;
}

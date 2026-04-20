import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { AssetScope } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional } from 'class-validator';

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
  @IsMongoId()
  brand?: string;
}

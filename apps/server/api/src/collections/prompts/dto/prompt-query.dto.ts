import { BaseQueryDto } from '@api/helpers/dto/base-query.dto';
import { AssetScope } from '@genfeedai/contracts';
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
}

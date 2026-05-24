import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { PromptCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class EnhancePromptDto {
  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly organization?: string;

  @IsEntityId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly brand?: string;

  @IsString()
  @ApiProperty({ required: true })
  readonly original!: string;

  @IsString()
  @ApiProperty({
    enum: PromptCategory,
    enumName: 'PromptCategory',
    required: true,
  })
  @IsEnum(PromptCategory)
  readonly category!: PromptCategory;
}

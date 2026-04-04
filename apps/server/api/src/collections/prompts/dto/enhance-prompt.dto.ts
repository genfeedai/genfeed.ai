import { PromptCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsMongoId, IsOptional, IsString } from 'class-validator';
import { Types } from 'mongoose';

export class EnhancePromptDto {
  @IsMongoId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly organization?: Types.ObjectId;

  @IsMongoId()
  @IsOptional()
  @ApiProperty({ required: false })
  readonly brand?: Types.ObjectId;

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

import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import {
  IMAGE_EDIT_SIZES,
  type ImageEditSize,
} from '@genfeedai/contracts/constants';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class EditImageDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  @ApiProperty({ description: 'Instruction to apply to the source image' })
  readonly prompt!: string;

  @IsOptional()
  @IsEntityId()
  readonly brandId?: string;

  @IsOptional()
  @IsString()
  readonly model?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(4)
  @IsEntityId({ each: true })
  readonly references?: string[];

  @IsOptional()
  @IsEntityId()
  readonly maskId?: string;

  @IsOptional()
  @IsIn(IMAGE_EDIT_SIZES)
  readonly size?: ImageEditSize;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  readonly outputs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(2147483647)
  readonly seed?: number;

  @IsOptional()
  @IsBoolean()
  readonly waitForCompletion?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  readonly sourceActionId?: string;
}

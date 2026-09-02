import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { CadenceGenerateLanding, PostCategory } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export const CADENCE_FORMATS = [
  PostCategory.ARTICLE,
  PostCategory.IMAGE,
  PostCategory.POST,
  PostCategory.REEL,
  PostCategory.STORY,
  PostCategory.TEXT,
  PostCategory.VIDEO,
] as const;

export class CreatePostingCadenceDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @ApiProperty({ required: false })
  readonly brief?: string;

  @IsEntityId()
  @ApiProperty()
  readonly brandId!: string;

  @IsEntityId()
  @ApiProperty()
  readonly credentialId!: string;

  @IsOptional()
  @IsDateString()
  @ApiProperty({ required: false })
  readonly endsAt?: string;

  @IsIn(CADENCE_FORMATS)
  @ApiProperty({ enum: CADENCE_FORMATS })
  readonly format!: PostCategory;

  @IsOptional()
  @IsEnum(CadenceGenerateLanding)
  @ApiProperty({ enum: CadenceGenerateLanding, required: false })
  readonly generateLanding?: CadenceGenerateLanding;

  @IsInt()
  @Min(15)
  @Max(7 * 24 * 60)
  @ApiProperty()
  readonly intervalMinutes!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  @ApiProperty({ required: false })
  readonly label?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @ApiProperty({ required: false })
  readonly maxOccurrences?: number;

  @IsDateString()
  @ApiProperty()
  readonly startsAt!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ApiProperty({ required: false })
  readonly timezone?: string;

  @IsInt()
  @Min(0)
  @Max(24 * 60)
  @ApiProperty()
  readonly windowEndMinute!: number;

  @IsInt()
  @Min(0)
  @Max(24 * 60)
  @ApiProperty()
  readonly windowStartMinute!: number;
}

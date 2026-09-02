import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { PostCategory } from '@genfeedai/contracts';
import { MAX_CADENCE_WINDOW_OCCURRENCES } from '@genfeedai/contracts/api-types/contracts/cadence-expansion.contract';
import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class BookCalendarSlotDto {
  @IsEntityId()
  @ApiProperty()
  readonly brandId!: string;

  @IsEntityId()
  @ApiProperty()
  readonly credentialId!: string;

  @IsEnum(PostCategory)
  @ApiProperty({ enum: PostCategory })
  readonly format!: PostCategory;

  @IsDateString()
  @ApiProperty()
  readonly instant!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  @ApiProperty({ required: false })
  readonly timezone?: string;
}

export class FillCalendarSlotDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @ApiProperty({ required: false })
  readonly brief?: string;

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description:
      'Publish content campaign to stamp on generated calendar content',
    required: false,
  })
  readonly campaignId?: string;

  @IsString()
  @MaxLength(400)
  @ApiProperty()
  readonly identityKey!: string;
}

export class SkipCalendarSlotDto {
  @IsString()
  @MaxLength(400)
  @ApiProperty()
  readonly identityKey!: string;
}

export class CancelCalendarSlotDto {
  @IsString()
  @MaxLength(400)
  @ApiProperty()
  readonly identityKey!: string;
}

export class BulkGenerateCalendarSlotsDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @ApiProperty({ required: false })
  readonly brief?: string;

  @IsOptional()
  @IsEntityId()
  @ApiProperty({
    description:
      'Publish content campaign to stamp on generated calendar content',
    required: false,
  })
  readonly campaignId?: string;

  @IsInt()
  @Min(1)
  @Max(MAX_CADENCE_WINDOW_OCCURRENCES)
  @ApiProperty({
    description: 'Confirmed count of unique identity keys to generate.',
    maximum: MAX_CADENCE_WINDOW_OCCURRENCES,
    minimum: 1,
  })
  readonly confirmedCount!: number;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CADENCE_WINDOW_OCCURRENCES)
  @IsString({ each: true })
  @MaxLength(400, { each: true })
  @ApiProperty({
    description: 'Missing-slot identities the operator confirmed.',
    type: [String],
  })
  readonly identityKeys!: string[];
}

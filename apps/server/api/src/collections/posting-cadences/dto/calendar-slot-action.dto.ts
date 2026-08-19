import { IsEntityId } from '@api/helpers/validation/entity-id.validator';
import { PostCategory } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
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

  @IsString()
  @MaxLength(400)
  @ApiProperty()
  readonly identityKey!: string;
}

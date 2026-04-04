import { DistributionContentType } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  ValidateIf,
} from 'class-validator';

export class CreateDistributionDto {
  @IsString()
  @IsNotEmpty()
  @ApiProperty({ description: 'Telegram chat/channel ID', required: true })
  readonly chatId!: string;

  @IsEnum(DistributionContentType)
  @IsNotEmpty()
  @ApiProperty({
    enum: DistributionContentType,
    enumName: 'DistributionContentType',
  })
  readonly contentType!: DistributionContentType;

  @ValidateIf(
    (o: CreateDistributionDto) =>
      o.contentType === DistributionContentType.TEXT,
  )
  @IsString()
  @IsNotEmpty()
  @ApiProperty({
    description: 'Text content for text messages',
    required: false,
  })
  readonly text?: string;

  @ValidateIf(
    (o: CreateDistributionDto) =>
      o.contentType === DistributionContentType.PHOTO ||
      o.contentType === DistributionContentType.VIDEO,
  )
  @IsUrl()
  @IsNotEmpty()
  @ApiProperty({ description: 'Media URL for photo/video', required: false })
  readonly mediaUrl?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Caption for photo/video', required: false })
  readonly caption?: string;

  @IsOptional()
  @IsString()
  @ApiProperty({ description: 'Brand ID', required: false })
  readonly brandId?: string;
}

export class ScheduleDistributionDto extends CreateDistributionDto {
  @IsDateString()
  @IsNotEmpty()
  @ApiProperty({ description: 'ISO 8601 date string for scheduled send' })
  readonly scheduledAt!: string;
}

import {
  DistributionContentType,
  DistributionPlatform,
} from '@genfeedai/enums';
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
  @IsEnum(DistributionPlatform)
  @IsNotEmpty()
  @ApiProperty({
    enum: DistributionPlatform,
    enumName: 'DistributionPlatform',
  })
  readonly platform!: DistributionPlatform;

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

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description:
      'ISO 8601 date string to schedule the send; omit to send immediately',
    required: false,
  })
  readonly scheduledAt?: string;
}

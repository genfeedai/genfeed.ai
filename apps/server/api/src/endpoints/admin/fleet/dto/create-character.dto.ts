import { LoraStatus } from '@genfeedai/enums';
import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString } from 'class-validator';

export class CreateCharacterDto {
  @IsString()
  @ApiProperty({ description: 'Character label/name' })
  readonly label!: string;

  @IsString()
  @ApiProperty({ description: 'URL-friendly slug' })
  readonly slug!: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Character bio', required: false })
  readonly bio?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Skin tone description', required: false })
  readonly skinTone?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Eye color description', required: false })
  readonly eyeColor?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'LoRA trigger word', required: false })
  readonly triggerWord?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'S3 folder for assets', required: false })
  readonly s3Folder?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Content niche', required: false })
  readonly niche?: string;

  @IsString()
  @IsOptional()
  @ApiProperty({ description: 'Emoji identifier', required: false })
  readonly emoji?: string;

  @IsEnum(LoraStatus)
  @IsOptional()
  @ApiProperty({
    description: 'LoRA training status',
    enum: LoraStatus,
    enumName: 'LoraStatus',
    required: false,
  })
  readonly loraStatus?: LoraStatus;
}

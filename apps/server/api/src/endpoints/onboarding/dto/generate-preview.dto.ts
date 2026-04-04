import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString } from 'class-validator';

export enum OnboardingContentType {
  ADS = 'ads',
  SOCIAL = 'social',
}

export class GeneratePreviewDto {
  @ApiProperty({ description: 'Brand ID to generate preview for' })
  @IsString()
  brandId!: string;

  @ApiProperty({
    description: 'Content type for the preview',
    enum: OnboardingContentType,
  })
  @IsEnum(OnboardingContentType)
  contentType!: OnboardingContentType;
}

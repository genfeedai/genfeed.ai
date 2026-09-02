import { OnboardingType } from '@genfeedai/contracts';
import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export class UpdateUserOnboardingDto {
  @IsOptional()
  @IsBoolean()
  @ApiProperty({
    default: false,
    description: 'Whether onboarding has been completed by the user',
    required: false,
  })
  readonly isOnboardingCompleted?: boolean;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Timestamp for when onboarding started',
    format: 'date-time',
    required: false,
    type: String,
  })
  readonly onboardingStartedAt?: string | Date;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Timestamp for when onboarding completed',
    format: 'date-time',
    required: false,
    type: String,
  })
  readonly onboardingCompletedAt?: string | Date;

  @IsOptional()
  @IsEnum(OnboardingType)
  @ApiProperty({
    description: 'Onboarding flow type',
    enum: OnboardingType,
    required: false,
  })
  readonly onboardingType?: OnboardingType;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ApiProperty({
    description: 'Completed onboarding step keys',
    required: false,
    type: [String],
  })
  readonly onboardingStepsCompleted?: string[];
}

import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
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
    required: false,
  })
  readonly onboardingStartedAt?: string | Date;

  @IsOptional()
  @IsDateString()
  @ApiProperty({
    description: 'Timestamp for when onboarding completed',
    required: false,
  })
  readonly onboardingCompletedAt?: string | Date;

  @IsOptional()
  @IsIn(['creator', 'organization'])
  @ApiProperty({
    description: 'Onboarding flow type',
    enum: ['creator', 'organization'],
    required: false,
  })
  readonly onboardingType?: 'creator' | 'organization';

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
